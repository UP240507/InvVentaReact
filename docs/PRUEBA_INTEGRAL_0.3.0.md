# Prueba integral de InvVenta antes de cortar la 0.3.0

> Instrucciones para Claude Code. Escritas el 20-sep-2026 con el estado medido el
> 15-sep. **Todo lo que este documento da como «esperado» es una hipótesis que
> hay que medir, no un resultado.**
>
> Uso: desde la raíz del repo, `claude` y luego:
> `Lee docs/PRUEBA_INTEGRAL_0.3.0.md y ejecútalo de principio a fin.`

---

## Qué se te pide

Probar el sistema entero **hasta donde se puede probar desde la máquina**, y
dejar un informe que diga, para cada cosa, **qué comando corriste, qué código
de salida dio, qué números salieron y si coinciden con lo esperado**.

**No arregles nada.** Si algo falla, descríbelo con la salida literal, di dónde
crees que está la causa y sigue con la fase siguiente. Los arreglos los decide
Chris después de leer el informe. La única excepción son los ficheros
temporales que tú mismo crees, que tienes que dejar como estaban.

## Las reglas de este proyecto, que no son negociables

Este proyecto tiene un patrón que lo define: **los errores no dan error**.
Código correcto por los dos lados y el hueco en medio, sin excepción ni log.
Por eso:

1. **Una salida vacía no es un verde.** Mira siempre el código de salida
   (`$LASTEXITCODE` en PowerShell, `$?` / `echo $?` en bash). Ya pasó: un
   `npm run lint` sin salida se dio por bueno y era un *timeout*.
2. **Mide antes de afirmar.** Nada de «debería pasar» ni «parece que funciona».
   Si no lo corriste, en el informe dice «no corrido» y por qué.
3. **Un control negativo que no muerde no demuestra nada.** Cuando rompas algo
   a propósito para ver si una prueba falla y la prueba NO falla, antes de
   concluir que la prueba no sirve comprueba que tu mutación de verdad se
   ejecuta. Ya pasó: se metió la llamada rota dentro de una función que nadie
   invocaba.
4. **Antes de decir «esto no tiene pruebas», haz `ls`.** Ya pasó también.
5. **Tras cada mutación, `git diff --stat` tiene que volver a salir vacío**
   para ese fichero. Si no, restáuralo con `git checkout -- <fichero>` y dilo.

### Lo que NO puedes tocar bajo ningún concepto

- **La base de datos de AZUL.** Es multi-tenant y es la del cliente real. Nada
  de `apply_migration`, `db push`, `db reset`, `INSERT`, `UPDATE`, `DELETE`,
  y **nunca `TRUNCATE`**: no admite `WHERE` y se salta RLS. Sólo lectura.
- **Las E2E que escriben en el tenant vivo**: `e2e/flujo-pos.spec.js` y
  `e2e/realtime-turnos.spec.js` abren turnos, cobran ventas y mueven
  inventario **en AZUL**. Meterían ventas falsas en los libros del cliente y
  ensuciarían el corte Z. No existe todavía un tenant desechable, así que
  **no se corren**. Tampoco `npm run e2e` a secas ni `npm run e2e:ui`, que
  las incluyen.
- **La llave del updater.** No la busques, no la leas, no la imprimas. Si
  aparece en algún fichero, no la muestres: di sólo la ruta. Y **avisa antes
  de cualquier `git add -A`**.
- **`git push`, `git commit`, `npm run publicar`, `npm run version -- <x>`,
  `npm run tauri build`.** Todo eso es de Chris.

---

## Fase 0 · El estado, antes de nada

El traspaso es una hipótesis. Mídelo:

```
git status --short
git log --oneline -5
git rev-list --count 354d9b3..HEAD
git log --oneline origin/main..HEAD
git fetch --tags
git tag
npm run version
```

**Esperado al 15-sep**, que puede haber cambiado:

