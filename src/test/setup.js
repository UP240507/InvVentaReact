// src/test/setup.js
//
// Lo común a las dos familias de pruebas (ver vitest.config.js). Lo que sólo
// usan las que renderizan está en setup-dom.js.
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './Mswserver';

// MSW: intercepta llamadas a Supabase en los tests (Supabase offline simulado).
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

// navigator.onLine es read-only en jsdom; helper para forzarlo en tests de sync.
globalThis.__setOnline = (value) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
};

// En el entorno node `navigator` existe pero `onLine` vale undefined, y el
// código lo lee como «sin conexión» (`!navigator.onLine`). Una prueba de lógica
// que tocara esa rama pasaría por el camino offline sin que nadie lo notara.
// Se deja en true, que es lo que da el navegador y lo que da jsdom.
if (typeof navigator !== 'undefined' && navigator.onLine === undefined) {
  globalThis.__setOnline(true);
}
