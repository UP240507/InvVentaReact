// ─── InvVenta: entrada del contenedor Tauri ───────────────────────────────────
// El frontend (React/Vite) es EL MISMO que la versión web; aquí vive el shell
// nativo y el HUB LAN: el servidor local que imprime, sirve la app a los
// dispositivos del local y encola hacia Supabase.
//
// La ventana de la caja NO habla con el hub por HTTP: usa los comandos de abajo,
// que van por IPC. Los teléfonos y tablets sí van por HTTP, porque para ellos el
// hub es un servidor remoto. Misma lógica, dos puertas — y ninguna de las dos
// puede saltarse la cola.

pub mod hub;

use std::path::PathBuf;

use hub::documento::Documento;
use hub::transporte::{impresoras_instaladas, ConfigTransporte};
use hub::{ConfigHub, HubVivo};

use tauri::Manager;

struct EstadoApp {
    hub: Option<HubVivo>,
}

/// Estado del hub para la pantalla de diagnóstico.
#[tauri::command]
fn hub_estado(estado: tauri::State<'_, EstadoApp>) -> serde_json::Value {
    match &estado.hub {
        Some(h) => serde_json::json!({
            "activo": true,
            "puerto": h.estado.puerto,
            "ip": h.estado.ip_lan.map(|i| i.to_string()),
            "token": h.estado.token,
            "url": h.estado.ip_lan
                .map(|ip| format!("http://{}:{}", ip, h.estado.puerto))
                .unwrap_or_else(|| format!("http://localhost:{}", h.estado.puerto)),
            "cola": h.estado.cola.resumen(),
            // El ancho VIVO del rollo. Lo devolvía `/salud` (el camino HTTP del
            // teléfono) y NO este comando, que es el que usa la caja —donde
            // está la pantalla que lo configura—.
            //
            // Efecto en la caja (12-ago): elegir 80 mm se aplicaba y se
            // escribía en hub.json correctamente, pero al recargar el selector
            // volvía a enseñar 58 mm, porque `ancho_papel` llegaba `undefined`
            // y la pantalla cae a 58 por defecto. Parecía que el ajuste no se
            // guardaba; lo que no se guardaba era nada: mentía el selector.
            //
            // Mismo patrón que el pulso del cajón: dos capas correctas por
            // separado y el hueco justo en medio.
            "ancho_papel": h.estado.cola.ancho(),
            "impresoras": impresoras_instaladas(),
            "web": h.estado.web,
            "web_ms": h.estado.web_ms,
        }),
        // El hub caído no es fatal: la app sigue cobrando y guardando en Dexie.
        // Se dice claramente para que la pantalla de diagnóstico lo muestre en
        // vez de fingir que todo va bien.
        None => serde_json::json!({
            "activo": false,
            "motivo": "el hub no arrancó (ver la consola de la caja)",
        }),
    }
}

/// Encola un documento desde la propia ventana de la caja, sin pasar por HTTP.
#[tauri::command]
fn hub_imprimir(
    estado: tauri::State<'_, EstadoApp>,
    documento: Documento,
) -> Result<String, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(hub.estado.cola.encolar(documento).etiqueta().to_string())
}

/// Abre el cajón sin imprimir nada.
///
/// ── POR QUÉ HACE FALTA ADEMÁS DE LA RUTA HTTP ──────────────────────────────
/// `lib/Hub.js` bifurca en todas sus operaciones: dentro de Tauri invoca un
/// comando, fuera hace HTTP. La caja ES Tauri, y el cobro ocurre en la caja, así
/// que una función que sólo hablara HTTP no dispararía nunca el pulso donde más
/// importa. Fue exactamente el fallo del 12-ago: el código estaba, compilaba,
/// las pruebas pasaban, y el cajón no se abría al cobrar.
#[tauri::command]
fn hub_abrir_cajon(estado: tauri::State<'_, EstadoApp>) -> Result<(), String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    hub.estado
        .cola
        .abrir_cajon()
        .map_err(|e| format!("no se pudo abrir el cajón: {e}"))
}

