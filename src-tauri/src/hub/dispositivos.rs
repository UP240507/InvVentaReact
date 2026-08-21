//! Registro de dispositivos emparejados con el hub.
//!
//! **Por qué cada dispositivo tiene su PROPIO token.** La primera versión del
//! hub tenía un token único para todos. Con eso, revocar el teléfono que se
//! quedó en un taxi obliga a re-emparejar la tablet, el KDS y la caja — en
//! plena hora de comida. Un token por dispositivo convierte la revocación en
//! una operación de un solo elemento, que es lo que un dueño espera al pulsar
//! "revocar".
//!
//! **Esto NO cuenta contra el plan.** El roadmap decía en su versión del 19-jul
//! que el registro de dispositivos alimentaría el límite de la suscripción,
//! pero la decisión de precios ya tomada dice lo contrario: los dispositivos
//! son ilimitados y el único enforcement es el número de empleados. Aquí se
//! registra por SEGURIDAD —saber quién puede imprimir y poder quitarlo—, no
//! para facturar.
//!
//! **El token de emparejamiento no es un token de dispositivo.** El QR de la
//! caja lleva el de emparejamiento, que solo sirve para canjearlo por uno
//! propio en `/hub/emparejar`. Así el QR puede quedarse pegado en la pared de
//! la cocina sin que eso conceda acceso permanente a quien le saque una foto:
//! el dueño lo rota y las fotos viejas dejan de servir.

use std::collections::HashMap;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dispositivo {
    pub id: String,
    pub nombre: String,
    /// caja | mesero | kds | pantalla
    pub rol: String,
    #[serde(default)]
    pub creado_ms: u128,
    #[serde(default)]
    pub visto_ms: u128,
    /// Nunca sale al listado. Ver `Publico`.
    pub token: String,
}

/// Vista sin el token, que es lo único que la pantalla necesita.
///
/// El listado se sirve a cualquier dispositivo emparejado. Si llevara los
/// tokens, un teléfono comprometido se llevaría los de todos los demás y
/// revocar el suyo no serviría de nada.
#[derive(Debug, Clone, Serialize)]
pub struct Publico {
    pub id: String,
    pub nombre: String,
    pub rol: String,
    pub creado_ms: u128,
    pub visto_ms: u128,
}

