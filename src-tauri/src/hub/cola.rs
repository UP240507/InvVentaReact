//! Cola de impresión.
//!
//! La regla que manda sobre todas las demás: **el cobro nunca se bloquea por
//! la impresora.** Un POST a `/imprimir` encola y responde de inmediato. Si la
//! térmica está apagada, sin papel o con el cable flojo, el cajero cobra igual
//! y el ticket sale cuando la impresora vuelva.
//!
//! De ahí se derivan las decisiones de este módulo:
//!
//! - **Un solo hilo trabajador.** La impresora es un recurso físico único.
//!   Dos hilos escribiendo a la vez entrelazan bytes de dos tickets y sale una
//!   tira ilegible. La serialización no es una limitación: es el requisito.
//!
//! - **Persistencia en disco.** Si la caja se reinicia con tickets pendientes,
//!   al arrancar los recupera. Perderlos en silencio significa que cocina
//!   nunca supo de una comanda que el mesero da por enviada.
//!
//! - **Reintento con espera creciente, pero acotada.** Sin tope, una impresora
//!   apagada al cerrar el turno acumularía reintentos toda la noche. Con tope,
//!   el trabajo pasa a `fallidos` y se ve en la pantalla de diagnóstico: un
//!   fallo visible se arregla, uno silencioso se descubre por el reclamo del
//!   cliente.
//!
//! - **Descarte por `id` ya impreso.** Es la contraparte de la idempotencia de
//!   `Comanda.js`: la LAN puede duplicar un POST (el teléfono reintenta porque
//!   el wifi parpadeó) y no deben salir dos comandas.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::hub::documento::Documento;
use crate::hub::escpos;
use crate::hub::transporte::Transporte;

/// Tope de reintentos antes de dar el trabajo por fallido.
const MAX_INTENTOS: u32 = 5;
/// Espera base; crece al doble en cada intento (2s, 4s, 8s, 16s, 32s).
const ESPERA_BASE: Duration = Duration::from_secs(2);
/// Cuántos trabajos ya impresos se recuerdan para descartar duplicados.
/// 500 cubre de sobra un turno completo sin que el archivo crezca sin control.
const MEMORIA_IMPRESOS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trabajo {
    pub documento: Documento,
    #[serde(default)]
    pub intentos: u32,
    #[serde(default)]
    pub ultimo_error: Option<String>,
    /// Milisegundos desde época; se serializa para sobrevivir un reinicio.
    #[serde(default)]
    pub creado_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EstadoPersistido {
    #[serde(default)]
    pendientes: Vec<Trabajo>,
    #[serde(default)]
    fallidos: Vec<Trabajo>,
    #[serde(default)]
    impresos: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Resumen {
    pub pendientes: usize,
    pub fallidos: usize,
    pub impresos: usize,
    pub transporte: String,
    pub ultimo_error: Option<String>,
}

struct Interior {
    pendientes: VecDeque<Trabajo>,
    fallidos: Vec<Trabajo>,
    impresos: VecDeque<String>,
    ultimo_error: Option<String>,
    detenida: bool,
}

pub struct Cola {
    interior: Mutex<Interior>,
    aviso: Condvar,
    transporte: Mutex<Box<dyn Transporte>>,
    /// Columnas del papel. Vive junto al transporte porque las dos son la
    /// misma cosa: propiedades de la impresora que hay enchufada hoy, no del
    /// documento. Se cambia igual que el transporte, sin reiniciar el hub.
    ancho: Mutex<usize>,
    archivo: PathBuf,
}

/// Resultado de encolar, para que la respuesta HTTP diga la verdad en vez de
/// un "ok" genérico. Un duplicado descartado NO es un error: el cliente hizo
/// lo correcto reintentando.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Recibo {
    Encolado,
    Duplicado,
    Vacio,
}

impl Recibo {
    pub fn etiqueta(&self) -> &'static str {
        match self {
            Recibo::Encolado => "encolado",
            Recibo::Duplicado => "duplicado",
            Recibo::Vacio => "vacio",
        }
    }
}

