// src/lib/Abrir.test.js
//
// La afirmación es una: **abrirFuera dice la verdad sobre si abrió.** De eso
// depende que `ComprasScreen` vacíe el carrito o no, y vaciarlo sin haber
// mandado nada es exactamente el fallo que esto viene a cerrar: el encargado ve
// la orden desaparecer y concluye que se envió.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { abrirFuera, esquemaPermitido, motivoLegible } from './Abrir';

const WA = 'https://wa.me/4491234567?text=hola';

/** Pone o quita el puente que Tauri inyecta en la ventana. */
const enCaja = (invoke) => {
  window.__TAURI_INTERNALS__ = invoke ? { invoke } : undefined;
};

beforeEach(() => {
  enCaja(null);
  delete window.__TAURI__;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('esquemaPermitido', () => {
  it('deja pasar http, https y mailto', () => {
    expect(esquemaPermitido('http://x.mx')).toBe(true);
    expect(esquemaPermitido(WA)).toBe(true);
    expect(esquemaPermitido('mailto:a@b.mx?subject=x')).toBe(true);
  });

  it('NO deja pasar lo demás', () => {
    // Estas URLs se arman con datos del catálogo, que teclea una persona.
    expect(esquemaPermitido('javascript:alert(1)')).toBe(false);
    expect(esquemaPermitido('file:///C:/Windows')).toBe(false);
    expect(esquemaPermitido('nada de esto es una url')).toBe(false);
    expect(esquemaPermitido('')).toBe(false);
    expect(esquemaPermitido(null)).toBe(false);
  });
});

describe('abrirFuera · fuera de la caja (el teléfono, por LAN)', () => {
  it('abre y lo dice', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({});
    await expect(abrirFuera(WA)).resolves.toEqual({ ok: true });
    expect(open).toHaveBeenCalledWith(WA, '_blank', 'noopener,noreferrer');
  });

  it('EL CASO: el bloqueador devuelve null y esto NO dice que abrió', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(abrirFuera(WA)).resolves.toEqual({
      ok: false,
      motivo: 'bloqueado',
    });
  });

  it('si `window.open` lanza, tampoco miente', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('bloqueado por politica');
    });
    expect((await abrirFuera(WA)).ok).toBe(false);
  });
});

describe('abrirFuera · dentro de la caja', () => {
  it('usa el puente de Tauri y NO `window.open`', async () => {
    // `window.open` es justo lo que no sirve dentro de WebView2: si esto lo
    // llamara, volveríamos al fallo original.
    const open = vi.spyOn(window, 'open').mockReturnValue({});
    const invoke = vi.fn().mockResolvedValue(null);
    enCaja(invoke);

    await expect(abrirFuera(WA)).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', { url: WA });
    expect(open).not.toHaveBeenCalled();
  });

  it('EL CASO QUE IMPORTA: si el plugin falla, devuelve que NO abrió', async () => {
    // Pasa si el plugin no está registrado en esa versión de la caja, o si el
    // sistema no tiene con qué abrirlo. Antes esto no se distinguía de haber
    // abierto: por ahí se vaciaba el carrito.
    enCaja(vi.fn().mockRejectedValue(new Error('plugin no registrado')));
    await expect(abrirFuera(WA)).resolves.toEqual({
      ok: false,
      motivo: 'tauri',
    });
  });

  it('no revienta la orden de compra: nunca lanza', async () => {
    enCaja(
      vi.fn().mockImplementation(() => {
        throw new Error('lo que sea');
      }),
    );
    await expect(abrirFuera(WA)).resolves.toBeTruthy();
  });
});

describe('abrirFuera · lo que ni se intenta', () => {
  it('sin url', async () => {
    expect(await abrirFuera('')).toEqual({ ok: false, motivo: 'sin-url' });
    expect(await abrirFuera(null)).toEqual({ ok: false, motivo: 'sin-url' });
  });

  it('esquema no permitido, ni dentro ni fuera de la caja', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({});
    const invoke = vi.fn();
    enCaja(invoke);

    expect(await abrirFuera('javascript:alert(1)')).toEqual({
      ok: false,
      motivo: 'esquema',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('motivoLegible', () => {
  it('cada motivo tiene su frase, y ninguna es "undefined"', () => {
    for (const m of ['sin-url', 'esquema', 'tauri', 'bloqueado', 'ni idea']) {
      const frase = motivoLegible(m);
      expect(typeof frase).toBe('string');
      expect(frase.length).toBeGreaterThan(10);
    }
  });
});
