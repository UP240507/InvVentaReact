#!/usr/bin/env node
/**
 * version.mjs — la versión vive en CINCO sitios; esto los mueve a la vez.
 *
 * ── POR QUÉ UN SCRIPT Y NO «acordarse» ──────────────────────────────────────
 * `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`,
 * `src-tauri/Cargo.lock` y `package-lock.json` tienen cada uno su número —los
 * dos últimos los escriben cargo y npm, no una persona, y por eso se
 * desalineaban solos. El 13-ago estaban en 0.1.0, 0.1.0 y **0.0.0**: ya se
 * habían separado sin que nadie lo notara, porque nada falla cuando se separan.
 *
 * Y el día que fallan, falla feo: el updater compara la versión del
 * `latest.json` con la que Tauri compiló —la de `tauri.conf.json`—, así que un
 * `package.json` desfasado no rompe nada… hasta que alguien lo usa para nombrar
 * el release y publica un `latest.json` que dice 0.0.1 sobre un instalador que
 * por dentro es 0.2.0. Entonces las cajas no se actualizan y no hay error que
 * mirar.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   npm run version               # enseña las cinco, y avisa si no coinciden
 *   npm run version -- 0.2.0      # las pone las tres en 0.2.0
 *   npm run version -- patch      # 0.1.0 → 0.1.1
 *   npm run version -- minor      # 0.1.0 → 0.2.0
 *
 * No toca git: etiquetar y commitear es decisión de quien publica, no efecto
 * secundario de renumerar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGE = path.join(RAIZ, 'package.json');
const PACKAGE_LOCK = path.join(RAIZ, 'package-lock.json');
const CONF = path.join(RAIZ, 'src-tauri', 'tauri.conf.json');
const CARGO = path.join(RAIZ, 'src-tauri', 'Cargo.toml');
const LOCK = path.join(RAIZ, 'src-tauri', 'Cargo.lock');

const leerJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** La primera línea `version = "x"` del Cargo.toml es la del paquete. */
const VERSION_CARGO = /^version\s*=\s*"([^"]+)"/m;

/** El nombre del paquete, para encontrar su entrada en el lock sin adivinarla. */
const NOMBRE_CARGO = /^name\s*=\s*"([^"]+)"/m;

/**
 * La entrada de NUESTRO paquete dentro de `Cargo.lock`.
 *
 * El lock lista cientos de paquetes y todos tienen su `version`. Se ancla al
 * `name = "invventa"` —leído del Cargo.toml, no escrito a mano— y se toma el
 * `version` que va justo detrás. Un reemplazo menos preciso renumeraría alguna
 * dependencia, que es peor que no tocar nada.
 */
const versionEnLock = (nombre) =>
  new RegExp(`(name = "${nombre}"\\r?\\nversion = ")([^"]+)(")`);

function nombreDelPaquete() {
  return fs.readFileSync(CARGO, 'utf8').match(NOMBRE_CARGO)?.[1];
}

function versiones() {
  const nombre = nombreDelPaquete();
  return {
    'package.json': leerJson(PACKAGE).version,
    'tauri.conf.json': leerJson(CONF).version,
    'Cargo.toml': fs.readFileSync(CARGO, 'utf8').match(VERSION_CARGO)?.[1],
    // ── EL CUARTO SITIO, AÑADIDO EL 18-AGO ──────────────────────────────────
    // Este archivo decía «la versión vive en TRES sitios». Vive en cuatro:
    // `Cargo.lock` lleva su propia entrada para el paquete y la reescribe
    // cargo, no este script. Resultado: cada renumeración dejaba el árbol
    // sucio y el lock se colaba en el commit siguiente — o en ninguno. Pasó
    // tres veces: 936be8a (17-ago), 70dbb69 (0.2.5) y 290ca4d (0.2.6).
    //
    // Es el mismo fallo que este script vino a evitar, un piso más abajo. Y
    // que no rompa nada —cargo corrige el lock en el siguiente build— es
    // exactamente lo que hacía que se repitiera.
    'Cargo.lock': nombre
      ? fs.readFileSync(LOCK, 'utf8').match(versionEnLock(nombre))?.[2]
      : undefined,
    // ── Y EL QUINTO, QUE SALIÓ AL BUSCAR EL CUARTO ──────────────────────────
    // `package-lock.json` guarda la versión DOS veces: en la raíz y en la
    // entrada `packages[""]`, que es este mismo paquete. Lo reescribe npm, no
    // este script, así que sólo se alineaba de casualidad cuando alguien
    // instalaba algo. El 18-ago estaba en 0.2.4 con el resto en 0.2.6: dos
    // versiones atrás y nadie lo había notado, porque no rompe nada.
    'package-lock.json': leerJson(PACKAGE_LOCK).version,
  };
}

