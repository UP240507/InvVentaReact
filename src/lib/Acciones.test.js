import { describe, it, expect } from 'vitest';
import { accionesDisponibles } from './Acciones';

const noop = () => {};

// Contexto de un Admin con todo conectado.
const ctxAdmin = (over = {}) => ({
  flag: () => true,
  puedeVerRuta: () => true,
  turnoActivo: false,
  esOscuro: false,
  sidebarColapsado: false,
  on: {
    alternarTema: noop,
    alternarSidebar: noop,
    verAtajos: noop,
    abrirTurno: noop,
    cerrarTurno: noop,
    cerrarSesion: noop,
    irAPerfil: noop,
    irAMiPlan: noop,
  },
  ...over,
});

const ids = (ctx) => accionesDisponibles(ctx).map((a) => a.id);

describe('accionesDisponibles · gates de rol', () => {
  it('SEGURIDAD: sin abre_caja no ofrece abrir ni cerrar turno', () => {
    const mesero = ctxAdmin({
      flag: (f) => f !== 'abre_caja' && f !== 'gestion',
      turnoActivo: true,
    });
    expect(ids(mesero)).not.toContain('cerrar-turno');
    expect(ids(mesero)).not.toContain('abrir-turno');
  });

  it('SEGURIDAD: sin gestion no ofrece Mi plan', () => {
    const cajero = ctxAdmin({ flag: (f) => f === 'abre_caja' });
    expect(ids(cajero)).not.toContain('mi-plan');
  });

  it('SEGURIDAD: respeta puedeVerRuta además del flag', () => {
    const sinRuta = ctxAdmin({ puedeVerRuta: (r) => r !== '/mi-plan' });
    expect(ids(sinRuta)).not.toContain('mi-plan');
  });
});

describe('accionesDisponibles · estado de caja', () => {
  it('sin turno ofrece ABRIR, no cerrar', () => {
    const r = ids(ctxAdmin({ turnoActivo: false }));
    expect(r).toContain('abrir-turno');
    expect(r).not.toContain('cerrar-turno');
  });

  it('con turno ofrece CERRAR, no abrir', () => {
    const r = ids(ctxAdmin({ turnoActivo: true }));
    expect(r).toContain('cerrar-turno');
    expect(r).not.toContain('abrir-turno');
  });
});

describe('accionesDisponibles · robustez', () => {
  it('una acción sin callback no se muestra', () => {
    const sinLogout = ctxAdmin();
    delete sinLogout.on.cerrarSesion;
    expect(ids(sinLogout)).not.toContain('salir');
  });

  it('el texto del tema refleja el modo actual', () => {
    const claro = accionesDisponibles(ctxAdmin({ esOscuro: false }));
    const oscuro = accionesDisponibles(ctxAdmin({ esOscuro: true }));
    expect(claro.find((a) => a.id === 'tema').titulo).toMatch(/oscuro/i);
    expect(oscuro.find((a) => a.id === 'tema').titulo).toMatch(/claro/i);
  });

  it('no explota con un contexto vacío', () => {
    expect(() => accionesDisponibles()).not.toThrow();
    expect(accionesDisponibles()).toEqual([]);
  });

  it('todas las acciones devueltas son ejecutables', () => {
    const acciones = accionesDisponibles(ctxAdmin());
    expect(acciones.length).toBeGreaterThan(0);
    expect(acciones.every((a) => typeof a.ejecutar === 'function')).toBe(true);
  });
});
