// e2e/render.spec.js — smoke visual para los proyectos iPad (landscape y
// portrait). CERO mutaciones: no abre caja, no vende, no toca el tenant más
// allá de una sesión de lectura. Valida que las pantallas críticas de tablet
// rendericen sin desbordes ni elementos clave ausentes.
import { test, expect } from '@playwright/test';
import { STATE_MESERO } from './helpers.js';

test.describe('Render en tablet', () => {
  test('login de empleados: numpad completo y accionable', async ({ page }) => {
    // Contexto limpio a propósito: valida la pantalla pública tal como la ve
    // un dispositivo nuevo (con input de código visible).
    await page.goto('/loginempleados');
    await expect(page.getByText('Acceso de Personal')).toBeVisible();
    // Los 10 dígitos del numpad presentes y clicables en este viewport.
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      await expect(
        page.getByRole('button', { name: d, exact: true }),
      ).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('sesión de mesero renderiza su pantalla inicial', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: STATE_MESERO });
    const page = await ctx.newPage();
    try {
      await page.goto('/');
      // Según el estado de la caja: /espera (cerrada) o /mesas (abierta).
      await page.waitForURL(/\/(espera|mesas)/, { timeout: 20_000 });
      // Nada de offline falso en tablet.
      await expect(page.getByText('Modo Offline')).not.toBeVisible();
      await expect(page).toHaveScreenshot({
        fullPage: true,
        maxDiffPixelRatio: 0.05, // tolerancia: timestamps/badges dinámicos
      });
    } finally {
      await ctx.close();
    }
  });
});
