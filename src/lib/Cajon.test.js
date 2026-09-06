// src/lib/Cajon.test.js
//
// La afirmación es una y es la tesis entera del diseño: **toda apertura del
// cajón deja nombre**. Incluso la que falla — sobre todo la que falla, porque
// significa que alguien tuvo que usar la llave.
import { describe, it, expect, vi } from 'vitest';
import {
  MOTIVOS,
  motivoValido,
  detallesDeApertura,
  abrirCajonConRegistro,
} from './Cajon';

const dado = ({ abre = true } = {}) => {
  const registrar = vi.fn();
  const abrir = vi
    .fn()
    .mockResolvedValue(
      abre ? { ok: true } : { ok: false, error: 'hub apagado' },
    );
  return { abrir, registrar };
};

describe('MOTIVOS', () => {
  it('son cuatro, y no hay una quinta', () => {
    expect(Object.values(MOTIVOS)).toEqual([
      'venta',
      'manual',
      'apertura_turno',
      'cierre_turno',
    ]);
  });

  it('motivoValido distingue', () => {
    expect(motivoValido('venta')).toBe(true);
    expect(motivoValido('porque si')).toBe(false);
  });
});

describe('abrirCajonConRegistro', () => {
  it('abre pasando el motivo como origen', async () => {
    const { abrir, registrar } = dado();
    await abrirCajonConRegistro({
      motivo: MOTIVOS.VENTA,
      usuario: 'Sairi',
      folio: 'AZUL-V-000012',
      abrir,
      registrar,
    });
    expect(abrir).toHaveBeenCalledWith({ origen: 'venta' });
  });

  it('LA AFIRMACIÓN: registra quién, qué y con qué folio', async () => {
    const { abrir, registrar } = dado();
    await abrirCajonConRegistro({
      motivo: MOTIVOS.VENTA,
      usuario: 'Sairi',
      folio: 'AZUL-V-000012',
      abrir,
      registrar,
    });

    expect(registrar).toHaveBeenCalledTimes(1);
    const fila = registrar.mock.calls[0][0];
    expect(fila.accion).toBe('CAJON_ABIERTO');
    expect(fila.modulo).toBe('CAJA');
    expect(fila.usuario).toBe('Sairi');
    expect(fila.detalles).toMatch(/Venta en efectivo/);
    expect(fila.detalles).toMatch(/AZUL-V-000012/);
    expect(fila.nivel).toBe('info');
  });

  it('LA QUE MÁS IMPORTA: si el cajón NO abre, se registra igual', async () => {
    // Un hub apagado no puede dejar la apertura sin nombre: es justo el caso en
    // que el dinero se saca con la llave, y el único rastro posible es éste.
    const { abrir, registrar } = dado({ abre: false });
    const r = await abrirCajonConRegistro({
      motivo: MOTIVOS.MANUAL,
      usuario: 'Diego',
      abrir,
      registrar,
    });

    expect(r.ok).toBe(false);
    expect(registrar).toHaveBeenCalledTimes(1);
    const fila = registrar.mock.calls[0][0];
    expect(fila.nivel).toBe('warning');
    expect(fila.detalles).toMatch(/NO SE ABRIÓ/);
    expect(fila.detalles).toMatch(/llave/);
  });

  it('nunca lanza, aunque la apertura lance: el cobro no se para', async () => {
    const registrar = vi.fn();
    const abrir = vi.fn().mockRejectedValue(new Error('lo que sea'));
    const r = await abrirCajonConRegistro({
      motivo: MOTIVOS.VENTA,
      usuario: 'Sairi',
      abrir,
      registrar,
    });
    expect(r.ok).toBe(false);
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('sin quién, «Sistema», pero nunca vacío', async () => {
    const { abrir, registrar } = dado();
    await abrirCajonConRegistro({ motivo: MOTIVOS.VENTA, abrir, registrar });
    expect(registrar.mock.calls[0][0].usuario).toBe('Sistema');
  });

  it('sin función de registro no revienta: el pulso sigue saliendo', async () => {
    const { abrir } = dado();
    await expect(
      abrirCajonConRegistro({ motivo: MOTIVOS.VENTA, abrir }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('detallesDeApertura', () => {
  it('cada motivo tiene su frase', () => {
    for (const m of Object.values(MOTIVOS)) {
      const t = detallesDeApertura({ motivo: m, abrio: true });
      expect(t).not.toMatch(/no previsto/);
      expect(t.length).toBeGreaterThan(15);
    }
  });

  it('un motivo no previsto se DICE, no se disfraza', () => {
    // Inventar un motivo conocido sería exactamente lo que este proyecto
    // persigue: un registro que afirma más de lo que sabe.
    expect(detallesDeApertura({ motivo: 'raro', abrio: true })).toMatch(
      /no previsto \(raro\)/,
    );
  });

  it('el folio sólo sale cuando lo hay', () => {
    expect(
      detallesDeApertura({ motivo: MOTIVOS.MANUAL, abrio: true }),
    ).not.toMatch(/folio/);
  });
});