- HEAD en `badb90b` o posterior; `origin/main` en `badb90b`.
- **Sin commitear** —o ya commiteado si Chris lo hizo— el arreglo de lint
  (9 ficheros: `eslint.config.js`, `localDB.js`, `ComprasScreen.jsx`,
  `MesasScreen.jsx`, `ZonasImpresionScreen.jsx`, `MermasScreen.jsx`,
  `Acciones.js` y los dos tests de censo) y **tres pruebas nuevas**:
  `features/inventario/MermasScreen.test.jsx`,
  `features/operacion/MesasScreen.test.jsx`,
  `features/ajustes/ZonasImpresionScreen.test.jsx`.
- `npm run version` sin argumento lista las cinco versiones y debe decir que
  **coinciden, en 0.2.9**. Si no coinciden, es un hallazgo.

Informa exactamente lo que ves. Si hay cambios sin commitear que no sean los de
arriba, **para y pregúntale a Chris** antes de seguir: podrías estar probando
algo a medias.

---

## Fase 1 · La suite de pruebas

```
npm run test:run
```

**No uses `npm run test:rapido` para decidir nada.** Usa `--isolate=false` y
da falsos fallos: unos ficheros se pisan con otros. Si por curiosidad lo
corres, cualquier fallo suyo sólo cuenta si se reproduce corriendo ese fichero
solo con `npx vitest run <ruta>`.

**Esperado:** 65 ficheros, **1157 pruebas, 0 fallos** (con las tres pruebas
nuevas en el árbol; sin ellas, 62 ficheros y 1149). Da los números exactos.

Si algo falla: la salida literal del fallo, y luego corre ese fichero solo para
saber si es real o de aislamiento.

---

## Fase 2 · Análisis estático

```
npm run lint
npm run format:check
npm run contraste
```

### Lint

**`npm run lint` nunca ha estado en verde en este proyecto**, ni en la versión
que lleva instalada AZUL. Así que el código de salida 1 es lo esperado y no
dice nada por sí solo. Lo que importa es **si el conjunto de errores cambió**.

Esperado, **13 errores y 2 avisos**, todos de esta familia y en estos sitios:

| Regla | Dónde |
|---|---|
| `react-hooks/set-state-in-effect` ×7 | PropineroScreen (2), KdsScreen, ZonasImpresionScreen, ComprasScreen, NominasScreen, PosScreen |
| `react-hooks/purity` ×4 | PropineroScreen (2: `Date.now`, `Math.random`), MermasScreen, RecetasScreen |
| `react-hooks/immutability` ×1 | NominasScreen |
| `react-refresh/only-export-components` ×1 | PanelRondas |
| `react-hooks/exhaustive-deps` ×2 (avisos) | PropineroScreen, RelojChecadorScreen |

**Cualquier error que no esté en esa tabla es un hallazgo**, aunque sea uno.
Si salen 30 en vez de 13, lo más probable es que el arreglo de lint no esté en
el árbol: dilo en vez de listarlos todos.

`format:check` y `contraste`: informa el resultado tal cual.

---

## Fase 3 · El build del front y la prueba de humo

```
npm run build
npm run e2e:humo
```

`e2e:humo` es la única E2E que **se puede correr**: no inicia sesión, no
escribe una fila y no depende del turno. Comprueba que el bundle compilado
arranca y pinta, y que no hay bloqueos de CSP. El `webServer` de
`playwright.config.ts` hace él mismo `npm run build && npm run preview` en el
puerto 4173; si ese puerto está ocupado, dilo en vez de matar el proceso.

Ojo al leer `playwright.config.ts`: los proyectos `setup`, `desktop` e `ipad-*`
inician sesión y mutan AZUL. **Sólo el proyecto `humo`.**

`e2e/render.spec.js` **no** se usa como puerta: compara contra un *snapshot*
que ya daba 27 % de píxeles distintos sin explicar. Si lo corres, es
informativo y tiene que quedar dicho así.

---

## Fase 4 · La caja: Rust

Desde `src-tauri/`:

```
cargo check
cargo test
cargo clippy --all-targets
```

**`cargo test` en Windows nunca se ha corrido** — está marcado como pendiente
en el checklist desde agosto. Hay pruebas en `src-tauri/src/hub/` (escpos,
respaldo, dispositivos, cola, servidor, documento, transporte, anuncio). Da el
número de pruebas y de fallos.

Comprueba además, leyendo, no suponiendo:

