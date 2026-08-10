// e2e/realtime-turnos.spec.js
// EL test de esta época del proyecto: cubre de un golpe todo lo endurecido en
// la última sesión — suscripción realtime global (montada en fetchInitialData,
// inmortal ante navegación), token de getSession() contra RLS, REPLICA
// IDENTITY FULL en turnos, y el guard de estampida que evitaba el offline
// falso ('timeout-red') tras la redirección.
//
// Escenario: dos CONTEXTOS de navegador (sesiones de Supabase realmente
// distintas — lo que dos pestañas del mismo navegador no pueden simular):
//   A) Cajero abre la caja desde /espera.
//   B) Mesero, parado en /espera, debe saltar a /mesas SIN recargar,
//      sin indicador "Modo Offline" y sin 'timeout-red' en consola.
import { test, expect } from '@playwright/test';
import {
  STATE_CAJERO,
  STATE_MESERO,
  abrirTurnoDesdeEspera,
  cerrarTurnoSiAbierto,
  capturarConsola,
} from './helpers.js';

test.describe('Realtime de turnos (cross-sesión)', () => {
  test('abrir caja propaga a otra sesión sin reload y sin offline falso', async ({
    browser,
  }) => {
    // ── Contextos con sesiones independientes ──────────────────────────────
    const ctxCajero = await browser.newContext({ storageState: STATE_CAJERO });
    const ctxMesero = await browser.newContext({ storageState: STATE_MESERO });
    const cajero = await ctxCajero.newPage();
    const mesero = await ctxMesero.newPage();
    const logsMesero = capturarConsola(mesero);

    try {
      // ── Precondición: caja CERRADA ────────────────────────────────────────
      await cajero.goto('/');
      await cajero.waitForURL(/\/(espera|mesas)/, { timeout: 20_000 });
      if (/\/mesas/.test(cajero.url())) {
        // Quedó un turno abierto de una corrida anterior: cerrarlo primero.
        const cerrado = await cerrarTurnoSiAbierto(cajero);
        expect(
          cerrado,
          'Había turno abierto y no se pudo cerrar; revisa selectores de CierreTurnoModal',
        ).toBe(true);
        await cajero.waitForURL(/\/espera/, { timeout: 15_000 });
      }

      // ── Mesero en sala de espera, con testigo anti-reload ────────────────
      await mesero.goto('/');
      await mesero.waitForURL(/\/espera/, { timeout: 20_000 });
      // El testigo vive en window: sobrevive a navegación SPA, muere con reload.
      await mesero.evaluate(() => {
        window.__e2eTestigo = 'vivo';
      });
      // El canal realtime debe estar montado ANTES de que ocurra el evento.
      await expect
        .poll(
          () => logsMesero.some((l) => l.includes('Túnel WebSocket abierto')),
          {
            timeout: 15_000,
            message: 'El canal realtime nunca se montó en /espera',
          },
        )
        .toBe(true);

      // ── Cajero abre la caja ──────────────────────────────────────────────
      await abrirTurnoDesdeEspera(cajero);

      // ── LA aserción: el mesero salta a /mesas por realtime ───────────────
      await mesero.waitForURL(/\/mesas/, { timeout: 15_000 });

      // Sin reload: el testigo sigue vivo (una recarga lo habría borrado).
      const testigo = await mesero.evaluate(() => window.__e2eTestigo);
      expect(testigo, 'La redirección recargó la página (debe ser SPA)').toBe(
        'vivo',
      );

      // Sin offline falso: ni indicador visible ni timeout en consola.
      await expect(mesero.getByText('Modo Offline')).not.toBeVisible();
      expect(
        logsMesero.filter((l) => l.includes('timeout-red')),
        'Apareció timeout-red: el guard de estampida no está funcionando',
      ).toHaveLength(0);

      // Canal único: el singleton no debe duplicar la suscripción.
      expect(
        logsMesero.filter((l) => l.includes('Túnel WebSocket abierto')),
      ).toHaveLength(1);
    } finally {
      // ── Limpieza: dejar la caja cerrada para la siguiente corrida ────────
      try {
        if (/\/mesas/.test(cajero.url())) await cerrarTurnoSiAbierto(cajero);
      } catch {
        /* la precondición del siguiente run lo detecta */
      }
      await ctxCajero.close();
      await ctxMesero.close();
    }
  });
});
