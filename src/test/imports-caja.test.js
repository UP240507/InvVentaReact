// src/test/imports-caja.test.js
//
// Que ningún import relativo dependa de que el sistema de archivos perdone las
// mayúsculas.
//
// ── Por qué existe esta prueba y no basta con «tener cuidado» ────────────────
// Windows y macOS son insensibles a la caja: `import './fiscal'` encuentra
// `Fiscal.js` sin rechistar. Linux no. Como el desarrollo se hace en Windows y
// el despliegue —y cualquier CI— es Linux, este error tiene una propiedad muy
// mala: **es invisible exactamente en el sitio donde se escribe el código**.
// No falla al escribirlo, no falla al probarlo, no falla al revisarlo. Falla la
// primera vez que alguien monta CI, y entonces aparecen todos de golpe sin
// relación con lo que se estaba tocando ese día.
//
// Ya pasó: `Fiscal.test.js`, `Arqueo.test.js` e `Inventario.test.js` llevaban
// meses pidiendo `./fiscal`, `./arqueo` y `./inventario`. Se detectaron de
// casualidad. Arreglarlos sin dejar un guardián sólo reinicia el reloj.
//
// ── Por qué no le pregunta al sistema de archivos si el archivo existe ───────
// Porque en Windows diría que sí. `existsSync('./fiscal.js')` con `Fiscal.js`
// en disco devuelve `true`, así que una prueba construida sobre eso pasaría en
// verde en la máquina donde se escribe y no protegería de nada.
//
// En vez de preguntar SI existe, se pregunta CÓMO SE LLAMA: se lista el
// directorio con `readdir` —que devuelve los nombres reales— y se comprueba
// tramo a tramo que la ruta pedida aparece con esa caja exacta. Eso da la misma
// respuesta en los tres sistemas operativos, que es justo lo que se necesita de
// una prueba que ha de sonar en Windows para un fallo de Linux.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// `process` no está en los globales del ESLint del navegador, y aquí sí existe:
// esto corre en Node bajo Vitest, no en la app. Se importa explícitamente en vez
// de añadir un global al config, que lo daría por bueno también en `src/`.
import process from 'node:process';

// Dónde se busca. `src-tauri` y `supabase` quedan fuera: el primero es Rust y
// el segundo son funciones Deno con sus propias reglas de resolución.
const CARPETAS = ['src', 'e2e', 'scripts'];
const IGNORAR = new Set(['node_modules', 'dist', 'dev-dist', 'test-results']);

// El orden importa: es el mismo que prueba el resolvedor. `''` primero para que
// un import con extensión explícita no se confunda con otro sin ella.
const EXTENSIONES = [
  '',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '/index.js',
  '/index.jsx',
  '/index.ts',
  '/index.tsx',
];

// `from './x'`, `import('./x')` y `require('./x')`. Sólo relativos: los paquetes
// los resuelve npm y los alias, Vite; ni unos ni otros tocan el disco así.
const RE_IMPORT =
  /(?:^|[^\w$])(?:from|import)\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)|require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

const RAIZ = process.cwd();

/**
 * Quita comentarios respetando las cadenas.
 *
 * Hace falta porque un import comentado —o citado en una explicación como la de
 * la cabecera de este mismo archivo— no es código y no puede hacer sonar la
 * alarma. Sin esto, el primer falso positivo que salga enseña a la gente a
 * ignorar la prueba, y una prueba que se ignora estorba más que no tenerla.
 *
 * Se recorre carácter a carácter llevando la cuenta de si se está dentro de una
 * cadena. Un `replace` con expresión regular no sirve: se comería la barra doble
 * de una URL dentro de un string y dejaría el resto de la línea fuera.
 */
function sinComentarios(fuente) {
  let salida = '';
  let comilla = null; // ' " ` cuando estamos dentro de una cadena
  let bloque = false;
  let linea = false;

  for (let i = 0; i < fuente.length; i++) {
    const c = fuente[i];
    const sig = fuente[i + 1];

    if (bloque) {
      if (c === '*' && sig === '/') {
        bloque = false;
        i++;
      }
      continue;
    }
    if (linea) {
      if (c === '\n') {
        linea = false;
        salida += c; // se conserva el salto: los números de línea no se mueven
      }
      continue;
    }
    if (comilla) {
      salida += c;
      if (c === '\\') {
        salida += sig ?? '';
        i++;
      } else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '/' && sig === '*') {
      bloque = true;
      i++;
      continue;
    }
    if (c === '/' && sig === '/') {
      linea = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') comilla = c;
    salida += c;
  }
  return salida;
}

function archivosDeCodigo(dir, salida = []) {
  if (!fs.existsSync(dir)) return salida;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    // Restos de herramientas y editores: Prettier y los editores escriben
    // atómicamente creando un archivo temporal AL LADO del destino y renombrando
    // después. Si el barrido pasa justo en esa ventana, lee medio archivo y
    // acusa de imports rotos a algo que ni siquiera existe un segundo más tarde.
    // Un guardián que falla al azar es peor que no tenerlo: enseña a reintentar.
    if (/^[.~]|\.(tmp|swp|orig|rej)$|~$/.test(entrada.name)) continue;
    const p = path.join(dir, entrada.name);
    if (entrada.isDirectory()) archivosDeCodigo(p, salida);
    else if (!entrada.isFile()) continue;
    else if (/\.(jsx?|tsx?|mjs|cjs)$/.test(entrada.name)) salida.push(p);
  }
  return salida;
}

