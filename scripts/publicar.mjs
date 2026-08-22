#!/usr/bin/env node
/**
 * publicar.mjs — sube el release a GitHub sin que puedas equivocarte.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Publicar a mano son ocho pasos en una pantalla del navegador, y tres de ellos
 * fallan **en silencio**: nada da error, el release queda publicado y las cajas
 * simplemente no se actualizan. Los tres son:
 *
 *   1. Subir dos de los tres archivos. Sin `latest.json` no hay nada que leer;
 *      sin el `.sig` el updater rechaza la descarga.
 *   2. Dejar marcado «Set as a pre-release». El endpoint es
 *      `releases/latest/download/latest.json` y GitHub excluye las pre-releases
 *      de «latest», así que las cajas piden un archivo que devuelve 404.
 *   3. Publicar un `latest.json` viejo — de la versión anterior, o generado
 *      antes de un recompilado. El updater compara números y firmas: si no
 *      cuadran, no pasa nada y no hay error que mirar.
 *
 * Este script hace los tres imposibles: sube siempre los tres archivos, nunca
 * pasa `--prerelease`, y **regenera el `latest.json` en el momento** en vez de
 * confiar en el que haya en disco.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   npm run publicar -- "Corrige que el cajón no abría al cobrar con tarjeta."
 *
 * Requiere la CLI de GitHub, una sola vez:
 *   winget install GitHub.cli
 *   gh auth login
 *
 * NO compila. Compilar necesita las variables de firma en el shell y eso es
 * decisión tuya, no efecto secundario de publicar. Ver
 * `docs/CHECKLIST_ACTUALIZACIONES.md`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'UP240507/InvVentaReact';

const morir = (titulo, ...pistas) => {
  console.error(`\n✖ ${titulo}\n`);
  for (const p of pistas) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
};

/**
 * El nombre del ejecutable, con extensión en Windows.
 *
 * ── POR QUÉ NO SE USA `shell: true`, QUE ERA LO FÁCIL ───────────────────────
 * Porque en Windows, con `shell: true`, Node **junta los argumentos en una
 * sola cadena sin entrecomillarlos**. La nota de la versión —una frase con
 * espacios— se partía en palabras sueltas y `gh` las tomaba por nombres de
 * archivos que subir:
 *
 *     no matches found for `se`
 *
 * El shell hacía falta sólo para que Windows resolviera `gh` → `gh.exe`. Dando
 * la extensión, `spawnSync` lo encuentra en el PATH él solo y no hay shell que
 * pueda romper nada por el camino.
 */
const bin = (nombre) =>
  process.platform === 'win32' ? `${nombre}.exe` : nombre;

/**
 * Ejecuta un comando y devuelve `{ ok, salida }`.
 *
 * `salida` junta stdout Y stderr a propósito. La primera versión de esto sólo
 * devolvía stdout y descartaba el resto, así que cuando `gh auth status`
 * fallaba, el script decía «no tiene sesión» y se guardaba para sí el motivo
 * que `gh` acababa de explicar — por stderr, que es por donde `gh auth status`
 * escribe SIEMPRE, incluso cuando todo va bien.
 *
 * Un diagnóstico que oculta la causa del fallo es peor que no diagnosticar.
 */
function correr(cmd, args) {
  const r = spawnSync(bin(cmd), args, { encoding: 'utf8' });
  const salida = [r.stdout, r.stderr]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n');
  return { ok: !r.error && r.status === 0, salida };
}

// ── 0 · La nota, antes que nada ────────────────────────────────────────────
// Se valida aquí y no después de comprobar diez cosas: si falta, que lo diga
// en el primer segundo y no en el décimo.
const argumentos = process.argv.slice(2);
// La bandera se saca ANTES de armar la nota, o acabaría impresa en el aviso
// que lee el dueño del restaurante.
const sinHumo = argumentos.includes('--sin-humo');
const nota = argumentos
  .filter((a) => a !== '--sin-humo')
  .join(' ')
  .trim();
if (!nota) {
  morir(
    'Falta la nota de la versión.',
    'npm run publicar -- "Qué cambió, en una línea."',
    '',
    'La lee el DUEÑO DEL RESTAURANTE en el aviso de actualizar, no un',
    'programador: «Corrige que el cajón no abría al cobrar con tarjeta»',
    'sirve; «fix: cola.rs abrir_cajon» no.',
  );
}

// ── 1 · ¿Está la CLI de GitHub, y con sesión? ──────────────────────────────
if (!correr('gh', ['--version']).ok) {
  morir(
    'No encuentro la CLI de GitHub (`gh`).',
    'winget install GitHub.cli',
    'Después, cierra y vuelve a abrir la terminal: el PATH no se actualiza',
    'en las ventanas que ya estaban abiertas.',
  );
}

// Se prueban DOS comprobaciones porque `gh auth status` no es de fiar como
// puerta: escribe por stderr, y devuelve código distinto de cero en
// situaciones en las que sí hay sesión — por ejemplo con otro host
// configurado sin token, o cuando no puede validar el token contra la red.
//
// `gh auth token` es binario y no miente: o hay credencial para github.com o
// no la hay. **Su salida no se enseña nunca**, que es literalmente el token.
const estado = correr('gh', ['auth', 'status', '--hostname', 'github.com']);
const hayToken = correr('gh', ['auth', 'token', '--hostname', 'github.com']).ok;

