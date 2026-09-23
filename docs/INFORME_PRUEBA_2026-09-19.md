# Informe de prueba integral — InvVenta 0.3.0

> Ejecutado el 19-sep-2026 siguiendo `docs/PRUEBA_INTEGRAL_0.3.0.md`, de
> principio a fin, desde la máquina de desarrollo (Windows, PowerShell/Git
> Bash). No se tocó la base de datos de AZUL ni las E2E que mutan el tenant
> vivo. No se arregló nada de lo encontrado.

## 1 · Resumen en tres líneas

Sí se puede cortar la 0.3.0: la suite completa (1157 pruebas), el build, la
prueba de humo, la suite de Rust (93 pruebas) y las siete afirmaciones
funcionales de la 0.3.0 pasan tal cual se documentaron, y los siete controles
negativos muerden. Lo único que la impide sería si Chris decide que dos
hallazgos no bloqueantes merecen arreglarse antes: el ruido de `npm run lint`
por carpetas de build sueltas (no es una regresión de código) y un
`undefined/4` cosmético en el mapa de mesas mientras una mesa recién mandada a
cocina no ha llegado a «pedir la cuenta» (comportamiento por diseño, sin
valor por defecto en la pantalla). Ninguno de los dos toca dinero, RLS ni el
cajón. Lo que sigue pendiente es enteramente lo que el propio documento marca
como no medible desde la máquina: campo, E2E contra AZUL y el build firmado.

## 2 · Estado medido (Fase 0)

| Medición | Resultado |
|---|---|
| HEAD | `badb90b` |
| `origin/main..HEAD` | vacío (HEAD = origin/main) |
| Commits desde `354d9b3` | 29 |
| Tags | v0.2.1 … v0.2.9 (nueve, sin v0.3.0) |
| Cambios sin commitear | Exactamente los 9 ficheros del arreglo de lint (`eslint.config.js`, `localDB.js`, `ComprasScreen.jsx`, `MesasScreen.jsx`, `ZonasImpresionScreen.jsx`, `MermasScreen.jsx`, `Acciones.js`, `escape-en-los-cuadros.test.js`, `modales-teclado.test.js`) + las 3 pruebas nuevas (`MermasScreen.test.jsx`, `MesasScreen.test.jsx`, `ZonasImpresionScreen.test.jsx`) + `docs/PRUEBA_INTEGRAL_0.3.0.md` (el propio encargo) |
| `npm run version` | Las cinco versiones coinciden en **0.2.9** |

Coincide exactamente con lo esperado al 15-sep. No hubo que parar a preguntar:
no había cambios sin commitear fuera de la lista prevista.

## 3 · Una tabla por fase

| Fase | Comando | Código salida | Números | Esperado | Veredicto |
|---|---|---|---|---|---|
| 1 | `npm run test:run` | 0 | **65 ficheros, 1157 pruebas, 0 fallos** | 65/1157/0 | **OK** |
| 2 | `npm run lint` | 1 | **1422 problemas (1416 err, 6 avisos)** en crudo; **dentro de `src/`: 13 errores, 2 avisos**, verificados fichero a fichero contra la tabla | 13 err / 2 avisos | **DIFIERE** (ver Hallazgo 1 — la causa no es el código de `src/`, que sí coincide) |
| 2 | `npm run format:check` | 0 | Todos los ficheros cumplen Prettier | verde | **OK** |
| 2 | `npm run contraste` | 0 | 264 pares, todos cumplen; 24 avisos informativos de borde (documentados como esperados) | verde | **OK** |
| 3 | `npm run build` | 0 | build completo, sin errores | verde | **OK** |
| 3 | `npx playwright test --project=humo` | 0 | 1 passed (33.0s) | 1/1 | **OK** |
| 4 | `cargo check` | 0 | compila | verde | **OK** |
| 4 | `cargo test` | 0 | **93 passed, 0 failed** (anuncio, cola, dispositivos, documento, escpos, respaldo, servidor, transporte) | sin baseline previo (primera corrida en Windows) | **OK** |
| 4 | `cargo clippy --all-targets` | 0 | 8-9 avisos menores (`doc_overindented_list_items`, `filter_next`, `ptr_arg`), 0 errores | sin baseline documentado | **OK** (informativo) |
| 4 | Cargo.lock / capabilities / lib.rs | — | `tauri-plugin-opener` 2.5.5; `opener:default` en `capabilities/default.json` y en `gen/schemas/capabilities.json`; `tauri_plugin_opener::init()` registrado en `lib.rs:339` | las tres afirmaciones | **OK** |
| 5 | 7 afirmaciones de código | — | Las siete se sostienen (detalle abajo) | 7/7 | **OK** |
| 6 | 7 controles negativos | — | Los siete fallan al mutar (detalle abajo) | 7/7 muerden | **OK** |
| 7 | Observación `comensales_reales` | — | **Sí puede pasar** (detalle abajo) | — | Confirmado, no arreglado |

