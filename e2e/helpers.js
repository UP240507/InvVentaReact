// e2e/helpers.js — utilidades compartidas de la suite
//
// ── LAS CREDENCIALES SALEN DEL ENTORNO, Y SÓLO DEL ENTORNO (22-ago) ─────────
// Hasta hoy los PIN reales de AZUL venían escritos aquí como valores por
// defecto. No es un detalle de higiene: **ese PIN es el que autoriza reabrir
// una cuenta, aplicar un descuento y desbloquear el KDS**. Cualquiera con
// acceso al repositorio —hoy, o el día que entre alguien más, o si el repo
// deja de ser privado— tenía en cuatro líneas el permiso de encargado del
// local.
//
// Y el precedente ya existe: el 13-ago se coló la llave del updater en un
// commit. Se purgó, pero la lección fue que un secreto en el árbol se queda
// ahí hasta que alguien lo mira.
//
// **No hay valor por defecto a propósito.** Poner uno «de desarrollo» es cómo
// vuelve el problema: alguien lo actualiza al PIN bueno para que le funcione y
// nadie se entera. Sin defecto, la suite no arranca sin las variables y lo
// dice en una línea.
//
//   PowerShell:
//     $env:E2E_CODIGO='AZUL-C172'; $env:E2E_PIN_CAJERO='…'; $env:E2E_PIN_MESERO='…'
//     npm run e2e
//
// `e2e/humo.spec.js` NO usa nada de esto: no inicia sesión, y por eso es la
// que puede correr en cada publicación.
import { expect } from '@playwright/test';

/**
 * Lee una variable obligatoria, o para la suite explicando qué falta.
 *
 * Se lanza al importar y no al usarse: mejor que falle antes de abrir el
 * navegador que a mitad de un login, donde el síntoma sería un PIN vacío y un
 * «Entrar» deshabilitado que no explica nada.
 */
const exigir = (nombre, ejemplo) => {
  // `globalThis.process` y no `process` a secas: el ESLint del repo no declara
  // los globales de Node para esta carpeta, y un error de lint por leer una
  // variable de entorno sería ruido permanente en la línea base.
  const v = (globalThis.process?.env?.[nombre] || '').trim();
  if (v) return v;
  throw new Error(
    `Falta ${nombre}. Las credenciales de las E2E ya no viven en el repositorio.\n` +
      `  Exporta ${nombre} antes de correr la suite (ej. ${ejemplo}).\n` +
      `  Ver la cabecera de e2e/helpers.js.`,
  );
};

export const CODIGO = exigir('E2E_CODIGO', 'AZUL-C172');
export const PIN_CAJERO = exigir('E2E_PIN_CAJERO', 'seis dígitos');
export const PIN_MESERO = exigir('E2E_PIN_MESERO', 'seis dígitos');

export const STATE_CAJERO = 'e2e/.auth/cajero.json';
export const STATE_MESERO = 'e2e/.auth/mesero.json';

// ── Login de empleado por PIN (/loginempleados) ──────────────────────────────
// Selectores tomados de LoginEmpleadoScreen.jsx:
//  - input del código: placeholder "Ej. AZUL-C172" (solo primera vez en el device)
//  - numpad: botones con texto exacto del dígito
//  - submit: botón "Entrar" (deshabilitado hasta PIN completo)
//  - éxito: window.location.assign('/') → flujo dirigido: /checador primero
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

  // login-pin (EF) + setSession + assign('/') + flujo dirigido: primero
  // aterriza en /checador (registrar Entrada) y de ahí a la ruta por rol.
  await page.waitForURL(/\/(checador|espera|mesas|kds|pos|dashboard)/, {
    timeout: 20_000,
  });

  // Checador: NO registramos Entrada real (escribiría checadas en el tenant y
  // activaría el candado de jornada). Con empleadoActivo el escape "Ya registré
  // mi entrada — continuar" siempre está visible y navega a la ruta por rol.
  if (/\/checador/.test(page.url())) {
    await page.getByRole('button', { name: /ya registré mi entrada/i }).click();
    await page.waitForURL(/\/(espera|mesas|kds|pos|dashboard)/, {
      timeout: 20_000,
    });
  }
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

// ── Captura de consola ──────────────────────────────────────────────────────
// Devuelve un array vivo con los textos de console.* de la página, para
// afirmar sobre los logs del store (⏭️, timeout-red, túnel realtime, etc.).
export function capturarConsola(page) {
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  return logs;
}
