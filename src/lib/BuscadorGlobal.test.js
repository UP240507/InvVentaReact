import { describe, it, expect } from 'vitest';
import { construirIndice, buscar, normalizar, agrupar } from './BuscadorGlobal';

const NAV = [
  { path: '/mesas', label: 'Mapa de Mesas', grupo: 'Operación' },
  { path: '/proveedores', label: 'Proveedores', grupo: 'Compras y Almacén' },
  { path: '/ingredientes', label: 'Ingredientes', grupo: 'Catálogos' },
  { path: '/clientes', label: 'CRM', grupo: 'Equipo y Clientes' },
];

const DATOS = {
  mesas: [
    { id: 1, nombre: 'Terraza 3', estado: 'ocupada' },
    { id: 2, nombre: 'Barra 1', estado: 'libre' },
  ],
  productos: [
    { id: 10, nombre: 'Jitomaté bola', stock: 4, unidad: 'kg' },
    { id: 11, nombre: 'Cebolla morada', stock: 2, unidad: 'kg' },
  ],
  proveedores: [
    { id: 20, nombre: 'Distribuidora del Norte', rfc: 'DNO010101AAA' },
    { id: 21, nombre: 'Verduras Ocultas', activo: false },
  ],
  clientes: [{ id: 30, nombre: 'Ana Cliente', telefono: '5512345678' }],
};

const indiceCompleto = () =>
  construirIndice(DATOS, { navItems: NAV, puedeVerRuta: () => true });

describe('normalizar', () => {
  it('quita acentos y mayúsculas', () => {
    expect(normalizar('Jitomaté BOLA')).toBe('jitomate bola');
  });
});

describe('construirIndice', () => {
  it('indexa navegación y datos de las rutas visibles', () => {
    const idx = indiceCompleto();
    expect(idx.filter((e) => e.tipo === 'navegacion')).toHaveLength(4);
    expect(idx.some((e) => e.titulo === 'Terraza 3')).toBe(true);
    expect(idx.some((e) => e.titulo === 'Distribuidora del Norte')).toBe(true);
  });

  it('excluye proveedores dados de baja lógica', () => {
    const idx = indiceCompleto();
    expect(idx.some((e) => e.titulo === 'Verduras Ocultas')).toBe(false);
  });

  it('SEGURIDAD: sin la ruta en el menú, el recurso no se indexa', () => {
    // Un mesero sin CRM (o un tenant sin el addon de lealtad) no debe poder
    // sacar la cartera de clientes por el buscador.
    const navSinCrm = NAV.filter((n) => n.path !== '/clientes');
    const idx = construirIndice(DATOS, {
      navItems: navSinCrm,
      puedeVerRuta: () => true,
    });
    expect(idx.some((e) => e.tipo === 'cliente')).toBe(false);
  });

  it('SEGURIDAD: respeta puedeVerRuta aunque la ruta esté en el menú', () => {
    const idx = construirIndice(DATOS, {
      navItems: NAV,
      puedeVerRuta: (r) => r !== '/proveedores',
    });
    expect(idx.some((e) => e.tipo === 'proveedor')).toBe(false);
  });

  it('tolera colecciones ausentes o nulas', () => {
    expect(() =>
      construirIndice({ mesas: null }, { navItems: NAV }),
    ).not.toThrow();
  });
});

describe('buscar', () => {
  it('ignora consultas de menos de 2 caracteres', () => {
    expect(buscar(indiceCompleto(), 'j')).toEqual([]);
  });

  it('encuentra sin acentos', () => {
    const r = buscar(indiceCompleto(), 'jitomate');
    expect(r[0].titulo).toBe('Jitomaté bola');
  });

  it('prioriza la navegación cuando el puntaje empata', () => {
    const r = buscar(indiceCompleto(), 'proveedores');
    expect(r[0].tipo).toBe('navegacion');
    expect(r[0].ruta).toBe('/proveedores');
  });

  it('exige que TODOS los términos coincidan', () => {
    const r = buscar(indiceCompleto(), 'distribuidora norte');
    expect(r).toHaveLength(1);
    expect(buscar(indiceCompleto(), 'distribuidora sur')).toHaveLength(0);
  });

  it('busca en campos secundarios (RFC)', () => {
    const r = buscar(indiceCompleto(), 'DNO0101');
    expect(r[0].titulo).toBe('Distribuidora del Norte');
  });

  it('respeta el límite', () => {
    expect(
      buscar(indiceCompleto(), 'a', { limite: 2 }).length,
    ).toBeLessThanOrEqual(2);
  });
});

describe('agrupar', () => {
  it('agrupa conservando el orden de relevancia', () => {
    const grupos = agrupar(buscar(indiceCompleto(), 'me'));
    expect(grupos[0].etiqueta).toBe('Ir a');
    expect(grupos.every((g) => g.items.length > 0)).toBe(true);
  });
});