### Detalle Fase 5 — afirmaciones verificadas con archivo y línea

1. **POS registra apertura de cajón.** [PosScreen.jsx:1632](../src/features/pos/PosScreen.jsx) llama `abrirCajonConRegistro({ motivo: MOTIVOS.VENTA, ... })`. `rg "abrirCajon\("` en `src/` sólo encuentra la definición en `Hub.js` y comentarios en `PosScreen.jsx` y `Cajon.js`. Sin llamadas sueltas. **OK.**
2. **El botón de cajón lee el PIN, no la sesión.** [BotonAbrirCajon.jsx:44,62](../src/features/dashboard/BotonAbrirCajon.jsx) — `usuario: quien.nombre` con `quien = buscarAutorizador(...)`. **OK.**
3. **El pulso no se encola; el registro siempre.** [Cajon.js:106-117](../src/lib/Cajon.js) — el bloque `registrar(...)` corre incondicionalmente después del `try/catch` del pulso, y el comentario del propio fichero (línea 22-28) documenta la asimetría a propósito. **OK.**
4. **Compras no vacía el carrito si no abrió.** [ComprasScreen.jsx:419-420](../src/features/compras/ComprasScreen.jsx) — `if (!r.ok) return showToast(...)` antes de `finalizarFlujoOrden()`. `rg "window\.open"` sólo encuentra la implementación real en `lib/Abrir.js` y comentarios/tests; ninguna llamada directa en `ComprasScreen.jsx`. **OK.**
5. **`@tauri-apps/api` no se importa en `src/`.** `rg "from '@tauri-apps/api"` no da resultados. Sólo `@tauri-apps/plugin-updater` (paquete distinto, sí instalado, usado en `Actualizacion.js`) y comentarios explicando por qué. **OK.**
6. **`minimumFractionDigits` siempre con `maximumFractionDigits`.** `src/test/dinero-con-dos-decimales.test.js` existe y pasó en la Fase 1 (2 pruebas). **OK.**
7. **Los dos cuadros de turno caben en pantalla.** `max-h-[90dvh]` + `overflow-y-auto` confirmados en [AbrirTurnoModal.jsx:57,82](../src/features/dashboard/AbrirTurnoModal.jsx) y [CierreTurnoModal.jsx:163,203](../src/features/dashboard/CierreTurnoModal.jsx). **OK.**

### Detalle Fase 6 — controles negativos

