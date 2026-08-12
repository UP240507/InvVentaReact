//! Servidor HTTP del hub.
//!
//! Hace dos trabajos que parecen uno solo:
//!
//! 1. **Sirve la app** a los dispositivos de la LAN. Esto no es comodidad, es
//!    la única forma de que funcione: un PWA cargado por HTTPS no puede hacer
//!    fetch a una IP local por HTTP (mixed content), y sin internet el teléfono
//!    ni siquiera llegaría a cargar la app. La caja tiene que ser el ORIGEN,
//!    no un respaldo al que se acude cuando falla la nube.
//!
//! 2. **Recibe documentos a imprimir** de cualquier dispositivo y los encola.
//!
//! Sobre la autenticación: hay un token que se genera en cada arranque y se
//! enseña en la pantalla de pairing. Es deliberadamente simple —no sustituye al
//! JWT de Supabase— porque su único trabajo es que un teléfono cualquiera de la
//! red del local no pueda mandar a imprimir. Sin internet no hay forma de
//! validar un JWT, y la caja no puede quedarse sin imprimir por eso.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use serde_json::json;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::hub::cola::{Cola, Recibo};
use crate::hub::dispositivos::Registro;
use crate::hub::documento::Documento;
use crate::hub::escpos;
use crate::hub::transporte::impresoras_instaladas;

pub struct EstadoHub {
    pub cola: Arc<Cola>,
    /// Token de EMPAREJAMIENTO: el que va en el QR. No concede acceso por sí
    /// mismo; solo sirve para canjearlo por un token propio en `/hub/emparejar`.
    /// Así el QR puede quedarse pegado en la pared sin que una foto conceda
    /// acceso permanente.
    pub token: String,
    pub dispositivos: Registro,
    pub puerto: u16,
    pub ip_lan: Option<IpAddr>,
    pub version: String,
    /// Carpeta del build de React que se sirve a la LAN, y cuándo se compiló.
    ///
    /// Se expone a propósito. En `tauri dev` la VENTANA de la caja carga desde
    /// Vite —siempre al día— pero los teléfonos reciben `dist/`, que es lo que
    /// dejó el último `npm run build`. Cuando esas dos cosas se separan, el
    /// síntoma es desconcertante: la caja se comporta bien y el teléfono corre
    /// una versión vieja **sin dar ningún error**. Pasó de verdad el 5-ago y
    /// costó una vuelta entera de diagnóstico; por eso la fecha ahora se ve.
    pub web: Option<String>,
    pub web_ms: u128,
}

#[derive(Serialize)]
struct RespuestaSalud {
    ok: bool,
    servicio: &'static str,
    version: String,
    puerto: u16,
    ip_lan: Option<String>,
    cola: crate::hub::cola::Resumen,
    web: Option<String>,
    web_ms: u128,
    /// Columnas del papel vigentes. Va aquí y no en una ruta propia porque la
    /// pantalla del hub ya pide `/salud` cada 5 s: un endpoint más sería una
    /// petición más para un dato que cabe en la que ya se hace.
    ancho_papel: usize,
}

/// Determina la IP del equipo en la LAN abriendo un socket UDP "hacia" una
/// dirección externa. No se envía ni un byte: solo obliga al sistema a elegir
/// la interfaz de salida, que es exactamente la que ven los teléfonos. Es más
/// fiable que enumerar interfaces, donde hay que adivinar cuál es la buena
/// entre el wifi, el ethernet, el adaptador virtual de Docker y el de la VPN.
pub fn ip_lan() -> Option<IpAddr> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    sock.local_addr().ok().map(|a| a.ip())
}

/// Token de sesión del hub. Sin dependencias de criptografía: no protege
/// dinero ni datos, solo evita que un dispositivo no emparejado mande papel.
/// Si algún día autentica algo serio, esto tiene que cambiar por un CSPRNG.
pub fn token_de_arranque() -> String {
    generar_token()
}

fn generar_token() -> String {
    let n = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mezcla = n ^ (std::process::id() as u128).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    format!("{:016x}", (mezcla as u64) ^ ((mezcla >> 64) as u64))
}