const cacheListados = new Map();
function listar(dir) {
  if (!cacheListados.has(dir)) {
    try {
      cacheListados.set(dir, fs.readdirSync(dir));
    } catch {
      cacheListados.set(dir, []);
    }
  }
  return cacheListados.get(dir);
}

/**
 * ¿Esta ruta existe con ESTA caja, tramo a tramo?
 *
 * Se recorre desde la raíz del repo hacia dentro comprobando que cada segmento
 * aparezca literalmente en el listado de su directorio padre. Es la parte que
 * hace que la prueba dé la misma respuesta en Windows y en Linux: `readdir`
 * devuelve los nombres tal como están escritos en disco, sin normalizar.
 */
function existeConEstaCaja(rutaAbsoluta) {
  const relativa = path.relative(RAIZ, rutaAbsoluta);
  if (relativa.startsWith('..')) return true; // fuera del repo, no es cosa nuestra
  let actual = RAIZ;
  for (const tramo of relativa.split(path.sep).filter(Boolean)) {
    if (!listar(actual).includes(tramo)) return false;
    actual = path.join(actual, tramo);
  }
  return true;
}

/** Resuelve el especificador como lo haría el bundler; devuelve la ruta o null. */
function resolver(desdeArchivo, especificador) {
  // `?raw`, `?url`, `?worker`… son sufijos de Vite, no parte del nombre.
  const limpio = especificador.split('?')[0];
  const base = path.resolve(path.dirname(desdeArchivo), limpio);
  for (const ext of EXTENSIONES) {
    const candidato = base + ext;
    try {
      if (fs.statSync(candidato).isFile()) return candidato;
    } catch {
      /* siguiente extensión */
    }
  }
  return null;
}

function revisarRepo() {
  const problemas = [];
  const archivos = CARPETAS.flatMap((c) =>
    archivosDeCodigo(path.join(RAIZ, c)),
  );

  for (const archivo of archivos) {
    const fuente = sinComentarios(fs.readFileSync(archivo, 'utf8'));
    for (const m of fuente.matchAll(RE_IMPORT)) {
      const especificador = m[1] || m[2] || m[3];
      if (!especificador) continue;
      const resuelto = resolver(archivo, especificador);
      const desde = path.relative(RAIZ, archivo).replace(/\\/g, '/');

      if (!resuelto) {
        problemas.push(
          `${desde} → '${especificador}' no resuelve a ningún archivo`,
        );
      } else if (!existeConEstaCaja(resuelto)) {
        // El nombre real: se lee del listado del directorio, no del import.
        const dir = path.dirname(resuelto);
        const pedido = path.basename(resuelto);
        const real =
          listar(dir).find((n) => n.toLowerCase() === pedido.toLowerCase()) ??
          '(desconocido)';
        problemas.push(
          `${desde} → '${especificador}' pide "${pedido}" pero en disco es "${real}"`,
        );
      }
    }
  }
  return problemas;
}

describe('imports relativos · caja del sistema de archivos', () => {
  it('ninguno depende de que Windows perdone las mayúsculas', () => {
    const problemas = revisarRepo();
    // El mensaje va en el propio `expect` para que al fallar se lean los casos
    // concretos y no un «expected 3 to be 0» que obliga a ir a buscarlos.
    expect(problemas, `\n${problemas.join('\n')}\n`).toEqual([]);
  });

  it('el barrido mira algo: si no encuentra archivos, no prueba nada', () => {
    // Sin esto, un cambio de estructura de carpetas dejaría la prueba anterior
    // en verde permanente por no tener nada que revisar — el peor estado
    // posible para un guardián, porque parece que cuida y no cuida.
    const archivos = CARPETAS.flatMap((c) =>
      archivosDeCodigo(path.join(RAIZ, c)),
    );
    expect(archivos.length).toBeGreaterThan(50);
  });

  it('no se traga los imports que están dentro de comentarios', () => {
    // Un import comentado no es código. Si hiciera saltar la alarma, el primer
    // falso positivo enseñaría a la gente a ignorar esta prueba — y una prueba
    // que se ignora estorba más que no existir.
    // La comilla va interpolada a propósito: escrito del tirón, el barrido se
    // encontraría a sí mismo —estas cadenas son código de verdad, no
    // comentarios— y se acusaría de importar archivos que no existen.
    const Q = "'";
    const conRuido = [
      `// import x from ${Q}./no-existe';`,
      `/* from ${Q}./tampoco' */`,
      `const url = ${Q}https://ejemplo.com//doble-barra';`,
      `import real from ${Q}./si-existe';`,
    ].join('\n');
    const limpio = sinComentarios(conRuido);
    expect(limpio).not.toContain('./no-existe');
    expect(limpio).not.toContain('./tampoco');
    expect(limpio).toContain('./si-existe');
    // La barra doble dentro de una cadena no es un comentario.
    expect(limpio).toContain('https://ejemplo.com//doble-barra');
  });

  it('detecta un desajuste de caja de verdad', () => {
    // Prueba de la prueba. `useAcoplado.js` existe con esa caja exacta; pedirlo
    // en minúscula tiene que dar negativo aunque el sistema de archivos lo
    // encuentre. Si esta aserción falla, la de arriba está en verde por no
    // saber mirar, no por estar limpio el repo.
    const real = path.join(RAIZ, 'src', 'hooks', 'useAcoplado.js');
    expect(existeConEstaCaja(real)).toBe(true);
    expect(
      existeConEstaCaja(path.join(RAIZ, 'src', 'hooks', 'useacoplado.js')),
    ).toBe(false);
  });
});
