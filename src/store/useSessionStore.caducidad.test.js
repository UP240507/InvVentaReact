// src/store/useSessionStore.caducidad.test.js
//
// La sesión de un aparato caduca al cerrarse el turno en el que se abrió.
//
// Hasta el 01-sep no caducaba NUNCA: `horaEntrada` se guardaba, se persistía, y
// no lo leía nadie. Un teléfono que entró una vez seguía dentro semanas
// después, con el nombre de quien lo abrió.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ app: { turnos: [], roles_permisos: [] } }));

vi.mock('./useAppStore', () => ({
  useAppStore: { getState: () => h.app },
}));

import { useSessionStore } from './useSessionStore';

const MESERO = { id: 3, nombre: 'Sairi', rol: 'Mesero' };
const abierto = (id) => ({ id, estado: 'abierto' });
const cerrado = (id) => ({ id, estado: 'cerrado' });

const s = () => useSessionStore.getState();

beforeEach(() => {
  h.app.turnos = [];
  s().cerrarSesionEmpleado();
});

describe('sesionVigente', () => {
  it('al entrar se guarda el turno al que pertenece la sesión', () => {
    h.app.turnos = [abierto(10)];
    s().abrirSesionEmpleado(MESERO);
    expect(s().turnoId).toBe(10);
    expect(s().sesionVigente()).toBe(true);
  });

  it('LA QUE IMPORTA: al cerrarse ese turno, la sesión deja de valer', () => {
    h.app.turnos = [abierto(10)];
    s().abrirSesionEmpleado(MESERO);

    h.app.turnos = [cerrado(10)];
    expect(s().sesionVigente()).toBe(false);
  });

  it('un turno NUEVO no revive la sesión vieja', () => {
    // El caso de mañana por la mañana: se abre la caja otra vez y el teléfono
    // que quedó encendido desde ayer NO tiene que volver a entrar solo.
    h.app.turnos = [abierto(10)];
    s().abrirSesionEmpleado(MESERO);

    h.app.turnos = [cerrado(10), abierto(11)];
    expect(s().sesionVigente()).toBe(false);
  });

  it('sin turno abierto al entrar, no hay a qué colgar la caducidad', () => {
    // Quien entra antes de que se abra la caja no puede quedar a merced de que
    // otro cierre un turno cualquiera.
    h.app.turnos = [];
    s().abrirSesionEmpleado(MESERO);
    expect(s().turnoId).toBeNull();

    h.app.turnos = [cerrado(99)];
    expect(s().sesionVigente()).toBe(true);
  });

  it('EL FALLO PEOR: no se decide por AUSENCIA del turno', () => {
    // Al arrancar, la caja hidrata desde Dexie y luego desde Supabase. Si esto
    // devolviera `false` con la lista todavía vacía, cada arranque echaría a
    // todo el mundo a la pantalla del PIN — y sólo se vería en el local, con la
    // red lenta.
    h.app.turnos = [abierto(10)];
    s().abrirSesionEmpleado(MESERO);

    h.app.turnos = []; // aún no cargan
    expect(s().sesionVigente()).toBe(true);
  });

  it('sin empleado no hay sesión que valga', () => {
    expect(s().sesionVigente()).toBe(false);
  });

  it('salir limpia también el turno, no sólo el nombre', () => {
    h.app.turnos = [abierto(10)];
    s().abrirSesionEmpleado(MESERO);
    s().cerrarSesionEmpleado();
    expect(s().turnoId).toBeNull();
    expect(s().empleadoActivo).toBeNull();
  });

  it('los ids se comparan en texto: 10 y "10" son el mismo turno', () => {
    h.app.turnos = [{ id: '10', estado: 'abierto' }];
    s().abrirSesionEmpleado(MESERO);
    h.app.turnos = [{ id: 10, estado: 'cerrado' }];
    expect(s().sesionVigente()).toBe(false);
  });
});
