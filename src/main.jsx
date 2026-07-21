import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// (Proyecto D) Fuentes self-hosted: offline-first y sin red en Tauri.
// Fraunces = display (números grandes, títulos admin) · Figtree = UI admin.
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-700.css';
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