fn token_de(headers: &HeaderMap) -> &str {
    headers
        .get("x-invventa-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

/// Autoriza una operación normal (imprimir, ver la cola).
///
/// Vale el token de un dispositivo emparejado **o** el de emparejamiento. Lo
/// segundo es a propósito: la caja recién instalada, antes de emparejar nada,
/// tiene que poder imprimir el ticket de prueba. Si exigiéramos un dispositivo
/// registrado, el primer arranque no podría verificarse.
fn autorizado(estado: &EstadoHub, headers: &HeaderMap) -> bool {
    let t = token_de(headers);
    if t.is_empty() {
        return false;
    }
    t == estado.token || estado.dispositivos.validar(t)
}

/// Autoriza operaciones de ADMINISTRACIÓN: revocar dispositivos, cambiar la
/// impresora. Solo el token de emparejamiento, que vive en la caja.
///
/// La distinción importa: un teléfono emparejado puede imprimir, pero no debe
/// poder echar del local a los demás dispositivos ni reconfigurar el hardware.
fn autorizado_admin(estado: &EstadoHub, headers: &HeaderMap) -> bool {
    let t = token_de(headers);
    !t.is_empty() && t == estado.token
}

async fn salud(State(estado): State<Arc<EstadoHub>>) -> impl IntoResponse {
    Json(RespuestaSalud {
        ok: true,
        servicio: "invventa-hub",
        version: estado.version.clone(),
        puerto: estado.puerto,
        ip_lan: estado.ip_lan.map(|i| i.to_string()),
        cola: estado.cola.resumen(),
        web: estado.web.clone(),
        web_ms: estado.web_ms,
        ancho_papel: estado.cola.ancho(),
    })
}

async fn imprimir(
    State(estado): State<Arc<EstadoHub>>,
    headers: HeaderMap,
    Json(doc): Json<Documento>,
) -> impl IntoResponse {
    if !autorizado(&estado, &headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "ok": false, "error": "token inválido o ausente" })),
        );
    }

    match estado.cola.encolar(doc) {
        // 202: aceptado, todavía no impreso. Es la verdad, y es importante que
        // el cliente no crea que el papel ya salió.
        Recibo::Encolado => (
            StatusCode::ACCEPTED,
            Json(json!({ "ok": true, "estado": "encolado" })),
        ),
        // Un duplicado NO es un error: el cliente reintentó porque el wifi
        // parpadeó, que es justo lo que debe hacer. Se le dice que ya estaba.
        Recibo::Duplicado => (
            StatusCode::OK,
            Json(json!({ "ok": true, "estado": "duplicado" })),
        ),
        Recibo::Vacio => (
            StatusCode::OK,
            Json(json!({ "ok": true, "estado": "vacio" })),
        ),
    }
}

/// Devuelve el ticket maquetado en texto plano, sin tocar la impresora.
/// Permite revisar alineación y cortes de palabra sin gastar papel — y sin
/// tener impresora, que es la situación mientras se escribe esto.
async fn previsualizar(
    State(estado): State<Arc<EstadoHub>>,
    Json(doc): Json<Documento>,
) -> impl IntoResponse {
    // El ancho VIVO, no la constante: la vista previa tiene que mentir lo menos
    // posible sobre lo que va a salir por el papel. Con la constante, cambiar a
    // 80 mm dejaba la previsualización enseñando 32 columnas para siempre.
    let cols = estado.cola.ancho();
    Json(json!({
        "ok": true,
        "ancho": cols,
        "texto": escpos::previsualizar(&doc, cols),
    }))
}

async fn estado_cola(State(estado): State<Arc<EstadoHub>>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "resumen": estado.cola.resumen(),
        "fallidos": estado.cola.fallidos(),
    }))
}

async fn reintentar(
    State(estado): State<Arc<EstadoHub>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !autorizado_admin(&estado, &headers) {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "ok": false })));
    }
    let n = estado.cola.reintentar_fallidos();
    (StatusCode::OK, Json(json!({ "ok": true, "reencolados": n })))
}

async fn descartar(
    State(estado): State<Arc<EstadoHub>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !autorizado_admin(&estado, &headers) {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "ok": false })));
    }
    let n = estado.cola.descartar_fallidos();
    (StatusCode::OK, Json(json!({ "ok": true, "descartados": n })))
}

