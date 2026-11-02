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

// En el entorno node la conexión no es la del navegador, y depende de la
// versión de Node:
//
//   · Node 21 o más: `navigator` existe, pero `onLine` vale undefined y el
//     código lo lee como «sin conexión» (`!navigator.onLine`). Una prueba de
//     lógica pasaría por el camino offline sin que nadie lo notara.
//   · Node 20: `navigator` NO existe. `useSyncStore` lee `navigator.onLine` al
//     crearse y revienta con ReferenceError al importarlo (1-nov, Windows de
//     Chris; el contenedor tenía Node 22 y no se vio).
//
// En los dos casos se deja `onLine` en true, que es lo que da el navegador y lo
// que da jsdom.
if (typeof navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {},
  });
}
if (navigator.onLine === undefined) {
  globalThis.__setOnline(true);
}
