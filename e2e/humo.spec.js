// e2e/humo.spec.js — la prueba de humo que corre ANTES de publicar.
//
// ── POR QUÉ EXISTE, Y POR QUÉ NO SON LAS E2E DE SIEMPRE ─────────────────────
// La decisión de Chris (22-ago) fue: las E2E entran en el guion de publicar, no
// en cada commit. Al ir a montarlo salió un problema que cambia la forma de la
// solución:
//
//   **`flujo-pos.spec.js` y `realtime-turnos.spec.js` mutan el tenant de AZUL
//   EN VIVO** — abren turnos, cobran ventas, mueven inventario. Está dicho en
//   `playwright.config.ts`, y es la razón de `workers: 1`.
//
// Meter eso en `npm run publicar` significaría **meter ventas falsas en los
// libros del cliente cada vez que se sube una versión**. Ensuciaría el corte Z,
// los folios sin venta y el ticket promedio: justo los reportes que existen
// para que el dueño confíe en sus números. Una puerta de calidad que corrompe
// los datos de producción no es una puerta de calidad.
//
// Y `render.spec.js` tampoco sirve de puerta: compara contra un snapshot que
// hoy da 27 % de píxeles distintos (§3.2), sin explicar. Bloquearía toda
// publicación por un fallo que ni siquiera se reproduce en banco.
//
// ── LO QUE SÍ PUEDE SER UNA PUERTA HOY ─────────────────────────────────────
// Ésta. **No toca la base**: no inicia sesión, no escribe una fila, no depende
// del estado del turno. Lo único que comprueba es lo que de verdad se rompe al
// publicar y no se nota hasta que el cliente abre la caja:
//
//   1. Que el bundle compilado ARRANCA y pinta algo. Una pantalla en blanco es
//      el desenlace de un import roto, un chunk que no subió o un error en el
//      arranque, y ninguna prueba unitaria lo ve.
//   2. Que **no hay bloqueos de CSP**. Desde el 22-ago la caja lleva política
//      de seguridad y las devtools no se compilan en release: un bloqueo ahí
//      deja la pantalla a medias sin decir por qué. Esto lo caza antes de
//      firmar el instalador.
//   3. Que no hay excepciones sueltas en el arranque.
//
// Las tres cosas se comprueban contra el MISMO build que se va a subir, porque
// `webServer` hace `npm run build && npm run preview`.
//
// ── LO QUE ESTA PRUEBA NO ES ───────────────────────────────────────────────
// No sustituye a las E2E de flujo. Ésas siguen siendo valiosas y siguen sin
// poder correrse a menudo, y la salida real es **un tenant de pruebas
// desechable** en vez del de AZUL. Mientras no exista, son manuales y se corren
// a mano sabiendo lo que escriben.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── POR QUÉ EL TEST SE PONE LA CSP ÉL MISMO ────────────────────────────────
// `npm run preview` sirve el build SIN cabecera de seguridad: la política vive
// en `tauri.conf.json` y sólo la aplica la ventana de Tauri. O sea que mirar
// violaciones sobre el preview a secas sería una comprobación que **no puede
// fallar nunca** — teatro, justo lo que este proyecto se dedica a quitar.
//
// Así que se lee la política REAL del `tauri.conf.json` y se inyecta en cada
// respuesta. Leerla del archivo y no copiarla aquí es lo que hace que las dos
// no puedan divergir: el día que alguien toque la política, esta prueba prueba
// la nueva.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSP =
  JSON.parse(
    fs.readFileSync(path.join(RAIZ, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  )?.app?.security?.csp || null;

test('el build arranca, pinta y no lo bloquea la CSP', async ({ page }) => {
  const errores = [];
  const bloqueosCsp = [];

  // La política de la caja, sobre el build de la caja.
  if (CSP) {
    await page.route('**/*', async (route) => {
      const res = await route.fetch();
      await route.fulfill({
        response: res,
        headers: { ...res.headers(), 'content-security-policy': CSP },
      });
    });
  }

  page.on('pageerror', (e) => errores.push(String(e?.message || e)));
  page.on('console', (m) => {
    const t = m.text();
    // El navegador escribe la violación en consola además de disparar el
    // evento. Se recogen las dos vías: en algunos motores el evento no llega
    // si el bloqueo ocurre antes de que corra nuestro script.
    if (/Content Security Policy|Refused to/i.test(t)) bloqueosCsp.push(t);
  });

  // Se engancha ANTES de navegar: los bloqueos que más importan —una fuente,
  // una hoja de estilo, el propio bundle— ocurren en el arranque.
  await page.addInitScript(() => {
    window.__cspHumo = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__cspHumo.push(`${e.violatedDirective} → ${e.blockedURI}`),
    );
  });

  // Si la política desapareciera del `tauri.conf.json`, esta prueba dejaría de
  // comprobar lo que dice comprobar. Mejor que falle y se vea.
  expect(CSP, 'No hay `app.security.csp` en tauri.conf.json.').toBeTruthy();

  await page.goto('/', { waitUntil: 'networkidle' });

  const eventos = await page.evaluate(() => window.__cspHumo || []);

  // ── 1 · Arrancó y pintó ──────────────────────────────────────────────────
  // Se mira el árbol real, no un texto concreto: cualquier copy puede cambiar
  // mañana, pero «el root tiene hijos y hay algo legible» sigue significando
  // lo mismo dentro de un año.
  const raiz = page.locator('#root');
  await expect(raiz).toBeAttached();
  await expect
    .poll(() => raiz.evaluate((n) => n.childElementCount), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() => (document.body.innerText || '').trim().length),
    )
    .toBeGreaterThan(20);

  // ── 2 · Ni un bloqueo de CSP ─────────────────────────────────────────────
  expect(
    [...eventos, ...bloqueosCsp],
    'La política de seguridad bloqueó algo. Mira docs/DISENO_CSP.md §2 antes de publicar.',
  ).toEqual([]);

  // ── 3 · Ni una excepción en el arranque ──────────────────────────────────
  expect(errores, 'La app lanzó una excepción al arrancar.').toEqual([]);
});
