#!/usr/bin/env node
/**
 * base-local.mjs — levanta un local de prueba completo en Supabase local.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Las E2E que escriben (`flujo-pos`, `realtime-turnos`) abren caja, cobran y
 * cierran turno. Hasta hoy la única base donde podían hacerlo era la de AZUL, y
 * por eso la regla es no correrlas nunca. Con esto tienen una base propia, en
 * Docker, que se tira y se vuelve a hacer en cada corrida.
 *
 * ── POR QUÉ NO ES `supabase start` Y YA ─────────────────────────────────────
 * Porque las migraciones del repo no levantan una base desde cero (H23): la
 * primera hace `alter table staff`, y ninguna de las 47 crea `staff`, `ventas`
 * ni `restaurantes`, que nacieron en el panel. `supabase start` con el repo tal
 * cual truena en la primera migración.
 *
 * Así que la pila se arranca desde `supabase/local/.pila/`, una copia de
 * `config.toml` y de las funciones SIN carpeta de migraciones, y este script le
 * mete él mismo, en orden:
 *
 *   1. `supabase/local/esquema_base.sql`, el volcado de la base viva (sólo
 *      esquema, sacado con `supabase db dump`), que ya trae las 47 aplicadas.
 *   2. El registro de las 47 en `supabase_migrations`, para que
 *      `supabase migration list` vea repo y base alineados.
 *   3. El restaurante, `supabase/seed/plantilla_local.sql` y
 *      `supabase/local/datos_prueba.sql`.
 *   4. Las cuentas de Auth de los empleados y del dueño, por la API de Auth
 *      local, por el mismo camino que `crear-empleado-auth`.
 *   5. La SEGUNDA PASADA: cada migración otra vez, dentro de una transacción
 *      que se deshace. Es la regla «toda migración aguanta una segunda pasada»,
 *      que hasta hoy nadie comprobaba. Cinco viejas no la aguantan (H25); están
 *      en `NO_AGUANTAN` y una sexta tumba el script.
 *   6. `.env.e2e`, con la URL y la llave de esta pila, para `npm run e2e:local`.
 *
 * El `config.toml` del repo no se toca: no hay que acordarse de devolverlo.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   npm run base:local
 *
 * Requiere Docker Desktop abierto y la CLI de Supabase. Borra y rehace la pila
 * local cada vez (`supabase stop --no-backup`): es desechable a propósito.
 * Nunca habla con la base de AZUL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = path.join(RAIZ, 'supabase');
const LOCAL = path.join(SUPA, 'local');
const PILA = path.join(LOCAL, '.pila');

// El local de prueba. Id fijo para que se pueda buscar a mano en Studio.
const RID = '00000000-0000-4000-8000-000000000001';
const CODIGO = 'PRUEBA-L1';
const DUENO = {
  email: 'dueno@prueba.local',
  password: 'Prueba-Local-1',
  nombre: 'Dueño Prueba',
};

// Las que no aguantan la segunda pasada al 23-nov (H25). Ya están aplicadas en
// la base y no se reescriben de paso. La lista sólo puede encoger: una nueva
// tumba el script, y una que ya aguante pide que se quite de aquí.
const NO_AGUANTAN = new Set([
  '20260719024028', // roles_libres_fk_staff: crea un índice sin if not exists
  '20260720020019', // config_tema_color: agrega una restricción que ya existe
  '20260725170733', // planes_addons...: create table planes
  '20260726235337', // gastos_categorias...: create table categorias_gasto
  '20260813190704', // decrementar_stock...: create function sin or replace
]);

const morir = (titulo, ...pistas) => {
  console.error(`\n✖ ${titulo}\n`);
  for (const p of pistas) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
};
const paso = (t) => console.log(`\n── ${t}`);

/**
 * Corre un comando sin shell (mismo motivo que en `publicar.mjs`: en Windows el
 * shell junta los argumentos sin comillas).
 *
 * La CLI de Supabase es la excepción posible: instalada con scoop es un `.exe`,
 * pero instalada con npm es un `.cmd`, y Node no lanza un `.cmd` sin shell. Si
 * el `.exe` no aparece se reintenta con shell, entrecomillando a mano.
 */
