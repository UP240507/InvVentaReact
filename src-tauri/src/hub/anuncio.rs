//! Anuncio mDNS: que la caja se encuentre por NOMBRE y no por IP.
//!
//! ── EL PROBLEMA (3.3 del roadmap) ───────────────────────────────────────────
//! El emparejamiento graba la URL de la caja con su IP dentro. El router reparte
//! por DHCP, así que un corte de luz o un reinicio pueden darle otra IP — y
//! entonces **todos los teléfonos del local dejan de encontrar el hub a la vez**.
//! No falla nada visiblemente: simplemente ya no imprimen y no se sincroniza el
//! respaldo. Hay que reescanear el QR en cada aparato, en hora de comida.
//!
//! La mitigación de hoy es fijar la IP en el router, y depende de que alguien se
//! acuerde de hacerlo en cada instalación.
//!
//! ── QUÉ HACE ESTO, Y QUÉ NO ────────────────────────────────────────────────
//! Publica el servicio como `_invventa._tcp.local` con el nombre
//! `invventa-caja`. Un dispositivo que lo soporte puede llegar a
//! `http://invventa-caja.local:3000` sin saber la IP.
//!
//! **No sustituye al QR ni al token**: emparejar sigue siendo lo mismo. Esto
//! sólo evita que la dirección caduque.
//!
//! ── LO QUE NO CUBRE, Y CONVIENE SABERLO ANTES DE CONFIAR ───────────────────
//! - **Chrome en Android resuelve `.local` de forma irregular.** Funciona en
//!   iOS y en Windows/macOS; en Android depende de versión y fabricante. Por eso
//!   el QR sigue llevando la IP: el nombre es un respaldo, no el camino
//!   principal.
//! - **Un extensor de wifi que cree su propia subred rompe mDNS**, igual que
//!   rompe el descubrimiento en general. Sigue siendo requisito de instalación.
//! - Si el anuncio falla, **no pasa nada**: se registra y el hub sigue
//!   funcionando por IP exactamente igual que hasta ahora. Un descubrimiento
//!   roto no puede tumbar la caja.

use std::net::IpAddr;

/// Nombre del host que se anuncia. Sin punto final y en minúsculas: los
/// resolutores de algunos sistemas son quisquillosos con ambas cosas.
pub const NOMBRE: &str = "invventa-caja";
pub const SERVICIO: &str = "_invventa._tcp.local.";

/// Mantiene vivo el anuncio. Al soltarse, el servicio se retira de la red —por
/// eso `arrancar` devuelve el guardián y `mod.rs` lo guarda: si se descartara,
/// el anuncio duraría lo que la línea que lo creó.
pub struct Anuncio {
    demonio: mdns_sd::ServiceDaemon,
    nombre_completo: String,
}

impl Anuncio {
    /// URL por nombre, para enseñarla junto a la de IP en la pantalla del hub.
    pub fn url(puerto: u16) -> String {
        format!("http://{NOMBRE}.local:{puerto}")
    }
}

impl Drop for Anuncio {
    fn drop(&mut self) {
        // Retirarlo explícitamente evita que los teléfonos guarden en caché un
        // servicio que ya no existe y se queden esperando a una caja apagada.
        let _ = self.demonio.unregister(&self.nombre_completo);
        let _ = self.demonio.shutdown();
    }
}

/// Publica la caja en la red local.
///
/// Devuelve `None` si algo falla. Es deliberado: mDNS es una comodidad, no un
/// requisito, y una red que no lo permita —wifi de invitados con aislamiento de
/// clientes, por ejemplo— no puede impedir que el restaurante cobre.
pub fn arrancar(ip: IpAddr, puerto: u16) -> Option<Anuncio> {
    let demonio = match mdns_sd::ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[hub] mDNS no disponible ({e}); se sigue sólo por IP");
            return None;
        }
    };

    let info = match mdns_sd::ServiceInfo::new(
        SERVICIO,
        NOMBRE,
        &format!("{NOMBRE}.local."),
        ip,
        puerto,
        // Sin propiedades: lo único que hace falta es dónde está. Meter aquí el
        // token sería publicarlo a toda la red.
        //
        // El tipo va explícito y no un `None` a secas: el parámetro es genérico
        // (`P: IntoTxtProperties`) y un `None` pelado no le da al compilador
        // con qué inferirlo. Es el tipo de error que sólo aparece al compilar,
        // y aquí no hay toolchain para verlo.
        None::<std::collections::HashMap<String, String>>,
    ) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[hub] no se pudo describir el servicio mDNS ({e})");
            let _ = demonio.shutdown();
            return None;
        }
    };

    let nombre_completo = info.get_fullname().to_string();

    if let Err(e) = demonio.register(info) {
        eprintln!("[hub] no se pudo anunciar por mDNS ({e}); se sigue por IP");
        let _ = demonio.shutdown();
        return None;
    }

    println!("[hub] anunciado como {}", Anuncio::url(puerto));

    Some(Anuncio {
        demonio,
        nombre_completo,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_url_por_nombre_lleva_el_puerto_real() {
        assert_eq!(Anuncio::url(3000), "http://invventa-caja.local:3000");
        assert_eq!(Anuncio::url(8080), "http://invventa-caja.local:8080");
    }

    #[test]
    fn el_servicio_termina_en_punto() {
        // mdns-sd exige el nombre de servicio completamente cualificado. Sin el
        // punto final, `ServiceInfo::new` rechaza y el anuncio no sale — pero
        // como degradamos en silencio, el síntoma sería «mDNS no funciona» sin
        // ninguna pista. Se fija aquí.
        assert!(SERVICIO.ends_with('.'));
        assert!(SERVICIO.starts_with('_'));
    }
}
