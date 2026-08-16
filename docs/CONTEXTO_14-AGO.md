# Contexto para retomar — cierre del 14-ago-2026

> **Superado por `docs/CONTEXTO_15-AGO.md`.** La prueba de campo del §6 ya se
> hizo; su resultado está en `docs/VERIFICADO_15-AGO.md`. Este documento se
> conserva porque §1, §3, §4, §8, §9 y §10 siguen vigentes tal cual.

Documento de traspaso. Pegar o referenciar al abrir conversación nueva.

---

## 1 · Qué es esto

**InvVentaReact** — ERP/POS multi-tenant, *offline-first*, para restaurantes
mexicanos. Repo `UP240507/InvVentaReact`, carpeta
`C:\Users\Usuario\Documents\DEV\InvVenta`.

- **React + Vite + Zustand + Dexie** (front), **Supabase/Postgres con RLS**
  (nube), **Tauri v2 + Rust** (la caja: hub HTTP en LAN, impresión ESC/POS,
  mDNS, updater).
- La caja sirve la app por LAN a teléfonos y tablets; los meseros trabajan
  desde el móvil contra el hub.
- **Cliente único: AZUL.** Todavía usan Soft Restaurant en paralelo.
- Todo el código, los comentarios y los mensajes van **en español**.

## 2 · Estado exacto ahora mismo

- Las tres versiones alineadas en **0.2.3** (`npm run version` lo verifica).
- Publicado en GitHub: **v0.2.2** (con modificadores). La 0.2.3 está compilada
  o por compilar, **falta publicarla** con `npm run publicar -- "…"`.
- Últimos commits: `14cecfb` (updater), `4f381ed` (script publicar),
  `401561e` (modificadores).
- Sin confirmar: `docs/PENDIENTE_LUNES.md`, `docs/DISENO_CONSUMOS_PERSONAL.md`,
  `src-tauri/Cargo.lock`.
- Pruebas: **668 pasan**. `src/test/imports-caja.test.js` puede dar timeout en
  máquinas lentas (5,7 s contra un límite de 5); no es un fallo real.
- `--isolate=false` (`npm run test:rapido`) produce **6 fallos intermitentes**
  conocidos en `useConectividad`. Preexistentes, documentados.

## 3 · El patrón que define este proyecto

**Los errores no dan error.** Es la firma de todos los fallos encontrados:
código correcto por ambos lados y el hueco justo en medio, sin excepción ni
log. Van ya, entre otros: el `u128` que no serializaba y no escribía nada al
disco; `decrementar_stock` descontando dos veces; el updater sin botón;
`ancho_papel` ausente de `hub_estado` (un selector que mentía); los
modificadores que se configuraban y no llegaban a ninguna parte; la pestaña
Impresoras que guardaba una lista que nadie lee.

**Ninguno lo encontró una prueba. Todos se encontraron mirando.** La conducta
correcta al abordar cualquier cosa aquí es *comprobar la cadena entera antes de
afirmar que funciona* — grep del consumidor, leer el trigger, mirar la captura,
consultar `pg_proc.proacl` en vez de fiarse de un `success: true`.

## 4 · Restricciones permanentes (seguridad)

- **La llave privada del updater (`~/.tauri/invventa.key`) NUNCA va al
  repositorio.** El 13-ago se coló en un commit vía `git add -A`; se purgó con
  `filter-branch` sin haber llegado a pushearse. `*.key`, `*.key.pub` y `~/`
  están en `.gitignore`. **Avisar siempre antes de un `git add -A`.**
- `TAURI_SIGNING_PRIVATE_KEY` y `..._PASSWORD` son **sólo de la sesión de
  shell**. Nunca en `.env`. El `firmar.ps1` vive **fuera** del repo.
- **Certificado de firma de código: descartado** (Chris, 11-ago). Se
  reconsidera cuando haya ingresos. Consecuencia asumida: SmartScreen enseña el
  aviso azul en cada actualización, y por eso el updater **nunca** instala en
  silencio.
- **GitHub Actions descartado por ahora**: exigiría la llave privada en los
  secretos de GitHub. Ver `CHECKLIST_ACTUALIZACIONES.md` §6.
