# Contexto para retomar — cierre del 17-ago-2026

Documento de traspaso. Sustituye a `CONTEXTO_15-AGO.md`. Pegar o referenciar al
abrir conversación nueva.

---

## 1 · Qué es esto

**InvVentaReact** — ERP/POS multi-tenant, *offline-first*, para restaurantes
mexicanos. Repo `UP240507/InvVentaReact`, carpeta
`C:\Users\Usuario\Documents\DEV\InvVenta`.

- **React + Vite + Zustand + Dexie** (front), **Supabase/Postgres con RLS**
  (nube), **Tauri v2 + Rust** (la caja: hub HTTP en LAN, impresión ESC/POS,
  mDNS, updater).
- La caja sirve la app por LAN a teléfonos y tablets; los meseros trabajan desde
  el móvil contra el hub.
- **Cliente único: AZUL.** Todavía usan Soft Restaurant en paralelo.
- Todo el código, los comentarios y los mensajes van **en español**.

## 2 · Estado exacto ahora mismo

- Versión **0.2.4**, compilada, publicada e **instalada en la caja de AZUL**.
- **19 commits el 17-ago**, todos **locales**. No hay push: si se quiere respaldo
  fuera de esa máquina, hace falta configurar remoto y empujar.
- Sin confirmar: `src-tauri/Cargo.lock`.
- Pruebas: **663 en verde** en `src/lib` y `src/store`. **Las suites de pantalla
  no se han corrido desde los cambios**, y `PosScreen.jsx` y `HubScreen.jsx`
  están tocados. `npm run test:run` completo es obligatorio antes de compilar.
- `--isolate=false` (`npm run test:rapido`) sigue con **6 fallos intermitentes**
  conocidos en `useConectividad`. Preexistentes.
- Dos avisos de lint preexistentes que no son de esta tanda: el `no-unused-vars`
  de `reencolarDeadLetter` y el `setState` en efecto de `PosScreen`. Y
  `Modificadores.js` y su prueba están sin pasar por Prettier desde antes.

> **Aviso de entorno:** el montaje del sandbox no permitía borrar archivos, así
> que git dejaba `index.lock` y `HEAD.lock` huérfanos que bloqueaban la
> operación siguiente. Se resolvió pidiendo permiso de borrado para la carpeta
> (`allow_cowork_file_delete`). Si vuelve a pasar, es eso y no el antivirus.

## 3 · El patrón que define este proyecto

**Los errores no dan error.** La verificación del 15-ago y los arreglos del 17
añadieron ocho casos más, todos de la misma forma: dos capas correctas y el
hueco justo en medio, sin excepción ni log.

**Ninguno lo encontró una prueba. Todos se encontraron mirando** — y varios los
vio Chris en un papel, no en una pantalla.

Corolario que se ganó a base de tropezar: **leer el módulo antes de afirmar**.
El 17-ago casi se «arregla» una decisión deliberada del updater por mirar quién
llamaba a la función sin leer la cabecera del archivo, que la explicaba.

## 4 · Restricciones permanentes (seguridad)

Sin cambios. La llave privada del updater nunca al repositorio;
`TAURI_SIGNING_PRIVATE_KEY` sólo en la sesión de shell; certificado de firma de
código descartado; GitHub Actions descartado; el hub jamás guarda credenciales
de Supabase. **Avisar siempre antes de un `git add -A`.**

