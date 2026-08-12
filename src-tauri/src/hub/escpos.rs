//! Render de documento semántico a bytes ESC/POS para papel de 58 mm.
//!
//! Tres decisiones que conviene tener presentes al leer esto:
//!
//! 1. **Ancho fijo en caracteres, no en milímetros.** Una térmica de 58 mm en
//!    fuente A da 32 columnas. Todo el maquetado —alineación de importes,
//!    corte de palabras, separadores— se hace contando caracteres. Pensar en
//!    píxeles aquí no sirve de nada.
//!
//! 2. **CP850, no UTF-8.** La impresora no habla Unicode. Si se le manda
//!    "Café" en UTF-8 imprime "CafÃ©". Se selecciona la página de códigos 850
//!    y se traduce carácter por carácter. Lo que no esté en la tabla se
//!    *pliega* a su letra base (`ñ`→`n`) en vez de imprimirse como basura: un
//!    nombre de platillo levemente mal escrito se entiende; un jeroglífico no.
//!
//! 3. **Nada de aritmética.** Los importes llegan como texto ya formateado.
//!    Este módulo los alinea a la derecha y nada más.

use crate::hub::documento::Documento;

/// Columnas útiles en fuente A. El papel de 58 mm da 32; el de 80 mm, 48.
pub const ANCHO_58: usize = 32;
pub const ANCHO_80: usize = 48;

/// El que se usa mientras nadie configure nada. 58 mm es el rollo del
/// clon barato, que es con lo que se hizo el diseño y lo que más hay.
pub const ANCHO_POR_DEFECTO: usize = ANCHO_58;

/// Marca estampada al pie de cada ticket de cobro.
///
/// Vive en el RENDERIZADOR, no en el documento, y esa diferencia es todo el
/// punto: si viajara dentro del JSON sería un dato, y un dato se quita. Bastaría
/// un `if plan === 'premium'` en el front, o un cliente modificado que arme su
/// propio documento y lo mande por HTTP al hub, para que dejara de salir.
///
/// Al vivir aquí, imprimir un ticket y estampar la marca son la misma
/// operación: no existe una forma de pedir la primera sin la segunda. La única
/// manera de quitarla es recompilar el binario de la caja.
///
/// Dice solo el nombre a propósito. Un eslogan en el papel de un comensal es
/// publicidad de alguien que no le vendió nada; el nombre suelto es una
/// pregunta, y la pregunta es la que trabaja.
const MARCA: &str = "InvVenta";

// ─── Comandos ESC/POS ────────────────────────────────────────────────────────
const ESC: u8 = 0x1B;
const GS: u8 = 0x1D;

pub struct Render {
    buf: Vec<u8>,
    /// Columnas del papel. Es propiedad de LA IMPRESORA, no del documento: el
    /// mismo ticket sale de 32 o de 48 según dónde se imprima, y meterlo en el
    /// JSON dejaría que un cliente pidiera un ancho que el papel no tiene.
    ancho: usize,
}

impl Render {
    fn new(ancho: usize) -> Self {
        Self {
            buf: Vec::with_capacity(1024),
            ancho,
        }
    }

    fn raw(&mut self, bytes: &[u8]) -> &mut Self {
        self.buf.extend_from_slice(bytes);
        self
    }

    /// ESC @ — reinicia la impresora. Sin esto, una impresión anterior que
    /// murió a media negrita deja la siguiente en negrita.
    fn init(&mut self) -> &mut Self {
        self.raw(&[ESC, b'@'])
    }

    /// ESC t n — selecciona página de códigos. n=2 es CP850 en el estándar
    /// Epson y en la mayoría de los clones chinos de 58 mm.
    fn codepage_850(&mut self) -> &mut Self {
        self.raw(&[ESC, b't', 2])
    }

    /// ESC a n — 0 izquierda, 1 centro, 2 derecha.
    fn alinear(&mut self, n: u8) -> &mut Self {
        self.raw(&[ESC, b'a', n])
    }

    /// ESC E n — negrita.
    fn negrita(&mut self, on: bool) -> &mut Self {
        self.raw(&[ESC, b'E', if on { 1 } else { 0 }])
    }

    /// GS ! n — tamaño. 0x11 = doble alto y doble ancho.
    fn doble(&mut self, on: bool) -> &mut Self {
        self.raw(&[GS, b'!', if on { 0x11 } else { 0x00 }])
    }

    fn texto(&mut self, s: &str) -> &mut Self {
        let cp = a_cp850(s);
        self.raw(&cp)
    }

    fn linea(&mut self, s: &str) -> &mut Self {
        self.texto(s).raw(b"\n")
    }

    fn separador(&mut self) -> &mut Self {
        self.linea(&"-".repeat(self.ancho))
    }

    /// Regla gruesa. Se usa solo antes de los totales: en una tira de 32
    /// columnas todos los separadores iguales convierten el ticket en una
    /// escalera y el ojo no encuentra dónde empieza lo que hay que pagar.
    fn separador_fuerte(&mut self) -> &mut Self {
        self.linea(&"=".repeat(self.ancho))
    }

