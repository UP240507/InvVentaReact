// src/test/modales-teclado.test.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// `docs/MOCKUPS_RESPONSIVE.md` nombra el fallo clásico de los modales en
// teléfono: **el formulario cabe, pero el botón de guardar queda debajo del
// teclado.** Pasa porque `vh` mide la pantalla ENTERA y no encoge cuando se
// abre el teclado, así que un modal de `max-h-[90vh]` sigue midiendo lo mismo y
// su pie se va fuera de lo alcanzable.
//
// La unidad correcta es `dvh`, y sólo funciona junto con
// `interactive-widget=resizes-content` en el `<meta viewport>` — las dos
// piezas, o ninguna sirve. Por eso esta prueba comprueba las DOS.
//
// ── POR QUÉ UN BARRIDO DEL REPO Y NO UNA PRUEBA DE COMPONENTE ──────────────
// Porque el fallo no vive en un componente: vive en los veinte sitios que
// escriben su propio modal a mano. Una prueba por componente cubriría los que
// alguien se acordó de cubrir, que son justo los que no fallan. El mismo
// criterio que `imports-caja.test.js`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

/** Todos los .jsx bajo src/, sin node_modules. */
function archivosJsx(dir = RAIZ, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules') continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) archivosJsx(ruta, acc);
    else if (entrada.name.endsWith('.jsx')) acc.push(ruta);
  }
  return acc;
}

// `max-h-[90vh]`, `max-h-[80vh]`… Se busca la unidad exacta para no cazar
// `dvh`, que es justamente la buena.
const ALTURA_DE_PANTALLA = /max-h-\[\d+vh\]/g;

describe('modales · el botón de guardar no puede quedar bajo el teclado', () => {
  it('ningún .jsx usa `vh` para la altura máxima', () => {
    const culpables = [];

    for (const archivo of archivosJsx()) {
      const texto = fs.readFileSync(archivo, 'utf8');
      const encontrados = texto.match(ALTURA_DE_PANTALLA);
      if (encontrados) {
        culpables.push(
          `${path.relative(RAIZ, archivo)} → ${[...new Set(encontrados)].join(', ')}`,
        );
      }
    }

    // El mensaje va dentro del `expect` para que al fallar se lea la razón sin
    // tener que venir a este archivo a averiguarla.
    expect(
      culpables,
      'Usa `dvh` en vez de `vh`. Con `vh`, al abrir el teclado del teléfono el\n' +
        'modal sigue midiendo la pantalla entera y su pie —donde está «Guardar»—\n' +
        'queda debajo del teclado, inalcanzable.\n\n' +
        culpables.join('\n'),
    ).toEqual([]);
  });

  it('el barrido mira algo: si no encuentra .jsx, no está probando nada', () => {
    // Sin esto, un cambio en la estructura de carpetas dejaría la prueba en
    // verde para siempre sin revisar un solo archivo.
    expect(archivosJsx().length).toBeGreaterThan(20);
  });

  it('sabe detectar un caso malo de verdad', () => {
    // Una prueba de barrido que no se comprueba a sí misma puede estar pasando
    // porque su expresión regular no casa con nada.
    expect(
      'class="flex flex-col max-h-[90vh]"'.match(ALTURA_DE_PANTALLA),
    ).not.toBeNull();
    expect(
      'class="flex flex-col max-h-[90dvh]"'.match(ALTURA_DE_PANTALLA),
    ).toBeNull();
  });
});

describe('el <meta viewport>, que es la otra mitad', () => {
  const html = fs.readFileSync(path.resolve(RAIZ, '..', 'index.html'), 'utf8');

  // Se extrae el `content` de la ETIQUETA, no se busca en el archivo entero.
  // La primera versión de esta prueba buscaba en todo el HTML y falló contra el
  // comentario que explica por qué se quitó `user-scalable=no` — o sea, acusó a
  // la explicación del arreglo. Buscar texto suelto en un archivo mide el
  // archivo, no la configuración.
  const contenidoViewport = (() => {
    const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
    const m = sinComentarios.match(
      /<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i,
    );
    return m ? m[1] : null;
  })();

  it('existe y se puede leer', () => {
    expect(contenidoViewport).not.toBeNull();
  });

  it('deja que el teclado encoja el contenido', () => {
    // Sin esto, `dvh` no encoge en Chrome de Android y el arreglo de arriba no
    // sirve de nada. Las dos piezas van juntas.
    expect(contenidoViewport).toContain('interactive-widget=resizes-content');
  });

  it('NO impide hacer zoom', () => {
    // `user-scalable=no` falla WCAG 1.4.4, y en un restaurante es justo lo que
    // necesita alguien de sesenta años para leer un ticket en un teléfono.
    expect(contenidoViewport).not.toContain('user-scalable=no');
    expect(contenidoViewport).not.toContain('maximum-scale');
  });
});
