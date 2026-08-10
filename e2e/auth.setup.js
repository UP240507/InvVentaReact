// e2e/auth.setup.js — corre UNA vez (proyecto 'setup') antes de los specs.
// Hace el login UI real de cada rol y persiste su storageState (token sb-* de
// Supabase + invventa.codigoRestaurante). Los specs abren contextos con estas
// sesiones ya vivas: cero logins repetidos, cero fricción con el rate-limit.
import { test as setup } from '@playwright/test';
import {
  loginEmpleado,
  PIN_CAJERO,
  PIN_MESERO,
  STATE_CAJERO,
  STATE_MESERO,
} from './helpers.js';

setup('sesión cajero', async ({ page }) => {
  await loginEmpleado(page, PIN_CAJERO);
  await page.context().storageState({ path: STATE_CAJERO });
});

setup('sesión mesero', async ({ page }) => {
  await loginEmpleado(page, PIN_MESERO);
  await page.context().storageState({ path: STATE_MESERO });
});
