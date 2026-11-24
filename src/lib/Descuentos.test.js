import { describe, it, expect } from 'vitest';
import {
  puedeAutorizar,
  normalizarDescuento,
  etiquetaDescuento,
} from './Descuentos';

// Capacidades vivas: Gerente autoriza, Mesero no (espejo de CAPACIDADES_BASE).
const ROLES = [
  { rol: 'Gerente', capacidades: { autoriza_descuentos: true } },
  { rol: 'Mesero', capacidades: { autoriza_descuentos: false } },
];

describe('puedeAutorizar', () => {
  it('lee la capacidad, no el nombre del rol', () => {
    expect(puedeAutorizar('Gerente', ROLES)).toBe(true);
    expect(puedeAutorizar('Mesero', ROLES)).toBe(false);
  });
});

describe('normalizarDescuento', () => {
  it('cortesía no necesita valor', () => {
    expect(normalizarDescuento({ tipo: 'cortesia' })).toEqual({
      ok: true,
      descuento: { tipo: 'cortesia', valor: 100 },
    });
  });

  it('rechaza porcentajes fuera de rango', () => {
    expect(normalizarDescuento({ tipo: 'pct', valor: 120 }).ok).toBe(false);
    expect(normalizarDescuento({ tipo: 'pct', valor: 0 }).ok).toBe(false);
    expect(normalizarDescuento({ tipo: 'pct', valor: 50 }).ok).toBe(true);
  });

  it('un monto mayor que la línea AVISA en vez de recortar en silencio', () => {
    // Si se recortara solo, el cajero creería que descontó $500 cuando el
    // sistema registró $150. Que lo diga con "cortesía" y quede así.
    const r = normalizarDescuento({ tipo: 'monto', valor: 500 }, 150);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('cortesía');
  });

  it('acepta un monto dentro del importe', () => {
    expect(normalizarDescuento({ tipo: 'monto', valor: 50 }, 150).ok).toBe(
      true,
    );
  });

  it('rechaza basura', () => {
    expect(normalizarDescuento({ tipo: 'monto', valor: 'x' }, 100).ok).toBe(
      false,
    );
    expect(normalizarDescuento({ tipo: 'otro', valor: 5 }).ok).toBe(false);
  });
});

describe('etiquetaDescuento', () => {
  it('resume el descuento para el badge y la auditoría', () => {
    expect(etiquetaDescuento({ tipo: 'cortesia' })).toBe('Cortesía');
    expect(etiquetaDescuento({ tipo: 'pct', valor: 25 })).toBe('−25%');
    expect(etiquetaDescuento({ tipo: 'monto', valor: 30 })).toBe('−$30.00');
    expect(etiquetaDescuento(null)).toBe('');
  });
});
