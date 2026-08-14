#!/usr/bin/env node
/**
 * version.mjs — la versión vive en TRES sitios; esto los mueve a la vez.
 *
 * ── POR QUÉ UN SCRIPT Y NO «acordarse» ──────────────────────────────────────
 * `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json` tienen
 * cada uno su número. El 13-ago estaban en 0.1.0, 0.1.0 y **0.0.0**: ya se
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
 *   npm run version               # enseña las tres, y avisa si no coinciden
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
const CONF = path.join(RAIZ, 'src-tauri', 'tauri.conf.json');
const CARGO = path.join(RAIZ, 'src-tauri', 'Cargo.toml');

const leerJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** La primera línea `version = "x"` del Cargo.toml es la del paquete. */
const VERSION_CARGO = /^version\s*=\s*"([^"]+)"/m;

function versiones() {
  return {
    'package.json': leerJson(PACKAGE).version,
    'tauri.conf.json': leerJson(CONF).version,
    'Cargo.toml': fs.readFileSync(CARGO, 'utf8').match(VERSION_CARGO)?.[1],
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
  // El TOML se toca con reemplazo de UNA sola coincidencia: hay más `version =`
  // en el archivo (los de las dependencias) y un reemplazo global las pisaría
  // todas. La del paquete es la primera.
  const toml = fs.readFileSync(CARGO, 'utf8');
  fs.writeFileSync(
    CARGO,
    toml.replace(VERSION_CARGO, `version = "${nueva}"`),
  );
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
  console.log('\n✓ Las tres coinciden.');
  process.exit(0);
}

// La referencia para `patch`/`minor` es la de Tauri: es la que acaba dentro del
// instalador y contra la que compara el updater. Las otras dos la siguen.
const referencia = actuales['tauri.conf.json'];
const nueva = /^\d+\.\d+\.\d+$/.test(arg) ? arg : subir(referencia, arg);

escribir(nueva);
console.log(`Versión: ${referencia} → ${nueva} en los tres archivos.`);
console.log('\nSiguiente paso: `npm run tauri build` con las variables de');
console.log('firma puestas (docs/CHECKLIST_ACTUALIZACIONES.md).');