| # | Mutación | Resultado | Nota |
|---|---|---|---|
| 1 | `MermasScreen.jsx`: borrar asignación de `nuevoStock` en alta | **Falla**: `expected undefined to be 58` | Exacto a lo predicho |
| 2 | `MermasScreen.jsx`: `if (cantidad > stockActual)` → `if (false)` | **Falla**: la prueba de «no se puede dar de baja más» | Exacto a lo predicho |
| 3 | `MesasScreen.jsx`: quitar `maximumFractionDigits: 2` del total | **Falla**: aparece `123.456` | Exacto a lo predicho; de regalo, el texto renderizado en el mock también mostró `undefined/4` (ver Fase 7) |
| 4 | `ZonasImpresionScreen.jsx`: `zonas_produccion`→`zonas_impresion` en la lectura | **Falla**, pero con un mensaje distinto al previsto: la aserción que revienta primero es `toContain('Plancha')` no encontrado, no la de «Cocina». El texto recibido sí contiene el fallback `Cocina Barra` al final, así que la mutación se ejecutó y la prueba sí defiende lo que dice — sólo el orden de aserciones hace que el mensaje difiera del anticipado en la tabla del encargo | Falla, con matiz |
| 5 | `Descuentos.js`: quitar `maximumFractionDigits: 2` | **Falla**, señalando exactamente `lib\Descuentos.js:88` | Exacto a lo predicho |
| 6 | `Cajon.js`: registrar sólo si `resultado.ok` | **Falla**: 2 pruebas (`si NO abre, se registra igual` y `nunca lanza`) | Exacto a lo predicho |
| 7 | `Empaques.js`: redondear `precio_unitario` a 2 decimales en `derivarLinea` | **Falla**: 2 pruebas (`no se redondea a centavos`, barrido `cantidad × unitario = total`) | Exacto a lo predicho |

Todas las mutaciones se restauraron y `git diff --stat` volvió al estado
previo a cada una (ver Hallazgo 2 sobre un incidente durante la restauración
de la mutación 1, resuelto sin pérdida de trabajo).

### Detalle Fase 7 — `comensales_reales` sin valor por defecto

**Sí hay un camino real.** `rg "estado: 'ocupada'|por_cobrar"` encuentra seis
escrituras reales (fuera de pruebas/comentarios) que llevan una mesa a
`ocupada` o `por_cobrar`:

- [PosScreen.jsx:1136-1140](../src/features/pos/PosScreen.jsx) (`handlePedirCuenta` → cobro) — **sí** fija `comensales_reales: comensalesCuenta` explícitamente.
- [MesasScreen.jsx:374-377](../src/features/operacion/MesasScreen.jsx) (traspasar cuenta) — **sí** fija `comensales_reales: Math.max(destino.comensales_reales || 1, 1)`.
- [MesasScreen.jsx:354-358](../src/features/operacion/MesasScreen.jsx) (mesa origen del traspaso) — conserva o pone en 0, según corresponda.
- [PosScreen.jsx:320-328](../src/features/pos/PosScreen.jsx) (`reabrirCuenta`) — no lo fija explícitamente, pero **conserva** el valor previo vía spread; sólo es alcanzable después de que la mesa ya pasó por `handlePedirCuenta`, que sí lo fija.
- [PosScreen.jsx:1704-1719](../src/features/pos/PosScreen.jsx) (tras cobro parcial, mesa sigue abierta) — mismo caso: conserva lo que ya venía fijado en el cobro anterior.
- **[PosScreen.jsx:948-957](../src/features/pos/PosScreen.jsx) (`ejecutarProduccion`, mandar el PRIMER pedido a cocina) — NO fija `comensales_reales`.** Es la transición real de `libre` a `ocupada` para cualquier mesa recién sentada. El propio comentario del código, en [PosScreen.jsx:1016-1027](../src/features/pos/PosScreen.jsx), lo dice explícitamente: es una decisión deliberada de Chris (21-ago) pedir el número de comensales al **pedir la cuenta**, no al abrir la mesa, porque el número «todavía cambia» mientras se sienta la gente.

