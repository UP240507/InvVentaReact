# Prueba con hardware — Fase 3 (hub LAN + impresión)

> Guion para el día que haya impresora y teléfono delante. Está ordenado de
> menos a más dependiente del hardware: cada paso que pasa reduce el número de
> cosas que pueden estar fallando en el siguiente. Si algo se rompe en el paso 4,
> ya sabes que 1–3 estaban bien, y eso es la mitad del diagnóstico.

## Estado de la verificación (5-ago)

**Compilado y probado:**

- **`cargo test` sobre los módulos del hub: 37 aserciones, 0 fallos, 0 warnings.**
  (29 del hub original + 8 del registro de dispositivos.)
  Se hizo en un crate suelto con los cuatro módulos de `src-tauri/src/hub/` —no
  dependen de Tauri, así que no hacen falta las librerías de sistema que Tauri
  exige en Linux. Cubre `escpos.rs`, `cola.rs`, `documento.rs` y `transporte.rs`.
- **`cargo check` con axum: limpio.** Incluye `servidor.rs`, sus rutas y los
  tipos de retorno de los handlers.
- **El bloque `cfg(windows)` de `transporte.rs`: type-checkeado.** No se puede
  compilar para el target de Windows sin `rustup` (bloqueado por allowlist), así
  que se levantó un crate espejo con las firmas **copiadas literalmente del
  fuente de `windows` 0.58** y se compiló el bloque contra ellas.

  **Límite real de esa técnica, descubierto al compilar en Windows (5-ago):** el
  espejo no reproducía las *puertas de compilación* del crate, así que no podía
  detectar que faltaban features. `OpenPrinterW` y `PRINTER_DEFAULTSW` están
  detrás de `Win32_Graphics_Gdi`, y `PRINTER_INFO_2W` además detrás de
  `Win32_Security`. Con solo `Win32_Graphics_Printing`, el error no dice "falta
  una feature": dice **"no existe `OpenPrinterW` en Win32::Graphics::Printing"**
  y sugiere `GetPrinterW`, que es otra función. Corregido en `Cargo.toml`, y
  verificados los 13 items del crate que usa el módulo: solo esos dos estaban
  gateados.

  El espejo sigue sin verificar el layout de los structs ni el comportamiento
  contra el spooler.
- **89 aserciones de JS** (`lib/Comanda.js` 35, `lib/Hub.js` 31, `lib/QR.js` 29
  más las 34 de `lib/Recuperacion.js`), ESLint y Prettier limpios.
- **El codificador QR está verificado contra `qrcode`**, la librería de
  referencia, módulo a módulo, en 14 vectores que barren las versiones 1–10.
  Esa librería se instaló solo en el entorno de verificación: el proyecto no
  carga con ella.

**Regresión corregida el 29-jul:** la primera versión de `lib/Hub.js` hacía
`await import('@tauri-apps/api/core')`. Vite resuelve los imports dinámicos de
cadena literal al transformar, así que un paquete ausente tumbaba **cualquier**
prueba que tocara ese archivo — incluida `PosScreen.integration.test.jsx`, que no
tiene nada que ver con imprimir. Ahora la llamada IPC va por el puente que Tauri
**ya inyecta** en la ventana (`window.__TAURI_INTERNALS__.invoke`, que es lo que
el paquete envuelve por dentro): cero dependencias nuevas, cero chunk extra en el
bundle del teléfono, y una función que solo corre dentro de Tauri no puede
romperle las pruebas al resto de la app. Cuatro aserciones nuevas lo fijan,
incluida la de que una ventana de Tauri **sin** puente degrada en vez de lanzar.

**Dos fallos reales que salieron de compilar:**

1. `EnumPrintersW` recibía `None` en el parámetro del nombre del servidor. Ese
   argumento es genérico sobre `Param<PCWSTR>` y `None` a secas no le da al
   compilador con qué resolver el tipo: **no compilaba**. Ahora es
   `PCWSTR::null()`, que además dice lo que significa — "el equipo local".
2. Una aserción del plegado de acentos estaba mal escrita (esperaba que `Crème`
   acabara en `é`). El código estaba bien; la prueba, no.

**Lo que sigue sin verificar, y hay que saberlo antes de empezar:**

- **`src-tauri/src/lib.rs`** — los comandos de Tauri y el `setup`. Necesita
  compilar Tauri, que en Linux pide webkit2gtk y no hay permisos para
  instalarlo. Es la capa más fina (siete comandos que delegan), pero es código
  no compilado.