function correr(cmd, args, { entrada, enVivo = false, env } = {}) {
  const opciones = {
    encoding: 'utf8',
    input: entrada,
    maxBuffer: 64 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: enVivo ? ['pipe', 'inherit', 'inherit'] : 'pipe',
  };
  const win = process.platform === 'win32';
  let r = spawnSync(win ? `${cmd}.exe` : cmd, args, opciones);
  if (win && r.error?.code === 'ENOENT') {
    const citados = args.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a));
    r = spawnSync(cmd, citados, { ...opciones, shell: true });
  }
  const salida = [r.stdout, r.stderr]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n');
  return { ok: !r.error && r.status === 0, salida, stdout: r.stdout || '' };
}

const supabase = (args, op) =>
  correr('supabase', [...args, '--workdir', PILA], op);

// ── 0 · Lo que hace falta ──────────────────────────────────────────────────
const ESQUEMA = path.join(LOCAL, 'esquema_base.sql');
if (!fs.existsSync(ESQUEMA)) {
  morir(
    'Falta supabase/local/esquema_base.sql.',
    'Se saca de la base viva, sólo esquema:',
    '  supabase login',
    '  supabase link --project-ref aorrfmxduefqwlrhfzzf',
    '  supabase db dump --linked -f supabase/local/esquema_base.sql',
  );
}
if (!correr('docker', ['info']).ok) {
  morir(
    'Docker no responde.',
    'Abre Docker Desktop y espera a que diga «Engine running».',
  );
}
if (!correr('supabase', ['--version']).ok) {
  morir('No encuentro la CLI de Supabase (`supabase`).');
}

// ── 1 · La carpeta de la pila ──────────────────────────────────────────────
// Se rehace entera cada vez: si una función cambió en el repo, la pila tiene
// que servir la de hoy, no la de la última corrida.
paso('Preparando supabase/local/.pila');
fs.rmSync(path.join(PILA, 'supabase'), { recursive: true, force: true });
fs.mkdirSync(path.join(PILA, 'supabase'), { recursive: true });
const config = fs.readFileSync(path.join(SUPA, 'config.toml'), 'utf8');
// El sembrado lo hace este script, en orden. Que la CLI no busque un seed.sql
// que no existe.
const configPila = config.replace(
  /(\[db\.seed\][^[]*?enabled\s*=\s*)true/,
  '$1false',
);
fs.writeFileSync(path.join(PILA, 'supabase', 'config.toml'), configPila);
fs.cpSync(
  path.join(SUPA, 'functions'),
  path.join(PILA, 'supabase', 'functions'),
  {
    recursive: true,
  },
);

const proyecto = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!proyecto) morir('No encuentro project_id en supabase/config.toml.');

// ── 2 · La pila, desde cero ────────────────────────────────────────────────
paso('Tirando la pila anterior (si había)');
supabase(['stop', '--no-backup']);

paso('Arrancando Supabase local (la primera vez baja las imágenes)');
if (!supabase(['start'], { enVivo: true }).ok) {
  morir(
    '`supabase start` falló.',
    'Lo que dijo está arriba. Si es un puerto ocupado, otra pila de Supabase',
    'sigue viva: `supabase stop --all`.',
  );
}