- `/hub/respaldo/pendientes` exige **`autorizado_admin`**, nunca el token
  ordinario de dispositivo: devuelve las ventas del local entero.
- El hub **jamás** guarda credenciales de Supabase ni `service_role`. Sólo
  bytes opacos.
- En Postgres: `REVOKE … FROM PUBLIC` (no `FROM anon`), y verificar con
  `pg_proc.proacl`.

## 5 · Lo que se hizo el 14-ago

### Modificadores y notas por platillo (entró para la prueba del sábado)

El diagnóstico real: **el POS no tenía ninguna forma de personalizar una
línea** — ni modificadores ni nota. Cero referencias. Todo lo demás llevaba
meses construido esperando el dato: `Comanda.js` ya aceptaba `nota`, el KDS ya
la pintaba, `TicketImpresion` ya sabía dibujar sublíneas.

- **`src/lib/Modificadores.js`** (nuevo, 26 pruebas). La matriz 2×2
  única/múltiple × obligatorio fuera de React. Lo crítico:
  `firmaDeLinea()` mete la selección y la nota en el id de línea — **término
  medio y bien cocido son dos líneas**; sin eso se funden en «2x» y la cocina
  saca dos iguales.
- **`PosScreen.jsx`**: modal «¿Cómo lo quiere?» al tocar un platillo con
  grupos; nota libre desde el icono 📝 de la línea (bloqueada si ya salió a
  cocina). Un producto sin grupos entra **de un solo toque** — a propósito.
- **El eslabón roto estaba en `construirItemsComanda`** (`lib/Inventario.js`):
  arma el item **campo a campo, sin spread**, así que todo dato nuevo se perdía
  en silencio. Corregido y con prueba.
- `Comanda.js` imprime las opciones como sublíneas (sin precio, a propósito);
  el KDS las pinta en grande.
- **NO suman precio ni descuentan inventario.** Decisión de Chris, para no
  ensuciar la verificación de stock del sábado.
- Se corrigió la contradicción del catálogo («elegir varios *o ninguno*» junto
  a «El cajero DEBE seleccionar») con `textoDeReglas()`, compartida entre el
  catálogo y el POS.

### Otros arreglos

- **Pestaña «Impresoras» de Configuración Global: ocultada.** Guardaba una
  lista que nadie lee, y el hub tiene **un solo `transporte`**, así que su
  promesa («cada zona puede tener su impresora») era imposible.
- **Jerga de programador fuera de pantalla**: los dos `npm run build` de
  `HubScreen` le hablaban al dueño del restaurante.
- **`scripts/publicar.mjs`** + `npm run publicar`. Cierra los tres agujeros
  silenciosos de publicar a mano. Dos fallos propios corregidos en el camino:
  se tragaba el stderr de `gh` (ocultaba la causa), y `shell: true` en Windows
  partía la nota en palabras sueltas.
- **Updater arreglado**: `download_and_install` exige `rid` + un `onEvent` tipo
  Channel; se llamaba sin argumentos. Ahora usa `@tauri-apps/plugin-updater`.
  Y «Versión instalada: —» salía de `info.version` (del hub), que nunca la ha
  devuelto; ahora se le pregunta a Tauri.
  **Ojo: el arreglo sólo actúa una vez que la 0.2.3 esté INSTALADA**, y no está
  probado — hace falta una 0.2.4 a la que saltar.

## 6 · Sábado 15-ago, 16:00 — la prueba de campo

Tarea programada `verificacion-invventa-azul`. Guion:
`docs/CHECKLIST_VERIFICACION.md`.

- **Mañana:** Chris solo, ventas sin impresión y **descuento de stock** (lo que
  de verdad se verifica).
- **Tarde:** impresión.
- **§5b es nueva** — modificadores y notas. Incluye preparar catálogo antes:
  hoy sólo Chilaquiles tiene grupo atado, y las tres opciones de «Tipo de
  leche» apuntan por error al mismo producto.
- **El paso que se olvida:** un grupo no aparece en el POS hasta que se ata en
  **Recetas**. Sin eso parece roto.
- Instalar el `.exe` **a mano** en la caja. Publicar no instala nada.