/// Deja en la caja una copia de lo que esta ventana acaba de encolar.
///
/// ── POR QUÉ EXISTEN ESTOS TRES COMANDOS Y NO SÓLO LAS RUTAS HTTP ────────────
/// Es la lección del pulso del cajón, que se escribió sólo con su ruta HTTP y
/// por eso nunca disparaba: **el cobro de la caja ocurre DENTRO de Tauri**, y
/// ahí `lib/Hub.js` no hace fetch, invoca. Un respaldo que sólo funcionara por
/// HTTP dejaría sin segunda copia justo al equipo que más cobra.
#[tauri::command]
fn hub_respaldar(
    estado: tauri::State<'_, EstadoApp>,
    anotaciones: Vec<hub::respaldo::Anotacion>,
) -> Result<serde_json::Value, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    let mut anotados = 0;
    let mut duplicados = 0;
    let mut invalidos = 0;

    for mut a in anotaciones {
        // La caja se marca como tal, no con un token. Aquí estaba
        // `hub.estado.token`, que se regenera en cada arranque —eso protege el
        // QR y hay que conservarlo—, así que al reiniciar la caja dejaba de
        // reconocer lo que ella misma había respaldado. Ver `respaldo::CAJA`.
        a.dispositivo = hub::respaldo::CAJA.to_string();
        match hub.estado.respaldo.anotar(a) {
            hub::respaldo::Recibo::Anotado => anotados += 1,
            hub::respaldo::Recibo::Duplicado => duplicados += 1,
            hub::respaldo::Recibo::Invalido => invalidos += 1,
        }
    }

    Ok(serde_json::json!({
        "anotados": anotados,
        "duplicados": duplicados,
        "invalidos": invalidos,
    }))
}

#[tauri::command]
fn hub_confirmar_respaldo(
    estado: tauri::State<'_, EstadoApp>,
    claves: Vec<String>,
) -> Result<usize, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(hub.estado.respaldo.confirmar(&claves))
}

/// Lo que la caja tiene que adoptar: ventas de dispositivos que ya no dan
/// señales. No devuelve las suyas propias — de ésas ya se encarga su cola.
#[tauri::command]
fn hub_respaldo_pendientes(
    estado: tauri::State<'_, EstadoApp>,
) -> Result<serde_json::Value, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    // Lo de la caja ya no se excluye aquí: lo excluye `pendientes()`, que es
    // donde no se puede olvidar. Este cierre sólo contesta por los teléfonos.
    let huerfanas = hub.estado.respaldo.pendientes(|d| {
        hub.estado
            .dispositivos
            .visto_hace_menos_de(d, hub::servidor::VENTANA_VIVO_MS)
    });
    Ok(serde_json::json!({
        "resumen": hub.estado.respaldo.resumen(),
        "anotaciones": huerfanas,
    }))
}

/// Ticket maquetado en texto plano, sin gastar papel.
#[tauri::command]
fn hub_previsualizar(estado: tauri::State<'_, EstadoApp>, documento: Documento) -> String {
    // Si el hub no está activo se cae al de por defecto en vez de fallar: una
    // vista previa aproximada vale más que un error en la pantalla de ajustes.
    let cols = estado
        .hub
        .as_ref()
        .map(|h| h.estado.cola.ancho())
        .unwrap_or(hub::escpos::ANCHO_POR_DEFECTO);
    hub::escpos::previsualizar(&documento, cols)
}

#[tauri::command]
fn hub_cola(estado: tauri::State<'_, EstadoApp>) -> Result<serde_json::Value, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(serde_json::json!({
        "resumen": hub.estado.cola.resumen(),
        "fallidos": hub.estado.cola.fallidos(),
    }))
}

/// Dispositivos emparejados. Sin tokens: ver `dispositivos::Publico`.
#[tauri::command]
fn hub_dispositivos(
    estado: tauri::State<'_, EstadoApp>,
) -> Result<Vec<hub::dispositivos::Publico>, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(hub.estado.dispositivos.listar())
}

/// Revoca un dispositivo. El token deja de valer de inmediato, sin reiniciar
/// el hub — que es lo que se necesita cuando un teléfono se queda en un taxi.
#[tauri::command]
fn hub_revocar(estado: tauri::State<'_, EstadoApp>, id: String) -> Result<bool, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(hub.estado.dispositivos.revocar(&id))
}

#[tauri::command]
fn hub_reintentar(estado: tauri::State<'_, EstadoApp>) -> Result<usize, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(hub.estado.cola.reintentar_fallidos())
}

#[tauri::command]
fn hub_descartar(estado: tauri::State<'_, EstadoApp>) -> Result<usize, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;
    Ok(hub.estado.cola.descartar_fallidos())
}

/// Cambia la impresora en caliente y lo deja escrito para el próximo arranque.
/// Los trabajos que ya estaban en cola salen por la nueva: es exactamente lo
/// que se quiere cuando descubres que el nombre estaba mal escrito.
#[tauri::command]
fn hub_configurar_impresora(
    estado: tauri::State<'_, EstadoApp>,
    transporte: ConfigTransporte,
    ancho_papel: Option<usize>,
) -> Result<String, String> {
    let hub = estado.hub.as_ref().ok_or("el hub no está activo")?;

    let nuevo = transporte.construir(&hub.carpeta_datos);
    let nombre = nuevo.nombre();
    hub.estado.cola.cambiar_transporte(nuevo);

    let mut config = ConfigHub::leer(&hub.carpeta_datos);

    // El ancho llega opcional para no romper a quien ya llama a este comando
    // sólo con el transporte: si no viene, se conserva el guardado.
    if let Some(cols) = ancho_papel {
        hub.estado.cola.cambiar_ancho(cols);
        config.ancho_papel = cols;
    }

    config.transporte = transporte;
    config
        .guardar(&hub.carpeta_datos)
        .map_err(|e| format!("no se pudo guardar la configuración: {e}"))?;

    Ok(nombre)
}

