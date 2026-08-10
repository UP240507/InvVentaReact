//! Cómo llegan los bytes a la impresora.
//!
//! Tres implementaciones tras un mismo trait, porque la impresora es la pieza
//! que más cambia entre restaurantes y la que no tenemos delante mientras se
//! escribe esto. Cambiar de transporte es cambiar una línea de configuración,
//! no recompilar.
//!
//! - `Simulador`  → escribe a disco. Permite validar TODO el sistema (rutas,
//!                  cola, reintentos, maquetado) sin hardware. Es el que queda
//!                  activo por defecto para que la app funcione en una máquina
//!                  sin impresora en vez de fallar al arrancar.
//! - `WindowsRaw` → spooler de Windows. Es el caso de la térmica USB genérica.
//! - `Tcp`        → socket al puerto 9100. Impresoras de red tipo Epson TM-T20.
//!
//! El trait es SÍNCRONO a propósito. Imprimir es lento, bloqueante y con un
//! único recurso físico al final; envolverlo en async daría la ilusión de
//! concurrencia sobre algo que es estrictamente uno-a-la-vez. La cola corre en
//! un hilo dedicado (ver `cola.rs`) y ahí el bloqueo no molesta a nadie.

use std::fmt;
use std::io::Write;
use std::path::PathBuf;

#[derive(Debug)]
pub enum ErrorImpresion {
    NoDisponible(String),
    Escritura(String),
}

impl fmt::Display for ErrorImpresion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorImpresion::NoDisponible(m) => write!(f, "impresora no disponible: {m}"),
            ErrorImpresion::Escritura(m) => write!(f, "fallo al escribir: {m}"),
        }
    }
}

impl std::error::Error for ErrorImpresion {}

pub trait Transporte: Send + Sync {
    fn nombre(&self) -> String;
    fn enviar(&self, bytes: &[u8]) -> Result<(), ErrorImpresion>;
}

// ─── Simulador ───────────────────────────────────────────────────────────────

/// Escribe cada impresión a un archivo `.escpos` con los bytes crudos, para
/// poder inspeccionar los comandos con un editor hexadecimal.
///
/// La versión legible no se genera aquí: un transporte recibe bytes y no sabe
/// de qué documento vienen. Para leer el ticket maquetado está el endpoint
/// `/previsualizar`, que corre `escpos::previsualizar` sobre el documento.
pub struct Simulador {
    pub carpeta: PathBuf,
}

impl Simulador {
    pub fn nueva(carpeta: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&carpeta);
        Self { carpeta }
    }
}

impl Transporte for Simulador {
    fn nombre(&self) -> String {
        format!("simulador ({})", self.carpeta.display())
    }

    fn enviar(&self, bytes: &[u8]) -> Result<(), ErrorImpresion> {
        std::fs::create_dir_all(&self.carpeta)
            .map_err(|e| ErrorImpresion::NoDisponible(e.to_string()))?;

        let marca = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        let crudo = self.carpeta.join(format!("{marca}.escpos"));
        std::fs::write(&crudo, bytes).map_err(|e| ErrorImpresion::Escritura(e.to_string()))?;
        Ok(())
    }
}

// ─── TCP (impresora de red, puerto 9100) ─────────────────────────────────────

pub struct Tcp {
    pub host: String,
    pub puerto: u16,
}

impl Transporte for Tcp {
    fn nombre(&self) -> String {
        format!("tcp {}:{}", self.host, self.puerto)
    }

    fn enviar(&self, bytes: &[u8]) -> Result<(), ErrorImpresion> {
        use std::net::TcpStream;
        use std::time::Duration;

        let destino = format!("{}:{}", self.host, self.puerto);
        // Con timeout explícito: una impresora apagada en una IP que existe
        // deja el socket colgado hasta el timeout del sistema (minutos), y
        // durante ese rato la cola no avanza.
        let addr = destino
            .parse()
            .map_err(|_| ErrorImpresion::NoDisponible(format!("dirección inválida: {destino}")))?;
        let mut flujo = TcpStream::connect_timeout(&addr, Duration::from_secs(3))
            .map_err(|e| ErrorImpresion::NoDisponible(e.to_string()))?;
        flujo
            .set_write_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| ErrorImpresion::Escritura(e.to_string()))?;
        flujo
            .write_all(bytes)
            .map_err(|e| ErrorImpresion::Escritura(e.to_string()))?;
        flujo
            .flush()
            .map_err(|e| ErrorImpresion::Escritura(e.to_string()))?;
        Ok(())
    }
}