**Conclusión:** entre el momento en que un mesero manda el primer pedido a
cocina y el momento en que alguien pide la cuenta de esa mesa, la mesa está
`ocupada` con `comensales_reales` sin definir. [MesasScreen.jsx:1025](../src/features/operacion/MesasScreen.jsx)
pinta `` `${mesa.comensales_reales}/${capMostrar}` `` sin *fallback*, así que
en esa ventana de tiempo —que en servicio normal es la mayor parte de la vida
de cada mesa ocupada— la tarjeta muestra literalmente `undefined/4`. No es un
artefacto del mock de la prueba: es el comportamiento real del diseño
documentado, sin que la pantalla lo compense.

## 4 · Hallazgos

### Hallazgo 1 — `npm run lint` no es estable entre máquinas por carpetas de build sueltas

**Salida literal (extracto):**
```
✖ 1422 problems (1416 errors, 6 warnings)
```
con cientos de errores en ficheros como
`src-tauri\target\debug\_up_\dist\assets\index-BO96AhlP.js` y
`dev-dist\sw.js` (`'importScripts' is not defined`, `'define' is not
defined`, etc.).

**Archivo y línea:** [eslint.config.js:8](../eslint.config.js) —
`globalIgnores(['dist'])` sólo ignora `dist`. `dev-dist/` y
`src-tauri/target/` están en `.gitignore` (confirmado: `git status --ignored`
los marca `!!`) pero NO en los `ignores` de ESLint.

**Hipótesis de causa:** en cualquier máquina donde ya se corrió `npm run dev`
(genera `dev-dist/`) o `cargo build` / `tauri build` (genera
`src-tauri/target/`, que en este caso incluye una copia de `dist/` embebida
en `_up_/dist/` para el bundling de Tauri), `npm run lint` escanea esos
miles de líneas de JS minificado/generado y reporta cientos de errores que no
tienen nada que ver con el código fuente. Verificado línea por línea: dentro
de `src/` el conteo real es exactamente 13 errores y 2 avisos, coincidiendo
con la tabla del encargo. El riesgo es que alguien —o un pipeline de CI mal
configurado— vea «1422 problemas» y concluya que el código se rompió, cuando
la causa es enteramente carpetas de build que nunca deberían haberse
escaneado. Arreglo sugerido (no aplicado): añadir `'dev-dist'` y
`'src-tauri/target'` a `globalIgnores`, o hacer que ESLint respete
`.gitignore`.

### Hallazgo 2 — incidente durante la Fase 6, sin pérdida de trabajo (documentado por transparencia)

Al restaurar la mutación 1 de `MermasScreen.jsx` con `git checkout --
<fichero>`, un `.git/index.lock` huérfano (con fecha 6-sep, de una sesión muy
anterior, sin ningún proceso `git` corriendo) impidió el primer intento.
Tras confirmar que no había ningún proceso activo, se borró el lock. Pero
`git checkout --` no restaura al estado previo a la mutación cuando el
fichero ya tenía cambios sin commitear (como era el caso: `MermasScreen.jsx`
es uno de los 9 del arreglo de lint pendiente) — restaura al commit `HEAD`,
que es una versión **anterior** a esos cambios pendientes. El primer
`checkout` borró sin querer el arreglo de lint pendiente en ese fichero.
Se reconstruyó el contenido exacto a partir de la lectura completa del
fichero hecha al principio de la Fase 6 (antes de mutar), y se verificó con
`git diff` que el resultado coincide, línea por línea, con el único cambio
pendiente esperado. A partir de ahí, las mutaciones sobre los otros dos
ficheros con cambios pendientes (`MesasScreen.jsx`,
`ZonasImpresionScreen.jsx`) se restauraron con la edición inversa exacta, no
con `git checkout --`. `git status --short` al final de la Fase 6 coincide
exactamente con el de la Fase 0. No es un hallazgo sobre el código del
proyecto, sino sobre el propio protocolo de prueba: **`git checkout --
<fichero>` no es una restauración segura cuando el fichero ya tenía cambios
sin commitear antes de la mutación**; hay que usar la edición inversa o
guardar el contenido exacto de antemano.