if (!estado.ok && !hayToken) {
  morir(
    'La CLI de GitHub no tiene sesión para github.com.',
    '',
    'Esto es lo que respondió `gh`:',
    ...(estado.salida || '(no dijo nada)').split('\n').map((l) => `  │ ${l}`),
    '',
    'Para entrar:',
    '  gh auth login',
    '',
    'Elige: GitHub.com → HTTPS → «Login with a web browser».',
    'Si ya lo hiciste en otra ventana, abre una terminal nueva.',
  );
}

if (!estado.ok && hayToken) {
  // Hay credencial válida pero `gh auth status` protesta. No es motivo para
  // parar: lo que importa —poder publicar— está.
  console.warn('\n⚠  `gh auth status` protesta, pero hay credencial válida:');
  console.warn(
    (estado.salida || '')
      .split('\n')
      .map((l) => `     ${l}`)
      .join('\n'),
  );
  console.warn('   Se continúa.\n');
}

// ── 2 · La versión manda, y la manda `tauri.conf.json` ─────────────────────
// Es la que Tauri metió DENTRO del instalador y contra la que compara el
// updater. `package.json` no sirve de referencia: puede estar desfasado.
const conf = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'src-tauri', 'tauri.conf.json'), 'utf8'),
);
const version = conf.version;
const etiqueta = `v${version}`;

const nsis = path.join(
  RAIZ,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'nsis',
);
const exe = `InvVenta_${version}_x64-setup.exe`;
const rutaExe = path.join(nsis, exe);
const rutaSig = `${rutaExe}.sig`;

if (!fs.existsSync(rutaExe) || !fs.existsSync(rutaSig)) {
  morir(
    `No hay instalador compilado para la versión ${version}.`,
    `Falta: ${fs.existsSync(rutaExe) ? rutaSig : rutaExe}`,
    '',
    'Compila primero, con las variables de firma puestas:',
    '  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\\.tauri\\invventa.key" -Raw',
    '  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "tu-contraseña"',
    '  npm run tauri build',
  );
}

// ── 3 · Git: la etiqueta va a colgar de un commit que TIENE que estar arriba ─
// Un release apunta a un commit. Si ese commit sólo existe en tu disco, la
// etiqueta se crea sobre otra cosa distinta de lo que compilaste.
const sucio = correr('git', ['status', '--porcelain']).salida;
if (sucio) {
  console.warn('\n⚠  Hay cambios sin confirmar:\n');
  console.warn(
    sucio
      .split('\n')
      .map((l) => `     ${l}`)
      .join('\n'),
  );
  console.warn(
    '\n   El release apuntará al último commit, NO a lo que tienes ahora.\n',
  );
}
const seguimiento = correr('git', ['status', '-sb']).salida;
if (/\bahead \d+/.test(seguimiento)) {
  morir(
    'Tienes commits sin subir.',
    'La etiqueta colgaría de un commit que GitHub no conoce.',
    '',
    'git push',
  );
}

// ── 4 · ¿Ya existe ese release? ────────────────────────────────────────────
// Se comprueba ANTES de generar nada: `gh` fallaría igual, pero después de
// haber reescrito el `latest.json`, y dejar archivos a medias por un error
// previsible es justo lo que no queremos.
if (correr('gh', ['release', 'view', etiqueta, '--repo', REPO]).ok) {
  morir(
    `El release ${etiqueta} ya existe en GitHub.`,
    'Publicar la misma versión con bytes distintos es la peor divergencia',
    'posible: las cajas que se actualicen recibirían el binario viejo',
    'creyendo estar al día, sin ningún error.',
    '',
    'Sube el número y vuelve a compilar:',
    '  npm run version -- patch',
  );
}

// ── 4.5 · La prueba de humo, contra el build que se va a subir ─────────────
// Decisión de Chris (22-ago): las E2E entran en el guion de publicar, no en
// cada commit.
//
// Lo que entra aquí es SÓLO `e2e/humo.spec.js`, y la razón importa: los otros
// specs —`flujo-pos`, `realtime-turnos`— **mutan el tenant de AZUL en vivo**.
// Meterlos aquí sería meter ventas falsas en los libros del cliente cada vez
// que se sube una versión, ensuciando el corte Z y el ticket promedio. Una
// puerta de calidad que corrompe datos de producción no es una puerta.
// `render.spec` tampoco: su snapshot da 27 % de píxeles distintos sin explicar
// (§3.2), y bloquearía toda publicación por un fallo que ni se reproduce.
//
// El humo no toca la base: compila, sirve el build, lo abre con la MISMA
// política de seguridad que lleva la caja y comprueba que arranca, que pinta y
// que la CSP no bloquea nada. Es exactamente lo que se rompe al publicar y no
// se nota hasta que el cliente abre la aplicación.
//
// Va ANTES de generar el `latest.json`: si falla, no queda nada a medias.
if (sinHumo) {
  console.warn('\n⚠  Publicando SIN la prueba de humo (--sin-humo).');
  console.warn(
    '   Nadie ha comprobado que este build arranque ni que la CSP lo deje.\n',
  );
} else {
  console.log('\nPrueba de humo (compila y abre el build)…');
  const humo = spawnSync(bin('npx'), ['playwright', 'test', '--project=humo'], {
    cwd: RAIZ,
    stdio: 'inherit',
  });
  if (humo.status !== 0) {
    morir(
      'La prueba de humo falló. El release NO se ha publicado.',
      'Este build o no arranca, o la política de seguridad le bloquea algo.',
      'Las dos cosas dejan la caja del cliente a medias sin dar un error',
      'visible, que es justo lo que esta puerta existe para evitar.',
      '',
      'Para verlo con detalle:',
      '  npm run e2e:humo',
      '',
      'Y si de verdad hace falta publicar sin ella:',
      '  npm run publicar -- --sin-humo "la nota"',
    );
  }
}