    /// GS V 1 — corte parcial. Parcial y no total a propósito: deja un punto
    /// de unión que impide que la tira caiga al suelo cuando cocina no está
    /// mirando la impresora.
    fn cortar(&mut self) -> &mut Self {
        self.raw(b"\n\n\n").raw(&[GS, b'V', 1])
    }

    /// ESC p m t1 t2 — pulso al cajón. Los tiempos son los habituales; un
    /// pulso demasiado corto no mueve el solenoide de un cajón real.
    fn abrir_cajon(&mut self) -> &mut Self {
        self.raw(&[ESC, b'p', 0, 25, 250])
    }

    pub fn bytes(self) -> Vec<u8> {
        self.buf
    }
}

/// Traduce una cadena UTF-8 a bytes CP850, plegando lo que no exista.
///
/// El plegado es la parte importante: preferimos "Jalapeno" a un cuadrito
/// negro. Un carácter irreconocible se convierte en '?' solo si ni siquiera
/// tiene una letra base razonable.
pub fn a_cp850(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    for ch in s.chars() {
        let b: u8 = match ch {
            c if (c as u32) < 128 => c as u8,
            'á' => 0xA0,
            'é' => 0x82,
            'í' => 0xA1,
            'ó' => 0xA2,
            'ú' => 0xA3,
            'ñ' => 0xA4,
            'Ñ' => 0xA5,
            'ü' => 0x81,
            'Ü' => 0x9A,
            'Á' => 0xB5,
            'É' => 0x90,
            'Í' => 0xD6,
            'Ó' => 0xE0,
            'Ú' => 0xE9,
            '¿' => 0xA8,
            '¡' => 0xAD,
            '°' => 0xF8,
            'º' => 0xA7,
            'ª' => 0xA6,
            '€' => 0xD5,
            // Signos tipográficos que el front usa y la impresora no tiene:
            // se traducen a su equivalente ASCII en vez de perderse. El menos
            // Unicode de los descuentos (−) es el caso frecuente.
            '−' | '–' | '—' => b'-',
            '“' | '”' | '„' => b'"',
            '‘' | '’' => b'\'',
            '…' => b'.',
            '·' => b'-',
            // Plegado genérico: quita el acento y conserva la letra.
            'à' | 'â' | 'ä' | 'ã' | 'å' => b'a',
            'è' | 'ê' | 'ë' => b'e',
            'ì' | 'î' | 'ï' => b'i',
            'ò' | 'ô' | 'ö' | 'õ' => b'o',
            'ù' | 'û' => b'u',
            'ç' => b'c',
            'À' | 'Â' | 'Ä' | 'Ã' => b'A',
            'È' | 'Ê' | 'Ë' => b'E',
            'Ì' | 'Î' | 'Ï' => b'I',
            'Ò' | 'Ô' | 'Ö' | 'Õ' => b'O',
            'Ù' | 'Û' => b'U',
            'Ç' => b'C',
            _ => b'?',
        };
        out.push(b);
    }
    out
}

/// Longitud en CARACTERES, no en bytes. `"Café".len()` en Rust son 5 bytes y
/// 4 caracteres; alinear por bytes desalinea toda la columna de importes en
/// cuanto aparece un acento.
fn ancho(s: &str) -> usize {
    s.chars().count()
}