// ─── Windows RAW (spooler) ───────────────────────────────────────────────────

#[cfg(windows)]
pub struct WindowsRaw {
    pub impresora: String,
}

#[cfg(windows)]
impl Transporte for WindowsRaw {
    fn nombre(&self) -> String {
        format!("windows raw «{}»", self.impresora)
    }

    fn enviar(&self, bytes: &[u8]) -> Result<(), ErrorImpresion> {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Graphics::Printing::{
            ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
            StartPagePrinter, WritePrinter, DOC_INFO_1W,
        };

        // Windows quiere UTF-16 terminado en nulo. Los buffers tienen que vivir
        // hasta después de la llamada: si se construyeran en línea, Rust los
        // liberaría al final de la expresión y el spooler leería memoria muerta.
        let a_wide =
            |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };

        let nombre = a_wide(&self.impresora);
        let mut tipo_raw = a_wide("RAW");
        let mut doc_nombre = a_wide("InvVenta ticket");

        unsafe {
            let mut handle = HANDLE::default();
            OpenPrinterW(PCWSTR(nombre.as_ptr()), &mut handle, None).map_err(|e| {
                ErrorImpresion::NoDisponible(format!(
                    "no se pudo abrir «{}»: {e}. Revisa que el nombre coincida \
                     exactamente con el de Dispositivos e impresoras.",
                    self.impresora
                ))
            })?;

            // Sin pDatatype = "RAW", el spooler intenta MAQUETAR los bytes como
            // si fueran un documento y la impresora recibe basura o nada.
            let info = DOC_INFO_1W {
                pDocName: windows::core::PWSTR(doc_nombre.as_mut_ptr()),
                pOutputFile: windows::core::PWSTR::null(),
                pDatatype: windows::core::PWSTR(tipo_raw.as_mut_ptr()),
            };

            let trabajo = StartDocPrinterW(handle, 1, &info);
            if trabajo == 0 {
                let _ = ClosePrinter(handle);
                return Err(ErrorImpresion::Escritura(
                    "StartDocPrinter devolvió 0 (¿cola de impresión detenida?)".into(),
                ));
            }

            if StartPagePrinter(handle).as_bool() {
                let mut escritos: u32 = 0;
                let ok = WritePrinter(
                    handle,
                    bytes.as_ptr() as *const _,
                    bytes.len() as u32,
                    &mut escritos,
                )
                .as_bool();
                let _ = EndPagePrinter(handle);
                let _ = EndDocPrinter(handle);
                let _ = ClosePrinter(handle);

                if !ok {
                    return Err(ErrorImpresion::Escritura("WritePrinter falló".into()));
                }
                // Una escritura parcial es un ticket cortado a la mitad: hay que
                // tratarla como fallo para que la cola reintente el documento
                // COMPLETO, no continuar como si nada.
                if escritos as usize != bytes.len() {
                    return Err(ErrorImpresion::Escritura(format!(
                        "escritura parcial: {escritos} de {} bytes",
                        bytes.len()
                    )));
                }
                Ok(())
            } else {
                let _ = EndDocPrinter(handle);
                let _ = ClosePrinter(handle);
                Err(ErrorImpresion::Escritura("StartPagePrinter falló".into()))
            }
        }
    }
}