### Hallazgo 3 — `undefined/4` en el mapa de mesas es reproducible en servicio normal, no sólo en el mock

Ver detalle completo en la Fase 7 arriba. No es un hallazgo de que algo esté
roto respecto a lo documentado — el comportamiento de fijar
`comensales_reales` tarde es una decisión deliberada de Chris — sino que
[MesasScreen.jsx:1025](../src/features/operacion/MesasScreen.jsx) no tiene
*fallback* para ese estado intermedio, que en operación real dura desde que
se manda el primer pedido a cocina hasta que se pide la cuenta (es decir, la
mayor parte del tiempo que una mesa está ocupada). Arreglo sugerido (no
aplicado): `` `${mesa.comensales_reales ?? '—'}/${capMostrar}` `` o similar.

## 5 · Lo que no se probó y por qué

- **`e2e/flujo-pos.spec.js` y `e2e/realtime-turnos.spec.js`.** Escriben en el
  tenant vivo de AZUL (turnos, ventas, movimientos de inventario). No existe
  todavía un tenant desechable. No se corrieron, ni tampoco `npm run e2e` ni
  `npm run e2e:ui` a secas (las incluyen).
- **`e2e/render.spec.js`.** No es una puerta según el propio documento
  (compara contra un snapshot con 27% de diferencia sin explicar). No se
  corrió; si se hubiera corrido, sería puramente informativo.
- **`npm run test:rapido`.** El documento indica explícitamente no usarlo
  para decidir nada (dan falsos fallos con `--isolate=false`). No se corrió.
- **Cierre de turno con el hub apagado.** Prueba de campo, no reproducible
  desde la máquina de desarrollo. Pendiente.
- **Pulsar WhatsApp y correo desde la caja instalada.** Requiere la caja
  compilada e instalada de verdad; compilar (`cargo build`) no es lo mismo
  que abrir el enlace desde WebView2 en el hardware real. Pendiente.
- **Recepción real con empaque, con costo promedio ponderado antes/después.**
  Prueba de campo con datos reales de un proveedor. Pendiente.
- **Barrida de Escape por los 54 cuadros.** Prueba manual de campo. Sólo se
  verificó, vía Fase 1, que las suites automatizadas relacionadas
  (`escape-en-los-cuadros.test.js`, `useCierreConEscape.test.jsx`, `Escape.test.js`)
  pasan; eso no sustituye la barrida manual.
- **El build firmado (`npm run tauri build`).** Requiere la llave de firma,
  que es de Chris. No se corrió, ni se buscó ni se leyó la llave en ningún
  fichero.

Ninguna de estas quedó marcada como hecha.

---

## 6 · Revisión del informe (20-sep)

Revisado contra el código, contra los ficheros en disco y contra la base de
AZUL. **Lo sustantivo se sostiene**: los números de la Fase 1, la suite de
Rust, el build, el humo, las siete afirmaciones y los siete controles
negativos. Tres correcciones y una confirmación.

### 6.1 · El Hallazgo 3 estaba mal: en operación real dice `0/4`, no `undefined/4`

La conclusión de la Fase 7 —que la tarjeta muestra `undefined/4` «la mayor
parte del tiempo que una mesa está ocupada»— **no se sostiene**. La lectura del
código era correcta: `ejecutarProduccion` no fija `comensales_reales`, y
`MesasScreen:1025` no tiene valor por defecto. Lo que falta es de dónde sale
ese campo cuando nadie lo fija ahí:

- En Postgres, `mesas.comensales_reales` tiene **valor por omisión `0`**, y en
  **toda** la base hay **cero filas con nulo** (medido el 20-sep, sólo lectura).
  Las tres mesas de AZUL están en `0`.
- Una mesa creada desde la pantalla nace con `0`
  ([MesasScreen.jsx:270](../src/features/operacion/MesasScreen.jsx)).