- **La versión de axum.** Se verificó contra **0.8.1**, porque el `rustc` que hay
  en apt es 1.75 y axum 0.8.9 pide 1.80. La API no cambia dentro de 0.8.x, pero
  tú vas a resolver 0.8.9 con un toolchain moderno. Si algo chirría ahí, será en
  `servidor.rs`.
- **Las pruebas de `servidor.rs`.** El crate completo pasa `cargo check --tests`
  limpio —los tipos y el código de prueba compilan—, pero enlazar el binario de
  pruebas excedía el límite de tiempo por comando del entorno donde se escribió
  esto. Las 8 del registro de dispositivos sí corrieron y pasaron.
- **Todo lo que toca hardware**, que es de lo que va este documento.
- **`npm test` y `npm run build` completos en Windows.** Los `node_modules` del
  repo son binarios de esa plataforma, así que las pruebas nuevas se corrieron en
  un entorno aparte.

---

## Qué se montó

| Pieza | Dónde | Qué hace |
|---|---|---|
| Motor de documentos | `src/lib/Comanda.js` | Decide **qué** se imprime: separa la comanda por estación, arma el ticket con descuentos. Puro y con 35 aserciones. |
| Cliente del hub | `src/lib/Hub.js` | Manda documentos por IPC (caja) o HTTP (teléfono). Nunca lanza excepción. 21 aserciones. |
| Contrato | `src-tauri/src/hub/documento.rs` | Espejo del documento en Rust. Deliberadamente tonto. |
| Motor ESC/POS | `src-tauri/src/hub/escpos.rs` | Decide **cómo** se pinta: 32 columnas, CP850, corte, cajón. |
| Transporte | `src-tauri/src/hub/transporte.rs` | Por dónde salen los bytes: simulador, USB/Windows, red. |
| Cola | `src-tauri/src/hub/cola.rs` | Reintentos, persistencia y descarte de duplicados. |
| Servidor | `src-tauri/src/hub/servidor.rs` | Sirve la app a la LAN y recibe impresiones. |
| Dispositivos | `src-tauri/src/hub/dispositivos.rs` | Quién está emparejado, con SU propio token, y revocación. |
| Códigos QR | `src/lib/QR.js` | Codificador sin dependencias, verificado contra la referencia. |
| Diagnóstico | `src/features/ajustes/HubScreen.jsx` → `/hub` | Todo lo anterior, visible y accionable sin terminal. |

**La regla que atraviesa todo:** el cobro nunca se bloquea por la impresora. Si
en algún momento de la prueba el POS se queda esperando por culpa del papel, eso
es un fallo de diseño y no un ajuste de configuración.

---

## Paso 0 · Compilar (sin hardware)

```bash
npm install                 # sin dependencias nuevas; por si acaso
npm run test:run            # las 89 aserciones nuevas + las que ya había
npm run build               # que el bundle no se rompa con el import dinámico
cd src-tauri && cargo test  # las pruebas de Rust; NUNCA se han corrido
cd .. && npm run tauri dev  # que la ventana levante
```

**Qué debe pasar:** `cargo test` da **37 aserciones en verde** y en la consola de
la caja aparece `[hub] escuchando en http://192.168.x.x:3000`.

**Si `cargo` falla**, por probabilidad decreciente y según lo que ya se verificó:

1. **`lib.rs`** — es lo único que no se ha compilado nunca. Los comandos de Tauri
   y el `setup`.
2. **`servidor.rs` con axum 0.8.9** — se verificó contra 0.8.1. Misma API menor,
   pero no es la misma versión exacta.
3. **El bloque de Windows en `transporte.rs`** — type-checkeado contra las firmas
   reales de `windows` 0.58, así que aquí lo que puede fallar no es el tipo sino
   el enlazado o el layout de `PRINTER_INFO_2W`.
4. Nombres de features de `tokio` en `Cargo.toml`.

**Si el hub no arranca pero la app sí:** correcto y deliberado. La app tiene que
poder cobrar sin hub. El motivo sale por la consola y en `/hub`.

---

## Paso 1 · Simulador (sin hardware todavía)

Todo el circuito —documento, cola, reintentos, maquetado— se valida antes de
tocar una impresora. Si algo falla aquí, no es culpa del hardware.