impl Cola {
    pub fn nueva(transporte: Box<dyn Transporte>, ancho: usize, archivo: PathBuf) -> Arc<Self> {
        let estado = leer_estado(&archivo);

        let cola = Arc::new(Self {
            interior: Mutex::new(Interior {
                pendientes: estado.pendientes.into_iter().collect(),
                fallidos: estado.fallidos,
                impresos: estado.impresos.into_iter().collect(),
                ultimo_error: None,
                detenida: false,
            }),
            aviso: Condvar::new(),
            transporte: Mutex::new(transporte),
            ancho: Mutex::new(ancho),
            archivo,
        });

        let obrero = Arc::clone(&cola);
        std::thread::Builder::new()
            .name("invventa-impresion".into())
            .spawn(move || obrero.trabajar())
            .expect("no se pudo crear el hilo de impresión");

        cola
    }

    /// Encola un documento. Devuelve de inmediato: aquí no se toca la
    /// impresora ni se espera a nadie.
    pub fn encolar(&self, documento: Documento) -> Recibo {
        if documento.vacio() {
            return Recibo::Vacio;
        }

        let mut interior = self.interior.lock().unwrap();

        if !documento.id.is_empty() {
            let ya_impreso = interior.impresos.iter().any(|i| *i == documento.id);
            let ya_en_cola = interior
                .pendientes
                .iter()
                .any(|t| t.documento.id == documento.id);
            if ya_impreso || ya_en_cola {
                return Recibo::Duplicado;
            }
        }

        let copias = documento.copias.max(1);
        let creado_ms = ahora_ms();
        for _ in 0..copias {
            interior.pendientes.push_back(Trabajo {
                documento: documento.clone(),
                intentos: 0,
                ultimo_error: None,
                creado_ms,
            });
        }

        self.guardar(&interior);
        drop(interior);
        self.aviso.notify_all();
        Recibo::Encolado
    }

    pub fn resumen(&self) -> Resumen {
        let interior = self.interior.lock().unwrap();
        Resumen {
            pendientes: interior.pendientes.len(),
            fallidos: interior.fallidos.len(),
            impresos: interior.impresos.len(),
            transporte: self.transporte.lock().unwrap().nombre(),
            ultimo_error: interior.ultimo_error.clone(),
        }
    }

    pub fn fallidos(&self) -> Vec<Trabajo> {
        self.interior.lock().unwrap().fallidos.clone()
    }

    /// Devuelve los fallidos a la cola. Se usa desde la pantalla de
    /// diagnóstico cuando ya se puso papel o se encendió la impresora.
    pub fn reintentar_fallidos(&self) -> usize {
        let mut interior = self.interior.lock().unwrap();
        let cuantos = interior.fallidos.len();
        let recuperados: Vec<Trabajo> = interior
            .fallidos
            .drain(..)
            .map(|mut t| {
                t.intentos = 0;
                t
            })
            .collect();
        for t in recuperados {
            interior.pendientes.push_back(t);
        }
        self.guardar(&interior);
        drop(interior);
        self.aviso.notify_all();
        cuantos
    }

    /// Reconoce la pérdida. No la repara — y el nombre lo dice.
    pub fn descartar_fallidos(&self) -> usize {
        let mut interior = self.interior.lock().unwrap();
        let cuantos = interior.fallidos.len();
        interior.fallidos.clear();
        self.guardar(&interior);
        cuantos
    }

    /// Cambia la impresora en caliente. Los pendientes salen por la nueva:
    /// es justo lo que se quiere al descubrir que el nombre estaba mal escrito.
    pub fn cambiar_transporte(&self, nuevo: Box<dyn Transporte>) {
        *self.transporte.lock().unwrap() = nuevo;
        self.aviso.notify_all();
    }

    /// Cambia el ancho del papel en caliente.
    ///
    /// Los trabajos que ya estén en la cola se renderizan con el ancho NUEVO,
    /// no con el que había al encolarlos. Es lo correcto: el ancho describe el
    /// rollo que hay puesto ahora, y si alguien lo corrige es justamente
    /// porque lo anterior salía mal.
    pub fn cambiar_ancho(&self, cols: usize) {
        *self.ancho.lock().unwrap() = cols;
        self.aviso.notify_all();
    }