/// Recorta a `max` caracteres respetando límites de carácter.
fn recortar(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Parte un texto en líneas de como mucho `max` caracteres, cortando por
/// espacios cuando se puede. Una palabra más larga que la línea (un nombre de
/// platillo sin espacios) se parte a lo bruto: es preferible a que la
/// impresora la corte sola y se pierda el final.
pub fn envolver(s: &str, max: usize) -> Vec<String> {
    if max == 0 {
        return vec![];
    }
    let mut lineas = Vec::new();
    let mut actual = String::new();

    for palabra in s.split_whitespace() {
        if ancho(&palabra) > max {
            if !actual.is_empty() {
                lineas.push(std::mem::take(&mut actual));
            }
            let mut resto: Vec<char> = palabra.chars().collect();
            while resto.len() > max {
                lineas.push(resto[..max].iter().collect());
                resto = resto[max..].to_vec();
            }
            actual = resto.iter().collect();
            continue;
        }
        if actual.is_empty() {
            actual = palabra.to_string();
        } else if ancho(&actual) + 1 + ancho(palabra) <= max {
            actual.push(' ');
            actual.push_str(palabra);
        } else {
            lineas.push(std::mem::take(&mut actual));
            actual = palabra.to_string();
        }
    }
    if !actual.is_empty() {
        lineas.push(actual);
    }
    if lineas.is_empty() {
        lineas.push(String::new());
    }
    lineas
}

/// Etiqueta a la izquierda, valor pegado a la derecha, relleno en medio.
/// Si no caben juntos, se recorta la ETIQUETA y nunca el valor: un total
/// truncado es un ticket inservible; una etiqueta truncada sigue leyéndose.
pub fn dos_columnas(izq: &str, der: &str, cols: usize) -> String {
    let der = recortar(der, cols);
    let espacio = cols.saturating_sub(ancho(&der));
    let izq = recortar(izq, espacio.saturating_sub(1));
    let relleno = cols.saturating_sub(ancho(&izq) + ancho(&der));
    format!("{}{}{}", izq, " ".repeat(relleno), der)
}

/// Convierte un documento en la tira de bytes que se le manda a la impresora.
pub fn render(doc: &Documento, cols: usize) -> Vec<u8> {
    let mut r = Render::new(cols);
    r.init().codepage_850();

    // ── Encabezado ──────────────────────────────────────────────────────────
    r.alinear(1);
    if !doc.titulo.is_empty() {
        // La comanda va SIEMPRE a doble tamaño: se lee a un metro, colgada de
        // una pinza, con prisa. Ahí el tamaño es funcional.
        //
        // El ticket va a doble tamaño solo si el nombre cabe en media tira.
        // A doble ancho quedan 16 columnas, y un nombre largo se partiría en
        // dos renglones gigantes que se comen el encabezado entero. La regla es
        // "grande si cabe entero, normal si no": el nombre completo importa más
        // que el tamaño, pero cuando ambos se pueden tener, se tienen.
        let grande = doc.tipo == "comanda" || ancho(&doc.titulo) <= cols / 2;
        r.doble(grande).negrita(true);
        for l in envolver(&doc.titulo, if grande { cols / 2 } else { cols }) {
            r.linea(&l);
        }
        r.negrita(false).doble(false);
    }
    if !doc.subtitulo.is_empty() {
        for l in envolver(&doc.subtitulo, cols) {
            r.linea(&l);
        }
    }
    // ── Emisor ──────────────────────────────────────────────────────────────
    // Razón social, RFC, domicilio y teléfono, centrados bajo el nombre. Cada
    // dato se envuelve por su cuenta: un domicilio largo se parte por palabras
    // pero no arrastra al RFC a su última línea.
    //
    // Las vacías se saltan aquí y no en quien construye el documento: un
    // restaurante sin RFC capturado no debe imprimir un renglón en blanco en
    // mitad de su encabezado.
    for dato in &doc.emisor {
        if dato.trim().is_empty() {
            continue;
        }
        for l in envolver(dato, cols) {
            r.linea(&l);
        }
    }
    r.alinear(0);

    // ── Avisos (reimpresión) ────────────────────────────────────────────────
    if !doc.avisos.is_empty() {
        r.separador();
        r.alinear(1).negrita(true);
        for aviso in &doc.avisos {
            for l in envolver(aviso, cols) {
                r.linea(&l);
            }
        }
        r.negrita(false).alinear(0);
    }

    // ── Meta ────────────────────────────────────────────────────────────────
    if !doc.meta.is_empty() {
        r.separador();
        for m in &doc.meta {
            if m.valor.is_empty() {
                continue;
            }
            r.linea(&dos_columnas(&format!("{}:", m.etiqueta), &m.valor, cols));
        }
    }

    // ── Cuerpo ──────────────────────────────────────────────────────────────
    if !doc.cuerpo.is_empty() {
        r.separador();
        // Encabezado de columnas solo donde hay columnas que nombrar. En la
        // comanda no hay dinero y el nombre ocupa toda la tira, así que un
        // "IMPORTE" ahí sería un título de una columna que no existe.
        if !doc.tipo.is_empty() && doc.tipo != "comanda" {
            r.linea(&dos_columnas("CANT DESCRIPCION", "IMPORTE", cols));
            r.separador();
        }
        for linea in &doc.cuerpo {
            let cant = format!("{}x ", linea.cantidad);
            let sangria = ancho(&cant);

            if linea.importe.is_empty() {
                // Comanda: sin columna de dinero, así que el nombre dispone de
                // todo el ancho. En negrita y con la cantidad delante, que es
                // lo que cocina busca de un vistazo.
                r.negrita(true);
                let disponible = cols.saturating_sub(sangria);
                for (i, l) in envolver(&linea.nombre, disponible).iter().enumerate() {
                    if i == 0 {
                        r.linea(&format!("{}{}", cant, l));
                    } else {
                        r.linea(&format!("{}{}", " ".repeat(sangria), l));
                    }
                }
                r.negrita(false);
            } else {
                // Ticket: el importe se reserva a la derecha ANTES de maquetar
                // el nombre, para que nunca se lo coma un platillo de nombre
                // largo.
                let ancho_importe = ancho(&linea.importe) + 1;
                let disponible = cols
                    .saturating_sub(sangria)
                    .saturating_sub(ancho_importe)
                    .max(1);
                let partes = envolver(&linea.nombre, disponible);
                for (i, l) in partes.iter().enumerate() {
                    if i == 0 {
                        r.linea(&dos_columnas(&format!("{}{}", cant, l), &linea.importe, cols));
                    } else {
                        r.linea(&format!("{}{}", " ".repeat(sangria), l));
                    }
                }
            }

            for sub in &linea.sublineas {
                for l in envolver(sub, cols.saturating_sub(2)) {
                    r.linea(&format!("  {}", l));
                }
            }

            if !linea.nota.is_empty() {
                // La nota va marcada y sangrada: "sin cebolla" perdido entre
                // nombres de platillo es exactamente lo que cocina no ve.
                for l in envolver(&linea.nota, cols.saturating_sub(4)) {
                    r.linea(&format!("  > {}", l));
                }
            }
        }
    }

    // ── Totales ─────────────────────────────────────────────────────────────
    if !doc.totales.is_empty() {
        r.separador_fuerte();
        // Todo lo que venga DESPUÉS del total enfatizado pertenece a otro
        // bloque: lo entregado y el cambio no son parte del desglose de la
        // cuenta, son la liquidación. Se separan con una regla para que nadie
        // lea "Cambio" como un cargo más.
        let mut cerrado = false;
        for t in &doc.totales {
            if cerrado && !t.enfasis {
                r.separador();
                cerrado = false;
            }
            if t.enfasis {
                cerrado = true;
                r.negrita(true).doble(true);
                // A doble ancho caben la mitad de columnas: si se maquetara
                // con el ancho completo, el total se saldría del papel por la derecha.
                let der = recortar(&t.valor, cols / 2);
                let izq = recortar(&t.etiqueta, (cols / 2).saturating_sub(ancho(&der) + 1));
                let relleno = (cols / 2).saturating_sub(ancho(&izq) + ancho(&der));
                r.linea(&format!("{}{}{}", izq, " ".repeat(relleno), der));
                r.doble(false).negrita(false);
            } else {
                r.linea(&dos_columnas(&t.etiqueta, &t.valor, cols));
            }
        }
    }

    // ── Pie ─────────────────────────────────────────────────────────────────
    if !doc.pie.is_empty() {
        r.separador();
        r.alinear(1);
        for p in &doc.pie {
            if p.is_empty() {
                r.raw(b"\n");
                continue;
            }
            for l in envolver(p, cols) {
                r.linea(&l);
            }
        }
        r.alinear(0);
    }

    // ── Marca ───────────────────────────────────────────────────────────────
    // Solo en los papeles que salen del local en la mano de alguien: el ticket
    // de cobro y la pre-cuenta. La comanda se queda en cocina y no la ve nadie
    // de fuera, así que ahí la marca solo gastaría papel.
    //
    // La pre-cuenta se sumó al añadirla (6-ago) y no por inercia: es el papel
    // que el comensal tiene MÁS RATO en la mano —lo lee, hace cuentas, decide
    // la propina— mientras que el ticket suele doblarse y guardarse. Si la
    // marca vale para uno, vale más para el otro.
    //
    // Nada de esto se lee del documento. No hay condición de negocio que
    // consultar ni bandera de plan que tocar: si el tipo es uno de esos dos, la
    // línea sale, y para quitarla hay que recompilar el binario.
    if doc.tipo == "ticket" || doc.tipo == "precuenta" {
        r.raw(b"\n");
        r.alinear(1);
        r.linea(MARCA);
        r.alinear(0);
    }

    r.cortar();

    if doc.abrir_cajon {
        // Después del corte: si el cajón se abriera antes y el papel se
        // atascara, quedaría dinero expuesto por un fallo de impresión.
        r.abrir_cajon();
    }

    r.bytes()
}

/// Vista previa legible del documento, en texto plano y con el mismo maquetado.
/// Es lo que escribe el transporte de simulación y lo que se enseña en la
/// pantalla de diagnóstico: permite revisar alineación y cortes de palabra sin
/// gastar un centímetro de papel.
///
/// **Interpreta `ESC a`**, no lo descarta. Si no lo hiciera, todo saldría
/// pegado a la izquierda y quien revisa la vista previa creería que el
/// encabezado y la marca están mal centrados cuando en el papel salen bien —
/// una vista previa que miente sobre el resultado es peor que no tenerla,
/// porque manda a arreglar algo que no está roto.
pub fn previsualizar(doc: &Documento, cols: usize) -> String {
    let bytes = render(doc, cols);
    let mut out = String::new();
    let mut linea = String::new();
    let mut alineacion: u8 = 0;
    let mut doble = false;

    // Vuelca la línea acumulada aplicando la alineación y el tamaño vigentes.
    //
    // ── POR QUÉ EL DOBLE ANCHO SE REPRESENTA Y NO SE IGNORA ─────────────────
    // A doble ancho cada glifo ocupa DOS columnas del papel, y por eso el
    // renderizador maqueta esas líneas contra la mitad del ancho (ver los totales con
    // énfasis). Si la vista previa las pintara a ancho sencillo, «TOTAL
    // $567.00» saldría como 16 caracteres sueltos pegados a la izquierda
    // —pareciendo desalineado y corto— cuando en el papel llena la tira y el
    // importe cae al borde derecho.
    //
    // Es exactamente el fallo que ya tuvo esta función con `ESC a`: enseñaba
    // todo pegado a la izquierda y mandaba a arreglar una alineación que estaba
    // bien. Una vista previa que miente sobre el resultado es peor que no
    // tenerla, y la línea sobre la que mentía aquí era la del TOTAL.
    //
    // Se separa cada carácter con un espacio: no es bonito, pero ocupa las
    // columnas que va a ocupar de verdad y se lee como lo que es —texto grande—.
    fn volcar(out: &mut String, linea: &mut String, alineacion: u8, doble: bool) {
        let contenido = linea.trim_end();
        // Sin `trim_end` sobre el resultado: el último glifo también ocupa DOS
        // columnas, y recortarle la segunda dejaría la línea en 31 caracteres
        // representando 32 de papel. La vista previa se mide, así que el ancho
        // tiene que ser literal aunque acabe en un espacio.
        let pintado: String = if doble {
            contenido.chars().flat_map(|c| [c, ' ']).collect()
        } else {
            contenido.to_string()
        };
        // El ancho OCUPADO, que con doble ancho es el doble del número de
        // glifos. Es contra esto contra lo que hay que centrar o alinear.
        let n = if doble {
            contenido.chars().count() * 2
        } else {
            contenido.chars().count()
        };
        let sangria = match alineacion {
            1 => cols.saturating_sub(n) / 2,
            2 => cols.saturating_sub(n),
            _ => 0,
        };
        out.push_str(&" ".repeat(sangria));
        out.push_str(&pintado);
        out.push('\n');
        linea.clear();
    }

    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        match b {
            ESC => {
                // Los comandos ESC que emitimos son de 2, 3 o 5 bytes.
                let n = match bytes.get(i + 1) {
                    Some(b'@') => 2,
                    Some(b'a') | Some(b'E') | Some(b't') => 3,
                    Some(b'p') => 5,
                    _ => 2,
                };
                if bytes.get(i + 1) == Some(&b'a') {
                    alineacion = bytes.get(i + 2).copied().unwrap_or(0);
                }
                i += n;
            }
            GS => {
                // GS ! n — tamaño. Cualquier n distinto de 0 agranda; sólo se
                // emite 0x11 (doble alto y ancho), así que basta con mirar si
                // hay algo encendido.
                if bytes.get(i + 1) == Some(&b'!') {
                    doble = bytes.get(i + 2).copied().unwrap_or(0) != 0;
                }
                i += 3;
            }
            b'\n' => {
                volcar(&mut out, &mut linea, alineacion, doble);
                i += 1;
            }
            _ => {
                linea.push(de_cp850(b));
                i += 1;
            }
        }
    }
    if !linea.is_empty() {
        volcar(&mut out, &mut linea, alineacion, doble);
    }
    out
}

