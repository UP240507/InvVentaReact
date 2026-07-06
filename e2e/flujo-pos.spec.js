// e2e/flujo-pos.spec.js — P2 del roadmap: login → POS → cobro → corte.
// Dividido en dos niveles:
//  1) SMOKE (selectores confirmados contra PosScreen.jsx): carrito, totales,
//     y la salida por rol del botón de regreso (fix de esta sesión).
//  2) COBRO COMPLETO: cruza ModalCobro.jsx y TicketImpresion.jsx — selectores
//     confirmados contra ambos JSX:
//       · Efectivo es el método ACTIVO por defecto (metodoActivo inicial).
//       · El pago se registra con "Pagar Restante"; recién entonces se
//         habilita "Confirmar y Cerrar Cuenta" (disabled hasta estaPagado).
//       · Si falta stock, ANTES del cobro aparece ConfirmacionStockModal
//         (botón "Continuar al cobro" / "... de todas formas") — se maneja.
//       · Ticket: "Folio:" + POS-xxxxx (PosScreen.jsx:425) y botón
//         "Cerrar Venta" (TicketImpresion.jsx).
//
// ⚠️ Estos tests escriben VENTAS y MOVIMIENTOS reales en el tenant. El folio
// de la venta queda identificable (POS-xxxxx) por si hay que depurar datos.
import { test, expect } from '@playwright/test';
import {
  STATE_CAJERO,
  abrirTurnoDesdeEspera,
  cerrarTurnoSiAbierto,
} from './helpers.js';

test.use({ storageState: STATE_CAJERO });

// Garantiza caja abierta para operar el POS; recuerda si la abrió este spec.
async function garantizarTurno(page) {
  await page.goto('/');
  await page.waitForURL(/\/(espera|mesas)/, { timeout: 20_000 });
  if (/\/espera/.test(page.url())) {
    await abrirTurnoDesdeEspera(page);
    return true; // la abrimos nosotros → la cerramos al final
  }
  return false;
}

// Tras "Cobrar Ticket" puede aparecer el gate de stock (solo si el inventario
// no alcanza). Espera a que aparezca el ModalCobro O el gate; si es el gate,
// lo confirma y espera el ModalCobro.
async function pasarGateStockSiAparece(page) {
  const modalCobro = page.getByRole('heading', { name: /opciones de cobro/i });
  const btnGate = page.getByRole('button', {
    name: /continuar al cobro|de todas formas/i,
  });
  await expect(modalCobro.or(btnGate).first()).toBeVisible({
    timeout: 10_000,
  });
  if (!(await modalCobro.isVisible())) {
    await btnGate.click();
  }
  await expect(modalCobro).toBeVisible({ timeout: 10_000 });
}

test.describe('Flujo POS (cajero)', () => {
  test('smoke: carrito, totales y salida por rol', async ({ page }) => {
    const turnoNuestro = await garantizarTurno(page);

    // Al POS desde el sidebar (cajero aterriza en /mesas con nav visible).
    await page.getByRole('link', { name: /punto de venta/i }).click();
    await page.waitForURL(/\/pos/);
    await expect(page.getByText('Venta Rápida')).toBeVisible();
    await expect(page.getByText('Comanda Vacía')).toBeVisible();

    // Agregar el primer producto del catálogo (dos veces → cantidad 2).
    const primerProducto = page
      .locator('button', { has: page.locator('.line-clamp-2') })
      .first();
    const nombre = await primerProducto.locator('.line-clamp-2').innerText();
    await primerProducto.click();
    await primerProducto.click();

    // El carrito refleja el item y el botón de cobro se habilita.
    await expect(page.getByText('Comanda Vacía')).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: nombre }).first(),
    ).toBeVisible();
    const btnCobrar = page.getByRole('button', { name: /cobrar ticket/i });
    await expect(btnCobrar).toBeEnabled();

    // Salida por rol (fix de esta sesión): salirDelPos manda al cajero de
    // mostrador a su ruta inicial (/mesas), nunca a /dashboard ni atrapado.
    await page.locator('button:has(svg.lucide-arrow-left)').first().click();
    await page.waitForURL(/\/mesas/, { timeout: 10_000 });

    if (turnoNuestro) await cerrarTurnoSiAbierto(page);
  });

  test('cobro completo: venta directa en efectivo genera ticket', async ({
    page,
  }) => {
    const turnoNuestro = await garantizarTurno(page);

    await page.getByRole('link', { name: /punto de venta/i }).click();
    await page.waitForURL(/\/pos/);

    // Un producto al carrito y a cobrar.
    await page
      .locator('button', { has: page.locator('.line-clamp-2') })
      .first()
      .click();
    await page.getByRole('button', { name: /cobrar ticket/i }).click();

    // Venta directa verifica stock ANTES del cobro: pasar el gate si aparece.
    await pasarGateStockSiAparece(page);

    // ── ModalCobro (confirmado contra ModalCobro.jsx) ──
    // "Efectivo" ya es el método activo por defecto; el click lo reafirma y
    // valida que el selector de método está en pantalla.
    await page.getByRole('button', { name: 'Efectivo', exact: true }).click();

    // Registrar el pago por el saldo completo…
    await page.getByRole('button', { name: 'Pagar Restante' }).click();

    // …lo cual habilita el botón de confirmación (disabled hasta estaPagado).
    const btnConfirmar = page.getByRole('button', {
      name: /confirmar y cerrar cuenta/i,
    });
    await expect(btnConfirmar).toBeEnabled();
    await btnConfirmar.click();

    // ── TicketImpresion (confirmado) ── folio POS-xxxxx (5 dígitos).
    await expect(
      page.getByText(/POS-\d{5}/),
      'El ticket no muestra el folio POS-xxxxx (TicketImpresion.jsx)',
    ).toBeVisible({ timeout: 15_000 });

    // Cerrar ticket: venta directa vuelve al POS con carrito vacío.
    await page.getByRole('button', { name: 'Cerrar Venta' }).click();
    await expect(page.getByText('Comanda Vacía')).toBeVisible({
      timeout: 10_000,
    });

    // Corte: salir del POS y cerrar caja (el corte debe reflejar la venta,
    // el arqueo declara el "Sistema espera" leído del propio modal).
    await page.locator('button:has(svg.lucide-arrow-left)').first().click();
    await page.waitForURL(/\/mesas/);
    if (turnoNuestro) {
      const cerrado = await cerrarTurnoSiAbierto(page);
      expect(cerrado).toBe(true);
    }
  });
});
