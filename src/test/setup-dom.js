// src/test/setup-dom.js
//
// Lo que sólo necesitan las pruebas que renderizan (proyecto «pantalla» de
// vitest.config.js): los matchers del DOM y desmontar después de cada prueba.
// Las de lógica no lo cargan: importar Testing Library arrastra react-dom en
// cada fichero aislado, y ahí no se renderiza nada.
import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