impl From<&Dispositivo> for Publico {
    fn from(d: &Dispositivo) -> Self {
        Self {
            id: d.id.clone(),
            nombre: d.nombre.clone(),
            rol: d.rol.clone(),
            creado_ms: d.creado_ms,
            visto_ms: d.visto_ms,
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Estado {
    #[serde(default)]
    dispositivos: Vec<Dispositivo>,
}

pub struct Registro {
    interior: Mutex<HashMap<String, Dispositivo>>,
    archivo: PathBuf,
}

fn ahora_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Identificador/token corto. Igual que el token del hub: no protege dinero,
/// solo evita que un dispositivo cualquiera de la red del local imprima. Si
/// algún día autenticara algo serio, esto tiene que pasar a un CSPRNG.
fn aleatorio(semilla: u128) -> String {
    let n = ahora_ms()
        ^ semilla.wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ ((std::process::id() as u128) << 32);
    format!("{:016x}", (n as u64) ^ ((n >> 64) as u64))
}

impl Registro {
    pub fn nuevo(archivo: PathBuf) -> Self {
        let estado: Estado = std::fs::read(&archivo)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();

        let mapa = estado
            .dispositivos
            .into_iter()
            .map(|d| (d.token.clone(), d))
            .collect();

        Self {
            interior: Mutex::new(mapa),
            archivo,
        }
    }

    fn guardar(&self, mapa: &HashMap<String, Dispositivo>) {
        if let Some(padre) = self.archivo.parent() {
            let _ = std::fs::create_dir_all(padre);
        }
        let estado = Estado {
            dispositivos: mapa.values().cloned().collect(),
        };
        if let Ok(json) = serde_json::to_vec_pretty(&estado) {
            let _ = std::fs::write(&self.archivo, json);
        }
    }

    /// Da de alta un dispositivo y devuelve SU token.
    pub fn emparejar(&self, nombre: &str, rol: &str) -> Dispositivo {
        let mut mapa = self.interior.lock().unwrap();

        let semilla = mapa.len() as u128 + 1;
        let d = Dispositivo {
            id: format!("dev-{}", aleatorio(semilla.wrapping_mul(7))),
            nombre: if nombre.trim().is_empty() {
                "Sin nombre".to_string()
            } else {
                nombre.trim().to_string()
            },
            rol: match rol {
                "caja" | "mesero" | "kds" | "pantalla" => rol.to_string(),
                // Un rol desconocido no se rechaza: se degrada al menos
                // privilegiado. Rechazar dejaría al mesero sin poder imprimir
                // por un error de dedo en el nombre del rol.
                _ => "mesero".to_string(),
            },
            creado_ms: ahora_ms(),
            visto_ms: ahora_ms(),
            token: aleatorio(semilla),
        };

        mapa.insert(d.token.clone(), d.clone());
        self.guardar(&mapa);
        d
    }

    /// ¿Este token pertenece a un dispositivo vivo? Actualiza "visto por última
    /// vez", que es lo que permite reconocer en la pantalla cuál es cuál cuando
    /// hay cuatro teléfonos iguales sobre la barra.
    pub fn validar(&self, token: &str) -> bool {
        if token.is_empty() {
            return false;
        }
        let mut mapa = self.interior.lock().unwrap();
        match mapa.get_mut(token) {
            Some(d) => {
                d.visto_ms = ahora_ms();
                true
            }
            None => false,
        }
    }

    /// ¿Se ha visto a este dispositivo hace poco?
    ///
    /// A diferencia de `validar`, **no toca `visto_ms`**. Es la diferencia
    /// entera: quien pregunta esto lo hace para decidir si adopta las ventas de
    /// un teléfono que parece muerto, y si la propia pregunta lo marcara como
    /// visto, nunca se adoptaría nada. Un token desconocido —revocado, o de una
    /// caja anterior— cuenta como no vivo: sus ventas hay que adoptarlas.
    pub fn visto_hace_menos_de(&self, token: &str, ventana_ms: u128) -> bool {
        if token.is_empty() {
            return false;
        }
        let mapa = self.interior.lock().unwrap();
        match mapa.get(token) {
            Some(d) => ahora_ms().saturating_sub(d.visto_ms) < ventana_ms,
            None => false,
        }
    }

    pub fn listar(&self) -> Vec<Publico> {
        let mapa = self.interior.lock().unwrap();
        let mut v: Vec<Publico> = mapa.values().map(Publico::from).collect();
        // Los más recientes primero: es el orden en que se buscan.
        v.sort_by(|a, b| b.visto_ms.cmp(&a.visto_ms));
        v
    }

    /// Revoca por id (no por token: la pantalla nunca ve tokens).
    pub fn revocar(&self, id: &str) -> bool {
        let mut mapa = self.interior.lock().unwrap();
        let token = mapa
            .values()
            .find(|d| d.id == id)
            .map(|d| d.token.clone());

        match token {
            Some(t) => {
                mapa.remove(&t);
                self.guardar(&mapa);
                true
            }
            None => false,
        }
    }

    /// Revoca TODOS los emparejados de golpe. Devuelve cuántos cayeron.
    ///
    /// ── PARA QUÉ, Y POR QUÉ NO ES AUTOMÁTICO ────────────────────────────────
    /// Los dispositivos se acumulan: cada teléfono que alguna vez escaneó el QR
    /// sigue emparejado para siempre, incluido el del mesero que se fue en
    /// marzo. Al cerrar turno es cuando tiene sentido barrer.
    ///
    /// **La caja no puede caer aquí, y no es por cuidado sino por
    /// construcción:** `autorizado_admin` compara contra `estado.token`, que es
    /// el de emparejamiento y **no vive en este registro**. Vaciar el mapa no
    /// la toca. Hay una prueba que lo fija, porque es la clase de garantía que
    /// alguien podría romper sin querer el día que decida meter la caja en la
    /// lista para que se vea en pantalla.
    pub fn revocar_todos(&self) -> usize {
        let mut mapa = self.interior.lock().unwrap();
        let cuantos = mapa.len();
        mapa.clear();
        self.guardar(&mapa);
        cuantos
    }

    /// Cuántos emparejados tienen su token en este conjunto.
    ///
    /// Existe para poder decir «3 de los 5 tienen ventas sin confirmar» **sin
    /// que un token salga de Rust**. La alternativa —devolver los tokens a la
    /// pantalla para que ella cruce— es justo lo que `Publico` evita: el
    /// listado se sirve a cualquier dispositivo emparejado.
    pub fn cuantos_con_token_en(&self, tokens: &HashSet<String>) -> usize {
        let mapa = self.interior.lock().unwrap();
        mapa.keys().filter(|t| tokens.contains(*t)).count()
    }

    /// Persiste el "visto por última vez" acumulado. Se llama de vez en cuando,
    /// no en cada petición: escribir el archivo en cada impresión sería un
    /// acceso a disco por comanda sin ninguna ganancia.
    pub fn persistir(&self) {
        let mapa = self.interior.lock().unwrap();
        self.guardar(&mapa);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La garantía que sostiene todo el botón de «revocar todos».
    ///
    /// El token de la CAJA es el de emparejamiento (`EstadoHub::token`) y no
    /// está en este registro: `autorizado_admin` lo compara aparte. Por eso
    /// vaciar el mapa no puede dejar a la caja fuera de su propio hub — que es
    /// lo primero que da miedo al leer «revocar todos».
    ///
    /// Se fija aquí porque el día que alguien meta la caja en el registro «para
    /// que se vea en la lista», el botón pasaría de barrer teléfonos a dejar la
    /// caja sin administrar el hub, en hora de cierre. Y no daría ningún error.
    #[test]
    fn revocar_todos_barre_los_telefonos_y_no_puede_tocar_la_caja() {
        let r = Registro::nuevo(temp("revocar-todos"));
        let a = r.emparejar("Tel Ana", "mesero");
        let b = r.emparejar("Tel Beto", "mesero");
        let kds = r.emparejar("KDS Cocina", "kds");

        assert_eq!(r.listar().len(), 3);
        assert_eq!(r.revocar_todos(), 3);
        assert!(r.listar().is_empty());

        // Ninguno de los tokens vale ya, y sin reiniciar el hub.
        for t in [&a.token, &b.token, &kds.token] {
            assert!(!r.validar(t), "un token revocado no puede seguir valiendo");
        }

        // Y el token de emparejamiento —el de la caja— nunca estuvo aquí, así
        // que no había nada que revocarle.
        assert!(!r.validar("token-de-emparejamiento-de-la-caja"));
    }

    #[test]
    fn cuantos_con_token_en_cuenta_sin_sacar_tokens() {
        // Es lo que permite decir «2 de los 3 tienen ventas sin confirmar» sin
        // que la pantalla vea un token.
        let r = Registro::nuevo(temp("cruce"));
        let a = r.emparejar("Tel Ana", "mesero");
        let b = r.emparejar("Tel Beto", "mesero");
        let _c = r.emparejar("Tel Caro", "mesero");

        let con_trabajo: std::collections::HashSet<String> =
            [a.token.clone(), b.token.clone(), "de-otro-hub".to_string()]
                .into_iter()
                .collect();

        // El token ajeno no suma: sólo cuentan los emparejados aquí.
        assert_eq!(r.cuantos_con_token_en(&con_trabajo), 2);
    }

    fn temp(nombre: &str) -> PathBuf {
        std::env::temp_dir().join(format!("invventa-dev-{nombre}-{}.json", ahora_ms()))
    }

    #[test]
    fn cada_dispositivo_recibe_un_token_distinto() {
        // Es la razón de ser del módulo: con un token compartido, revocar uno
        // obliga a re-emparejar todos.
        let f = temp("tokens");
        let r = Registro::nuevo(f.clone());

        let a = r.emparejar("Teléfono de Ana", "mesero");
        let b = r.emparejar("Tablet barra", "mesero");

        assert_ne!(a.token, b.token);
        assert_ne!(a.id, b.id);
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn revocar_uno_no_toca_a_los_demas() {
        let f = temp("revocar");
        let r = Registro::nuevo(f.clone());

        let perdido = r.emparejar("Teléfono en el taxi", "mesero");
        let bueno = r.emparejar("Tablet barra", "mesero");

        assert!(r.revocar(&perdido.id));
        assert!(!r.validar(&perdido.token), "el revocado ya no vale");
        assert!(r.validar(&bueno.token), "el resto sigue trabajando");

        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn el_listado_nunca_expone_los_tokens() {
        // Se sirve a cualquier dispositivo emparejado: si llevara tokens, un
        // teléfono comprometido se llevaría los de todos y revocar el suyo no
        // serviría de nada.
        let f = temp("listado");
        let r = Registro::nuevo(f.clone());
        let d = r.emparejar("Tablet", "mesero");

        let json = serde_json::to_string(&r.listar()).unwrap();
        assert!(!json.contains(&d.token), "el token no puede salir en el listado");
        assert!(json.contains("Tablet"));

        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn un_token_inventado_no_valida() {
        let f = temp("invalido");
        let r = Registro::nuevo(f.clone());
        r.emparejar("Tablet", "mesero");

        assert!(!r.validar("0000000000000000"));
        assert!(!r.validar(""));
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn los_emparejamientos_sobreviven_a_un_reinicio() {
        let f = temp("persistencia");
        let token = {
            let r = Registro::nuevo(f.clone());
            r.emparejar("Tablet barra", "mesero").token
        };

        // Segundo arranque del hub.
        let r2 = Registro::nuevo(f.clone());
        assert!(
            r2.validar(&token),
            "un reinicio de la caja no puede desemparejar el local entero"
        );

        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn un_rol_desconocido_se_degrada_en_vez_de_rechazar() {
        let f = temp("rol");
        let r = Registro::nuevo(f.clone());
        let d = r.emparejar("Raro", "administrador-supremo");
        assert_eq!(d.rol, "mesero");
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn revocar_algo_que_no_existe_devuelve_false_sin_romper_nada() {
        let f = temp("fantasma");
        let r = Registro::nuevo(f.clone());
        let d = r.emparejar("Tablet", "mesero");

        assert!(!r.revocar("dev-inventado"));
        assert!(r.validar(&d.token));
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn validar_actualiza_el_visto_por_ultima_vez() {
        let f = temp("visto");
        let r = Registro::nuevo(f.clone());
        let d = r.emparejar("Tablet", "mesero");

        std::thread::sleep(std::time::Duration::from_millis(5));
        r.validar(&d.token);

        let lista = r.listar();
        let fila = lista.iter().find(|p| p.id == d.id).unwrap();
        assert!(fila.visto_ms >= d.visto_ms);
        let _ = std::fs::remove_file(&f);
    }
}
