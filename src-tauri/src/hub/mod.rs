//! El hub LAN de la caja.
//!
//! La caja Tauri no es "la app de escritorio": es el SERVIDOR del local. Sirve
//! la app a los teléfonos y tablets, imprime, y encola hacia Supabase. Esa
//! decisión resuelve de un golpe los dos problemas que hunden a un POS web en
//! un restaurante real: el mixed content (una PWA en HTTPS no puede hablar con
//! una IP local por HTTP) y el arranque sin internet (si el service worker no
//! tiene la app cacheada, el teléfono ni siquiera carga).
//!
//! Módulos:
//!   documento  — el contrato con el front (tonto a propósito)
//!   escpos     — maquetado a bytes de impresora
//!   transporte — por dónde salen esos bytes (USB, red, simulador)
//!   cola        — reintentos y persistencia; el cobro nunca se bloquea
//!   dispositivos— quién está emparejado y con qué token propio
//!   servidor    — rutas HTTP y servido de la app

pub mod cola;
pub mod dispositivos;
pub mod documento;
pub mod escpos;
pub mod servidor;
pub mod transporte;

use std::path::PathBuf;
use std::sync::Arc;

use cola::Cola;
use dispositivos::Registro;
use servidor::EstadoHub;
use transporte::ConfigTransporte;

/// Puerto preferido. Si está ocupado, `servidor::escuchar` prueba los
/// siguientes y reporta cuál quedó.
pub const PUERTO: u16 = 3000;

/// Configuración persistida del hub, en un JSON junto a los datos de la app.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigHub {
    #[serde(default = "puerto_por_defecto")]
    pub puerto: u16,
    pub transporte: ConfigTransporte,
    /// Columnas del papel: 32 para 58 mm, 48 para 80 mm.
    ///
    /// `serde(default)` para que un `hub.json` escrito por una versión anterior
    /// —que no tenía este campo— siga leyéndose. Sin eso, actualizar la caja
    /// dejaría el hub sin configuración y arrancando en simulador: la impresora
    /// «desaparecería» tras una actualización, sin decir por qué.
    #[serde(default = "ancho_por_defecto")]
    pub ancho_papel: usize,
}

fn ancho_por_defecto() -> usize {
    escpos::ANCHO_POR_DEFECTO
}

fn puerto_por_defecto() -> u16 {
    PUERTO
}

impl Default for ConfigHub {
    fn default() -> Self {
        Self {
            puerto: PUERTO,
            // Arranca en simulación. Una caja sin impresora configurada debe
            // levantar igual: si el hub fallara al arrancar por no encontrar
            // hardware, la app entera se quedaría sin servidor por culpa de un
            // periférico.
            transporte: ConfigTransporte::Simulador { carpeta: None },
            ancho_papel: escpos::ANCHO_POR_DEFECTO,
        }
    }
}

impl ConfigHub {
    pub fn leer(carpeta: &PathBuf) -> Self {
        std::fs::read(carpeta.join("hub.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn guardar(&self, carpeta: &PathBuf) -> std::io::Result<()> {
        std::fs::create_dir_all(carpeta)?;
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(carpeta.join("hub.json"), json)
    }
}

/// Lo que queda vivo tras arrancar el hub, para que los comandos de Tauri
/// puedan consultarlo desde la ventana de la caja.
pub struct HubVivo {
    pub estado: Arc<EstadoHub>,
    pub carpeta_datos: PathBuf,
}

/// Arranca el hub: cola, servidor y hilo de impresión.
///
/// `dir_web` es la carpeta con el build de React que se sirve a la LAN. Si no
/// se pasa, el hub sigue funcionando como servicio de impresión: la caja
/// imprime aunque no pueda servir la app a los teléfonos, que es la
/// degradación correcta —el orden de importancia es cobrar, luego imprimir,
/// luego repartir la app.
pub fn arrancar(
    carpeta_datos: PathBuf,
    dir_web: Option<PathBuf>,
    version: String,
) -> std::io::Result<HubVivo> {
    let config = ConfigHub::leer(&carpeta_datos);

    let transporte = config.transporte.construir(&carpeta_datos);
    let cola = Cola::nueva(
        transporte,
        config.ancho_papel,
        carpeta_datos.join("cola-impresion.json"),
    );

    // El puerto se abre AQUÍ, antes de publicar el estado, para que la
    // pantalla de pairing no llegue a enseñar una URL con el puerto que
    // pedimos en vez del que conseguimos.
    let (socket, puerto_real) = servidor::abrir_puerto(config.puerto)?;

    // Cuándo se compiló el build que van a recibir los teléfonos. Si esta
    // fecha es anterior al último cambio, el móvil corre código viejo y no lo
    // dice de ninguna otra forma.
    let web_ms = dir_web
        .as_ref()
        .and_then(|d| std::fs::metadata(d.join("index.html")).ok())
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let web_ruta = dir_web.as_ref().map(|d| d.display().to_string());

    let estado = Arc::new(EstadoHub {
        cola: Arc::clone(&cola),
        token: servidor::token_de_arranque(),
        dispositivos: Registro::nuevo(carpeta_datos.join("dispositivos.json")),
        puerto: puerto_real,
        ip_lan: servidor::ip_lan(),
        version,
        web: web_ruta,
        web_ms,
    });

    let estado_servidor = Arc::clone(&estado);
    let anuncio = format!(
        "http://{}:{}",
        estado
            .ip_lan
            .map(|i| i.to_string())
            .unwrap_or_else(|| "0.0.0.0".into()),
        puerto_real
    );

    std::thread::Builder::new()
        .name("invventa-hub".into())
        .spawn(move || {
            let rt = match tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    eprintln!("[hub] no se pudo crear el runtime: {e}");
                    return;
                }
            };

            rt.block_on(async move {
                let listener = match tokio::net::TcpListener::from_std(socket) {
                    Ok(l) => l,
                    Err(e) => {
                        eprintln!("[hub] no se pudo adoptar el socket: {e}");
                        return;
                    }
                };
                println!("[hub] escuchando en {anuncio}");
                let app = servidor::rutas(estado_servidor, dir_web);
                if let Err(e) = axum::serve(listener, app).await {
                    eprintln!("[hub] el servidor se detuvo: {e}");
                }
            });
        })?;

    Ok(HubVivo {
        estado,
        carpeta_datos,
    })
}