/// Lo que hay que enseñar en la pantalla de pairing para que un teléfono se
/// conecte: a dónde apuntar y con qué token. El QR se pinta en el front.
async fn pairing(State(estado): State<Arc<EstadoHub>>) -> impl IntoResponse {
    let url = estado
        .ip_lan
        .map(|ip| format!("http://{}:{}", ip, estado.puerto))
        .unwrap_or_else(|| format!("http://localhost:{}", estado.puerto));

    Json(json!({
        "ok": true,
        "url": url,
        "token": estado.token,
        "impresoras": impresoras_instaladas(),
    }))
}

#[derive(serde::Deserialize)]
struct PeticionEmparejar {
    #[serde(default)]
    nombre: String,
    #[serde(default)]
    rol: String,
}

/// Canjea el token de emparejamiento por uno PROPIO del dispositivo.
///
/// Es lo que hace que revocar sea una operación de un solo elemento. Y es la
/// razón de que el QR pueda quedarse pegado en la pared: quien le saque una
/// foto tendría que además emparejarse, y ese emparejamiento aparece en la
/// lista de la caja con su hora, a la vista del dueño.
async fn emparejar(
    State(estado): State<Arc<EstadoHub>>,
    headers: HeaderMap,
    Json(p): Json<PeticionEmparejar>,
) -> impl IntoResponse {
    if !autorizado_admin(&estado, &headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "ok": false, "error": "token de emparejamiento inválido" })),
        );
    }

    let d = estado.dispositivos.emparejar(&p.nombre, &p.rol);
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "id": d.id,
            "nombre": d.nombre,
            "rol": d.rol,
            // Única vez que un token de dispositivo sale del hub: justo al
            // crearlo, hacia su dueño. El listado nunca lo devuelve.
            "token": d.token,
        })),
    )
}

async fn listar_dispositivos(State(estado): State<Arc<EstadoHub>>) -> impl IntoResponse {
    Json(json!({ "ok": true, "dispositivos": estado.dispositivos.listar() }))
}

#[derive(serde::Deserialize)]
struct PeticionAncho {
    #[serde(default)]
    ancho: usize,
}

async fn configurar_ancho(
    State(estado): State<Arc<EstadoHub>>,
    headers: HeaderMap,
    Json(p): Json<PeticionAncho>,
) -> impl IntoResponse {
    if !autorizado_admin(&estado, &headers) {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "ok": false })));
    }
    // Sólo los dos anchos que existen. Un número libre aquí produciría tickets
    // que no caben en ningún rollo, y el fallo se vería en el papel y no antes.
    let cols = match p.ancho {
        n if n == escpos::ANCHO_80 => escpos::ANCHO_80,
        n if n == escpos::ANCHO_58 => escpos::ANCHO_58,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "ok": false,
                    "error": "ancho no soportado: 32 (58 mm) o 48 (80 mm)"
                })),
            )
        }
    };
    estado.cola.cambiar_ancho(cols);
    (StatusCode::OK, Json(json!({ "ok": true, "ancho": cols })))
}

#[derive(serde::Deserialize)]
struct PeticionRevocar {
    #[serde(default)]
    id: String,
}

async fn revocar(
    State(estado): State<Arc<EstadoHub>>,
    headers: HeaderMap,
    Json(p): Json<PeticionRevocar>,
) -> impl IntoResponse {
    if !autorizado_admin(&estado, &headers) {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "ok": false })));
    }
    let quitado = estado.dispositivos.revocar(&p.id);
    (
        StatusCode::OK,
        Json(json!({ "ok": true, "revocado": quitado })),
    )
}

pub fn rutas(estado: Arc<EstadoHub>, dir_web: Option<std::path::PathBuf>) -> Router {
    let api = Router::new()
        .route("/salud", get(salud))
        .route("/pairing", get(pairing))
        .route("/emparejar", post(emparejar))
        .route("/dispositivos", get(listar_dispositivos))
        .route("/dispositivos/revocar", post(revocar))
        .route("/imprimir", post(imprimir))
        .route("/previsualizar", post(previsualizar))
        .route("/cola", get(estado_cola))
        .route("/cola/reintentar", post(reintentar))
        .route("/cola/descartar", post(descartar))
        .route("/impresora/ancho", post(configurar_ancho))
        .with_state(estado);

    let mut app = Router::new().nest("/hub", api).layer(
        // Permisivo a propósito: la ventana de Tauri corre en el origen
        // `tauri://localhost` y hace fetch a `http://127.0.0.1`, que para el
        // navegador es otro origen. Lo que protege el endpoint no es el CORS
        // —que un cliente que no sea navegador se salta— sino el token.
        CorsLayer::permissive(),
    );

    if let Some(dir) = dir_web {
        let index = dir.join("index.html");
        // Fallback a index.html: la app usa react-router, así que una recarga
        // en /mesas pide una ruta que no existe como archivo. Sin esto, el
        // mesero que refresca la pantalla se lleva un 404.
        let estaticos = ServeDir::new(&dir).fallback(ServeFile::new(index));
        app = app.fallback_service(estaticos);
    }

    app
}