const estado = supabase(['status', '-o', 'env']);
const vars = Object.fromEntries(
  [...estado.stdout.matchAll(/^([A-Z_]+)="?([^"\r\n]*)"?$/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);
const API = vars.API_URL;
const ANON = vars.ANON_KEY || vars.PUBLISHABLE_KEY;
// La llave de servicio de ESTA pila local (fija y pública en la doc de
// Supabase). Se usa sólo aquí, en memoria, para dar de alta cuentas; no se
// escribe en ningún archivo.
const SERVICIO = vars.SERVICE_ROLE_KEY || vars.SECRET_KEY;
if (!API || !ANON || !SERVICIO) {
  morir('`supabase status -o env` no dio URL y llaves.', estado.salida);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(API)) {
  morir(`La API no es local (${API}). No sigo.`);
}

const contenedor = correr('docker', [
  'ps',
  '--filter',
  `name=supabase_db_${proyecto}`,
  '--format',
  '{{.Names}}',
])
  .stdout.split(/\r?\n/)
  .find((n) => n.trim() === `supabase_db_${proyecto}`);
if (!contenedor) morir(`No encuentro el contenedor supabase_db_${proyecto}.`);

/** SQL al psql del contenedor. `variables` llega como `-v nombre=valor`. */
function psql(
  sql,
  { variables = {}, unaTransaccion = false, columnas = false } = {},
) {
  const args = ['exec', '-i', '-e', 'PGPASSWORD=postgres', contenedor, 'psql'];
  args.push('-h', 'localhost', '-U', 'postgres', '-d', 'postgres');
  args.push('-v', 'ON_ERROR_STOP=1', '-q');
  if (unaTransaccion) args.push('--single-transaction');
  if (columnas) args.push('-tA', '-F', '|');
  for (const [k, v] of Object.entries(variables)) args.push('-v', `${k}=${v}`);
  args.push('-f', '-');
  return correr('docker', args, { entrada: sql });
}
const leer = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const exigir = (r, titulo) => {
  if (!r.ok) morir(titulo, ...r.salida.split('\n').slice(-12));
  return r;
};

// ── 3 · El esquema ─────────────────────────────────────────────────────────
paso('Cargando el esquema base');
exigir(
  psql(leer(ESQUEMA), { unaTransaccion: true }),
  'El esquema base no entró.',
);

// ── 4 · El registro de las migraciones ─────────────────────────────────────
const MIGRACIONES = path.join(SUPA, 'migrations');
const migraciones = fs
  .readdirSync(MIGRACIONES)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();
paso(`Registrando las ${migraciones.length} migraciones como aplicadas`);
const filas = migraciones
  .map((f) => `('${f.slice(0, 14)}', '${f.slice(15, -4).replace(/'/g, "''")}')`)
  .join(',\n  ');
exigir(
  psql(`
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ${filas}
on conflict (version) do nothing;`),
  'No se pudieron registrar las migraciones.',
);

// ── 5 · El local de prueba ─────────────────────────────────────────────────
paso(`Sembrando el local ${CODIGO}`);
const rid = { rid: `'${RID}'` };
exigir(
  psql(
    `insert into public.restaurantes (id, nombre, codigo) values ('${RID}', 'Local de prueba', '${CODIGO}');`,
  ),
  'No se pudo crear el restaurante.',
);
exigir(
  psql(leer(SUPA, 'seed', 'plantilla_local.sql'), { variables: rid }),
  'La plantilla no entró.',
);
exigir(
  psql(leer(LOCAL, 'datos_prueba.sql'), { variables: rid }),
  'Los datos de prueba no entraron.',
);

// ── 6 · Las cuentas de Auth ────────────────────────────────────────────────
// Con las mismas reglas que `crear-empleado-auth` y `login-pin`: correo
// sintético `emp.<id>@staff.invventa.app` y contraseña `pin.<pin>.<id>`.
async function crearCuenta(email, password, metadatos) {
  const r = await fetch(`${API.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICIO,
      Authorization: `Bearer ${SERVICIO}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: metadatos,
    }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo.id) {
    morir(`Auth no creó la cuenta ${email}.`, JSON.stringify(cuerpo));
  }
  return cuerpo.id;
}

paso('Creando las cuentas de Auth');
const empleados = exigir(
  psql(
    `select id, pin, nombre, rol from public.staff where restaurante_id = '${RID}' order by id;`,
    { columnas: true },
  ),
  'No pude leer los empleados.',
)
  .stdout.trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => {
    const [id, pin, nombre, rol] = l.split('|');
    return { id, pin, nombre, rol };
  });

