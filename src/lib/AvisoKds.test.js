// src/lib/AvisoKds.test.js
//
// Los dos fallos que sólo se ven con la cocina llena, y que por eso se prueban
// aquí en vez de descubrirlos un viernes:
//
//   1. Que al abrir el KDS suenen seis pitidos por las seis comandas que ya
//      estaban en curso.
//   2. Que marcar un item como listo cuente como llegada, porque la lista
//      cambió.
import { describe, it, expect } from 'vitest';
import {
  comandasNuevas,
  textoDeAviso,
  puedeRecibirAvisos,
  canalDeAviso,
} from './AvisoKds';
import { CAPACIDADES_BASE } from './Permisos';

const cmd = (id, extra = {}) => ({ id, mesa: 'Mesa 4', items: [{}], ...extra });

describe('comandasNuevas', () => {
  it('la primera pasada NO avisa de nada, sólo siembra', () => {
    // Abrir el KDS a media comida no es que acaben de llegar seis comandas.
    const { nuevas, vistas } = comandasNuevas(null, [cmd('a'), cmd('b')]);
    expect(nuevas).toEqual([]);
    expect(vistas).toEqual(new Set(['a', 'b']));
  });

  it('avisa sólo de la que no se había visto', () => {
    const { nuevas } = comandasNuevas(new Set(['a']), [cmd('a'), cmd('b')]);
    expect(nuevas.map((c) => c.id)).toEqual(['b']);
  });

  it('no vuelve a avisar de lo mismo aunque la lista se recalcule', () => {
    // El KDS recalcula en cada cambio: marcar un item listo, un realtime que
    // llega, un re-render. Nada de eso es una llegada.
    const primera = comandasNuevas(new Set(['a']), [cmd('a'), cmd('b')]);
    const segunda = comandasNuevas(primera.vistas, [cmd('a'), cmd('b')]);
    expect(segunda.nuevas).toEqual([]);
  });

  it('una comanda que cambia por dentro no es una llegada', () => {
    const antes = comandasNuevas(null, [cmd('a', { items: [{}, {}] })]);
    const despues = comandasNuevas(antes.vistas, [
      cmd('a', { items: [{ estado: 'listo' }, {}] }),
    ]);
    expect(despues.nuevas).toEqual([]);
  });

  it('la memoria se poda: sólo recuerda lo que sigue en pantalla', () => {
    // Sin podar, crecería todo el turno.
    const { vistas } = comandasNuevas(new Set(['a', 'b', 'c']), [cmd('a')]);
    expect(vistas).toEqual(new Set(['a']));
  });

  it('una comanda que se va y vuelve SÍ vuelve a avisar', () => {
    // Pasa con las devoluciones y con una mesa que se reabre. Para cocina
    // vuelve a haber trabajo, así que es correcto que suene otra vez.
    const uno = comandasNuevas(null, [cmd('a')]);
    const dos = comandasNuevas(uno.vistas, []); // se entregó
    const tres = comandasNuevas(dos.vistas, [cmd('a')]); // vuelve
    expect(tres.nuevas.map((c) => c.id)).toEqual(['a']);
  });

  it('sin comandas no revienta ni inventa avisos', () => {
    expect(comandasNuevas(new Set(), []).nuevas).toEqual([]);
    expect(comandasNuevas(null, null).nuevas).toEqual([]);
    expect(comandasNuevas(new Set(), undefined).nuevas).toEqual([]);
  });

  it('ignora comandas sin id en vez de tratarlas como nuevas cada vez', () => {
    // Una comanda sin id no se puede recordar, así que avisaría en bucle.
    const { nuevas, vistas } = comandasNuevas(new Set(), [{ mesa: 'Mesa 1' }]);
    expect(nuevas).toEqual([]);
    expect(vistas.size).toBe(0);
  });
});