function escribir(nueva) {
  // Los JSON se reescriben conservando el orden de claves (JSON.parse lo
  // mantiene) y con 2 espacios, que es lo que usa prettier en este repo.
  for (const archivo of [PACKAGE, CONF]) {
    const d = leerJson(archivo);
    d.version = nueva;
    fs.writeFileSync(archivo, JSON.stringify(d, null, 2) + '\n');
  }

  // El lock de npm, sus DOS sitios. `packages['']` es la entrada de este mismo
  // paquete; dejarla atrás hace que el siguiente `npm install` reescriba el
  // archivo y ensucie el árbol por su cuenta.
  const pl = leerJson(PACKAGE_LOCK);
  pl.version = nueva;
  if (pl.packages?.['']) pl.packages[''].version = nueva;
  fs.writeFileSync(PACKAGE_LOCK, JSON.stringify(pl, null, 2) + '\n');
  // El TOML se toca con reemplazo de UNA sola coincidencia: hay más `version =`
  // en el archivo (los de las dependencias) y un reemplazo global las pisaría
  // todas. La del paquete es la primera.
  const toml = fs.readFileSync(CARGO, 'utf8');
  fs.writeFileSync(CARGO, toml.replace(VERSION_CARGO, `version = "${nueva}"`));

  // El lock, por la entrada de nuestro paquete. Si no se encuentra se AVISA y
  // se sale con error en vez de seguir: dejarlo pasar en silencio es como
  // llegamos hasta aquí. Un lock desalineado no rompe el build —cargo lo
  // arregla— pero deja el árbol sucio y esconde lo que sí importe el día que
  // importe.
  const nombre = nombreDelPaquete();
  const lock = fs.readFileSync(LOCK, 'utf8');
  const patron = nombre && versionEnLock(nombre);
  if (!nombre || !patron.test(lock)) {
    console.error(
      `\n✖ No encuentro la entrada de "${nombre ?? '???'}" en Cargo.lock.`,
    );
    console.error('  Los otros archivos SÍ se cambiaron a', nueva + '.');
    console.error('  Revisa el lock a mano antes de compilar.');
    process.exit(1);
  }
  fs.writeFileSync(LOCK, lock.replace(patron, `$1${nueva}$3`));
}

function subir(actual, parte) {
  const [ma, mi, pa] = actual.split('.').map(Number);
  if ([ma, mi, pa].some((n) => !Number.isFinite(n))) {
    throw new Error(`no entiendo la versión actual: ${actual}`);
  }
  if (parte === 'major') return `${ma + 1}.0.0`;
  if (parte === 'minor') return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

const arg = process.argv[2];
const actuales = versiones();

if (!arg) {
  console.log('Versiones actuales:');
  for (const [k, v] of Object.entries(actuales)) console.log(`  ${k}: ${v}`);
  const distintas = new Set(Object.values(actuales));
  if (distintas.size > 1) {
    console.error(
      '\n⚠  NO COINCIDEN. Ejecuta `npm run version -- <x.y.z>` para alinearlas.',
    );
    process.exit(1);
  }
  console.log('\n✓ Las cinco coinciden.');
  process.exit(0);
}

// La referencia para `patch`/`minor` es la de Tauri: es la que acaba dentro del
// instalador y contra la que compara el updater. Las otras dos la siguen.
const referencia = actuales['tauri.conf.json'];
const nueva = /^\d+\.\d+\.\d+$/.test(arg) ? arg : subir(referencia, arg);

escribir(nueva);
console.log(`Versión: ${referencia} → ${nueva} en los cinco archivos.`);
console.log('\nSiguiente paso: `npm run tauri build` con las variables de');
console.log('firma puestas (docs/CHECKLIST_ACTUALIZACIONES.md).');
