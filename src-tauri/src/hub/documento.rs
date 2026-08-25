//! Espejo en Rust del documento semántico que produce `src/lib/Comanda.js`.
//!
//! Deliberadamente TONTO: aquí no hay reglas de negocio, ni aritmética, ni
//! decisiones sobre qué se imprime. Todos los importes llegan como `String` ya
//! formateado porque el motor de dinero es `lib/Fiscal.js` y debe haber uno
//! solo: si el hub redondeara por su cuenta, el papel podría decir un centavo
//! distinto de la pantalla y no habría forma de saber cuál miente.
//!
//! Todos los campos tienen `#[serde(default)]`. Un cliente viejo que aún no
//! manda `avisos` debe poder imprimir, no recibir un 400: durante un despliegue
//! escalonado conviven versiones, y el que se queda sin imprimir es el mesero.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Meta {
    #[serde(default)]
    pub etiqueta: String,
    #[serde(default)]
    pub valor: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Linea {
    #[serde(default)]
    pub cantidad: String,
    #[serde(default)]
    pub nombre: String,
    #[serde(default)]
    pub nota: String,
    /// Vacío en las comandas: cocina no ve precios. Ver `construirComandas`.
    #[serde(default)]
    pub importe: String,
    #[serde(default)]
    pub sublineas: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Total {
    #[serde(default)]
    pub etiqueta: String,
    #[serde(default)]
    pub valor: String,
    #[serde(default)]
    pub enfasis: bool,
}

/// El logo del local, ya convertido a puntos de impresora.
///
/// ── POR QUÉ VIAJA EL MAPA DE BITS Y NO UNA URL ──────────────────────────────
/// Porque la caja trabaja sin internet: una URL obligaría a descargar, y un
/// local con la red caída imprimiría sin logo sin decir por qué. Y porque lo
/// que se ve tiene que ser lo que sale — convirtiendo al imprimir, la pantalla
/// enseñaría la imagen bonita y el papel sacaría otra cosa.
///
/// El hub sigue siendo tonto: no escala, no recorta, no umbraliza. Recibe
/// puntos y los manda. Quién decide cómo se ve es `src/lib/LogoTermico.js`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Logo {
    /// Un bit por punto, 1 = negro, empaquetados de ocho en ocho con el más
    /// significativo a la izquierda, en base64. Es lo que pide `GS v 0`.
    #[serde(default)]
    pub bitmap: String,
    /// Ancho en PUNTOS, siempre múltiplo de 8: una fila incompleta desplazaría
    /// todas las siguientes y el logo saldría escalonado.
    #[serde(default)]
    pub ancho: u32,
    /// Alto en puntos.
    #[serde(default)]
    pub alto: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Documento {
    /// Identidad lógica de la impresión. El hub descarta un `id` ya impreso:
    /// si la LAN duplica el POST no salen dos comandas. Una reimpresión trae
    /// sufijo de copia, así que sí sale (y viene marcada).
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub tipo: String,
    #[serde(default)]
    pub zona: Option<String>,
    #[serde(default)]
    pub titulo: String,
    #[serde(default)]
    pub subtitulo: String,
    /// Va arriba del todo, antes del título. `None` en las comandas: cocina no
    /// necesita el logo, y cada punto impreso es tiempo de impresora con un
    /// mesero esperando la tira.
    #[serde(default)]
    pub logo: Option<Logo>,
    /// Datos fiscales del EMISOR, una línea por dato: razón social, RFC,
    /// domicilio y teléfono. Van centrados bajo el título.
    ///
    /// Es una lista y no un `subtitulo` con saltos porque cada dato es una
    /// unidad: si el domicilio no cabe en 32 columnas se parte por palabras,
    /// pero el RFC nunca debe acabar pegado al final de la calle. Con una sola
    /// cadena, el envoltorio no sabe dónde termina un dato y empieza otro.
    ///
    /// Va aquí y no en `pie` porque el emisor se identifica ARRIBA: es quien
    /// expide el documento. El RFC estuvo al pie hasta el 6-ago y era el sitio
    /// equivocado — allí abajo parecía una nota más, junto al «gracias por su
    /// visita».
    #[serde(default)]
    pub emisor: Vec<String>,
    #[serde(default)]
    pub meta: Vec<Meta>,
    #[serde(default)]
    pub avisos: Vec<String>,
    #[serde(default)]
    pub cuerpo: Vec<Linea>,
    #[serde(default)]
    pub totales: Vec<Total>,
    #[serde(default)]
    pub pie: Vec<String>,
    #[serde(default)]
    pub abrir_cajon: bool,
    #[serde(default = "una_copia")]
    pub copias: u8,
}

fn una_copia() -> u8 {
    1
}

impl Documento {
    /// Un documento sin nada que imprimir no debe mover la impresora: cortar
    /// papel en blanco gasta rollo y confunde a cocina.
    pub fn vacio(&self) -> bool {
        self.cuerpo.is_empty() && self.totales.is_empty() && self.avisos.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acepta_un_documento_minimo_sin_campos_opcionales() {
        // Un cliente viejo (o un curl a mano durante una prueba) no debería
        // recibir un 400 por no mandar `avisos` o `copias`.
        let json = r#"{"id":"x","tipo":"prueba","cuerpo":[{"nombre":"Café"}]}"#;
        let doc: Documento = serde_json::from_str(json).expect("debe deserializar");
        assert_eq!(doc.id, "x");
        assert_eq!(doc.copias, 1);
        assert!(doc.avisos.is_empty());
        assert_eq!(doc.cuerpo[0].nombre, "Café");
    }

    #[test]
    fn el_camel_case_del_front_llega_al_snake_case_de_rust() {
        // `abrirCajon` en JS ↔ `abrir_cajon` en Rust. Si esto se rompe, el
        // cajón deja de abrirse en silencio y nadie lo nota hasta el corte.
        let json = r#"{"id":"x","abrirCajon":true}"#;
        let doc: Documento = serde_json::from_str(json).expect("debe deserializar");
        assert!(doc.abrir_cajon, "abrirCajon del front debe mapear a abrir_cajon");
    }

    #[test]
    fn un_documento_sin_contenido_se_reconoce_como_vacio() {
        let doc = Documento::default();
        assert!(doc.vacio());
    }
}