1. Abre **Sistema → Hub e impresora** (`/hub`).
2. Comprueba que dice **Hub activo** y muestra dirección, token y transporte
   `simulador (...)`.
3. Pulsa **Ver sin imprimir**.

**Qué debe verse:** el ticket de prueba maquetado en 32 columnas, con los
importes pegados a la derecha, el nombre largo del platillo partido en varias
líneas y los acentos (`Ñoquis`, `jalapeño`, `crème`) legibles.

- Si algo se sale por la derecha en la vista previa, en papel también se saldrá.
- Si en vez de `ñ` aparece `?`, la tabla de CP850 de `escpos.rs` no cubre ese
  carácter.

4. Pulsa **Imprimir prueba**. El contador de **Impresos** debe subir a 1.
5. Vuelve a pulsar **Imprimir prueba**. Debe subir a 2 — el documento de prueba
   lleva la hora en el `id`, así que no es duplicado.
6. Busca los archivos `.escpos` en la carpeta de datos de la app
   (`%APPDATA%\app.invventa.pos\impresiones`). Debe haber uno por impresión.

---

## Paso 2 · Impresora USB conectada

1. Conecta la térmica y deja que Windows instale su driver.
2. En `/hub`, pulsa **Actualizar** y cambia *Cómo se conecta* a **USB / Windows**.
3. Elige la impresora de la lista. **No teclees el nombre**: suelen llamarse
   cosas como `POS-58 Printer(1)` y un espacio de más deja la caja sin imprimir
   sin decir por qué.
4. **Guardar** → el toast debe confirmar `windows raw «...»`.
5. **Imprimir prueba**.

**Qué debe salir en papel:**

- Encabezado centrado con el nombre del restaurante.
- Los acentos correctos. Si salen jeroglíficos, la impresora no acepta `ESC t 2`
  (CP850) y hay que probar otra página de códigos en `codepage_850()`.
- La columna de importes alineada a la derecha, sin desbordar.
- Corte parcial al final (la tira queda colgando de un punto, no cae al suelo).

**Si no sale nada y no hay error:** el spooler aceptó los bytes pero la
impresora no los entendió. Casi siempre es que el driver instalado no es el
genérico RAW. Prueba a añadirla como *Generic / Text Only*.

**Si sale error `no se pudo abrir «...»`:** el nombre no coincide. Vuelve a
Actualizar y elige de la lista.

---

## Paso 3 · La cola bajo estrés (es la prueba que importa)

Esto es lo que separa un POS que aguanta un servicio de uno que no.

| # | Qué hacer | Qué debe pasar |
|---|---|---|
| 3.1 | **Apaga la impresora** y cobra una venta en el POS | El cobro se completa **sin esperar**. El ticket queda en *Pendientes* en `/hub`. |
| 3.2 | Espera ~30 s mirando `/hub` | Los reintentos van espaciándose (2s, 4s, 8s, 16s). Tras el quinto, el trabajo pasa a **Fallidos** con su motivo. |
| 3.3 | **Enciende la impresora** y pulsa **Reintentar** | El ticket sale. Fallidos vuelve a 0. |
| 3.4 | **Quita el papel** a media impresión | El trabajo debe reintentar, no perderse. |
| 3.5 | Cobra 3 ventas seguidas, rápido | Salen las 3, **en orden**. Si salen entrelazadas, la serialización de la cola está rota. |
| 3.6 | Cierra la app con tickets pendientes y vuelve a abrirla | Los pendientes siguen ahí y salen solos. |

**El criterio de fallo del paso 3.1 es absoluto:** si el POS se queda esperando,
aunque sea dos segundos, hay que arreglarlo antes de seguir. Un cajero con un
cliente delante no espera a una impresora.

---

## Paso 4 · El teléfono contra el hub

1. Conecta el teléfono **al mismo wifi** que la caja.
2. En la caja, abre `/hub`. Arriba hay un **QR**.
3. Escanéalo con la cámara del teléfono y abre el enlace.

**Qué debe pasar:** carga la app completa, servida por la caja —no por la nube—
y el teléfono queda **emparejado en el mismo gesto**. El QR lleva la dirección y
el código dentro, así que un solo escaneo hace las dos cosas.

Al volver a `/hub` en la caja, el teléfono debe aparecer en **Dispositivos
emparejados** con su hora de alta.