/// Nombres de las impresoras instaladas. La pantalla de diagnóstico las lista
/// para que el nombre no se teclee a mano: en Windows suelen llamarse cosas
/// como "POS-58 Printer(1)" y un espacio de más deja la caja sin imprimir.
#[cfg(windows)]
pub fn impresoras_instaladas() -> Vec<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Printing::{EnumPrintersW, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W};

    let mut necesario: u32 = 0;
    let mut cuantas: u32 = 0;
    let nivel = 2;
    let banderas = PRINTER_ENUM_LOCAL;

    // `PCWSTR::null()` y no `None`: el parámetro es genérico sobre
    // `Param<PCWSTR>`, y `None` a secas no le da al compilador con qué resolver
    // el tipo. El nulo significa "el equipo local", que es lo que se quiere.
    let equipo_local = PCWSTR::null();

    unsafe {
        // Primera llamada: solo para saber cuánto buffer hace falta. Devuelve
        // error siempre (ERROR_INSUFFICIENT_BUFFER); es el protocolo esperado.
        let _ = EnumPrintersW(
            banderas,
            equipo_local,
            nivel,
            None,
            &mut necesario,
            &mut cuantas,
        );
        if necesario == 0 {
            return vec![];
        }

        let mut buffer = vec![0u8; necesario as usize];
        if EnumPrintersW(
            banderas,
            equipo_local,
            nivel,
            Some(&mut buffer),
            &mut necesario,
            &mut cuantas,
        )
        .is_err()
        {
            return vec![];
        }

        let info = buffer.as_ptr() as *const PRINTER_INFO_2W;
        (0..cuantas as usize)
            .filter_map(|i| {
                let p = &*info.add(i);
                p.pPrinterName.to_string().ok()
            })
            .collect()
    }
}

#[cfg(not(windows))]
pub fn impresoras_instaladas() -> Vec<String> {
    // En Linux/macOS no hay spooler RAW equivalente. El desarrollo fuera de
    // Windows usa el simulador o una impresora de red.
    vec![]
}

// ─── Selección ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum ConfigTransporte {
    Simulador { carpeta: Option<String> },
    Windows { impresora: String },
    Tcp { host: String, puerto: Option<u16> },
}

impl ConfigTransporte {
    pub fn construir(&self, carpeta_datos: &PathBuf) -> Box<dyn Transporte> {
        match self {
            ConfigTransporte::Simulador { carpeta } => {
                let destino = carpeta
                    .as_ref()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| carpeta_datos.join("impresiones"));
                Box::new(Simulador::nueva(destino))
            }
            ConfigTransporte::Tcp { host, puerto } => Box::new(Tcp {
                host: host.clone(),
                puerto: puerto.unwrap_or(9100),
            }),
            #[cfg(windows)]
            ConfigTransporte::Windows { impresora } => Box::new(WindowsRaw {
                impresora: impresora.clone(),
            }),
            // Fuera de Windows la opción existe en el JSON pero no hay a qué
            // conectarla; se degrada al simulador en vez de tumbar el hub.
            #[cfg(not(windows))]
            ConfigTransporte::Windows { .. } => {
                Box::new(Simulador::nueva(carpeta_datos.join("impresiones")))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_simulador_escribe_los_bytes_tal_cual() {
        let dir = std::env::temp_dir().join(format!(
            "invventa-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let sim = Simulador::nueva(dir.clone());
        sim.enviar(b"hola").expect("debe escribir");

        let archivos: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(archivos.len(), 1);
        assert_eq!(std::fs::read(archivos[0].path()).unwrap(), b"hola");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn una_ip_inexistente_falla_rapido_y_no_cuelga_la_cola() {
        // 192.0.2.x es el rango reservado para documentación: nunca responde.
        let t = Tcp { host: "192.0.2.1".into(), puerto: 9100 };
        let inicio = std::time::Instant::now();
        let r = t.enviar(b"x");
        assert!(r.is_err());
        assert!(
            inicio.elapsed() < std::time::Duration::from_secs(10),
            "el timeout debe acotar la espera"
        );
    }

    #[test]
    fn la_config_de_transporte_va_y_viene_por_json() {
        let json = r#"{"tipo":"tcp","host":"192.168.1.50","puerto":9100}"#;
        let c: ConfigTransporte = serde_json::from_str(json).unwrap();
        match c {
            ConfigTransporte::Tcp { host, puerto } => {
                assert_eq!(host, "192.168.1.50");
                assert_eq!(puerto, Some(9100));
            }
            _ => panic!("debería ser tcp"),
        }
    }
}