`compilar.ps1` vive **fuera** del repo (`C:\Users\Usuario\Documents\DEV\`) y
lleva dentro la contraseña de la llave. `firmar.ps1` y `compilar.ps1` están en
`.gitignore` por si alguna copia cae dentro. **El script va en ASCII puro**:
PowerShell 5.1 lee los `.ps1` como ANSI y un carácter fuera de ASCII rompe el
parser en un sitio que no tiene nada que ver con el error real.

## 5 · La verificación en AZUL — cerrada

Registro: **`docs/VERIFICADO_15-AGO.md`**. Pendiente: **`docs/CHECKLIST_VERIFICACION.md`**.

Verificado entero: §0 a §11. El checklist ya no contiene nada que necesite estar
en el local. Lo que queda: la ronda completa del updater (necesita una 0.2.5),
`npm run test:rapido`, y el **pulso del cajón**, que no se puede comprobar
porque el de AZUL está averiado y sólo abre con llave.

## 6 · Los ocho fallos, y dónde está cada uno

| # | Qué | Estado |
|---|---|---|
| 1 | El trigger casteaba `it->>'id'` a `bigint` y tumbaba toda venta con nota o modificador | **Arreglado**, migración aplicada y comprobada en `pg_proc` |
| 2 | Tras reabrir, volver a pedir la cuenta no imprimía y no avisaba | **Arreglado** (`655916e`) — falta verlo en papel |
| 3 | Dos jugos de $40 se cobraban a $80.01 | **Arreglado** (`7a9268d`) — falta verlo en papel |
| 4 | «Recuperar ahora» decía «no había nada» cuando había fallado | **Arreglado** (`f5fea58`) |
| 5 | Un `23505` sobre una fila que ya existe se marcaba como fallo permanente | **Arreglado** (`140415d`) |
| 6 | La auditoría no se respaldaba: un cobro podía quedar sin rastro | **Arreglado** (`7021425`) |
| 7 | El folio reservado vive sólo en el aparato | **Mitigado** (`655916e`, `cfbc428`) |
| 8 | El updater no avisa solo | **No es fallo**: decisión escrita (`143cd15`) |

### Lo que sigue abierto de esos

- **Del 5**, la otra mitad: **por qué la caja no se reconoce a sí misma** al
  comparar tokens. Ya no reparte errores rojos, pero sigue adoptando lo suyo.
  Hipótesis actual, mejor que la del token que cambia al reiniciar: la exclusión
  compara el campo `dispositivo` de la anotación con el **token de admin del
  hub** (`autorizado_admin` lo contrasta con `estado.token`), y si el respaldo
  se escribe con otro identificador **la comparación no puede acertar nunca**.
  Se decide leyendo de dónde sale ese campo al escribir el respaldo.

- **Del 7**: que la reserva del folio sobreviva al aparato exigiría meter `mesas`
  en `TABLAS_RESPALDADAS`, y eso cambia cómo se resuelven conflictos de sala —
  adoptar el estado de una mesa desde un aparato muerto puede resucitar una que
  otro ya cerró. **Decisión pendiente, no olvido.**

## 7 · Lo que hay que probar mañana, con impresora

Está escrito en `CHECKLIST_VERIFICACION.md`. En corto:

1. Mesa con productos → **Pedir Cuenta** → **un** papel.
2. **Pedir Cuenta otra vez** sin tocar nada → **otro** papel, idéntico.
3. **Reabrir**, agregar, **A Producción**, Pedir Cuenta → papel con el **total
   nuevo** y **el mismo folio**.
4. **Cobrar** → la venta lleva **ese** folio. Se confirma en `public.ventas`.
5. Un ticket de **dos jugos de $40** debe decir `TOTAL $80.00`, con
   `SUBTOTAL:$68.97 IVA:$11.03`.
6. Descartar los rojos del teléfono y hacer una venta sin red: **no deben
   volver** al reconectar.

Antes de todo eso: **`npm run test:run` completo**.

## 8 · Peticiones de diseño con decisión tomada

En `docs/PENDIENTE_LUNES.md`, con su porqué:

- **§7 · KDS de sólo lectura fuera de tu estación.** Las estaciones van a Roles y
  Permisos (se configura, no se codifica); escotilla por PIN con
  `Autorizacion.js`; una sola guarda para marcar y desmarcar; sin doble toque.
- **§10 · Revocar todos los dispositivos al cerrar turno.** Con confirmación
  diciendo cuántos y si alguno tiene ventas sin confirmar. **Orden obligatorio:
  revocar → drenar → cerrar.** No automático.
- **§9 · La URL por nombre (`invventa-caja.local:3000`) funciona y no se enseña
  en ninguna pantalla.** `Anuncio::url()` existe, está probada, y nadie la llama
  salvo un `println!` que en release no ve nadie.
- **§6 · Dos recortes de interfaz**: el `padding` del contenedor con scroll de
  `MesasScreen` (no el `gap`), y el `whitespace-nowrap` que le falta al
  `Enviado: n` de `PosScreen`.

## 8b · El botón de reimprimir un ticket ya cobrado — a medio camino

`PENDIENTE_LUNES.md` §1, y está **al día**: de sus tres cambios, dos entraron el
17-ago sin querer, arreglando el fallo 2 — que resultó ser este mismo mecanismo
ocurriendo ya en el flujo de la cuenta.

- **Hecho:** el ticket ya no estampa el aviso de copia, y el id cambia en cada
  impresión gracias al contador.
- **Falta:** el botón en **Reportes → Tickets del turno**, y el contador
  equivalente para una venta **ya cobrada**. El de hoy vive en
  `mesa.orden_actual.impresiones` y sirve para la cuenta *antes* de cobrar;
  al cobrar, la mesa se limpia y ese número no llega a la venta. Para reimprimir
  desde Reportes hace falta `ventas.copias_impresas`.
- **Y la auditoría de la reimpresión** ya tiene hermana y precedente:
  `CUENTA_IMPRESA` (`cfbc428`). Conviene que las dos digan lo mismo.

## 9 · Deuda conocida que sigue ahí

`ModalCobro` sin migrar a `lib/Autorizacion.js`; CSP nulo y
`CorsLayer::permissive()` en el hub; `mesas.mesero_id` muerto (bloquea tres de
las cinco propuestas de sala); el archivo que ensucia `matchMedia` entre
ficheros sin localizar; `total_divergente` que calcula un trigger y **nada en el
front lo lee** — y desde el arreglo del fallo 3 el front y Postgres coinciden
exacto, así que ese detector pasa de vivir al borde de gritar por todo a ser
útil de verdad.

## 10 · Cómo trabajar con Chris

Español, directo, sin adornos. Prefiere el porqué antes que el qué. Valora que se
le lleve la contraria con argumentos y que se admitan los errores propios sin
rodeos — el 17-ago hubo que retractarse dos veces y las dos mejoraron la sesión.
Los comentarios del código explican **decisiones**, no mecánica. Preguntar antes
de construir cuando la respuesta cambia el modelo de datos.

Dos cosas que se ganaron en el local y conviene no perder:

- **Cuando conteste «sí» a una pregunta que pedía un número, pedir el número.**
  Dos de los hallazgos del día salieron de insistir en eso.
- **Una prueba que separa dos hipótesis tiene que mover una sola variable.** La
  primera que se diseñó comparaba mesa contra mostrador cuando la variable real
  era nota contra sin nota, y produjo un fallo que no existía.
