//! Respaldo de ventas en la caja (3.4 / 3.5).
//!
//! ── EL PROBLEMA ─────────────────────────────────────────────────────────────
//! Hoy la cola de salida vive en el navegador de cada dispositivo. Si a un
//! teléfono se le acaba la batería, se le limpia el navegador o se pierde antes
//! de que vuelva internet, **las ventas que cobró se van con él**. No hay
//! segunda copia en ninguna parte. La caja, en cambio, es un equipo fijo,
//! enchufado y con disco.
//!
//! ── LO QUE ESTE MÓDULO NO HACE, Y ES LO IMPORTANTE ──────────────────────────
//! **El hub sólo RESPALDA. Nunca habla con Supabase.** El teléfono sigue siendo
//! quien sincroniza; aquí sólo deja una copia. Cuando un teléfono muere, la
//! caja —que sí tiene sesión de administrador— adopta lo que quedó sin
//! confirmar y lo sube ella.
//!
//! La alternativa cómoda era que el hub sincronizara solo, y su precio era
//! inaceptable: para escribir en `ventas` necesitaría un JWT que satisfaga RLS,
//! y eso obliga o a guardar credenciales de empleados en el disco de un equipo
//! que está en la barra de un restaurante, o a darle `service_role`, que es
//! saltarse RLS entera. Guardando sólo bytes, el problema no existe.
//!
//! ── POR QUÉ NO SE PARECE A `cola.rs` ────────────────────────────────────────
//! Comparte la idea (persistir en disco, recordar claves vistas) y se aparta en
//! tres cosas, a propósito:
//!
//! - **No hay hilo trabajador.** Este módulo no hace nada por su cuenta: guarda
//!   y entrega. Todo el movimiento lo empuja alguien de fuera.
//! - **Escritura por añadido (NDJSON), no reescritura completa.** `cola.rs`
//!   serializa su estado entero en cada `guardar()`. Con trabajos de impresión
//!   da igual; con ventas —que llevan sus `items` dentro— el archivo crece a
//!   megabytes y reescribirlo **en cada cobro** es gasto sobre gasto. Aquí cada
//!   anotación es una línea; el archivo se compacta al arrancar.
//! - **Sin `MAX_INTENTOS`.** No hay nada que reintentar: una anotación vive
//!   hasta que alguien la confirma. Caducar una venta sin subir sería tirar
//!   dinero por no llevar la cuenta.

use std::collections::{HashMap, VecDeque};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

/// Cuántas claves ya confirmadas se recuerdan para descartar duplicados.
///
/// La LAN reenvía POSTs —el teléfono reintenta porque el wifi parpadeó—, así
/// que sin memoria una venta ya subida y confirmada volvería a entrar como
/// pendiente y la caja la subiría otra vez. 5000 cubre varios días de un
/// restaurante ocupado; el archivo con eso sigue siendo pequeño porque una
/// clave confirmada son ~40 bytes.
const MEMORIA_CONFIRMADAS: usize = 5000;