describe('textoDeAviso', () => {
  it('una sola dice la mesa y cuántos platillos', () => {
    expect(textoDeAviso([cmd('a', { items: [{}, {}, {}] })], 'Cocina')).toBe(
      'Cocina: Mesa 4 · 3 platillos',
    );
  });

  it('singular cuando es uno', () => {
    expect(textoDeAviso([cmd('a')], 'Barra')).toBe(
      'Barra: Mesa 4 · 1 platillo',
    );
  });

  it('varias a la vez se resumen', () => {
    // Enumerar tres mesas no cabe en una notificación del sistema, y en la
    // franja compite con la lista, que ya las enseña.
    expect(textoDeAviso([cmd('a'), cmd('b'), cmd('c')], 'Cocina')).toBe(
      'Cocina: 3 comandas nuevas',
    );
  });

  it('cuenta los items de LA ESTACIÓN cuando vienen filtrados', () => {
    // El KDS adjunta `_itemsEstacion`: una comanda con 5 platillos puede tener
    // sólo 2 para barra, y decir 5 mandaría a buscar tres que no existen.
    const c = cmd('a', {
      items: [{}, {}, {}, {}, {}],
      _itemsEstacion: [{}, {}],
    });
    expect(textoDeAviso([c], 'Barra')).toContain('2 platillos');
  });

  it('sin nada que avisar devuelve null', () => {
    expect(textoDeAviso([])).toBeNull();
    expect(textoDeAviso(null)).toBeNull();
  });

  it('sin mesa cae en Mostrador', () => {
    expect(textoDeAviso([{ id: 'a', items: [{}] }])).toContain('Mostrador');
  });
});

describe('puedeRecibirAvisos', () => {
  // Se prueba contra CAPACIDADES_BASE de verdad y no contra objetos inventados:
  // si mañana alguien cambia la ruta_inicial de Chef, esto se entera.
  it('a Chef y Barista sí', () => {
    expect(puedeRecibirAvisos(CAPACIDADES_BASE.Chef)).toBe(true);
    expect(puedeRecibirAvisos(CAPACIDADES_BASE.Barista)).toBe(true);
  });

  it('a Admin y Gerente no: entran a mirar, no a cocinar', () => {
    expect(puedeRecibirAvisos(CAPACIDADES_BASE.Admin)).toBe(false);
    expect(puedeRecibirAvisos(CAPACIDADES_BASE.Gerente)).toBe(false);
  });

  it('a Mesero y Cajero tampoco', () => {
    expect(puedeRecibirAvisos(CAPACIDADES_BASE.Mesero)).toBe(false);
    expect(puedeRecibirAvisos(CAPACIDADES_BASE.Cajero)).toBe(false);
  });

  it('un rol nuevo del restaurante con puesto en el KDS sí', () => {
    // El punto de preguntar por capacidad y no por nombre: «Parrillero» no
    // existe en el código y aun así le suena.
    expect(puedeRecibirAvisos({ ruta_inicial: '/kds', gestion: false })).toBe(
      true,
    );
  });

  it('gestion gana sobre la ruta inicial', () => {
    expect(puedeRecibirAvisos({ ruta_inicial: '/kds', gestion: true })).toBe(
      false,
    );
  });

  it('sin capacidades no suena', () => {
    expect(puedeRecibirAvisos(null)).toBe(false);
    expect(puedeRecibirAvisos(undefined)).toBe(false);
    expect(puedeRecibirAvisos({})).toBe(false);
  });
});

describe('canalDeAviso', () => {
  it('fuera de la pantalla y con permiso → notificación del sistema', () => {
    expect(canalDeAviso({ oculto: true, permiso: 'granted' })).toBe('sistema');
  });

  it('con la pantalla a la vista → pop, aunque haya permiso', () => {
    // Chrome suprime las notificaciones de una pestaña visible: mandarla ahí
    // sería no avisar.
    expect(canalDeAviso({ oculto: false, permiso: 'granted' })).toBe(
      'pantalla',
    );
  });

  it('sin permiso NUNCA se manda al sistema', () => {
    // Si se mandara, el aviso se perdería sin rastro. El pop al menos se ve al
    // volver.
    expect(canalDeAviso({ oculto: true, permiso: 'denied' })).toBe('pantalla');
    expect(canalDeAviso({ oculto: true, permiso: 'default' })).toBe('pantalla');
    expect(canalDeAviso({ oculto: true, permiso: 'unsupported' })).toBe(
      'pantalla',
    );
  });

  it('sin argumentos cae en pantalla', () => {
    expect(canalDeAviso()).toBe('pantalla');
  });
});
