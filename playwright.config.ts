// playwright.config.js → raíz del repo. Specs en ./e2e
//
// ⚠️ CORRECCIONES sobre el borrador original:
//  1. `npm run preview` sirve en 4173 (no 5173). baseURL y webServer alineados.
//  2. fullyParallel: false + workers: 1 — los specs mutan el tenant AZUL en
//     VIVO (turnos, ventas, movimientos). Dos tests abriendo caja en paralelo
//     se pisan entre sí y contra el realtime.
//  3. Proyecto 'setup' hace el login UI UNA vez por rol y guarda storageState
//     (token de Supabase + invventa.codigoRestaurante en localStorage). Los
//     specs reusan sesión → menos golpes a login-pin (rate-limit 10 fallos /
//     15 min por IP; los éxitos no cuentan, pero igual ahorra segundos).
//  4. iPads corren SOLO render.spec.js (sin mutaciones): validar layout de
//     POS/KDS en tablet no necesita repetir el flujo de caja tres veces.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000, // el flujo de caja cruza EF + realtime; 30s quedaba justo
  expect: { timeout: 10_000 }, // la propagación realtime puede tardar 2-5s
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: process.env.E2E_BASE_URL || 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // build + preview
  },
  projects: [
    // Logins UI una vez por rol → e2e/.auth/{cajero,mesero}.json
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /render\.spec\.js/,
    },
    // Requisito de renderizado: tablet landscape y portrait, SOLO smoke visual.
    {
      name: 'ipad-landscape',
      use: { ...devices['iPad (gen 7) landscape'] },
      dependencies: ['setup'],
      testMatch: /render\.spec\.js/,
    },
    {
      name: 'ipad-portrait',
      use: { ...devices['iPad (gen 7)'] },
      dependencies: ['setup'],
      testMatch: /render\.spec\.js/,
    },
  ],
});