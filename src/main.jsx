import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// (Proyecto D) Fuentes self-hosted: offline-first y sin red en Tauri.
// Fraunces = display (números grandes, títulos admin) · Figtree = UI admin.
//
// ── LAS DOS QUE FALTABAN, AÑADIDAS EL 18-AGO ────────────────────────────────
// Esta lista tenía la mitad de las familias que declara `index.css`, y las
// otras dos estaban en otro sitio o en ninguno:
//
//   · **Syne** —la más usada de todas, 96 sitios— venía de `fonts.googleapis.com`
//     por un `<link>` del `index.html`. O sea que la app que presume de
//     funcionar sin internet **pedía una fuente a Google en cada arranque**, y
//     el día que se cae la red esa petición no falla rápido: cuelga hasta que
//     el sistema se rinde, y sólo entonces cae a la fuente del sistema.
//   · **DM Sans** (`--font-sans`) **no se cargaba en ninguna parte.** Se
//     declaraba en `index.css` y nadie la traía, así que esos sitios llevaban
//     meses pintando con la sans del sistema. No falla nada: sólo no es la
//     tipografía que el diseño dice.
//
// Y de paso se fue **Inter**, que el `index.html` sí descargaba y que no
// aparece ni una vez en el CSS ni en el código. Una fuente entera bajada en
// cada carga para nadie.
//
// Los pesos son los que se usan: `font-syne` va con `font-black` (79 veces) y
// `font-bold` (14). Syne llega hasta 800, así que el 900 lo resuelve el
// navegador con el 800 — igual que hasta hoy, esto no cambia cómo se ve.
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import './index.css';
import App from './App.jsx';
import { abrirDBSegura } from './store/localDB';

// Auto-reparación de Dexie ANTES de montar la app: si la base quedó inconsistente
// (v140 vacía por un upgrade bloqueado), se recrea limpia. .finally garantiza que
// la app monte aunque algo falle (no dejamos la pantalla en blanco por la DB).
abrirDBSegura().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