- `src-tauri/Cargo.lock` fija `tauri-plugin-opener` en **2.5.5**.
- `src-tauri/capabilities/default.json` incluye `opener:default`, y
  `src-tauri/gen/schemas/capabilities.json` lo tiene generado.
- `src-tauri/src/lib.rs` registra `tauri_plugin_opener::init()`.

**No corras `npm run tauri build`**: necesita la llave de firma, y eso es de
Chris.

---

## Fase 5 · Que lo que la 0.3.0 dice hacer esté de verdad en el código

Esto no es una prueba automática: es leer el código y confirmar cada
afirmación con archivo y línea. Si alguna no se sostiene, es un hallazgo.

1. **El POS registra la apertura del cajón.** En `src/features/pos/PosScreen.jsx`
   la venta en efectivo llama a `abrirCajonConRegistro` con `MOTIVOS.VENTA` y el
   folio. **No debe quedar ningún `void abrirCajon()` suelto** en todo `src/`:
   búscalo con `rg "abrirCajon\(" src`. Esperado, medido el 15-sep: sólo la
   definición en `lib/Hub.js` y dos menciones en comentarios. El cajón se pasa
   como referencia (`abrir: abrirCajon`) a `abrirCajonConRegistro`; **una
   llamada directa en cualquier otro sitio es una apertura sin nombre**.
2. **El botón del cajón lee el PIN, no la sesión.** En
   `src/features/dashboard/BotonAbrirCajon.jsx`, el `usuario` que se registra
   sale de `buscarAutorizador(...)`, no de la sesión.
3. **El pulso al cajón nunca se encola; el registro siempre.** En
   `src/lib/Cajon.js`.
4. **Mandar la orden de compra no vacía el carrito si no abrió.** En
   `ComprasScreen.jsx`, `finalizarFlujoOrden()` sólo corre cuando `abrirFuera`
   devolvió `ok`. Y **no debe quedar `window.open` directo** en esa pantalla:
   `rg "window\.open" src`.
5. **No se importa `@tauri-apps/api` en ningún sitio de `src/`.** Vite resuelve
   los imports dinámicos al transformar y un paquete ausente tumba la suite
   entera: `rg "@tauri-apps" src`.
6. **Todo `minimumFractionDigits` lleva su `maximumFractionDigits`.** Hay una
   prueba que lo exige (`src/test/dinero-con-dos-decimales.test.js`); confirma
   que existe y que pasó en la fase 1.
7. **Los dos cuadros de turno tienen altura máxima.** `AbrirTurnoModal.jsx` y
   `CierreTurnoModal.jsx` llevan `max-h-[90dvh]` en el panel y el cuerpo con
   `overflow-y-auto`. Sin eso, el PIN y el botón de confirmar se recortaban y
   el turno no se podía cerrar.

---

## Fase 6 · Controles negativos: ¿las pruebas saben fallar?

Una prueba que nunca se ha visto fallar no ha demostrado nada. Para cada fila,
aplica la mutación, corre **sólo** esa prueba, anota el resultado, restaura con
`git checkout -- <fichero>` y comprueba que `git diff --stat` vuelve a estar
limpio para ese fichero.

| # | Fichero a mutar | Mutación | Prueba | Debe |
|---|---|---|---|---|
| 1 | `src/features/inventario/MermasScreen.jsx` | Borra la línea que asigna `nuevoStock` en la rama de **alta** | `MermasScreen.test.jsx` | Fallar: `expected undefined to be 58` |
| 2 | `src/features/inventario/MermasScreen.jsx` | Cambia `if (cantidad > stockActual)` por `if (false)` | `MermasScreen.test.jsx` | Fallar la de «no se puede dar de baja más» |
| 3 | `src/features/operacion/MesasScreen.jsx` | Quita `maximumFractionDigits: 2` del total de la tarjeta (el que va con `minimumFractionDigits: 0`) | `MesasScreen.test.jsx` | Fallar: aparece `123.456` |
| 4 | `src/features/ajustes/ZonasImpresionScreen.jsx` | Cambia `zonas_produccion` por `zonas_impresion` en la lectura de la configuración | `ZonasImpresionScreen.test.jsx` | Fallar: aparece «Cocina» |
| 5 | `src/lib/Descuentos.js` | Quita el `maximumFractionDigits: 2` | `src/test/dinero-con-dos-decimales.test.js` | Fallar señalando `lib/Descuentos.js` |
| 6 | `src/lib/Cajon.js` | Haz que el registro de auditoría NO se escriba cuando el pulso falla | `src/lib/Cajon.test.js` | Fallar |
| 7 | `src/lib/Empaques.js` | En `derivarLinea`, redondea `precio_unitario` a 2 decimales | `src/lib/Empaques.test.js` | Fallar |

