// src/lib/Autorizacion.test.js
//
// La comprobación que hacían tres pantallas por su cuenta. Lo que se prueba
// aquí es sobre todo la parte que se olvida al copiarla: que un empleado dado
// de baja NO autoriza. Ese fallo no se nota probando —todo funciona— y sólo
// aparece cuando alguien usa el PIN que se sabe de memoria después de irse.
import { describe, it, expect } from 'vitest';
import {
  buscarAutorizador,
  sesionAutoriza,
  empleadoActivo,
} from './Autorizacion';

const roles = [
  { rol: 'Admin', capacidades: { autoriza_descuentos: true, gestion: true } },
  { rol: 'Mesero', capacidades: { autoriza_descuentos: false } },
];

const jefa = { id: 1, nombre: 'Sairi', rol: 'Admin', pin: '331213' };
const mesero = { id: 2, nombre: 'Diego', rol: 'Mesero', pin: '445566' };

const buscar = (pin, staff = [jefa, mesero]) =>
  buscarAutorizador({
    staff,
    roles_permisos: roles,
    pin,
    flag: 'autoriza_descuentos',
  });

describe('buscarAutorizador', () => {
  it('encuentra a quien tiene la capacidad y el PIN', () => {
    expect(buscar('331213')?.nombre).toBe('Sairi');
  });

  it('el PIN correcto de alguien SIN la capacidad no autoriza', () => {
    // Es lo que separa «sé un PIN» de «puedo autorizar».
    expect(buscar('445566')).toBeNull();
  });

  it('UN EMPLEADO DADO DE BAJA NO AUTORIZA', () => {
    // La comprobación que más fácil se pierde al copiar el bloque, y la única
    // cuyo olvido no se nota probando: sigue funcionando todo, sólo que
    // autoriza alguien que ya no trabaja aquí.
    expect(buscar('331213', [{ ...jefa, activo: false }])).toBeNull();
  });

  it('tolera los `false` que llegan como texto o como cero', () => {
    // Vienen así de formularios y de bases antiguas.
    for (const falso of [false, 'false', 0]) {
      expect(buscar('331213', [{ ...jefa, activo: falso }])).toBeNull();
    }
    expect(empleadoActivo({ activo: undefined })).toBe(true);
  });

  it('acepta el PIN legado en `pin_acceso`', () => {
    const legado = {
      id: 3,
      nombre: 'Beto',
      rol: 'Admin',
      pin_acceso: '999888',
    };
    expect(buscar('999888', [legado])?.nombre).toBe('Beto');
  });

  it('un PIN vacío no encuentra a quien tiene el campo vacío', () => {
    // Sin esta guarda, un empleado sin PIN autorizaría con la cadena vacía.
    const sinPin = { id: 4, nombre: 'Ana', rol: 'Admin', pin: '' };
    expect(buscar('', [sinPin])).toBeNull();
    expect(
      buscarAutorizador({
        staff: [sinPin],
        roles_permisos: roles,
        pin: '   ',
        flag: 'autoriza_descuentos',
      }),
    ).toBeNull();
  });

  it('sin flag no autoriza a nadie, ni con el PIN bueno', () => {
    expect(
      buscarAutorizador({
        staff: [jefa],
        roles_permisos: roles,
        pin: '331213',
      }),
    ).toBeNull();
  });

  it('sin staff no revienta', () => {
    expect(buscar('331213', [])).toBeNull();
    expect(buscarAutorizador({})).toBeNull();
  });
});

describe('sesionAutoriza', () => {
  it('quien ya tiene el mando no teclea su propio PIN', () => {
    // Pedirle al dueño que se autorice a sí mismo es fricción sin ganancia.
    expect(
      sesionAutoriza({
        usuario: { rol: 'Admin' },
        roles_permisos: roles,
        flag: 'autoriza_descuentos',
      }),
    ).toBe(true);
  });

  it('quien no lo tiene, no', () => {
    expect(
      sesionAutoriza({
        usuario: { rol: 'Mesero' },
        roles_permisos: roles,
        flag: 'autoriza_descuentos',
      }),
    ).toBe(false);
  });

  it('lee también `puesto`, que es como lo guardan algunas filas', () => {
    expect(
      sesionAutoriza({
        usuario: { puesto: 'Admin' },
        roles_permisos: roles,
        flag: 'autoriza_descuentos',
      }),
    ).toBe(true);
  });
});
