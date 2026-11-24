import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ app: {} }));
vi.mock('../store/useAppStore', () => ({
  useAppStore: { getState: () => h.app },
}));

import { autorizar } from './autorizar';

const ROLES = [
  { rol: 'Gerente', capacidades: { autoriza_descuentos: true } },
  { rol: 'Mesero', capacidades: { autoriza_descuentos: false } },
];

describe('autorizar', () => {
  beforeEach(() => {
    h.app = {
      staff: [
        { id: 1, nombre: 'Ana', rol: 'Gerente', pin: '2468', activo: true },
        { id: 2, nombre: 'Beto', rol: 'Mesero', pin: '1357', activo: true },
      ],
      roles_permisos: ROLES,
    };
  });

  it('es una promesa, para que la fase 2 pueda preguntar por red', () => {
    const r = autorizar({ pin: '2468', flag: 'autoriza_descuentos' });
    expect(r).toBeInstanceOf(Promise);
  });

  it('responde con la plantilla y los permisos del store', async () => {
    const quien = await autorizar({ pin: '2468', flag: 'autoriza_descuentos' });
    expect(quien?.nombre).toBe('Ana');
  });

  it('un PIN sin la capacidad no autoriza', async () => {
    expect(await autorizar({ pin: '1357', flag: 'autoriza_descuentos' })).toBe(
      null,
    );
  });

  it('lee el store en cada llamada, no una copia vieja', async () => {
    // Si alguien se da de baja con la pantalla abierta, su PIN deja de servir.
    h.app.staff[0].activo = false;
    expect(await autorizar({ pin: '2468', flag: 'autoriza_descuentos' })).toBe(
      null,
    );
  });
});