/// Marca reservada para las anotaciones que deja **la propia caja**.
///
/// ── POR QUÉ NO VALE SU TOKEN, QUE ES LO QUE SE USABA ────────────────────────
/// La caja se firmaba con `estado.token`, que es el token de EMPAREJAMIENTO —el
/// que va en el QR— y `servidor.rs` lo regenera **en cada arranque**. Eso es a
/// propósito y hay que conservarlo: es lo que hace que una foto vieja del QR
/// pegado en la cocina deje de servir. Hay incluso una prueba que lo fija,
/// `el_token_no_es_constante_entre_arranques`.
///
/// Pero este archivo SÍ sobrevive al reinicio. O sea que cada anotación de la
/// caja quedaba firmada con un valor que moría esa misma noche: al volver a
/// arrancar, `pendientes()` comparaba contra el token nuevo, no reconocía
/// ninguna de las suyas, y **la caja se ofrecía a adoptar su propio trabajo**.
/// Nunca dio un error —los dos lados hacían lo correcto con el dato que tenían—
/// y por eso costó tres hipótesis. Es la mitad que quedaba abierta del fallo 5.
///
/// El arreglo no es persistir el token: eso cambiaría una propiedad de seguridad
/// para resolver un problema de identidad. Es dejar de deducir quién escribió
/// una anotación comparando cadenas **después**, cuando en el momento de
/// escribirla se sabe con certeza.
///
/// No puede chocar con un token real —`generar_token()` devuelve 16 caracteres
/// hexadecimales y esto lleva dos puntos— y un teléfono no lo puede falsificar:
/// ni la ruta HTTP ni el comando de Tauri leen `dispositivo` del cuerpo, los dos
/// lo sobrescriben con el emisor antes de anotar.
pub const CAJA: &str = "::caja::";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Anotacion {
    /// `"ventas::1829286241974646"`. Única entre dispositivos gracias a
    /// `lib/IdVenta.js` — sin eso, dos cobros en el mismo milisegundo desde dos
    /// teléfonos compartirían clave y el segundo se descartaría como duplicado
    /// **en silencio**, que es peor que la pérdida que esto viene a evitar.
    pub clave: String,
    /// Quién la dejó: el token del dispositivo, o `CAJA` si fue la caja misma.
    /// Sirve para saber a quién huerfanar.
    #[serde(default)]
    pub dispositivo: String,
    /// La tarea tal cual la encola el front: `{ tabla | rpc, metodo, data }`.
    /// Se guarda opaca a propósito: el hub no entiende de ventas, y el día que
    /// el front cambie la forma del payload no hay que tocar Rust.
    pub tarea: serde_json::Value,
    #[serde(default)]
    /// **u64 y no u128, y esto NO es un detalle de estilo.**
    ///
    /// `Entrada` es un enum con etiqueta interna (`#[serde(tag = "t")]`), y esos
    /// serializan a través de un buffer intermedio de serde que **no soporta
    /// enteros de 128 bits**. Con `u128` aquí, `serde_json::to_string` devolvía
    /// `Err` y —como el error se tragaba— **no se escribía NI UNA línea al
    /// disco**. Las 67 pruebas en memoria pasaban; fallaban justo las tres que
    /// reabren el archivo. El fallo silencioso de siempre, esta vez en Rust.
    ///
    /// u64 en milisegundos alcanza hasta el año 584.554.531. De sobra.
    pub creado_ms: u64,
}

