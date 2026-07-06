// src/test/setup.js
import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './Mswserver';

// MSW: intercepta llamadas a Supabase en los tests (Supabase offline simulado).
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

// navigator.onLine es read-only en jsdom; helper para forzarlo en tests de sync.
globalThis.__setOnline = (value) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
};
