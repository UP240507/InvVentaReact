# Contexto para retomar — cierre del 15-ago-2026

> **Superado por `docs/CONTEXTO_17-AGO.md`.** Los siete fallos que este documento
> deja abiertos están arreglados o decididos. Se conserva por el relato de la
> verificación en el local.

Documento de traspaso. Sustituye a `CONTEXTO_14-AGO.md`, que sigue siendo válido
para todo lo que no se toca aquí (§1, §3, §4, §8, §9 y §10 de aquel documento no
han cambiado).

---

## 1 · Qué es esto

**InvVentaReact** — ERP/POS multi-tenant, *offline-first*, para restaurantes
mexicanos. Repo `UP240507/InvVentaReact`, carpeta
`C:\Users\Usuario\Documents\DEV\InvVenta`.

- **React + Vite + Zustand + Dexie** (front), **Supabase/Postgres con RLS**
  (nube), **Tauri v2 + Rust** (la caja: hub HTTP en LAN, impresión ESC/POS,
  mDNS, updater).
- **Cliente único: AZUL.** Todavía usan Soft Restaurant en paralelo.
- Todo el código, los comentarios y los mensajes van **en español**.

## 2 · Estado exacto ahora mismo

- Versión **0.2.3**, **compilada e instalada en la caja de AZUL**. Confirmado en
  Ajustes → Hub, que además es el propio detector: la versión salía como «—» en
  los binarios anteriores.
- Pruebas: `cargo test` y `npm run test:run` en verde el 15-ago. Es la primera
  vez que compilan el pulso del cajón, `respaldo.rs`, `anuncio.rs` y el plugin
  del updater.
- `--isolate=false` (`npm run test:rapido`) sigue con **6 fallos intermitentes**
  conocidos en `useConectividad`. Preexistentes, documentados.
- Sin confirmar en git: `docs/CONTEXTO_14-AGO.md`,
  `docs/DISENO_CONSUMOS_PERSONAL.md`, `src-tauri/Cargo.lock`.

> **Aviso de entorno:** trabajando contra la carpeta montada, git deja
> `index.lock` y `HEAD.lock` que no se pueden borrar desde la sesión y bloquean
> la operación siguiente. Se borran a mano desde PowerShell. Huele a handles
> abiertos por el editor, el `npm run dev` o el indexador.

## 3 · El patrón que define este proyecto

**Los errores no dan error.** La verificación del 15-ago lo confirmó cuatro veces
más: una venta que Postgres rechaza y nadie ve; un papel que no sale porque el
hub lo consideró duplicado y eso «no es un error»; un centavo de más que ninguna
alarma detecta porque cae justo bajo la tolerancia; y un botón de recuperación
que falla diciendo que no había nada que hacer.

**Ninguno lo encontró una prueba. Todos se encontraron mirando** — y dos de los
cuatro los vio Chris en un papel, no en una pantalla.

La conducta correcta al abordar cualquier cosa aquí es *comprobar la cadena
entera antes de afirmar que funciona*.

## 4 · Restricciones permanentes (seguridad)

Sin cambios respecto al 14-ago. En resumen: la llave privada del updater nunca al
repositorio; `TAURI_SIGNING_PRIVATE_KEY` sólo en la sesión de shell; certificado
de firma de código descartado; GitHub Actions descartado; el hub jamás guarda
credenciales de Supabase. **Avisar siempre antes de un `git add -A`.**

Un dato corregido el 15-ago: `tauri.conf.json` **ya tiene la `pubkey` pegada de
verdad**, no el marcador de posición. Lo que sigue haciendo falta para compilar
el bundle es exportar la llave privada y su contraseña en la misma sesión de
shell, o revienta al firmar, al final del build.

## 5 · La verificación en AZUL del 15-ago

Documento completo: **`docs/VERIFICADO_15-AGO.md`**. Lo pendiente:
**`docs/CHECKLIST_VERIFICACION.md`**, que a partir de ahora sólo contiene eso.

**La mañana no se hizo.** Todo se midió por la tarde, con la impresora real.

**Verificado:** §0, §1, §2, §3, §4, §5, §5b, §6, §7, el descuento de inventario
idempotente (80 kg → 79.8 tras el reintento) y el respaldo de ventas de la caja.

**Pendiente:** §8 (avisos del KDS), §9 (la salida del barista), §10 (el teléfono
muerto, `stock_salidas` en la nube, mDNS, la ronda del updater) y §11 (lo
responsivo en un teléfono de verdad). Más el pulso del cajón, que sigue sin
poderse comprobar: el de AZUL está averiado.

**Cuatro fallos**, en `PENDIENTE_LUNES.md` §0 con su orden:

1. El trigger que castea `it->>'id'` a `bigint` — la venta con nota o
   modificador no llega a Supabase.
2. La reimpresión tras reabrir una cuenta no imprime y no avisa.
3. Dos jugos de $40 se cobran a $80.01.
4. «Recuperar ahora» falla y dice que no había nada que recuperar.

> **Dos cosas operativas hasta que el 1 esté arreglado:** que nadie use notas ni
> modificadores en ventas reales, y no borrar los datos del navegador de la
> caja. La venta `AZULJ3-V-000006` (total 209) sólo vive ahí.

### Lo que se aprendió sobre cómo verificar

- **Vaciar la cola del hub antes de contar papeles.** Al reconectar la impresora
  salió un documento de tres días antes; en medio de §3 se habría contado como
  el segundo papel que no debía salir.
- **Una prueba que separa dos hipótesis tiene que mover una sola variable.** La
  primera que se diseñó comparaba mesa contra mostrador cuando la variable real
  era nota contra sin nota, y produjo un quinto fallo que no existía.
- **La consola no existe en producción.** `tauri` está declarado sin la feature
  `devtools`, así que ningún paso de diagnóstico puede depender de ella.

## 6 · Lo del lunes

`docs/PENDIENTE_LUNES.md`, ahora con un **§0** delante: primero los cuatro
fallos, en ese orden y por dependencia. Los fallos 2 y §1 del documento (la
reimpresión del ticket) **son el mismo mecanismo** y conviene arreglarlos a la
vez — §1 ya había descrito la trampa en abstracto sin saber que ya estaba
ocurriendo.

Después, lo que ya estaba: CI, gastos en dos cajas, los dos fallos E2E, lo
fiscal de los gastos, la impresión de reportes, el logo, precio y stock de los
modificadores, y los consumos de personal.

## 7 · Cómo trabajar con Chris

Español, directo, sin adornos. Prefiere el porqué antes que el qué. Valora que se
le lleve la contraria con argumentos y que se admitan los errores propios sin
rodeos — el 15-ago hubo que retractarse de un diagnóstico a media verificación y
eso mejoró la sesión, no la empeoró. Los comentarios del código explican
**decisiones**, no mecánica. Preguntar antes de construir cuando la respuesta
cambia el modelo de datos.

Y una que quedó clara en el local: **cuando conteste «sí» a una pregunta que
pedía un número, pedir el número.** Dos de los hallazgos del día salieron de
insistir en eso.
