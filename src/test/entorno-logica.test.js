// src/test/entorno-logica.test.js
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **En el proyecto «logica» (entorno node) el código ve la conexión como en el
// navegador.**
//
// En node `navigator` existe pero `onLine` vale undefined, y el código lo lee
// como «sin conexión» (`!navigator.onLine` en useSyncStore y useAppStore). Sin
// el ajuste de `setup.js`, una prueba de lógica que pasara por esa rama
// recorrería el camino offline y pasaría igual, sin avisar.
import { describe, it, expect } from 'vitest';

describe('entorno de las pruebas de lógica', () => {
  it('LA AFIRMACIÓN: navigator.onLine es true, como en el navegador', () => {
    expect(navigator.onLine).toBe(true);
  });

  it('y de verdad es node: no hay DOM que tapar el hueco', () => {
    expect(typeof document).toBe('undefined');
  });
});