- Al liberarse, la mesa vuelve a `comensales_reales: 0`
  ([PosScreen.jsx:1742, 1770, 1784](../src/features/pos/PosScreen.jsx)).
- `ejecutarProduccion` hace *spread* de la mesa actual, así que **conserva** ese
  `0` en vez de dejarlo sin definir.
- Y el mesero puede ajustarlo durante el servicio con el contador del POS
  ([PosScreen.jsx:563-567](../src/features/pos/PosScreen.jsx)), que ya pinta
  `—` cuando vale cero ([PosScreen.jsx:2115](../src/features/pos/PosScreen.jsx)).

**Lo real, entonces:** entre el primer pedido y el momento de pedir la cuenta,
la tarjeta del mapa dice **`0/4`**, no `undefined/4`. El `undefined` sólo
aparece con datos en memoria a los que les falta el campo — que es exactamente
el caso del *mock* de la prueba donde se vio.

Queda una pregunta de diseño, no un defecto: si `0/4` en una mesa ocupada se
lee como «cero comensales» y conviene pintar `—/4` como ya hace el POS. Decide
Chris.

**Por qué se coló:** la cadena se siguió hasta donde alcanzaba el código de la
pantalla y se paró ahí. El valor no lo ponía la pantalla: lo ponían la columna
de la base y otros tres sitios del POS. Es la regla de la casa aplicada a sí
misma — **comprobar la cadena entera**, y la cadena de un campo incluye su
valor por omisión en Postgres.

### 6.2 · El Hallazgo 2 fue culpa del encargo, no de quien lo ejecutó

`docs/PRUEBA_INTEGRAL_0.3.0.md` mandaba restaurar cada mutación con
`git checkout -- <fichero>`. Para un fichero que **ya tenía cambios sin
commitear** —como los nueve del arreglo de lint— eso no deshace la mutación:
devuelve el fichero a `HEAD` y **se lleva por delante el trabajo pendiente**.
La instrucción estaba mal escrita.

Lo reportado se comprobó: los **15 ficheros** tocados durante la prueba —los 9
del arreglo de lint, las 3 pruebas nuevas y los 3 mutados de `lib/`— son
**idénticos byte a byte** a los verificados el 15-sep, incluido el
`MermasScreen.jsx` que hubo que reconstruir. **No se perdió nada.**

Para la próxima: guardar una copia del fichero antes de mutarlo y restaurarla,
o aplicar la edición inversa exacta. Nunca `git checkout --` sobre un fichero
con cambios pendientes.

### 6.3 · El Hallazgo 1 era correcto, y ya está arreglado

Confirmado y aplicado en `eslint.config.js`: `globalIgnores` pasa de `['dist']`
a `['dist', 'dev-dist', 'src-tauri/target']`.

Comprobado con un control negativo, no por inspección: en un clon limpio se
plantaron a mano un `dev-dist/sw.js` y un
`src-tauri/target/debug/_up_/dist/assets/index-TEST.js` con errores típicos de
código generado.

| Estado | `npx eslint .` |
|---|---|
| Antes del arreglo, con las dos carpetas | **17 errores** (13 reales + 4 de la basura) |
| Después del arreglo, con las dos carpetas | **13 errores** |
| Después del arreglo, sin las dos carpetas | **13 errores** |

El número deja de depender de si en esa máquina se compiló antes, que era el
fondo del asunto. Suite completa tras el cambio: **1157 pruebas, 0 fallos**.
`format:check` en verde.

### 6.4 · Lo que sigue igual

El veredicto no cambia: **la 0.3.0 se puede cortar**. Y lo pendiente sigue
siendo lo mismo, sin que nada de esta revisión lo mueva: el cierre de turno con
el hub apagado, pulsar WhatsApp desde la caja instalada, la recepción real con
empaque, la barrida de Escape, las E2E contra un tenant desechable que todavía
no existe, y el build firmado.
