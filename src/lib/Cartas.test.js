// src/lib/Cartas.test.js
import { describe, it, expect } from 'vitest';
import {
  franjaDeCarta,
  precioDeTarde,
  seVendeEn,
  conPrecioDeCarta,
  sufijoDeCarta,
  SUFIJO_TARDE,
} from './Cartas';

const AGUA = { id: 40, nombre: 'Agua de fruta', precio_venta: 34 };
const conf = (activas, corte = '14:00') => ({
  franjas_activas: activas,
  franja_corte: corte,
});
const a = (h, m = 0) => new Date(2026, 9, 9, h, m);

describe('franjaDeCarta', () => {
  it('con franjas apagadas no hay carta de tarde', () => {
    expect(franjaDeCarta(conf(false), a(18))).toBeNull();
  });
  it('corte a las 2: la 1:30 es mañana, las 2:00 en punto ya es tarde', () => {
    expect(franjaDeCarta(conf(true), a(13, 30))).toBe('matutino');
    expect(franjaDeCarta(conf(true), a(14, 0))).toBe('vespertino');
    expect(franjaDeCarta(conf(true), a(16, 0))).toBe('vespertino');
  });
});

describe('precioDeTarde', () => {
  it('lee el número; vacío, texto o negativo es «no tiene»', () => {
    expect(precioDeTarde({ precio_vespertino: 38 })).toBe(38);
    expect(precioDeTarde({ precio_vespertino: '38.5' })).toBe(38.5);
    expect(precioDeTarde({ precio_vespertino: 0 })).toBe(0);
    for (const v of [null, undefined, '', 'x', -1]) {
      expect(precioDeTarde({ precio_vespertino: v })).toBeNull();
    }
  });
});

describe('seVendeEn — qué enseña la caja', () => {
  const desayuno = { franja_carta: 'matutino' };
  const cena = { franja_carta: 'vespertino' };
  const todoElDia = { franja_carta: null };

  it('en la mañana, desayunos y lo de todo el día; no las cenas', () => {
    expect(seVendeEn(desayuno, 'matutino')).toBe(true);
    expect(seVendeEn(todoElDia, 'matutino')).toBe(true);
    expect(seVendeEn(cena, 'matutino')).toBe(false);
  });
  it('en la tarde, al revés', () => {
    expect(seVendeEn(desayuno, 'vespertino')).toBe(false);
    expect(seVendeEn(cena, 'vespertino')).toBe(true);
  });
  it('sin franjas se ve todo, aunque la receta tenga carta', () => {
    expect(seVendeEn(desayuno, null)).toBe(true);
    expect(seVendeEn(cena, null)).toBe(true);
  });
  it('un valor raro en la receta cuenta como todo el día, no la esconde', () => {
    expect(seVendeEn({ franja_carta: 'noche' }, 'matutino')).toBe(true);
  });
});

describe('conPrecioDeCarta', () => {
  const aguaTarde = { ...AGUA, precio_vespertino: 38 };

  it('en la tarde pisa precio y precio_venta, y marca la línea', () => {
    const r = conPrecioDeCarta(aguaTarde, 'vespertino');
    expect(r).toMatchObject({
      id: 40,
      precio: 38,
      precio_venta: 38,
      precio_carta: 'vespertino',
    });
    expect(sufijoDeCarta(r)).toBe(SUFIJO_TARDE);
  });

  it('en la mañana no toca nada', () => {
    expect(conPrecioDeCarta(aguaTarde, 'matutino')).toBe(aguaTarde);
  });

  it('sin precio de tarde, o igual al normal, la línea es la de siempre', () => {
    expect(conPrecioDeCarta(AGUA, 'vespertino')).toBe(AGUA);
    const igual = { ...AGUA, precio_vespertino: 34 };
    expect(conPrecioDeCarta(igual, 'vespertino')).toBe(igual);
    expect(sufijoDeCarta(conPrecioDeCarta(igual, 'vespertino'))).toBe('');
  });

  it('con franjas apagadas (franja null) no cambia nada', () => {
    expect(conPrecioDeCarta(aguaTarde, null)).toBe(aguaTarde);
  });
});
