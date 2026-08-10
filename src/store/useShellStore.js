// ─── ESTADO DEL SHELL ADMIN (Proyecto D · tanda 2) ───────────────────────────
// Preferencias de CHASIS, no de negocio: si el sidebar está colapsado y si el
// buscador global está abierto. Vive en su propio store (no en useAppStore)
// porque no se sincroniza, no se persiste en Supabase y es POR DISPOSITIVO —
// la misma lógica que ya usamos para el modo claro/oscuro.
//
// El colapso se guarda en localStorage: una caja de restaurante se reinicia
// varias veces al día y no tiene por qué reacomodar su pantalla cada vez.

import { create } from 'zustand';

const LLAVE = 'shell:sidebar-colapsado';

const leerColapsado = () => {
  try {
    return localStorage.getItem(LLAVE) === '1';
  } catch {
    // Tauri/webview sin storage o modo privado: arrancamos expandido.
    return false;
  }
};

const guardarColapsado = (valor) => {
  try {
    localStorage.setItem(LLAVE, valor ? '1' : '0');
  } catch {
    /* noop */
  }
};

export const ANCHO_SIDEBAR = 208; // px, expandido
export const ANCHO_SIDEBAR_MIN = 56; // px, modo icono

export const useShellStore = create((set, get) => ({
  sidebarColapsado: leerColapsado(),
  buscadorAbierto: false,

  toggleSidebar: () => {
    const siguiente = !get().sidebarColapsado;
    guardarColapsado(siguiente);
    set({ sidebarColapsado: siguiente });
  },

  setSidebarColapsado: (valor) => {
    guardarColapsado(!!valor);
    set({ sidebarColapsado: !!valor });
  },

  abrirBuscador: () => set({ buscadorAbierto: true }),
  cerrarBuscador: () => set({ buscadorAbierto: false }),
}));