/// Una línea del archivo. El formato es un diario, no una foto: se añade lo que
/// pasa y el estado se reconstruye leyéndolo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t")]
enum Entrada {
    #[serde(rename = "a")]
    Anotada(Anotacion),
    #[serde(rename = "c")]
    Confirmada { clave: String },
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Recibo {
    Anotado,
    Duplicado,
    Invalido,
}

impl Recibo {
    pub fn etiqueta(&self) -> &'static str {
        match self {
            Recibo::Anotado => "anotado",
            Recibo::Duplicado => "duplicado",
            Recibo::Invalido => "invalido",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Resumen {
    /// Anotaciones vivas: alguien las dejó y nadie ha confirmado que subieron.
    pub pendientes: usize,
    /// Edad de la más vieja, en milisegundos. La pantalla la usa para gritar:
    /// una venta de hace tres semanas que nadie subió sigue siendo dinero.
    pub mas_vieja_ms: u64,
    pub confirmadas_recordadas: usize,
}

struct Interior {
    /// Clave → anotación. `HashMap` y no `Vec` porque la operación caliente es
    /// «¿ya tengo esta clave?», una vez por cobro.
    pendientes: HashMap<String, Anotacion>,
    /// Cola acotada: la más vieja sale cuando entra la número 5001.
    confirmadas: VecDeque<String>,
}

pub struct Respaldo {
    interior: Mutex<Interior>,
    archivo: PathBuf,
}

impl Respaldo {
    pub fn nuevo(archivo: PathBuf) -> Arc<Self> {
        let interior = leer_diario(&archivo);
        let respaldo = Arc::new(Self {
            interior: Mutex::new(interior),
            archivo,
        });
        // Compactar AL ARRANCAR y no al cerrar: un cierre sucio —que es el caso
        // que este módulo existe para sobrevivir— no ejecuta código de salida.
        respaldo.compactar();
        respaldo
    }

    /// Deja una copia. No sube nada, no bloquea a nadie.
    pub fn anotar(&self, anotacion: Anotacion) -> Recibo {
        if anotacion.clave.trim().is_empty() {
            // Sin clave no hay deduplicado posible, y sin deduplicado la LAN
            // acabaría multiplicando la misma venta. Se rechaza en la puerta.
            return Recibo::Invalido;
        }

        let mut interior = self.interior.lock().unwrap();

        if interior.pendientes.contains_key(&anotacion.clave)
            || interior.confirmadas.iter().any(|c| *c == anotacion.clave)
        {
            return Recibo::Duplicado;
        }

        let mut anotacion = anotacion;
        if anotacion.creado_ms == 0 {
            anotacion.creado_ms = ahora_ms();
        }

        self.escribir(&Entrada::Anotada(anotacion.clone()));
        interior.pendientes.insert(anotacion.clave.clone(), anotacion);
        Recibo::Anotado
    }

    /// «Esto ya está en Supabase, olvídalo.» Devuelve cuántas reconoció.
    ///
    /// Confirmar una clave que no existe NO es un error: puede llegar de un
    /// teléfono que respaldó contra otra caja, o después de una compactación.
    /// Tratarlo como fallo haría ruido en el camino del dinero por algo que no
    /// tiene consecuencia.
    pub fn confirmar(&self, claves: &[String]) -> usize {
        let mut interior = self.interior.lock().unwrap();
        let mut reconocidas = 0;

        for clave in claves {
            if clave.trim().is_empty() {
                continue;
            }
            if interior.pendientes.remove(clave).is_some() {
                reconocidas += 1;
            }
            // Se recuerda SIEMPRE, exista o no la pendiente: el objetivo de la
            // memoria es que un reenvío tardío no la resucite.
            if !interior.confirmadas.iter().any(|c| c == clave) {
                interior.confirmadas.push_back(clave.clone());
                while interior.confirmadas.len() > MEMORIA_CONFIRMADAS {
                    interior.confirmadas.pop_front();
                }
            }
            self.escribir(&Entrada::Confirmada {
                clave: clave.clone(),
            });
        }

        reconocidas
    }

    /// Lo que hay que adoptar: anotaciones sin confirmar cuyo dispositivo ya no
    /// está.
    ///
    /// La liveza se pregunta con un cierre y no se calcula aquí para que este
    /// módulo no dependa del registro de dispositivos —y, sobre todo, para que
    /// la regla se pueda probar sin montar medio hub.
    ///
    /// **Lo de la caja nunca sale de aquí**, y la regla vive dentro y no en el
    /// cierre de cada llamador. Hay dos llamadores —el comando de Tauri y la
    /// ruta HTTP— y olvidarla en uno solo no daría ningún error: devolvería el
    /// fallo 5 por ese camino y en silencio. Ver `CAJA`.
    ///
    /// Se ordenan por antigüedad. No hace falta para la corrección —no hay FK
    /// entre estas tablas, comprobado el 10-ago— pero si algún día se añade
    /// una, subir en orden de creación es lo que salva.
    pub fn pendientes(&self, esta_vivo: impl Fn(&str) -> bool) -> Vec<Anotacion> {
        let interior = self.interior.lock().unwrap();
        let mut lista: Vec<Anotacion> = interior
            .pendientes
            .values()
            .filter(|a| a.dispositivo != CAJA && !esta_vivo(&a.dispositivo))
            .cloned()
            .collect();
        lista.sort_by_key(|a| a.creado_ms);
        lista
    }

    /// Todas las vivas, esté o no vivo su dispositivo. Para diagnóstico.
    pub fn todas_pendientes(&self) -> Vec<Anotacion> {
        let interior = self.interior.lock().unwrap();
        let mut lista: Vec<Anotacion> = interior.pendientes.values().cloned().collect();
        lista.sort_by_key(|a| a.creado_ms);
        lista
    }

    pub fn resumen(&self) -> Resumen {
        let interior = self.interior.lock().unwrap();
        let ahora = ahora_ms();
        let mas_vieja_ms = interior
            .pendientes
            .values()
            .map(|a| ahora.saturating_sub(a.creado_ms))
            .max()
            .unwrap_or(0);
        Resumen {
            pendientes: interior.pendientes.len(),
            mas_vieja_ms,
            confirmadas_recordadas: interior.confirmadas.len(),
        }
    }

    /// Reescribe el archivo con sólo lo vivo. Sin esto, el diario crecería para
    /// siempre: cada venta del año seguiría ocupando su línea aunque se
    /// confirmara a los dos segundos.
    fn compactar(&self) {
        let interior = self.interior.lock().unwrap();

        let mut texto = String::new();
        for anotacion in interior.pendientes.values() {
            match serde_json::to_string(&Entrada::Anotada(anotacion.clone())) {
                Ok(linea) => {
                    texto.push_str(&linea);
                    texto.push('\n');
                }
                Err(e) => {
                    // Perder una anotación viva EN LA COMPACTACIÓN es peor que
                    // no compactar: se borra del archivo lo que sigue sin subir.
                    eprintln!(
                        "[hub] ⛔ compactando el respaldo: no se pudo reescribir \
                         {} ({e}). Se aborta para no perderla.",
                        anotacion.clave
                    );
                    return;
                }
            }
        }
        // Las confirmadas también se conservan, en su forma corta: son la
        // memoria antiduplicados, y sin ellas un reinicio de la caja dejaría
        // que un reenvío resucitara una venta ya subida.
        for clave in &interior.confirmadas {
            if let Ok(linea) = serde_json::to_string(&Entrada::Confirmada {
                clave: clave.clone(),
            }) {
                texto.push_str(&linea);
                texto.push('\n');
            }
        }

        if let Some(padre) = self.archivo.parent() {
            let _ = std::fs::create_dir_all(padre);
        }

        // Escribir a un temporal y renombrar: si la caja se apaga a mitad de la
        // compactación, el archivo bueno sigue siendo el viejo. Reescribir en
        // sitio dejaría un diario truncado, o sea ventas perdidas — justo lo
        // que este módulo existe para impedir.
        let temporal = self.archivo.with_extension("ndjson.tmp");
        if std::fs::write(&temporal, texto.as_bytes()).is_ok() {
            let _ = std::fs::rename(&temporal, &self.archivo);
        }
    }

    /// Añade una línea al diario. Best-effort, igual que en `cola.rs`: si el
    /// disco falla no se tumba el cobro, que es lo que el cajero está esperando.
    /// Lo que se pierde es la SEGUNDA copia, nunca la primera.
    fn escribir(&self, entrada: &Entrada) {
        // Se GRITA en vez de tragárselo. La primera versión hacía
        // `let Ok(..) else { return }` y por eso un error de serialización
        // —el `u128` de `creado_ms`— dejó el respaldo escribiendo en el vacío
        // sin una sola señal. Un respaldo que no respalda tiene que doler.
        let linea = match serde_json::to_string(entrada) {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "[hub] ⛔ el respaldo NO pudo serializar una anotación ({e}). \
                     La venta se queda sin segunda copia."
                );
                return;
            }
        };
        if let Some(padre) = self.archivo.parent() {
            let _ = std::fs::create_dir_all(padre);
        }
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.archivo)
        {
            let _ = writeln!(f, "{linea}");
        }
    }
}