Si alguna **no** falla, antes de concluir nada aplica la regla 3: comprueba que
la mutación se ejecuta de verdad en el camino que prueba el test. Sólo si se
ejecuta y aun así la prueba pasa, es un hallazgo: esa prueba no defiende lo que
dice.

---

## Fase 7 · Una observación pendiente de confirmar

`src/features/operacion/MesasScreen.jsx`, cerca de la línea 1025, pinta:

```js
`${mesa.comensales_reales}/${capMostrar}`
```

**sin valor por defecto.** En una prueba con una mesa ocupada que no traía ese
campo, la tarjeta dijo `undefined/4`. Puede que sea sólo el mock.

La pregunta que hay que contestar leyendo el código, no suponiendo: **¿hay algún
camino real por el que una mesa pase a `ocupada` o `por_cobrar` sin que se
escriba `comensales_reales`?** Busca todos los sitios que cambian `estado` de una
mesa (`rg "estado: 'ocupada'|estado: \"ocupada\"|por_cobrar" src`) y, para cada
uno, di si fija `comensales_reales`. Concluye «puede pasar, por aquí» o «no
puede pasar, porque…». No lo arregles.

---

## Fase 8 · El informe

Escribe `docs/INFORME_PRUEBA_<AAAA-MM-DD>.md` con esta forma:

1. **Resumen en tres líneas**: ¿se puede cortar la 0.3.0? ¿qué lo impide, si
   algo?
2. **Estado medido** (fase 0).
3. **Una tabla por fase**: comando · código de salida · números · esperado ·
   veredicto (`OK` / `DIFIERE` / `NO CORRIDO`).
4. **Hallazgos**, cada uno con la salida literal, archivo y línea, y tu
   hipótesis de causa marcada como hipótesis.
5. **Lo que no se probó y por qué.** Esto no es relleno: es la mitad del
   informe. Como mínimo:
   - Las E2E que escriben en AZUL (falta el tenant desechable).
   - Las pruebas de **campo**, que no se pueden hacer desde la máquina y
     siguen pendientes: un **cierre de turno con el hub apagado**; **pulsar
     WhatsApp y correo desde la caja instalada** (compilar no es abrir); una
     **recepción real con empaque**, anotando el costo promedio ponderado antes
     y después; y la **barrida de Escape** por los 54 cuadros.
   - El build firmado.
   **No marques ninguna de éstas como hecha.**

No commitees el informe: déjalo en el árbol para que Chris lo lea.

---

## Contexto por si lo necesitas

- ERP/POS multi-tenant y offline-first para restaurantes mexicanos. React +
  Vite + Zustand + Dexie en el front, Supabase con RLS en la nube, Tauri v2 +
  Rust en la caja (hub HTTP en la LAN, ESC/POS, mDNS, updater). Un solo
  cliente: AZUL. Todo —código, comentarios, mensajes— en español.
- `getCapacidades` **reemplaza, no mezcla**: un permiso nuevo llega como
  `undefined` —falso— a todo rol que ya tenga fila en `roles_permisos`. Si ves
  que `abre_cajon` o `autoriza_arqueo` «no funcionan», probablemente es eso.
- El cajón quedó comprobado en campo el 06-sep por sus tres caminos (cierre
  firmado, botón manual y venta en efectivo). Lo que falta de ese módulo es el
  cierre con el hub apagado.
- Checklists del repo con más detalle: `docs/CHECKLIST_VERIFICACION.md`,
  `docs/CHECKLIST_CAMPO.md`, `docs/DISENO_ARQUEO_Y_CAJON.md`.
