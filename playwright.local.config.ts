// playwright.local.config.ts — las E2E contra la base local de Docker.
//
// ── POR QUÉ UN ARCHIVO APARTE Y NO UNA VARIABLE ─────────────────────────────
// La regla es que las E2E que escriben nunca corran contra AZUL. Con una
// variable (`E2E_LOCAL=1`), olvidarla es correrlas contra AZUL sin aviso. Con
// un archivo aparte, `npm run e2e` sigue siendo exactamente lo que era y
// `npm run e2e:local` no tiene manera de apuntar a otro lado:
//
//   1. Lee `.env.e2e`, que escribe `npm run base:local`, y se NIEGA a arrancar
//      si la URL no es 127.0.0.1 o localhost.
//   2. Pone las cinco variables en `process.env` desde ESE archivo, pisando lo
//      que haya en la terminal. Lo hereda la compilación (`webServer`) y lo
//      heredan los trabajadores que leen el código y los PIN.
//   3. Compila a `dist-e2e/` y sirve en el 4174 sin reusar servidor. Así no se
//      monta sobre un `npm run preview` de producción que esté vivo en el 4173,
//      y el `dist/` que empaqueta Tauri no queda compilado contra la base local.
//
// ── POR QUÉ NO `loadEnv` DE VITE ────────────────────────────────────────────
// Porque `loadEnv` le da prioridad a lo que ya está exportado en la terminal
// sobre el archivo. Se probó el 23-nov: con `E2E_CODIGO=AZUL-C172` exportado de
// otra corrida, la sonda vio el código de AZUL contra la base local. Y lo mismo
// pasa al compilar: un `VITE_SUPABASE_URL` en la terminal gana sobre
// `.env.e2e`. Aquí manda el archivo y nada más.
import fs from 'node:fs';
import base from './playwright.config';

const ARCHIVO = '.env.e2e';
const VARIABLES = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_KEY',
  'E2E_CODIGO',
  'E2E_PIN_CAJERO',
  'E2E_PIN_MESERO',
];

const texto = fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, 'utf8') : '';
const archivo = Object.fromEntries(
  [...texto.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);

const url = archivo.VITE_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error(
    `${ARCHIVO} no apunta a la base local (VITE_SUPABASE_URL=${url || 'vacía'}).\n` +
      '  Corre primero `npm run base:local`.',
  );
}
const faltan = VARIABLES.filter((k) => !archivo[k]);
if (faltan.length) {
  throw new Error(
    `A ${ARCHIVO} le falta ${faltan.join(', ')}. Corre \`npm run base:local\`.`,
  );
}
for (const k of VARIABLES) process.env[k] = archivo[k];

const PUERTO = 4174;
const URL_APP = `http://localhost:${PUERTO}`;

export default {
  ...base,
  use: { ...base.use, baseURL: URL_APP },
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PUERTO} --strictPort`,
    url: URL_APP,
    reuseExistingServer: false,
    timeout: 180_000,
  },
};