## 7 · Lunes — `docs/PENDIENTE_LUNES.md`, 10 secciones

Primero de todo: **CI** (`cargo test` + `npm run test:run`, sin E2E el primer
día). Luego:

1. Reimpresión de ticket — duplicado exacto, `copias_impresas`, auditoría.
2. Gastos en dos pestañas (caja chica / caja grande), columna `caja` nueva —
   **no reutilizar `gastos.origen`**.
3. Los dos fallos E2E: regex del folio y el bug de layout de OpsHeader en
   tablet — **arreglar antes de regenerar el snapshot**.
4. Notas fiscales de gastos (sin decidir; falta saber si AZUL es Persona Moral
   o RESICO).
5. **Impresión de reportes**: el Corte Z y el vale de propina usan
   `window.open` + `win.print()`, patrón de navegador que **en Tauri no hace
   nada**; y aunque funcionara imprimiría en A4, no en la térmica. Van a la
   cola del hub como ESC/POS.
6. **Logo**: `logo_url` sólo lo lee su propia vista previa. En pantalla es
   trivial; en térmica no hay una línea de raster en `escpos.rs`. Y antes hay
   que decidir el almacenamiento: es una URL, y una caja sin internet no puede
   descargarla.
7. Mantener el barrido de jerga de programador.
8. **Precio y stock de los modificadores.** Bloqueante para los consumos.
9. Curva de aprendizaje de modificadores: falta avisar de que el grupo no hace
   nada hasta atarlo en Recetas, vista previa, panel de ayuda, y el vínculo con
   inventario que viene apagado por defecto.
10. **Consumos de personal** → `docs/DISENO_CONSUMOS_PERSONAL.md`.

## 8 · Consumos de personal — lo último que se diseñó

**Regla real de AZUL, por ingrediente y no por platillo:** van gratis tortilla,
huevo, crema, queso fresco, verdura simple, tés, aguas de fruta y cafés; a todo
lo demás **25 % de descuento**. Los chilaquiles salen gratis *porque están
hechos de cosas gratis*.

Caso literal a fijar en las pruebas: chilaquiles con arrachera, **140 el
cliente**, **33.75 el trabajador** (45 del extra × 0.75). Del inventario salen
las dos cosas completas.

Piezas: bandera `cobrable_personal` en `productos` (**en
`IngredientesScreen`, no en pantalla nueva**), defecto por categoría con
excepción por ingrediente, y filtro **«sin decidir»** para que ningún
ingrediente caiga en sí o en no sin que alguien lo elija.

Tres cosas que hoy no existen y hacen falta: tabla `consumos` con `staff_id`
real, **deducciones en `nominas`** (hoy `gran_total = sueldos + propinas`, nada
resta) y el concepto de **sueldo neto**. El candado contra el doble cobro es
`nomina_id` en cada consumo — mismo patrón que `stock_salidas` y `crm_canjes`.

**Y el dueño rompe el modelo:** no tiene nómina, así que su consumo quedaría a
cargo y sin cobrar para siempre. Salida explícita en pantalla: cortesía, o
*retiro del propietario* en su propio cubo.

## 9 · Deuda conocida, no urgente

`auditoria.id` sigue en `Date.now()` (`SERIE_AUDITORIA='U'` existe sin usarse);
CSP en `null` y `CorsLayer::permissive()`; `ModalCobro` sin migrar a
`lib/Autorizacion.js`; §F del flujo de cuenta; `SidebarLayout`/`EmpleadoRoute`
leyendo capacidades de `user`; `comprobante_url` existe en la base y
`GastosScreen` no lo usa; `total_divergente` lo calcula un trigger y **nada en
el front lo lee** (media hora convertiría un detector mudo en una alerta).

## 10 · Cómo trabajar con Chris

Español, directo, sin adornos. Prefiere el porqué antes que el qué. Valora que
se le lleve la contraria con argumentos y que se admitan los errores propios
sin rodeos. Los comentarios del código explican **decisiones**, no mecánica —
ese estilo es deliberado y hay que mantenerlo. Preguntar antes de construir
cuando la respuesta cambia el modelo de datos.
