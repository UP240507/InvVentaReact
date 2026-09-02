// src/lib/Compras.test.js
//
// La afirmación de todo el fichero: **renombrar un proveedor en el catálogo no
// deja sin destinatario a sus órdenes anteriores.** Antes sí las dejaba, y sin
// dar error: el enlace de WhatsApp se armaba igual, sin número.
import { describe, it, expect } from 'vitest';
import {
  proveedorDeLaOrden,
  nombreDeProveedorDeLaOrden,
  telefonoParaWhatsApp,
} from './Compras';

const QUESOS = { id: 1, nombre: 'Quesos', telefono: '449 123 4567' };
const EMMA = { id: 2, nombre: 'Emma', telefono: '(449) 765-4321' };
const CATALOGO = [QUESOS, EMMA];

describe('proveedorDeLaOrden', () => {
  it('busca por id, no por nombre', () => {
    expect(proveedorDeLaOrden({ proveedor_id: 2 }, CATALOGO)).toBe(EMMA);
  });

  it('EL CASO: el proveedor se renombró y la orden sigue encontrándolo', () => {
    // La orden se emitió cuando el proveedor se llamaba "Quesos"; en el
    // catálogo alguien lo corrigió a "Quesos y Lácteos del Centro".
    const catalogoCorregido = [
      { ...QUESOS, nombre: 'Quesos y Lácteos del Centro' },
      EMMA,
    ];
    const orden = { proveedor_id: 1, proveedor: 'Quesos' };

    expect(proveedorDeLaOrden(orden, catalogoCorregido)?.id).toBe(1);
    expect(telefonoParaWhatsApp(orden, catalogoCorregido)).toBe('4491234567');

    // ── EL CONTROL NEGATIVO ────────────────────────────────────────────
    // Así buscaba la pantalla hasta el 01-sep. Se deja escrito para que se
    // vea qué se rompía: no fallaba, se quedaba SIN NADIE.
    const comoSeHaciaAntes = catalogoCorregido.find(
      (p) => p.nombre === orden.proveedor,
    );
    expect(comoSeHaciaAntes).toBeUndefined();
  });

  it('el id gana aunque el nombre también case con otro', () => {
    // Dos proveedores llamados igual es posible: el nombre no es unico.
    const dosIguales = [
      { id: 7, nombre: 'Emma', telefono: '111' },
      { id: 8, nombre: 'Emma', telefono: '222' },
    ];
    const orden = { proveedor_id: 8, proveedor: 'Emma' };
    expect(proveedorDeLaOrden(orden, dosIguales)?.id).toBe(8);
    expect(telefonoParaWhatsApp(orden, dosIguales)).toBe('222');
  });

  it('los ids se comparan en texto: 2 y "2" son el mismo proveedor', () => {
    expect(proveedorDeLaOrden({ proveedor_id: '2' }, CATALOGO)).toBe(EMMA);
  });

  it('orden vieja sin `proveedor_id`: respaldo por nombre', () => {
    // Las 46 de AZUL emitidas antes de que la columna existiera.
    expect(proveedorDeLaOrden({ proveedor: 'Emma' }, CATALOGO)).toBe(EMMA);
  });

  it('un `proveedor_id` que ya no está en el catálogo cae al nombre', () => {
    // Proveedor borrado: la FK deja el id en NULL, pero una copia local de la
    // orden puede seguir trayéndolo. El nombre de la orden sigue valiendo.
    expect(
      proveedorDeLaOrden({ proveedor_id: 99, proveedor: 'Emma' }, CATALOGO),
    ).toBe(EMMA);
  });

  it('«Sin asignar» no inventa un proveedor', () => {
    // La orden real de AZUL que no casa con nadie. Que devuelva null es la
    // respuesta correcta: la pantalla tiene que poder decir que no hay a quién.
    const orden = { proveedor_id: null, proveedor: 'Sin asignar' };
    expect(proveedorDeLaOrden(orden, CATALOGO)).toBeNull();
    expect(telefonoParaWhatsApp(orden, CATALOGO)).toBe('');
  });

  it('aguanta basura sin romperse', () => {
    expect(proveedorDeLaOrden(null, CATALOGO)).toBeNull();
    expect(proveedorDeLaOrden({}, CATALOGO)).toBeNull();
    expect(proveedorDeLaOrden({ proveedor: 'Emma' }, null)).toBeNull();
    expect(proveedorDeLaOrden({ proveedor: 7 }, CATALOGO)).toBeNull();
    expect(
      proveedorDeLaOrden({ proveedor_id: 1 }, [null, undefined]),
    ).toBeNull();
  });
});

describe('nombreDeProveedorDeLaOrden', () => {
  it('enseña el nombre del catálogo, para que una corrección se vea', () => {
    const corregido = [{ ...QUESOS, nombre: 'Quesos y Lácteos' }];
    expect(
      nombreDeProveedorDeLaOrden(
        { proveedor_id: 1, proveedor: 'Quesos' },
        corregido,
      ),
    ).toBe('Quesos y Lácteos');
  });

  it('sin catálogo, el nombre que quedó escrito en la orden', () => {
    expect(nombreDeProveedorDeLaOrden({ proveedor: 'saad' }, [])).toBe('saad');
  });

  it('sin nada, cadena vacía y no «undefined» en pantalla', () => {
    expect(nombreDeProveedorDeLaOrden({}, [])).toBe('');
    expect(nombreDeProveedorDeLaOrden(null, null)).toBe('');
  });
});

describe('telefonoParaWhatsApp', () => {
  it('deja sólo dígitos', () => {
    expect(telefonoParaWhatsApp({ proveedor_id: 2 }, CATALOGO)).toBe(
      '4497654321',
    );
  });

  it('sin proveedor o sin teléfono, cadena vacía que la pantalla debe mirar', () => {
    expect(telefonoParaWhatsApp({ proveedor_id: 404 }, CATALOGO)).toBe('');
    expect(
      telefonoParaWhatsApp({ proveedor_id: 3 }, [{ id: 3, nombre: 'X' }]),
    ).toBe('');
  });
});