    pub fn ancho(&self) -> usize {
        *self.ancho.lock().unwrap()
    }

    /// Abre el cajón AHORA, saltándose la cola.
    ///
    /// ── POR QUÉ NO SE ENCOLA, QUE ES LO IMPORTANTE ──────────────────────────
    /// La cola reintenta cinco veces con espera creciente, y para un ticket eso
    /// es exactamente lo que se quiere: el papel puede salir tarde. Para un
    /// cajón es peligroso. Un pulso encolado se ejecutaría cuando la impresora
    /// vuelva —veinte minutos después, o al día siguiente al encenderla— y
    /// abriría un cajón con dinero dentro sin nadie delante.
    ///
    /// Intento único. Si falla, el cajero lo abre con la llave, que es lo que ya
    /// hace hoy cuando la impresora está apagada. Un cajón que no se abre es un
    /// incordio; uno que se abre solo de madrugada es otra cosa.
    ///
    /// Toma el mismo cerrojo del transporte que usa el hilo de impresión, así
    /// que si hay un ticket saliendo espera a que termine. La impresora es un
    /// recurso físico: dos escrituras entrelazadas serían basura en el papel.
    pub fn abrir_cajon(&self) -> Result<(), crate::hub::transporte::ErrorImpresion> {
        let bytes = escpos::pulso_cajon();
        let transporte = self.transporte.lock().unwrap();
        transporte.enviar(&bytes)
    }

    /// Detiene el hilo trabajador al cerrar la app. Lo pendiente ya está en
    /// disco, así que no se pierde: sale en el siguiente arranque.
    pub fn detener(&self) {
        let mut interior = self.interior.lock().unwrap();
        interior.detenida = true;
        self.guardar(&interior);
        drop(interior);
        self.aviso.notify_all();
    }

    fn guardar(&self, interior: &Interior) {
        let estado = EstadoPersistido {
            pendientes: interior.pendientes.iter().cloned().collect(),
            fallidos: interior.fallidos.clone(),
            impresos: interior.impresos.iter().cloned().collect(),
        };
        if let Some(padre) = self.archivo.parent() {
            let _ = std::fs::create_dir_all(padre);
        }
        // Escritura best-effort: si el disco falla no vale la pena tumbar la
        // impresión, que es lo que el usuario está esperando ahora mismo.
        if let Ok(json) = serde_json::to_vec_pretty(&estado) {
            let _ = std::fs::write(&self.archivo, json);
        }
    }

    fn trabajar(self: Arc<Self>) {
        loop {
            let trabajo = {
                let mut interior = self.interior.lock().unwrap();
                while interior.pendientes.is_empty() && !interior.detenida {
                    // Espera pasiva: sin sondeo, el hilo no consume CPU en una
                    // caja que está toda la mañana sin imprimir.
                    let (guarda, _) = self
                        .aviso
                        .wait_timeout(interior, Duration::from_secs(30))
                        .unwrap();
                    interior = guarda;
                }
                if interior.detenida {
                    return;
                }
                interior.pendientes.pop_front()
            };

            let Some(mut trabajo) = trabajo else { continue };

            let cols = *self.ancho.lock().unwrap();
            let bytes = escpos::render(&trabajo.documento, cols);
            let resultado = {
                let transporte = self.transporte.lock().unwrap();
                transporte.enviar(&bytes)
            };

            let mut interior = self.interior.lock().unwrap();
            match resultado {
                Ok(()) => {
                    interior.ultimo_error = None;
                    if !trabajo.documento.id.is_empty() {
                        interior.impresos.push_back(trabajo.documento.id.clone());
                        while interior.impresos.len() > MEMORIA_IMPRESOS {
                            interior.impresos.pop_front();
                        }
                    }
                    self.guardar(&interior);
                }
                Err(e) => {
                    trabajo.intentos += 1;
                    trabajo.ultimo_error = Some(e.to_string());
                    interior.ultimo_error = Some(e.to_string());

                    if trabajo.intentos >= MAX_INTENTOS {
                        interior.fallidos.push(trabajo);
                        self.guardar(&interior);
                    } else {
                        let espera = ESPERA_BASE * 2u32.pow(trabajo.intentos - 1);
                        // Vuelve AL FRENTE, no al final: los tickets de una
                        // misma mesa deben salir en orden. Reencolar atrás
                        // haría que el segundo platillo se imprimiera antes
                        // que el primero.
                        interior.pendientes.push_front(trabajo);
                        self.guardar(&interior);
                        drop(interior);
                        // La espera se hace FUERA del candado para que un POST
                        // nuevo no se quede bloqueado 32 segundos.
                        std::thread::sleep(espera);
                        continue;
                    }
                }
            }
        }
    }
}

