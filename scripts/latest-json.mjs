#!/usr/bin/env node
/**
 * latest-json.mjs — genera el `latest.json` que leen las cajas para saber que
 * hay versión nueva.
 *
 * ── POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO ────────────────────────────────
 * La firma son ~420 caracteres en base64. Copiarla a mano es una errata
 * esperando a ocurrir, y el síntoma sería «la actualización no se instala», sin
 * ninguna otra pista: el updater rechaza la firma y no dice por qué.
 *
 * Además el archivo tiene que decir **exactamente** la versión que Tauri metió
 * dentro del instalador. Leerla del `tauri.conf.json` en vez de teclearla quita
 * el otro camino a la misma clase de fallo silencioso.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   npm run release -- "Corrige que el cajón no abría al cobrar con tarjeta."
 *
 * La nota va COMO ARGUMENTO y no se edita después en el archivo. Un paso manual
 * al final es un paso que alguien se salta el día que tiene prisa, y lo que se
 * publica entonces es un aviso que dice «PON AQUI QUE CAMBIO» en la pantalla de
 * un restaurante.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'UP240507/InvVentaReact';

const conf = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'src-tauri', 'tauri.conf.json'), 'utf8'),
);
const version = conf.version;

const nsis = path.join(
  RAIZ,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'nsis',
);
const exe = `InvVenta_${version}_x64-setup.exe`;
const sig = path.join(nsis, `${exe}.sig`);

if (!fs.existsSync(sig)) {
  console.error(`✖ No encuentro la firma:\n  ${sig}\n`);
  console.error('Causas, en orden de probabilidad:');
  console.error('  1. No has compilado esta versión todavía.');
  console.error(
    '  2. Compilaste SIN las variables de firma → no hay .sig (y el build',
  );
  console.error('     debería haber fallado; si no falló, revisa que');
  console.error('     `createUpdaterArtifacts` siga en true).');
  console.error(
    `  3. Subiste la versión a ${version} DESPUÉS de compilar: el bundle que`,
  );
  console.error('     hay en disco es de la anterior. Vuelve a compilar.');
  process.exit(1);
}

const firma = fs.readFileSync(sig, 'utf8').trim();

// Todo lo que venga después de `--`. Se juntan por si el shell partió la frase.
const nota = process.argv.slice(2).join(' ').trim();

// Se valida ANTES de escribir. La primera versión comprobaba la nota DESPUÉS
// de guardar el archivo, así que un intento fallido dejaba en disco un
// `latest.json` con las notas vacías — listo para que alguien lo subiera sin
// mirar. Un script que aborta debe abortar sin dejar nada a medias.
if (!nota) {
  console.error('✖ Falta la nota de la versión.\n');
  console.error('   npm run release -- "Qué cambió, en una línea."\n');
  console.error('La lee el DUEÑO DEL RESTAURANTE en el aviso de actualizar,');
  console.error('no un programador: «Corrige que el cajón no abría al cobrar');
  console.error('con tarjeta» sirve; «fix: cola.rs abrir_cajon» no.');
  process.exit(1);
}

// El aviso más útil que puede dar este script: que la versión del conf y la del
// archivo compilado no cuadren. Si no cuadran, el .sig de arriba no existe y ya
// se ha salido; llegar aquí significa que sí cuadran. Se deja dicho para que
// quien lea el código sepa que esa comprobación está hecha.
const latest = {
  version,
  notes: nota,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {
    'windows-x86_64': {
      signature: firma,
      url: `https://github.com/${REPO}/releases/download/v${version}/${exe}`,
    },
  },
};

const destino = path.join(RAIZ, 'release');
fs.mkdirSync(destino, { recursive: true });
const archivo = path.join(destino, 'latest.json');
fs.writeFileSync(archivo, JSON.stringify(latest, null, 2) + '\n');

console.log(`✓ release/latest.json — versión ${version}`);
console.log(`  nota:       ${nota}`);
console.log(`  instalador: ${exe}`);
console.log(`  firma:      ${firma.length} caracteres`);
console.log('');
console.log(`Sube al release con etiqueta v${version} estos tres archivos:`);
console.log(`  1. ${exe}`);
console.log(`  2. ${exe}.sig`);
console.log('  3. release/latest.json');