- Si no carga: firewall de Windows. Al primer arranque pregunta si se permite
  `InvVenta` en redes privadas; si se dijo que no, hay que abrirlo a mano
  (Firewall de Windows Defender → Permitir una aplicación).
- Si carga pero se ve rota: el `dist` empaquetado como recurso está
  desactualizado. Corre `npm run build` antes de `tauri build`.
- Si el QR no se deja escanear: comprueba que la caja no esté en tema oscuro con
  algún filtro encima. El QR se pinta con fondo blanco propio precisamente por
  esto, pero un filtro de pantalla del sistema puede estropearlo igual.
- Si el hub no encontró la IP de la LAN, en vez del QR sale un aviso. Suele ser
  que el equipo solo tiene la interfaz de la VPN levantada.

4. Entra como mesero, abre una mesa, manda algo a producción.

**Qué debe pasar:** la comanda sale por la impresora de la caja, **sin precios**,
con el nombre de la estación en grande y la nota del platillo marcada con `>`.

5. **Prueba de revocación.** En la caja, pulsa **Revocar** en el teléfono. Vuelve
   a mandar algo desde el teléfono.

**Qué debe pasar:** el teléfono deja de imprimir de inmediato, sin reiniciar la
caja. Vuelve a escanear el QR y recupera el acceso. Si tenías otro dispositivo
emparejado, comprueba que **ese siguió funcionando** todo el rato: es la razón
de que cada uno tenga su propio código y no uno compartido.

6. **La prueba de las dos estaciones:** manda una orden con algo de Cocina y
   algo de Barra. Deben salir **dos tiras separadas**, cada una solo con lo suyo.

7. **Corta el internet del local** (deja el wifi, quita el WAN) y repite. Debe
   funcionar igual: el hub no necesita nube para imprimir.

---

## Paso 5 · Segunda PC como KDS

1. Abre la misma dirección en la laptop, ruta `/kds`.
2. Manda una comanda desde el teléfono.

**Qué debe pasar hoy:** el KDS la ve **si hay internet** (va por Supabase
realtime). **Sin internet no la ve** — y eso es conocido y está en el roadmap
como 3.6 (*modo isla v2*): el relay por WebSocket local no se montó en esta
tanda. La comanda se imprime igual, que es lo que salva el servicio.

---

## Qué queda fuera de esta tanda

Anotado para que no se descubra durante la prueba y parezca un fallo:

- **mDNS** (`invventa-caja.local`). Hoy la dirección se lee de `/hub` y se teclea.
  Con DHCP la IP puede cambiar entre reinicios del router.
- **Nada del pairing: ya está.** El QR se pinta en `/hub`, un escaneo empareja, y
  cada dispositivo aparece en la lista con su propio código y su botón de
  revocar. Lo que NO cuenta contra el plan: los dispositivos son ilimitados.
- **Relay WebSocket LAN** (3.6) — ver paso 5.
- **Drenado del hub a Supabase** (3.5). Hoy cada dispositivo encola contra
  Supabase por su cuenta con el outbox que ya existía; el hub solo imprime.
- **Auto-updater e instalador firmado** (3.12).

---

## Detalles de diseño que conviene no revertir sin pensarlo

**El hub no hace aritmética.** Todos los importes llegan como texto ya
formateado desde `lib/Fiscal.js`. Si el hub sumara o redondeara habría dos
motores de dinero y el papel podría decir un centavo distinto de la pantalla.

**La comanda no puede llevar precios por construcción.** `construirComandas` no
emite el campo `importe`; no hay una bandera que alguien pueda encender por
error. Hay una aserción que lo comprueba sobre el documento serializado entero.

**Una reimpresión sí sale, y va marcada.** El descarte por `id` protege contra
el POST duplicado de una red que parpadea, pero una reimpresión deliberada lleva
sufijo de copia y una banda que dice `NO PREPARAR DE NUEVO`. Sin esa banda,
cocina prepara el platillo dos veces y el duplicado cuesta comida, no papel.

**El cajón se abre después del corte, y solo con efectivo.** Si se abriera antes
y el papel se atascara, quedaría dinero expuesto por un fallo de impresión.

**La fecha del ticket va por `aISOLocal`, no por `.slice(0,10)` del ISO.** Es el
mismo bug de UTC que se corrigió en 9 sitios el 27-jul; aquí sería peor, porque
el papel ya se lo llevó el cliente. Hay una aserción con las 23:20 de México.