/// Abre el puerto ANTES de construir el estado del hub, y de forma síncrona.
///
/// El orden importa: la pantalla de pairing enseña la URL con el puerto, y si
/// el 3000 estaba ocupado y el hub acabó en el 3001, el QR tiene que llevar el
/// puerto real. Averiguarlo después de publicar el estado significa enseñar
/// una dirección equivocada durante los primeros segundos — y ésos son justo
/// los que el mesero usa para escanear.
///
/// Se prueban 10 puertos: en una caja con algo más en el 3000 es preferible
/// arrancar en el 3001 y decirlo, que no arrancar.
pub fn abrir_puerto(puerto_preferido: u16) -> std::io::Result<(std::net::TcpListener, u16)> {
    for offset in 0..10u16 {
        let puerto = puerto_preferido.saturating_add(offset);
        // 0.0.0.0 y no 127.0.0.1: escuchando solo en loopback los teléfonos de
        // la LAN no podrían conectarse y el hub no serviría para nada.
        let addr = SocketAddr::from(([0, 0, 0, 0], puerto));
        if let Ok(l) = std::net::TcpListener::bind(addr) {
            l.set_nonblocking(true)?;
            return Ok((l, puerto));
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AddrInUse,
        format!(
            "no hay puerto libre entre {puerto_preferido} y {}",
            puerto_preferido + 9
        ),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_token_no_es_constante_entre_arranques() {
        let a = generar_token();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = generar_token();
        assert_ne!(a, b);
        assert_eq!(a.len(), 16);
    }

    fn estado_de_prueba(token: &str) -> EstadoHub {
        let dir = std::env::temp_dir().join(format!(
            "invventa-srv-{}.json",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        EstadoHub {
            cola: crate::hub::cola::Cola::nueva(
                Box::new(crate::hub::transporte::Simulador::nueva(
                    std::env::temp_dir().join("invventa-srv-imp"),
                )),
                escpos::ANCHO_POR_DEFECTO,
                dir.with_extension("cola.json"),
            ),
            token: token.to_string(),
            dispositivos: Registro::nuevo(dir),
            puerto: 3000,
            ip_lan: None,
            version: "test".into(),
            web: None,
            web_ms: 0,
        }
    }

    fn con_token(t: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("x-invventa-token", t.parse().unwrap());
        h
    }

    #[test]
    fn el_token_de_emparejamiento_autoriza_y_el_incorrecto_no() {
        let e = estado_de_prueba("abc123");
        assert!(autorizado(&e, &con_token("abc123")));
        assert!(!autorizado(&e, &con_token("otro")));
        assert!(!autorizado(&e, &HeaderMap::new()));
    }

    #[test]
    fn un_dispositivo_emparejado_puede_imprimir_con_su_propio_token() {
        let e = estado_de_prueba("abc123");
        let d = e.dispositivos.emparejar("Tablet", "mesero");
        assert!(autorizado(&e, &con_token(&d.token)));
    }

    #[test]
    fn pero_no_puede_administrar() {
        // Un teléfono emparejado imprime; no debe poder echar del local a los
        // demás dispositivos ni reconfigurar la impresora.
        let e = estado_de_prueba("abc123");
        let d = e.dispositivos.emparejar("Tablet", "mesero");
        assert!(!autorizado_admin(&e, &con_token(&d.token)));
        assert!(autorizado_admin(&e, &con_token("abc123")));
    }

    #[test]
    fn revocar_deja_al_dispositivo_sin_poder_imprimir() {
        let e = estado_de_prueba("abc123");
        let d = e.dispositivos.emparejar("Teléfono perdido", "mesero");
        assert!(autorizado(&e, &con_token(&d.token)));

        e.dispositivos.revocar(&d.id);
        assert!(!autorizado(&e, &con_token(&d.token)));
    }
}