/// Vuelta de CP850 a Unicode, solo para la vista previa.
fn de_cp850(b: u8) -> char {
    match b {
        0..=127 => b as char,
        0xA0 => 'á',
        0x82 => 'é',
        0xA1 => 'í',
        0xA2 => 'ó',
        0xA3 => 'ú',
        0xA4 => 'ñ',
        0xA5 => 'Ñ',
        0x81 => 'ü',
        0x9A => 'Ü',
        0xB5 => 'Á',
        0x90 => 'É',
        0xD6 => 'Í',
        0xE0 => 'Ó',
        0xE9 => 'Ú',
        0xA8 => '¿',
        0xAD => '¡',
        0xF8 => '°',
        _ => '?',
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hub::documento::{Linea, Meta, Total};

    fn doc_ticket() -> Documento {
        Documento {
            id: "ticket::1".into(),
            tipo: "ticket".into(),
            titulo: "AZUL".into(),
            meta: vec![Meta { etiqueta: "Folio".into(), valor: "POS-1".into() }],
            cuerpo: vec![Linea {
                cantidad: "2".into(),
                nombre: "Chilaquiles verdes con pollo".into(),
                importe: "$360.00".into(),
                ..Default::default()
            }],
            totales: vec![Total {
                etiqueta: "TOTAL".into(),
                valor: "$445.00".into(),
                enfasis: true,
            }],
            ..Default::default()
        }
    }

    #[test]
    fn cp850_traduce_los_acentos_del_espanol() {
        assert_eq!(a_cp850("Café"), vec![b'C', b'a', b'f', 0x82]);
        assert_eq!(a_cp850("ñ"), vec![0xA4]);
    }

    #[test]
    fn lo_que_no_esta_en_la_tabla_se_pliega_a_su_letra_base() {
        // La `è` no está en la tabla de CP850 que mantenemos, así que se pliega
        // a `e`. Preferimos "Creme" a un cuadrito negro: se entiende igual.
        assert_eq!(a_cp850("Crème"), b"Creme".to_vec());
        // Y las que SÍ están siguen saliendo acentuadas: el plegado es el
        // último recurso, no el comportamiento por defecto.
        assert_eq!(a_cp850("café"), vec![b'c', b'a', b'f', 0x82]);
    }

    #[test]
    fn el_menos_unicode_de_los_descuentos_se_vuelve_guion() {
        // El front escribe "−10%" con U+2212. Sin esta traducción saldría '?'
        // justo delante del descuento, que es la parte que el cliente revisa.
        assert_eq!(a_cp850("−10%"), vec![b'-', b'1', b'0', b'%']);
    }

    #[test]
    fn el_ancho_se_mide_en_caracteres_no_en_bytes() {
        // "Café" son 5 bytes y 4 caracteres. Si se alineara por bytes, cada
        // acento correría la columna de importes un espacio a la izquierda.
        let l = dos_columnas("Café", "$10.00", ANCHO_58);
        assert_eq!(l.chars().count(), ANCHO_58);
    }

    #[test]
    fn dos_columnas_siempre_ocupa_el_ancho_exacto() {
        for (a, b) in [("A", "$1.00"), ("", ""), ("Subtotal", "$1,234.50")] {
            assert_eq!(dos_columnas(a, b, ANCHO_58).chars().count(), ANCHO_58, "«{a}» / «{b}»");
        }
    }

    #[test]
    fn ante_falta_de_espacio_se_recorta_la_etiqueta_no_el_importe() {
        let largo = "Concepto absurdamente largo que no cabe de ninguna manera";
        let l = dos_columnas(largo, "$1,234,567.89", ANCHO_58);
        assert!(l.ends_with("$1,234,567.89"), "el importe debe sobrevivir entero");
        assert_eq!(l.chars().count(), ANCHO_58);
    }

    #[test]
    fn envolver_corta_por_espacios() {
        let l = envolver("uno dos tres cuatro cinco seis", 10);
        assert!(l.iter().all(|x| x.chars().count() <= 10));
        assert_eq!(l[0], "uno dos");
    }

    #[test]
    fn una_palabra_mas_larga_que_la_linea_se_parte_en_vez_de_perderse() {
        let l = envolver("supercalifragilisticoespialidoso", 10);
        assert!(l.len() > 1);
        assert_eq!(l.concat(), "supercalifragilisticoespialidoso");
    }

    #[test]
    fn la_comanda_no_imprime_ningun_importe() {
        // Doble candado: `construirComandas` no emite `importe`, y aunque
        // llegara uno, la comanda no debería pintar el símbolo de dinero.
        let doc = Documento {
            tipo: "comanda".into(),
            titulo: "COCINA".into(),
            cuerpo: vec![Linea {
                cantidad: "2".into(),
                nombre: "Chilaquiles".into(),
                importe: String::new(),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(!previsualizar(&doc, ANCHO_58).contains('$'));
    }

    #[test]
    fn el_ticket_alinea_el_importe_a_la_derecha() {
        let vista = previsualizar(&doc_ticket(), ANCHO_58);
        let linea = vista
            .lines()
            .find(|l| l.contains("$360.00"))
            .expect("debe existir la línea del platillo");
        assert!(linea.ends_with("$360.00"));
    }

    #[test]
    fn ninguna_linea_se_pasa_del_ancho_del_papel() {
        let vista = previsualizar(&doc_ticket(), ANCHO_58);
        for l in vista.lines() {
            assert!(
                l.chars().count() <= ANCHO_58,
                "«{l}» mide {} y el papel da {ANCHO_58}",
                l.chars().count()
            );
        }
    }

    #[test]
    fn el_cajon_se_abre_despues_del_corte() {
        let mut doc = doc_ticket();
        doc.abrir_cajon = true;
        let bytes = render(&doc, ANCHO_58);
        let corte = bytes
            .windows(3)
            .position(|w| w == [GS, b'V', 1])
            .expect("debe cortar");
        let cajon = bytes
            .windows(2)
            .position(|w| w == [ESC, b'p'])
            .expect("debe abrir el cajón");
        assert!(cajon > corte, "el cajón no debe abrirse antes de imprimir");
    }

    #[test]
    fn sin_abrir_cajon_no_se_emite_el_pulso() {
        let bytes = render(&doc_ticket(), ANCHO_58);
        assert!(bytes.windows(2).all(|w| w != [ESC, b'p']));
    }

    // ── Marca ───────────────────────────────────────────────────────────────
    // Estas pruebas fijan una decisión de producto, no un detalle de formato:
    // la marca no se puede quitar desde fuera del binario.

    #[test]
    fn todo_ticket_lleva_la_marca() {
        assert!(previsualizar(&doc_ticket(), ANCHO_58).contains(MARCA));
    }

    #[test]
    fn la_marca_sale_aunque_el_documento_venga_pelado() {
        // Sin título, sin pie, sin configuración, sin nada. Es el documento que
        // armaría un cliente modificado intentando que no salga.
        let doc = Documento { tipo: "ticket".into(), ..Default::default() };
        assert!(previsualizar(&doc, ANCHO_58).contains(MARCA));
    }

    #[test]
    fn el_emisor_va_arriba_y_antes_de_la_meta() {
        // Quien expide el documento se identifica en la cabecera. Si acabara
        // debajo del folio o entre los totales, dejaría de leerse como el
        // emisor y pasaría a parecer una nota suelta — que es exactamente lo
        // que le pasaba al RFC cuando vivía en el pie.
        let mut doc = Documento {
            tipo: "ticket".into(),
            titulo: "AZUL".into(),
            emisor: vec![
                "ALBERTO DE JESUS CHAVEZ".into(),
                "RFC: XAXX010101000".into(),
            ],
            ..Default::default()
        };
        doc.meta.push(Meta {
            etiqueta: "Folio".into(),
            valor: "CAJA-V-000001".into(),
        });
        let vista = previsualizar(&doc, ANCHO_58);
        let pos_rfc = vista.find("RFC:").expect("el RFC debe salir");
        let pos_folio = vista.find("Folio").expect("el folio debe salir");
        assert!(pos_rfc < pos_folio, "el emisor va antes que la meta");
    }

    #[test]
    fn un_dato_vacio_del_emisor_no_deja_renglon_en_blanco() {
        // Un local a medio configurar no debe imprimir huecos en su encabezado.
        let doc = Documento {
            tipo: "ticket".into(),
            titulo: "AZUL".into(),
            emisor: vec!["".into(), "RFC: XAXX010101000".into(), "   ".into()],
            ..Default::default()
        };
        let vista = previsualizar(&doc, ANCHO_58);
        // Entre el título y el RFC no puede haber una línea vacía.
        let lineas: Vec<&str> = vista.lines().collect();
        let i = lineas.iter().position(|l| l.contains("RFC:")).unwrap();
        assert!(!lineas[i - 1].trim().is_empty());
    }

    #[test]
    fn cada_dato_del_emisor_se_envuelve_por_su_cuenta() {
        // Un domicilio largo se parte por palabras, pero no debe arrastrar al
        // teléfono a su última línea: son datos distintos.
        let doc = Documento {
            tipo: "ticket".into(),
            emisor: vec![
                "Madero 616, La Purisima, Aguascalientes, Mexico, CP 20259".into(),
                "Tel: 449 915 7059".into(),
            ],
            ..Default::default()
        };
        let vista = previsualizar(&doc, ANCHO_58);
        assert!(
            vista.lines().any(|l| l.trim() == "Tel: 449 915 7059"),
            "el telefono va en su propia linea"
        );
    }

    #[test]
    fn la_vista_previa_no_miente_sobre_el_doble_ancho() {
        // El TOTAL se maqueta contra ANCHO_58/2 porque a doble ancho cada glifo
        // ocupa dos columnas. Si la vista previa lo pintara a ancho sencillo,
        // se leería como una línea corta y desalineada y mandaría a arreglar
        // algo que en el papel está bien. Mismo fallo que tuvo con `ESC a`.
        let doc = Documento {
            tipo: "ticket".into(),
            totales: vec![Total {
                etiqueta: "TOTAL".into(),
                valor: "$567.00".into(),
                enfasis: true,
            }],
            ..Default::default()
        };
        let vista = previsualizar(&doc, ANCHO_58);
        let fila = vista
            .lines()
            .find(|l| l.contains("T O T A L"))
            .expect("el total debe salir separado, que es como ocupa el papel");
        // Ocupa la tira entera: 16 glifos a doble ancho son 32 columnas.
        assert_eq!(fila.chars().count(), ANCHO_58);
        // Y el importe termina pegado al borde derecho, como en el papel.
        assert!(fila.trim_end().ends_with('0'));
    }

    #[test]
    fn la_precuenta_tambien_lleva_la_marca() {
        // Es el papel que el comensal tiene más rato en la mano: lo lee, hace
        // cuentas y decide la propina. Si la marca vale para el ticket, vale
        // más para éste.
        let doc = Documento { tipo: "precuenta".into(), ..Default::default() };
        assert!(previsualizar(&doc, ANCHO_58).contains(MARCA));
    }

    #[test]
    fn la_precuenta_no_abre_el_cajon_ni_por_error() {
        // No ha entrado dinero. Una mesa pide la cuenta varias veces por turno;
        // abrir el cajón en cada una deja el efectivo expuesto sin razón.
        let doc = Documento {
            tipo: "precuenta".into(),
            abrir_cajon: false,
            ..Default::default()
        };
        let bytes = render(&doc, ANCHO_58);
        assert!(bytes.windows(2).all(|w| w != [ESC, b'p']));
    }

    #[test]
    fn la_precuenta_lleva_encabezado_de_columnas_como_el_ticket() {
        // Tiene columna de dinero, a diferencia de la comanda. Si cayera en la
        // rama de la comanda, los importes saldrían sin nombrar.
        let mut doc = Documento { tipo: "precuenta".into(), ..Default::default() };
        doc.cuerpo.push(Linea {
            cantidad: "2".into(),
            nombre: "Cafe de olla".into(),
            importe: "$132.00".into(),
            ..Default::default()
        });
        assert!(previsualizar(&doc, ANCHO_58).contains("IMPORTE"));
    }

    #[test]
    fn ni_el_pie_ni_los_avisos_pueden_desplazarla_del_final() {
        // Va después del pie, siempre. Si alguien mete texto en `pie` para
        // empujarla fuera de vista, sigue siendo la última línea impresa.
        let mut doc = doc_ticket();
        doc.pie = vec!["Gracias".into(), "Vuelva pronto".into()];
        let vista = previsualizar(&doc, ANCHO_58);
        let ultima = vista
            .lines()
            .filter(|l| !l.trim().is_empty())
            .next_back()
            .expect("algo se imprimió");
        assert_eq!(ultima.trim(), MARCA);
    }

    #[test]
    fn la_comanda_no_lleva_marca() {
        // Cocina no es público. Ahí la marca solo gastaría papel.
        let doc = Documento {
            tipo: "comanda".into(),
            titulo: "COCINA".into(),
            cuerpo: vec![Linea {
                cantidad: "1".into(),
                nombre: "Sopa".into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(!previsualizar(&doc, ANCHO_58).contains(MARCA));
    }

    #[test]
    fn el_encabezado_de_columnas_no_aparece_en_la_comanda() {
        let doc = Documento {
            tipo: "comanda".into(),
            cuerpo: vec![Linea {
                cantidad: "1".into(),
                nombre: "Sopa".into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let vista = previsualizar(&doc, ANCHO_58);
        assert!(!vista.contains("IMPORTE"));
        assert!(previsualizar(&doc_ticket(), ANCHO_58).contains("IMPORTE"));
    }

    #[test]
    fn un_nombre_largo_de_negocio_no_se_imprime_a_doble_tamano() {
        // A doble ancho caben 16 columnas: un nombre de 25 se partiría en dos
        // renglones gigantes. Se comprueba por el maquetado, que es lo que
        // `previsualizar` puede ver: entero en una sola línea.
        let mut doc = doc_ticket();
        doc.titulo = "Restaurante La Parrilla del Centro".into();
        let vista = previsualizar(&doc, ANCHO_58);
        assert!(vista.lines().any(|l| l.contains("Restaurante La Parrilla")));
        for l in vista.lines() {
            assert!(l.chars().count() <= ANCHO_58, "«{l}» se sale del papel");
        }
    }

    #[test]
    fn siempre_se_reinicia_la_impresora_al_empezar() {
        // Si la impresión anterior murió a media negrita, sin ESC @ esta sale
        // entera en negrita.
        let bytes = render(&doc_ticket(), ANCHO_58);
        assert_eq!(&bytes[0..2], &[ESC, b'@']);
    }

    // ── EL PAPEL DE 80 mm ────────────────────────────────────────────────────
    // El 11-ago se imprimió por primera vez en una TM-T20II real y salió lo que
    // ya se sabía: correcto pero estrecho, usando dos tercios del rollo. El
    // diseño se hizo contra el ticket de 58 mm de referencia y `ANCHO` estaba
    // fijo en 32.

    #[test]
    fn a_80_mm_las_reglas_ocupan_el_rollo_entero() {
        let bytes = render(&doc_ticket(), ANCHO_80);
        let vista = previsualizar(&doc_ticket(), ANCHO_80);
        assert!(!bytes.is_empty());
        // El separador es la línea que delata el ancho: si siguiera midiendo 32
        // en un papel de 48, el ticket se vería centrado en una columna estrecha.
        assert!(
            vista.lines().any(|l| l.trim_end().chars().count() == ANCHO_80),
            "ninguna línea llega a las {ANCHO_80} columnas del papel de 80 mm"
        );
    }

    #[test]
    fn ninguna_linea_se_sale_del_papel_sea_cual_sea_el_ancho() {
        // La garantía que importa: cambiar el ancho no puede producir una línea
        // más larga que el rollo. Un desbordamiento no da error — la impresora
        // parte la línea donde le toca y el ticket sale ilegible.
        for cols in [ANCHO_58, ANCHO_80] {
            for l in previsualizar(&doc_ticket(), cols).lines() {
                assert!(
                    l.chars().count() <= cols,
                    "«{l}» mide {} y el papel da {cols}",
                    l.chars().count()
                );
            }
        }
    }

    #[test]
    fn dos_columnas_respeta_el_ancho_que_se_le_pide() {
        assert_eq!(dos_columnas("Café", "$10.00", ANCHO_58).chars().count(), ANCHO_58);
        assert_eq!(dos_columnas("Café", "$10.00", ANCHO_80).chars().count(), ANCHO_80);
    }
}