fn ahora_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn leer_estado(archivo: &PathBuf) -> EstadoPersistido {
    std::fs::read(archivo)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hub::documento::Linea;
    use crate::hub::transporte::ErrorImpresion;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Instant;

    /// Espera acotada: da tiempo al hilo trabajador sin colgar la suite si algo
    /// se atasca.
    fn esperar_hasta(cola: &Cola, cond: impl Fn(&Resumen) -> bool) -> Resumen {
        let limite = Instant::now() + Duration::from_secs(5);
        loop {
            let r = cola.resumen();
            if cond(&r) || Instant::now() > limite {
                return r;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    struct Contador {
        veces: Arc<AtomicUsize>,
        falla_las_primeras: usize,
    }

    impl Transporte for Contador {
        fn nombre(&self) -> String {
            "contador".into()
        }
        fn enviar(&self, _bytes: &[u8]) -> Result<(), ErrorImpresion> {
            let n = self.veces.fetch_add(1, Ordering::SeqCst);
            if n < self.falla_las_primeras {
                Err(ErrorImpresion::NoDisponible("sin papel".into()))
            } else {
                Ok(())
            }
        }
    }

    fn archivo_temp(nombre: &str) -> PathBuf {
        std::env::temp_dir().join(format!("invventa-cola-{nombre}-{}.json", ahora_ms()))
    }

    fn doc(id: &str) -> Documento {
        Documento {
            id: id.into(),
            tipo: "ticket".into(),
            cuerpo: vec![Linea {
                cantidad: "1".into(),
                nombre: "Café".into(),
                ..Default::default()
            }],
            copias: 1,
            ..Default::default()
        }
    }

    #[test]
    fn encolar_devuelve_de_inmediato_aunque_la_impresora_tarde() {
        struct Lenta;
        impl Transporte for Lenta {
            fn nombre(&self) -> String {
                "lenta".into()
            }
            fn enviar(&self, _b: &[u8]) -> Result<(), ErrorImpresion> {
                std::thread::sleep(Duration::from_millis(800));
                Ok(())
            }
        }

        let archivo = archivo_temp("rapida");
        let cola = Cola::nueva(Box::new(Lenta), escpos::ANCHO_POR_DEFECTO, archivo.clone());

        let inicio = Instant::now();
        assert_eq!(cola.encolar(doc("a")), Recibo::Encolado);
        assert!(
            inicio.elapsed() < Duration::from_millis(200),
            "encolar no puede esperar a la impresora: bloquearía el cobro"
        );

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn el_mismo_id_no_se_imprime_dos_veces() {
        let veces = Arc::new(AtomicUsize::new(0));
        let archivo = archivo_temp("dup");
        let cola = Cola::nueva(
            Box::new(Contador { veces: Arc::clone(&veces), falla_las_primeras: 0 }),
            escpos::ANCHO_POR_DEFECTO,
            archivo.clone(),
        );

        assert_eq!(cola.encolar(doc("mismo")), Recibo::Encolado);
        esperar_hasta(&cola, |r| r.pendientes == 0);
        assert_eq!(cola.encolar(doc("mismo")), Recibo::Duplicado);

        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(veces.load(Ordering::SeqCst), 1, "solo debió imprimirse una vez");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn una_reimpresion_con_otro_id_si_sale() {
        let veces = Arc::new(AtomicUsize::new(0));
        let archivo = archivo_temp("reimp");
        let cola = Cola::nueva(
            Box::new(Contador { veces: Arc::clone(&veces), falla_las_primeras: 0 }),
            escpos::ANCHO_POR_DEFECTO,
            archivo.clone(),
        );

        cola.encolar(doc("t::1"));
        cola.encolar(doc("t::1::c2"));
        esperar_hasta(&cola, |r| r.pendientes == 0);

        assert_eq!(veces.load(Ordering::SeqCst), 2);
        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn reintenta_y_acaba_imprimiendo_cuando_vuelve_el_papel() {
        let veces = Arc::new(AtomicUsize::new(0));
        let archivo = archivo_temp("reintento");
        let cola = Cola::nueva(
            Box::new(Contador { veces: Arc::clone(&veces), falla_las_primeras: 2 }),
            escpos::ANCHO_POR_DEFECTO,
            archivo.clone(),
        );

        cola.encolar(doc("x"));
        // 2 fallos (2s + 4s de espera) y luego éxito.
        let limite = Instant::now() + Duration::from_secs(20);
        while cola.resumen().pendientes > 0 && Instant::now() < limite {
            std::thread::sleep(Duration::from_millis(100));
        }

        let r = cola.resumen();
        assert_eq!(r.pendientes, 0);
        assert_eq!(r.fallidos, 0);
        assert!(veces.load(Ordering::SeqCst) >= 3);

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn un_documento_vacio_no_mueve_la_impresora() {
        let veces = Arc::new(AtomicUsize::new(0));
        let archivo = archivo_temp("vacio");
        let cola = Cola::nueva(
            Box::new(Contador { veces: Arc::clone(&veces), falla_las_primeras: 0 }),
            escpos::ANCHO_POR_DEFECTO,
            archivo.clone(),
        );

        assert_eq!(cola.encolar(Documento::default()), Recibo::Vacio);
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(veces.load(Ordering::SeqCst), 0, "cortar papel en blanco gasta rollo");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn los_pendientes_sobreviven_a_un_reinicio_de_la_caja() {
        struct Muerta;
        impl Transporte for Muerta {
            fn nombre(&self) -> String {
                "muerta".into()
            }
            fn enviar(&self, _b: &[u8]) -> Result<(), ErrorImpresion> {
                Err(ErrorImpresion::NoDisponible("apagada".into()))
            }
        }

        let archivo = archivo_temp("persistencia");
        {
            let cola = Cola::nueva(Box::new(Muerta), escpos::ANCHO_POR_DEFECTO, archivo.clone());
            cola.encolar(doc("sobrevive"));
            std::thread::sleep(Duration::from_millis(300));
        }

        // Segundo arranque: lee el archivo y recupera lo pendiente.
        let estado = leer_estado(&archivo);
        let total = estado.pendientes.len() + estado.fallidos.len();
        assert_eq!(total, 1, "un ticket pendiente no puede perderse en un reinicio");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn tras_agotar_los_intentos_el_fallo_queda_visible_y_no_desaparece() {
        struct Muerta;
        impl Transporte for Muerta {
            fn nombre(&self) -> String {
                "muerta".into()
            }
            fn enviar(&self, _b: &[u8]) -> Result<(), ErrorImpresion> {
                Err(ErrorImpresion::NoDisponible("apagada".into()))
            }
        }

        let archivo = archivo_temp("fallidos");
        let cola = Cola::nueva(Box::new(Muerta), escpos::ANCHO_POR_DEFECTO, archivo.clone());
        cola.encolar(doc("perdido"));

        // 2+4+8+16 = 30s de esperas antes del quinto intento.
        let limite = Instant::now() + Duration::from_secs(45);
        while cola.resumen().fallidos == 0 && Instant::now() < limite {
            std::thread::sleep(Duration::from_millis(200));
        }

        let r = cola.resumen();
        assert_eq!(r.fallidos, 1, "el trabajo debe acabar en fallidos, no desaparecer");
        assert!(r.ultimo_error.is_some(), "y con el motivo a la vista");

        let f = cola.fallidos();
        assert_eq!(f[0].intentos, MAX_INTENTOS);

        let _ = std::fs::remove_file(&archivo);
    }
}