fn ahora_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Reconstruye el estado leyendo el diario de principio a fin.
///
/// Una línea ilegible se salta y no aborta la lectura: un corte de luz a mitad
/// de una escritura deja media línea al final, y perder el archivo entero por
/// eso sería convertir un fallo de un byte en la pérdida de todo el turno.
fn leer_diario(archivo: &PathBuf) -> Interior {
    let mut pendientes: HashMap<String, Anotacion> = HashMap::new();
    let mut confirmadas: VecDeque<String> = VecDeque::new();

    let Ok(texto) = std::fs::read_to_string(archivo) else {
        return Interior {
            pendientes,
            confirmadas,
        };
    };

    for linea in texto.lines() {
        let linea = linea.trim();
        if linea.is_empty() {
            continue;
        }
        match serde_json::from_str::<Entrada>(linea) {
            Ok(Entrada::Anotada(a)) => {
                pendientes.insert(a.clave.clone(), a);
            }
            Ok(Entrada::Confirmada { clave }) => {
                pendientes.remove(&clave);
                if !confirmadas.iter().any(|c| *c == clave) {
                    confirmadas.push_back(clave);
                    while confirmadas.len() > MEMORIA_CONFIRMADAS {
                        confirmadas.pop_front();
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Interior {
        pendientes,
        confirmadas,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn archivo_temp(nombre: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "invventa-respaldo-{nombre}-{}.ndjson",
            ahora_ms()
        ))
    }

    fn anotacion(clave: &str, dispositivo: &str) -> Anotacion {
        Anotacion {
            clave: clave.into(),
            dispositivo: dispositivo.into(),
            tarea: json!({ "tabla": "ventas", "metodo": "upsert", "data": { "total": 250 } }),
            creado_ms: 0,
        }
    }

    /// LA PRUEBA QUE FALTABA.
    ///
    /// El 13-ago las tres pruebas de persistencia fallaron con «0 pendientes»
    /// tras reabrir. La causa no estaba en el archivo ni en la lectura: era que
    /// `Entrada` lleva etiqueta interna (`#[serde(tag = "t")]`) y ese camino de
    /// serde **no admite enteros de 128 bits**, así que con `creado_ms: u128`
    /// `to_string` devolvía `Err`... y el error se tragaba. El respaldo escribía
    /// en el vacío sin una sola señal.
    ///
    /// Esta prueba mira la serialización a la cara, en vez de deducirla de un
    /// efecto tres capas más abajo. Si alguien vuelve a meter un `u128` —o
    /// cualquier tipo que el buffer no soporte— falla AQUÍ y con nombre propio.
    #[test]
    fn una_anotacion_se_serializa_de_verdad() {
        let entrada = Entrada::Anotada(anotacion("ventas::1", "tel"));
        let texto = serde_json::to_string(&entrada)
            .expect("si esto falla, el respaldo no escribe NADA y no se entera nadie");

        assert!(texto.contains("\"t\":\"a\""), "falta la etiqueta: {texto}");
        assert!(texto.contains("ventas::1"));

        // Y de vuelta: un formato que se escribe pero no se lee es igual de
        // inútil que uno que no se escribe.
        let leida: Entrada = serde_json::from_str(&texto).expect("no se pudo releer");
        match leida {
            Entrada::Anotada(a) => assert_eq!(a.clave, "ventas::1"),
            _ => panic!("se releyó como otra cosa"),
        }
    }

    #[test]
    fn la_confirmacion_tambien_va_y_vuelve() {
        let entrada = Entrada::Confirmada {
            clave: "ventas::1".into(),
        };
        let texto = serde_json::to_string(&entrada).expect("no serializa");
        assert!(texto.contains("\"t\":\"c\""));
        let leida: Entrada = serde_json::from_str(&texto).expect("no se pudo releer");
        assert!(matches!(leida, Entrada::Confirmada { .. }));
    }

    #[test]
    fn anotar_deja_rastro_en_el_archivo() {
        // Lo que las tres pruebas de persistencia daban por supuesto. Mirar el
        // archivo directamente separa «no se escribió» de «no se leyó bien», que
        // es la distinción que costó encontrar el fallo.
        let archivo = archivo_temp("rastro");
        let r = Respaldo::nuevo(archivo.clone());
        r.anotar(anotacion("ventas::1", "tel"));

        let contenido = std::fs::read_to_string(&archivo).expect("no hay archivo");
        assert!(
            contenido.contains("ventas::1"),
            "el archivo quedó vacío: el respaldo no está respaldando"
        );

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn dos_post_con_la_misma_clave_dejan_una_sola_anotacion() {
        // La LAN reenvía: el teléfono reintenta porque el wifi parpadeó. Si esto
        // fallara, la caja subiría la misma venta dos veces.
        let archivo = archivo_temp("dup");
        let r = Respaldo::nuevo(archivo.clone());

        assert_eq!(r.anotar(anotacion("ventas::1", "tel-a")), Recibo::Anotado);
        assert_eq!(r.anotar(anotacion("ventas::1", "tel-a")), Recibo::Duplicado);
        assert_eq!(r.resumen().pendientes, 1);

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn una_anotacion_sin_clave_se_rechaza() {
        let archivo = archivo_temp("sinclave");
        let r = Respaldo::nuevo(archivo.clone());
        assert_eq!(r.anotar(anotacion("   ", "tel-a")), Recibo::Invalido);
        assert_eq!(r.resumen().pendientes, 0);
        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn lo_no_confirmado_sobrevive_a_un_reinicio_de_la_caja() {
        // Es el caso entero: la caja se apaga con ventas de un teléfono dentro.
        let archivo = archivo_temp("reinicio");
        {
            let r = Respaldo::nuevo(archivo.clone());
            r.anotar(anotacion("ventas::1", "tel-a"));
            r.anotar(anotacion("ventas::2", "tel-a"));
            r.confirmar(&["ventas::1".to_string()]);
        }

        let r2 = Respaldo::nuevo(archivo.clone());
        assert_eq!(r2.resumen().pendientes, 1);
        assert_eq!(r2.todas_pendientes()[0].clave, "ventas::2");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn tras_reiniciar_una_confirmada_no_puede_resucitar() {
        // Sin memoria persistida, un reenvío tardío del teléfono volvería a
        // meter en la cola una venta que ya está en Supabase.
        let archivo = archivo_temp("resucita");
        {
            let r = Respaldo::nuevo(archivo.clone());
            r.anotar(anotacion("ventas::7", "tel-a"));
            r.confirmar(&["ventas::7".to_string()]);
        }

        let r2 = Respaldo::nuevo(archivo.clone());
        assert_eq!(r2.anotar(anotacion("ventas::7", "tel-a")), Recibo::Duplicado);
        assert_eq!(r2.resumen().pendientes, 0);

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn confirmar_una_clave_inexistente_no_rompe_nada() {
        let archivo = archivo_temp("fantasma");
        let r = Respaldo::nuevo(archivo.clone());
        assert_eq!(r.confirmar(&["no-existe".to_string()]), 0);
        assert_eq!(r.resumen().pendientes, 0);
        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn pendientes_solo_devuelve_lo_de_los_dispositivos_que_ya_no_estan() {
        // El corazón de la adopción: no se toca lo del teléfono que sigue vivo,
        // porque ése va a subir lo suyo por su cuenta.
        let archivo = archivo_temp("huerfanas");
        let r = Respaldo::nuevo(archivo.clone());

        r.anotar(anotacion("ventas::vivo", "tel-vivo"));
        r.anotar(anotacion("ventas::muerto", "tel-muerto"));

        let huerfanas = r.pendientes(|d| d == "tel-vivo");
        assert_eq!(huerfanas.len(), 1);
        assert_eq!(huerfanas[0].clave, "ventas::muerto");

        let _ = std::fs::remove_file(&archivo);
    }

    /// La mitad abierta del fallo 5.
    ///
    /// Lo suyo lo sube su propia cola. Que además se lo ofrezca la adopción no
    /// es un error visible —`upsert` sobre una clave ya única aguanta el
    /// duplicado— pero es una carrera que se puede evitar, y en pantalla es una
    /// pila de «Por adoptar» que dice que algo va mal cuando no va mal nada.
    #[test]
    fn la_caja_nunca_es_huerfana_de_si_misma() {
        let archivo = archivo_temp("caja-propia");
        let r = Respaldo::nuevo(archivo.clone());

        r.anotar(anotacion("ventas::de-la-caja", CAJA));
        r.anotar(anotacion("ventas::del-telefono", "tel-muerto"));

        // El cierre dice que NADIE está vivo, que es el caso más duro: ni
        // siquiera así debe salir la de la caja.
        let huerfanas = r.pendientes(|_| false);
        assert_eq!(huerfanas.len(), 1);
        assert_eq!(huerfanas[0].clave, "ventas::del-telefono");

        let _ = std::fs::remove_file(&archivo);
    }

    /// **Ésta es la prueba que encierra el fallo**, y por eso reabre el archivo.
    ///
    /// El defecto no se veía en un solo arranque: dentro de la misma sesión, el
    /// token del hub coincidía consigo mismo y la exclusión acertaba. Aparecía
    /// al reiniciar, cuando `estado.token` era otro y las anotaciones de ayer
    /// seguían firmadas con el de anteayer. Una prueba en memoria habría pasado
    /// con el código roto — que es exactamente lo que pasó.
    #[test]
    fn y_lo_sigue_siendo_despues_de_reiniciar() {
        let archivo = archivo_temp("caja-reinicio");
        {
            let r = Respaldo::nuevo(archivo.clone());
            r.anotar(anotacion("ventas::de-la-caja", CAJA));
        }

        // Otro arranque: otro token de emparejamiento, el mismo archivo.
        let r2 = Respaldo::nuevo(archivo.clone());
        assert_eq!(
            r2.resumen().pendientes,
            1,
            "la anotación tiene que seguir ahí"
        );
        assert!(
            r2.pendientes(|_| false).is_empty(),
            "la caja volvió a ofrecerse a adoptar lo suyo: el fallo 5 otra vez"
        );

        let _ = std::fs::remove_file(&archivo);
    }

    /// El sentinel no puede ser un token real, o un teléfono con la cadena justa
    /// dejaría de ser adoptable nunca. `generar_token()` es hexadecimal puro.
    #[test]
    fn la_marca_de_la_caja_no_puede_confundirse_con_un_token() {
        assert!(CAJA.contains(':'));
        assert!(!CAJA.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn pendientes_no_devuelve_las_confirmadas() {
        let archivo = archivo_temp("confirmadas");
        let r = Respaldo::nuevo(archivo.clone());

        r.anotar(anotacion("ventas::1", "tel-muerto"));
        r.anotar(anotacion("ventas::2", "tel-muerto"));
        r.confirmar(&["ventas::1".to_string()]);

        let huerfanas = r.pendientes(|_| false);
        assert_eq!(huerfanas.len(), 1);
        assert_eq!(huerfanas[0].clave, "ventas::2");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn las_huerfanas_salen_de_la_mas_vieja_a_la_mas_nueva() {
        let archivo = archivo_temp("orden");
        let r = Respaldo::nuevo(archivo.clone());

        let mut vieja = anotacion("ventas::vieja", "tel");
        vieja.creado_ms = 1000;
        let mut nueva = anotacion("ventas::nueva", "tel");
        nueva.creado_ms = 9000;

        r.anotar(nueva);
        r.anotar(vieja);

        let lista = r.pendientes(|_| false);
        assert_eq!(lista[0].clave, "ventas::vieja");
        assert_eq!(lista[1].clave, "ventas::nueva");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn la_compactacion_no_pierde_lo_vivo() {
        // Se abre y cierra tres veces: cada arranque compacta, y lo que sigue
        // sin confirmar tiene que seguir ahí a la tercera.
        let archivo = archivo_temp("compacta");
        {
            let r = Respaldo::nuevo(archivo.clone());
            r.anotar(anotacion("ventas::a", "tel"));
            r.anotar(anotacion("ventas::b", "tel"));
            r.confirmar(&["ventas::a".to_string()]);
        }
        {
            let r = Respaldo::nuevo(archivo.clone());
            assert_eq!(r.resumen().pendientes, 1);
            r.anotar(anotacion("ventas::c", "tel"));
        }
        let r3 = Respaldo::nuevo(archivo.clone());
        let claves: Vec<String> = r3.todas_pendientes().into_iter().map(|a| a.clave).collect();
        assert_eq!(claves.len(), 2);
        assert!(claves.contains(&"ventas::b".to_string()));
        assert!(claves.contains(&"ventas::c".to_string()));

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn una_linea_corrupta_no_se_lleva_por_delante_el_resto() {
        // Un corte de luz a mitad de una escritura deja media línea. Perder el
        // turno entero por eso sería convertir un byte en un desastre.
        let archivo = archivo_temp("corrupta");
        {
            let r = Respaldo::nuevo(archivo.clone());
            r.anotar(anotacion("ventas::buena", "tel"));
        }
        {
            use std::io::Write as _;
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&archivo)
                .unwrap();
            writeln!(f, "{{\"t\":\"a\",\"clave\":\"ventas::media").unwrap();
        }

        let r2 = Respaldo::nuevo(archivo.clone());
        assert_eq!(r2.resumen().pendientes, 1);
        assert_eq!(r2.todas_pendientes()[0].clave, "ventas::buena");

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn la_tarea_se_devuelve_tal_cual_se_dejo() {
        // El hub no entiende de ventas y no debe: guarda bytes opacos. Si algún
        // día reinterpretara el payload, cambiar el front rompería el respaldo.
        let archivo = archivo_temp("opaca");
        let r = Respaldo::nuevo(archivo.clone());

        let mut a = anotacion("ventas::9", "tel");
        a.tarea = json!({ "rpc": "decrementar_stock", "data": { "items": [1, 2, 3] } });
        r.anotar(a);

        let recuperada = &r.todas_pendientes()[0];
        assert_eq!(recuperada.tarea["rpc"], "decrementar_stock");
        assert_eq!(recuperada.tarea["data"]["items"][2], 3);

        let _ = std::fs::remove_file(&archivo);
    }

    #[test]
    fn una_anotacion_sin_fecha_recibe_la_de_ahora() {
        // `creado_ms` alimenta el aviso de «esto lleva días aquí». Un cero se
        // leería como 1970 y la pantalla gritaría siempre, que es igual de
        // inútil que no gritar nunca.
        let archivo = archivo_temp("fecha");
        let r = Respaldo::nuevo(archivo.clone());
        r.anotar(anotacion("ventas::1", "tel"));
        assert!(r.todas_pendientes()[0].creado_ms > 0);
        let _ = std::fs::remove_file(&archivo);
    }
}
