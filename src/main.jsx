import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
