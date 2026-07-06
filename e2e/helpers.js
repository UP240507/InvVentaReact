// e2e/helpers.js — utilidades compartidas de la suite
// Credenciales por env con defaults del tenant de desarrollo (AZUL).
// Para CI o tenant TEST dedicado: exportar E2E_CODIGO / E2E_PIN_CAJERO / E2E_PIN_MESERO.
import { expect } from '@playwright/test';

export const CODIGO = process.env.E2E_CODIGO || 'AZUL-C172';
export const PIN_CAJERO = process.env.E2E_PIN_CAJERO || '131415';
export const PIN_MESERO = process.env.E2E_PIN_MESERO || '331213';

export const STATE_CAJERO = 'e2e/.auth/cajero.json';
export const STATE_MESERO = 'e2e/.auth/mesero.json';

// ── Login de empleado por PIN (/loginempleados) ──────────────────────────────
// Selectores tomados de LoginEmpleadoScreen.jsx:
//  - input del código: placeholder "Ej. AZUL-C172" (solo primera vez en el device)
//  - numpad: botones con texto exacto del dígito
//  - submit: botón "Entrar" (deshabilitado hasta PIN completo)
//  - éxito: window.location.assign('/') → el router manda a /espera o /mesas
export async function loginEmpleado(page, pin) {
  await page.goto('/loginempleados');

  // Código del restaurante: solo si el dispositivo/contexto no lo tiene guardado.
  const inputCodigo = page.getByPlaceholder('Ej. AZUL-C172');
  if (await inputCodigo.isVisible().catch(() => false)) {
    await inputCodigo.fill(CODIGO);
  }

  // PIN por numpad táctil (el teclado físico se ignora con foco en el input
  // del código, así que los botones son la ruta determinista).
  for (const d of pin) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }

  await page.getByRole('button', { name: /entrar/i }).click();

  // login-pin (EF) + setSession + assign('/') + redirect por rol.
  await page.waitForURL(/\/(espera|mesas|kds|pos|dashboard)/, {
    timeout: 20_000,
  });
}

// ── Estado de caja ───────────────────────────────────────────────────────────
// EsperaScreen.jsx (confirmado): la apertura es un panel INLINE, no pasa por
// AbrirTurnoModal. Input del fondo: type=number placeholder "0.00" (único input
// de la pantalla). Botón: "Abrir caja" (muestra "Abriendo..." mientras corre).
// Al abrirse el turno, el useEffect redirige a getRutaInicial() del rol
// (Cajero → /mesas).
export async function abrirTurnoDesdeEspera(page, fondo = '500') {
  await expect(page).toHaveURL(/\/espera/);
  await page.getByPlaceholder('0.00').fill(fondo);
  await page.getByRole('button', { name: /abrir caja/i }).click();
  // El useEffect de EsperaScreen redirige al ver el turno abierto (optimistic).
  await page.waitForURL(/\/mesas/, { timeout: 15_000 });
}

// Cierre vía botón del sidebar → CierreTurnoModal.jsx (confirmado):
//  - Heading "Corte de Caja".
//  - El botón "Confirmar Cierre" está DESHABILITADO hasta capturar el efectivo
//    contado (input type=number placeholder "0.00" dentro del modal).
//  - Declaramos el monto que "Sistema espera" (fondo + efectivo del turno) para
//    cerrar con cuadre perfecto; si no se puede leer, se declara 0 (el modal
//    lo acepta: registra la diferencia como faltante y cierra igual).
export async function cerrarTurnoSiAbierto(page) {
  const btnCerrar = page.getByRole('button', { name: /cerrar turno/i });
  if (!(await btnCerrar.isVisible().catch(() => false))) return false;
  await btnCerrar.click();

  // Scope al overlay del modal para no chocar con otros inputs de la página.
  const modal = page.locator('div.fixed').filter({ hasText: 'Corte de Caja' });
  await expect(modal.getByText('Corte de Caja')).toBeVisible({
    timeout: 10_000,
  });

  // "Sistema espera" y su monto comparten el mismo div (dos spans hermanos).
  let declarado = '0';
  try {
    const fila = modal.getByText('Sistema espera').locator('..');
    const txt = await fila.locator('span').last().innerText();
    const monto = txt.replace(/[^0-9.]/g, '');
    if (monto) declarado = monto;
  } catch {
    /* sin lectura → declarar 0; el cierre procede igual */
  }
  await modal.getByPlaceholder('0.00').fill(declarado);

  const confirmar = modal.getByRole('button', { name: /confirmar cierre/i });
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  // cerrarTurno + onClose: el modal desaparece al completar.
  await expect(confirmar).toBeHidden({ timeout: 10_000 });
  return true;
}

// ── Captura de consola ───────────────────────────────────────────────────────
// Devuelve un array vivo con los textos de console.* de la página, para
// afirmar sobre los logs del store (⏭️, timeout-red, túnel realtime, etc.).
export function capturarConsola(page) {
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  return logs;
}