/// Cierra el splash y muestra la ventana principal.
///
/// Lo llama el front cuando la app está **usable** —sesión resuelta y datos
/// hidratados—, no a los N segundos. Un temporizador cambiaría una espera
/// honesta por una pantalla congelada: la marca desaparecería y el usuario se
/// quedaría mirando una app a medio cargar.
///
/// Es idempotente: si ya se llamó, no pasa nada. React puede montar dos veces
/// en modo estricto y no queremos que el segundo intento reviente.
#[tauri::command]
fn app_lista(app: tauri::AppHandle) {
    mostrar_principal(&app);
}

fn mostrar_principal(app: &tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(principal) = app.get_webview_window("main") {
        let _ = principal.show();
        let _ = principal.set_focus();
    }
}

/// Carpeta con el build de React que el hub sirve a la LAN.
///
/// En release viene empaquetada como recurso (`bundle.resources: ["../dist"]`
/// en tauri.conf.json). Sí, eso mete `dist` dos veces en el instalador: una
/// embebida en el binario para la ventana de la caja y otra en disco para
/// servirla por HTTP. Son unos pocos MB y evita tener que extraer los assets
/// del binario en tiempo de ejecución para poder servirlos.
///
/// En `tauri dev` el frontend lo sirve Vite, así que `dist` puede estar
/// desactualizado: se busca pero no se exige. Si no está, el hub arranca igual
/// y funciona como servicio de impresión.
fn carpeta_web(app: &tauri::AppHandle) -> Option<PathBuf> {
    let tiene_app = |p: &PathBuf| p.join("index.html").exists();

    if let Ok(dir) = app.path().resource_dir() {
        for nombre in ["dist", "web", "_up_/dist"] {
            let candidato = dir.join(nombre);
            if tiene_app(&candidato) {
                return Some(candidato);
            }
        }
    }

    let en_desarrollo = PathBuf::from("../dist");
    if tiene_app(&en_desarrollo) {
        return Some(en_desarrollo);
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Notificaciones nativas para el KDS. Va aquí y no en el front con la
        // API web porque WebView2 no la implementa: `Notification.permission`
        // nunca llega a 'granted' y el aviso se pierde sin decir nada.
        .plugin(tauri_plugin_notification::init())
        // Auto-actualizacion. El plugin sólo EXPONE la capacidad; quién y
        // cuándo la dispara lo decide el front, a propósito: sin firma de
        // código Windows enseña su aviso en cada versión nueva, así que una
        // actualización silenciosa se convertiría en una llamada de soporte a
        // media comida. Ver `lib/Actualizacion.js`.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            hub_estado,
            hub_imprimir,
            hub_previsualizar,
            hub_cola,
            hub_dispositivos,
            hub_revocar,
            hub_reintentar,
            hub_descartar,
            hub_configurar_impresora,
            hub_abrir_cajon,
            hub_respaldar,
            hub_confirmar_respaldo,
            hub_respaldo_pendientes,
            app_lista,
        ])
        .setup(|app| {
            let carpeta_datos = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            let version = app.package_info().version.to_string();
            let web = carpeta_web(app.handle());

            // Un fallo del hub NO tumba la app. La caja tiene que poder cobrar
            // aunque el puerto esté ocupado o la impresora no exista: el orden
            // de importancia es cobrar, luego imprimir, luego repartir la app.
            let hub = match hub::arrancar(carpeta_datos, web, version) {
                Ok(h) => Some(h),
                Err(e) => {
                    eprintln!("[hub] no arrancó: {e}. La app sigue funcionando sin hub.");
                    None
                }
            };

            app.manage(EstadoApp { hub });

            // ── INTERRUPTOR DE SEGURIDAD DEL SPLASH ──────────────────────────
            // La ventana principal arranca oculta y solo la muestra el front al
            // terminar de cargar. Si el front NUNCA llega a decirlo —un error
            // de JavaScript, un bundle roto, una migración de Dexie que se
            // atasca— el usuario se quedaría con la caja mostrando un splash
            // eterno y ninguna ventana usable. Eso es peor que arrancar feo.
            //
            // A los 12 segundos se muestra igualmente. Si la app está rota, al
            // menos se ve la pantalla rota y se puede diagnosticar; si solo iba
            // lenta, el splash ya se habrá cerrado por su cuenta y esto no hace
            // nada (`mostrar_principal` es idempotente).
            let manija = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(12));
                mostrar_principal(&manija);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al arrancar la aplicación Tauri");
}
