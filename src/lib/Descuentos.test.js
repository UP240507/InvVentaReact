import { describe, it, expect } from 'vitest';
import {
  puedeAutorizar,
  buscarAutorizador,
  normalizarDescuento,
  etiquetaDescuento,
} from './Descuentos';

// Capacidades vivas: Gerente autoriza, Mesero no (espejo de CAPACIDADES_BASE).
const ROLES = [
  { rol: 'Gerente', capacidades: { autoriza_descuentos: true } },
  { rol: 'Mesero', capacidades: { autoriza_descuentos: false } },
];

const staff = [
  { id: 1, nombre: 'Ana', rol: 'Gerente', pin: '1234', activo: true },
  { id: 2, nombre: 'Beto', rol: 'Mesero', pin: '5678', activo: true },
  { id: 3, nombre: 'Cyn', rol: 'Gerente', pin_acceso: '4321', activo: true },
  { id: 4, nombre: 'Dan', rol: 'Gerente', pin: '9999', activo: false },
  { id: 5, nombre: 'Eva', rol: 'Gerente', pin: '', activo: true },
];

describe('puedeAutorizar', () => {
  it('lee la capacidad, no el nombre del rol', () => {
    expect(puedeAutorizar('Gerente', ROLES)).toBe(true);
    expect(puedeAutorizar('Mesero', ROLES)).toBe(false);
  });
});

describe('buscarAutorizador', () => {
  it('encuentra al autorizador por PIN', () => {
    expect(buscarAutorizador('1234', staff, ROLES).nombre).toBe('Ana');
  });

  it('acepta el campo histórico pin_acceso', () => {
    expect(buscarAutorizador('4321', staff, ROLES).nombre).toBe('Cyn');
  });

  it('SEGURIDAD: un PIN correcto SIN la capacidad no autoriza', () => {
    expect(buscarAutorizador('5678', staff, ROLES)).toBe(null);
  });

  it('SEGURIDAD: un empleado dado de baja no autoriza', () => {
    expect(buscarAutorizador('9999', staff, ROLES)).toBe(null);
  });

  it('SEGURIDAD: un PIN vacío en la ficha no autoriza a nadie', () => {
    // Si no se filtrara, '' === '' haría que Eva autorizara cualquier cosa.
    expect(buscarAutorizador('', staff, ROLES)).toBe(null);
    expect(buscarAutorizador('   ', staff, ROLES)).toBe(null);
  });

  it('un PIN de menos de 4 dígitos ni se compara', () => {
    expect(buscarAutorizador('123', staff, ROLES)).toBe(null);
  });

  it('no explota sin datos', () => {
    expect(buscarAutorizador('1234')).toBe(null);
    expect(buscarAutorizador(null, staff, ROLES)).toBe(null);
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