// ── 5 · Regenerar el `latest.json` AHORA ───────────────────────────────────
// No se reutiliza el que haya en disco: puede ser de la versión anterior, o
// haberse generado antes de un recompilado —en cuyo caso la firma que lleva ya
// no es la del `.exe` que estás subiendo—.
console.log(`\nGenerando release/latest.json para ${version}…`);
try {
  execFileSync(
    process.execPath,
    [path.join(RAIZ, 'scripts', 'latest-json.mjs'), nota],
    {
      stdio: 'inherit',
    },
  );
} catch {
  morir('Falló la generación del latest.json.');
}

const rutaLatest = path.join(RAIZ, 'release', 'latest.json');
const latest = JSON.parse(fs.readFileSync(rutaLatest, 'utf8'));

// Cinturón y tirantes: se comprueba que lo recién generado cuadra con lo que
// hay en disco. Si esto falla es que algo muy raro pasó, y más vale enterarse
// aquí que con una caja que no se actualiza dentro de tres semanas.
const firmaEnDisco = fs.readFileSync(rutaSig, 'utf8').trim();
if (latest.version !== version) {
  morir(`El latest.json dice ${latest.version} y el conf dice ${version}.`);
}
if (latest.platforms?.['windows-x86_64']?.signature !== firmaEnDisco) {
  morir(
    'La firma del latest.json no es la del .sig que hay en disco.',
    'Vuelve a compilar y a publicar.',
  );
}

// ── 6 · Publicar ───────────────────────────────────────────────────────────
// Sin `--prerelease`, nunca. Es lo único de la pantalla de GitHub que rompe el
// updater sin avisar, y aquí simplemente no existe la opción.
console.log(`\nPublicando ${etiqueta} en ${REPO}…`);

// La nota va en un ARCHIVO y no en `--notes`. Aunque ya no haya shell de por
// medio, una frase con «comillas angulares», acentos y posibles comillas
// rectas es un campo de minas para cualquier capa que la manipule por el
// camino. Un archivo UTF-8 no tiene ese problema, y `gh` lo admite de serie.
const rutaNota = path.join(os.tmpdir(), `invventa-nota-${version}.md`);
fs.writeFileSync(rutaNota, `${nota}\n`, 'utf8');

const publicado = spawnSync(
  bin('gh'),
  [
    'release',
    'create',
    etiqueta,
    '--repo',
    REPO,
    '--title',
    etiqueta,
    '--notes-file',
    rutaNota,
    '--latest',
    rutaExe,
    rutaSig,
    rutaLatest,
  ],
  { stdio: 'inherit' },
);
try {
  fs.unlinkSync(rutaNota);
} catch {
  /* si no se puede borrar el temporal, da igual */
}
if (publicado.status !== 0) {
  morir('`gh release create` falló. El release NO se ha publicado.');
}

// ── 7 · Comprobarlo de verdad ──────────────────────────────────────────────
// Es el paso 8 de la checklist, y es el único que demuestra algo: si esta URL
// da 404, las cajas también lo van a recibir. Publicar sin mirarla es publicar
// a ciegas.
const url = `https://github.com/${REPO}/releases/latest/download/latest.json`;
console.log(`\nComprobando ${url} …`);
try {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const servido = JSON.parse(await r.text());
  if (servido.version !== version) {
    morir(
      `GitHub sirve la versión ${servido.version}, no la ${version}.`,
      'Suele significar que este release quedó marcado como pre-release,',
      'o que hay otro más reciente marcado como «latest».',
    );
  }
  console.log(`✓ Publicado y comprobado: ${servido.version}`);
  console.log(`  nota: ${servido.notes}`);
} catch (e) {
  console.error(`\n⚠  El release se publicó, pero no pude comprobar la URL:`);
  console.error(`   ${e.message}`);
  console.error(`\n   Ábrela a mano antes de darla por buena:\n   ${url}\n`);
  process.exit(1);
}

console.log('\nFalta un paso que ningún script puede hacer por ti:');
console.log(`  Instalar ${exe} en la caja. Publicar no instala nada.\n`);