const asignaciones = [];
for (const e of empleados) {
  const uid = await crearCuenta(
    `emp.${e.id}@staff.invventa.app`,
    `pin.${e.pin}.${e.id}`,
    {
      nombre: e.nombre,
      rol: e.rol,
      staff_id: Number(e.id),
      restaurante_id: RID,
    },
  );
  asignaciones.push(
    `update public.staff set auth_id = '${uid}' where id = ${Number(e.id)};`,
  );
}
const uidDueno = await crearCuenta(DUENO.email, DUENO.password, {
  nombre: DUENO.nombre,
  rol: 'Admin',
  restaurante_id: RID,
});
asignaciones.push(
  `insert into public.usuarios (username, nombre, rol, auth_id, restaurante_id)
   values ('${DUENO.email}', '${DUENO.nombre}', 'Admin', '${uidDueno}', '${RID}');`,
);
exigir(
  psql(asignaciones.join('\n'), { unaTransaccion: true }),
  'No se ligaron las cuentas.',
);

// ── 7 · La segunda pasada ──────────────────────────────────────────────────
// Cada migración otra vez, sobre la base ya completa, dentro de una
// transacción que se deshace: mide la regla sin dejar rastro.
paso('Segunda pasada de las migraciones');
const noAguantan = migraciones.filter(
  (f) => !psql(`begin;\n${leer(MIGRACIONES, f)}\nrollback;\n`).ok,
);
const nuevas = noAguantan.filter((f) => !NO_AGUANTAN.has(f.slice(0, 14)));
const curadas = [...NO_AGUANTAN].filter(
  (v) => !noAguantan.some((f) => f.startsWith(v)),
);
console.log(
  `   ${migraciones.length - noAguantan.length} aguantan, ${noAguantan.length} no (las ${NO_AGUANTAN.size} conocidas de H25).`,
);
if (curadas.length) {
  console.warn(
    `   ⚠ Ya aguantan y siguen en NO_AGUANTAN: ${curadas.join(', ')}. Quítalas.`,
  );
}

// ── 8 · El .env.e2e ────────────────────────────────────────────────────────
// Se genera y no se sube: la llave depende de la versión de la CLI, y escrita
// a mano en el repo dejaría de servir el día que cambie.
paso('Escribiendo .env.e2e');
const pin = (rol) => empleados.find((e) => e.rol === rol)?.pin;
fs.writeFileSync(
  path.join(RAIZ, '.env.e2e'),
  [
    '# Generado por `npm run base:local`. No se sube (.gitignore).',
    '# Apunta a la pila local de Docker, nunca a AZUL.',
    `VITE_SUPABASE_URL=${API}`,
    `VITE_SUPABASE_KEY=${ANON}`,
    `E2E_CODIGO=${CODIGO}`,
    `E2E_PIN_CAJERO=${pin('Cajero')}`,
    `E2E_PIN_MESERO=${pin('Mesero')}`,
    '',
  ].join('\n'),
);

if (nuevas.length) {
  morir(
    'La base quedó lista, pero hay migraciones NUEVAS que no aguantan una segunda pasada:',
    ...nuevas,
    '',
    'Hazlas idempotentes (if not exists, or replace, drop ... if exists) antes',
    'de aplicarlas a la base viva.',
  );
}

console.log(`
✔ Local de prueba listo.

  Studio:    ${vars.STUDIO_URL || 'http://127.0.0.1:54323'}
  Código:    ${CODIGO}
  Dueño:     ${DUENO.email} / ${DUENO.password}
  PIN:       ${empleados.map((e) => `${e.rol} ${e.pin}`).join(' · ')}

  E2E que escriben, contra esta base:   npm run e2e:local
  Para apagarla:                        supabase stop --workdir supabase/local/.pila
`);
