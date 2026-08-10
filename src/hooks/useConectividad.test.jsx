// src/hooks/useConectividad.test.jsx
//
// Las cuatro combinaciones de las dos redes, y sobre todo la que hasta ahora
// mentía: **nube sí, local no** — el mesero que sale a la calle y tira de datos
// móviles. Ahí `navigator.onLine` dice `true` y la app decía «En línea» aunque
// el hub estuviera a diez kilómetros.
//
// Es el mismo patrón que el fallo del 5-ago (la caja colgada sin internet
// porque `navigator.onLine` seguía en `true` con el wifi arriba y el WAN
// caído). Por eso la prueba central de este archivo no es «detecta que no hay
// red» sino «distingue CUÁL de las dos falta».
//
// ── POR QUÉ AQUÍ NO SE SIMULA `lib/Hub` ─────────────────────────────────────
// La primera versión hacía `vi.mock('../lib/Hub', …)` y pasaba aislada pero
// fallaba dentro de la tanda `src/store src/hooks`. Con `--isolate=false` el
// registro de módulos es compartido: si otro archivo carga el `lib/Hub` real
// antes, el `vi.mock` de éste ya no se aplica y el hook llamaba al hub de
// verdad. Es el mismo conflicto que costó tres intentos en `auth/` (10-ago) y
// tiene el mismo remedio: no simular nada. `useConectividad` acepta sus sondas
// como parámetro, así que basta pasarle las de mentira.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { useConectividad, motivoSinImpresion } from './useConectividad';

/** Estado que las sondas de mentira leen en cada llamada. */
const h = { activo: true, enTauri: false, llamadas: 0 };

const sondas = {
  sondaHub: async () => {
    h.llamadas += 1;
    return { ok: h.activo, activo: h.activo };
  },
  dentroDeTauri: () => h.enTauri,
};

/** Sonda: pinta las dos señales para poder leerlas desde el DOM. */
function Sonda() {
  const { nube, local, comprobandoLocal } = useConectividad(sondas);
  return (
    <div>
      <span data-testid="nube">{nube ? 'si' : 'no'}</span>
      <span data-testid="local">{local ? 'si' : 'no'}</span>
      <span data-testid="motivo">
        {motivoSinImpresion({ local, comprobandoLocal }) ?? '—'}
      </span>
    </div>
  );
}

const ponerOnLine = (valor) =>
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: valor,
  });

/**
 * `visibilityState` es de sólo lectura; para simular la app en segundo plano
 * hay que redefinirla. Y hay que DESHACERLO: con `--isolate=false` el `document`
 * es el mismo para todos los archivos de la tanda, así que un `hidden` que se
 * queda puesto se lleva por delante a los que vengan detrás —los suyos y los de
 * otros archivos— sin que nada apunte a este test. Mismo caso con
 * `navigator.onLine`.
 *
 * Es la otra mitad del fallo que hacía que esta suite pasara o fallara según el
 * orden de los archivos: quitar el `vi.mock` arregló el conflicto de módulos,
 * pero el estado global seguía filtrándose.
 */
const ponerVisibilidad = (valor) =>
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: valor,
  });

beforeEach(() => {
  h.activo = true;
  h.enTauri = false;
  h.llamadas = 0;
  ponerOnLine(true);
  ponerVisibilidad('visible');
});

afterEach(() => {
  cleanup();
  // Al valor por defecto de jsdom, no al que dejó el último test.
  ponerVisibilidad('visible');
  ponerOnLine(true);
});

const leer = (id) => screen.getByTestId(id).textContent;

describe('las cuatro combinaciones', () => {
  it('nube ✓ local ✓ — el caso normal', async () => {
    render(<Sonda />);
    await waitFor(() => expect(leer('local')).toBe('si'));
    expect(leer('nube')).toBe('si');
    expect(leer('motivo')).toBe('—');
  });

  it('nube ✗ local ✓ — se cayó el internet del local', async () => {
    // Es la premisa entera de la fase 3: la caja no necesita internet,
    // necesita la LAN. Aquí SÍ se puede imprimir.
    ponerOnLine(false);
    render(<Sonda />);
    await waitFor(() => expect(leer('local')).toBe('si'));
    expect(leer('nube')).toBe('no');
    expect(leer('motivo')).toBe('—');
  });

  it('nube ✓ local ✗ — EL CASO QUE MENTÍA: datos móviles', async () => {
    // `navigator.onLine` dice true porque hay datos, así que el indicador
    // antiguo pintaba verde y el mesero tocaba imprimir para nada.
    h.activo = false;
    render(<Sonda />);
    await waitFor(() => expect(leer('local')).toBe('no'));
    expect(leer('nube')).toBe('si');
    expect(leer('motivo')).toBe('Sin conexión con la caja');
  });

  it('nube ✗ local ✗ — el teléfono se quedó sin nada', async () => {
    ponerOnLine(false);
    h.activo = false;
    render(<Sonda />);
    await waitFor(() => expect(leer('local')).toBe('no'));
    expect(leer('nube')).toBe('no');
    expect(leer('motivo')).toBe('Sin conexión con la caja');
  });
});

describe('cómo se comporta el sondeo', () => {
  it('arranca suponiendo que HAY caja, no que no la hay', () => {
    // Pintar «sin conexión con la caja» antes de haber preguntado sería un
    // susto gratis cada vez que se abre la app.
    h.activo = false;
    render(<Sonda />);
    expect(leer('local')).toBe('si');
    expect(leer('motivo')).toBe('—');
  });

  it('mientras comprueba NO da un motivo', () => {
    // El motivo apaga botones. Apagarlos durante el primer instante los haría
    // parpadear en cada carga.
    expect(
      motivoSinImpresion({ local: false, comprobandoLocal: true }),
    ).toBeNull();
  });

  it('dentro de Tauri no pregunta por red: el hub ES el proceso', async () => {
    h.enTauri = true;
    h.activo = false; // aunque diga que no, en Tauri no se le pregunta
    render(<Sonda />);
    await waitFor(() => expect(leer('local')).toBe('si'));
    expect(h.llamadas).toBe(0);
  });

  it('deja de sondear con la app en segundo plano', async () => {
    // Un teléfono en el bolsillo no debe gastar batería contestando algo que
    // nadie mira.
    vi.useFakeTimers();
    render(<Sonda />);
    await act(async () => {});
    const alArrancar = h.llamadas;

    ponerVisibilidad('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(h.llamadas).toBe(alArrancar);
    vi.useRealTimers();
  });

  it('vuelve a preguntar en cuanto la app vuelve al frente', async () => {
    // Es el instante en que el dato importa: el mesero acaba de sacar el
    // teléfono del bolsillo.
    render(<Sonda />);
    await waitFor(() => expect(h.llamadas).toBeGreaterThan(0));
    const antes = h.llamadas;

    ponerVisibilidad('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(h.llamadas).toBeGreaterThan(antes));
  });
});

describe('el motivo que se le enseña al mesero', () => {
  it('dice qué hacer, no qué falló', () => {
    // «Sin conexión con la caja» pide acercarse. «Error de impresión» mandaría
    // a buscar papel o a llamar a alguien — y la impresora está perfecta.
    expect(motivoSinImpresion({ local: false, comprobandoLocal: false })).toBe(
      'Sin conexión con la caja',
    );
  });

  it('con caja no hay motivo, y el botón queda vivo', () => {
    expect(
      motivoSinImpresion({ local: true, comprobandoLocal: false }),
    ).toBeNull();
  });
});
