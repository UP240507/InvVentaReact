// ─── InvVenta: entrada del contenedor Tauri ───────────────────────────────────
// El frontend (React/Vite) es EL MISMO que la versión web; aquí solo vive el
// shell nativo. Los comandos Rust futuros (impresión térmica ESC/POS, puertos
// USB/red, auto-update) se registran en este Builder.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error al arrancar la aplicación Tauri");
}
