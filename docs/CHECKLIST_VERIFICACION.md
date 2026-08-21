# Checklist de verificación — lo que FALTA por comprobar

Reescrito el 18-ago para la sesión de campo con la **0.2.5**. Este documento es
**sólo lo pendiente**: lo verificado el 15-ago vive en `docs/VERIFICADO_15-AGO.md`,
y el porqué de cada arreglo en `docs/PENDIENTE_LUNES.md`.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
varios cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados. El 15-ago pasó una vez: las comandas que
salían de más en mostrador parecían un bug propio y eran síntoma de otro.

**Y una regla nueva, que sale de lo del 18-ago:** los cinco arreglos de ese día
no vienen con la misma red debajo: dos los encierran pruebas nuevas —el fallo 5
en Rust, la reimpresión en `Comanda.test.js`—, tres **no los mira ninguna suite**
y uno ni siquiera se corrió. Está anotado en cada sección. Donde diga «sin red
debajo», el ojo es la única verificación que hay.

**Y una corrección:** el paso 2 de la sección 2 estaba mal escrito —pedía pulsar
un botón que en ese estado está apagado— y se descubrió al construir el botón de
copia. Un checklist que manda hacer lo imposible se salta, y saltarse un paso es
cómo se pierde el único que verificaba algo.

---

## 0 · Antes de salir de la máquina

- [x] `cargo test` en `src-tauri`. **Hecho el 18-ago**, en verde. Era lo único
      que sostenía los cambios de Rust fuera de `respaldo.rs`.
- [ ] `npm run test:run` completo. Lo corre `compilar.ps1` solo; se anota aquí
      porque es lo que autoriza a compilar, no un trámite.
- [ ] `npm run test:rapido`. Pendiente desde el 13-ago.

  > **Lo que tiene que dar, medido el 12-ago para que no vuelva a costar dos
  > días:** 6 fallos en `useConectividad.test.jsx`, y **no son una regresión**
  > —vienen de compartir estado global con `--isolate=false`; ese archivo solo
  > pasa 11 de 11—. **Si aparece un séptimo, ESE sí es nuevo.**

- [ ] Las tres versiones en **0.2.5** (`npm run version` lo comprueba).

---

## 1 · Paso cero en el local: en qué flujo está AZUL

- [ ] **Zonas de Producción** (`/zonas-produccion`), primer bloque: **«La cuenta
      de la mesa»**. Dos opciones: «Un solo papel — el ticket final»
      (`ticket_final`) o «Dos papeles — pre-cuenta y ticket»
      (`precuenta_y_ticket`).
- [ ] Y si la pantalla deja dudas, mirar la fila de configuración en Supabase.
      **`precuenta_y_ticket` es el valor por defecto** —`PosScreen.jsx:840` hace
      `configuracion?.flujo_cuenta || 'precuenta_y_ticket'`—, así que si nadie
      ha tocado nunca esa pantalla la columna puede venir `null` y el
      comportamiento ser el de dos papeles **por omisión, no por decisión**.

**Esto va antes que todo lo demás porque cambia qué prueba la sección 2.** El
contador de impresiones que arregló el fallo 2 sólo entra por la rama
`ticket_final`. Con `precuenta_y_ticket` se va por `enviarPreCuenta`, cuyo id ya
llevaba `Date.now()` más una secuencia y **por tanto nunca se dedupló**: ahí el
fallo 2 no existía. Si AZUL está en ese flujo, los papeles de abajo salen —pero
no prueban el arreglo, prueban un camino que ya funcionaba.

> **Si AZUL está en `precuenta_y_ticket`:** para ver el arreglo hay que pasar a
> `ticket_final` un momento, hacer la sección 2 y devolverlo. Ese cambio altera
> **qué papel se lleva el cliente**, así que no se toca con el local abierto.

---

## 2 · La cuenta, la reapertura y el folio — con impresora

Fallos 2, 3 y 7. **Los arreglos están y la suite los cubre por debajo**
(`Comanda.test.js`, `Fiscal.test.js`), pero el eslabón de `PosScreen` que los
conecta **no lo mira ninguna prueba**. Esto es la verificación, no una segunda
opinión.

- [ ] Mesa con productos → **Pedir Cuenta** → sale **un** papel.
- [ ] **«Imprimir copia»**, en el aviso naranja, sin tocar nada → sale **otro**
      papel, idéntico salvo la hora.

  > **Corregido el 18-ago, y conviene saber por qué.** Aquí decía «Pedir Cuenta
  > otra vez», y eso **no se puede hacer**: con `ticket_final`, en cuanto la
  > cuenta se imprime la mesa pasa a `por_cobrar`, `cuentaCerrada` se pone en
  > `true` y ese botón se apaga. El paso venía heredado del checklist viejo y
  > nadie lo había intentado. Para eso está el botón nuevo.
  >
  > La hora sí cambia: es la de esta impresión. `orden_actual` no guarda la de
  > la primera. El folio es lo que dice que son la misma cuenta.

- [ ] **Reabrir**, agregar algo, **A Producción**, Pedir Cuenta → papel con el
      **total nuevo** y **el mismo folio**. **Éste es el fallo 2 de verdad** —el
      del 15-ago fue «tras reabrir, volver a pedir la cuenta no imprimía»—, así
      que si algo falla en esta sección, lo que importa es este paso.
- [ ] **Cobrar** → la venta lleva **ese** folio, no uno nuevo. Se confirma en
      `public.ventas`.
- [ ] Fallo 3: un ticket de **dos jugos de $40** dice `TOTAL $80.00`, con
      `SUBTOTAL:$68.97 IVA:$11.03`. Antes decía `$80.01`.

- [ ] **«Imprimir copia» NO abre el cajón** y **no desbloquea la cuenta**: el
      aviso naranja sigue ahí y «A Producción» sigue apagado. Si la copia
      reabriera algo, el bloqueo dejaría de proteger lo que protege.
- [ ] En **Auditoría** hay un `CUENTA_IMPRESA` por cada papel, numerados. Es el
      único rastro: los papeles son idénticos.

### El cajón

- [ ] **NO se abre** al pedir la cuenta. Ese papel se imprime antes de cobrar y
      no debe mover dinero.
- [ ] ~~se abre al cobrar en efectivo~~ / ~~con tarjeta no~~ — **no se puede
      verificar**: el cajón de AZUL está averiado y sólo abre con llave. El
      pulso sale igual (`hub_abrir_cajon`). **Pendiente, no verificado.**

---

## 3 · El respaldo y la adopción — el fallo 5, cerrado el 18-ago

**Respaldado por dos pruebas nuevas en `respaldo.rs`**, una de ellas reabriendo
el archivo, y comprobado que fallan sin el arreglo. Esto de aquí verifica el
cableado en la caja de verdad.

- [ ] **Al instalar la 0.2.5, drenar una vez con «Recuperar ahora».** Lo que ya
      está en el disco lleva tokens de arranques muertos y no se distingue de lo
      de un teléfono revocado, así que se ofrecerá esa última vez. Adoptar de
      más es inofensivo: `upsert` sobre una clave ya única.

### La prueba que confirma el arreglo

- [ ] Quitar internet a la caja (que siga viendo su propia LAN), **cobrar una
      venta desde la caja**, y comprobar que queda pendiente de subir.
- [ ] **Cerrar la aplicación y volver a abrirla.**
- [ ] En la pantalla del hub, **«Por adoptar» debe seguir en 0**. Antes de este
      arreglo, ahí aparecía la venta que la caja acababa de cobrar ella misma.

  > Ése es el fallo entero: el token de emparejamiento se regenera en cada
  > arranque y el archivo de respaldo no, así que la caja dejaba de reconocer lo
  > suyo. Dentro de un mismo arranque **no se ve**: hay que reiniciar.

- [ ] Abrir `respaldo-ventas.ndjson` y ver que las líneas nuevas de la caja
      dicen `"dispositivo":"::caja::"` y no una cadena hexadecimal.

### La prueba que confirma que NO se rompió lo que servía

Igual de importante: la adopción tiene que seguir funcionando para los
teléfonos, que es para lo que existe.

- [ ] Cobrar desde un teléfono sin red, **revocar ese dispositivo** desde la
      caja —revocar lo saca de la ventana de vivo al momento, sin esperar los 15
      minutos— y pulsar «Recuperar ahora».
- [ ] Esa venta **sí** debe aparecer y subir. Comprobarla en `public.ventas`.

---

## 4 · La dirección por nombre — nuevo el 18-ago

**Sin red debajo:** `HubScreen.jsx` no tiene suite. Esto es todo lo que hay.

- [ ] En la pantalla del hub aparece **«Dirección por nombre»** junto a la de
      IP, con `http://invventa-caja.local:3000`.
- [ ] Abrirla **desde un teléfono** y **desde otra PC** del local.
- [ ] Con la caja en el wifi de AZUL, no en un hotspot: el descubrimiento por
      nombre depende de la red, y un extensor que cree su propia subred lo rompe.

  > **Si la línea NO aparece, no es un fallo de la pantalla:** significa que el
  > anuncio no salió, y entonces es correcto no enseñarla. Enseñar una dirección
  > que la red no resuelve manda a teclear algo que no funciona y a concluir que
  > el hub está roto. Si no aparece y quieres saber por qué, el hub lo dice al
  > arrancar por consola —que en release no se ve—, así que el diagnóstico real
  > es probar si otro equipo resuelve `.local` en esa red.

---

## 5 · El botón de reimprimir — nuevo el 18-ago

`Reportes → Corte de Caja (Z) → Tickets del turno`, un icono de impresora por
fila. **Sin red debajo:** `ReportesScreen.jsx` no tiene suite. Lo que sí está
probado es la capa de abajo (`Comanda.test.js`, 88 en verde).

- [ ] Cobrar una venta, ir a Reportes y **pulsar el botón**: sale un papel.
- [ ] **Pulsarlo otra vez** → sale **otro** papel. Éste es el paso que importa:
      si el número de copia no subiera, `cola.rs` descartaría el segundo por id
      ya impreso, **sin error y sin papel**, y el cajero le diría al cliente
      «ya salió» mientras la impresora no hace nada.
- [ ] Los papeles son **idénticos al original**: sin «REIMPRESIÓN», sin «copia
      2», sin nada añadido.
- [ ] **El cajón NO se abre** con ninguna de las copias.
- [ ] La copia de una venta **de mesa** dice el nombre de la mesa, no
      «Mostrador».
- [ ] En **Auditoría** aparece un `REIMPRESION_TICKET` por cada copia, con folio
      y número. Es el único rastro que existe: desde el papel no se puede
      distinguir un original de una copia.
- [ ] En Supabase, `ventas.copias_impresas` de esa venta subió.

> **Si AZUL está en `ticket_final`:** la copia lleva «Pago: EFECTIVO» y el papel
> que se llevó el cliente no lo llevaba, porque aquél era la cuenta. Es
> deliberado (decisión del 18-ago) y está explicado en `PENDIENTE_LUNES.md` §1.
> No lo apuntes como fallo.
>
> **Y no esperes ver «Recibido» ni «Cambio» en la copia.** `cambio_entregado`
> no se guarda en la base, así que la reimpresión no lo sabe — y preferimos
> callarlo antes que imprimir un cero que sería mentira.

---

## 6 · Los dos recortes de interfaz — nuevo el 18-ago

**Sin red debajo:** ninguna suite mira el layout.

- [ ] **Mesas:** seleccionar la mesa de la **esquina superior izquierda**. El
      anillo tiene que verse entero por los cuatro lados. Ahí es donde se
      cortaba, porque el contenedor con scroll no tenía margen ni arriba ni a la
      izquierda.
- [ ] **POS:** la etiqueta **`Enviado: n`** en **una sola línea**. Probar en la
      tablet o estirando una ventana de Chrome a ~1080 px, que es donde rompía.

  > No es estética: ese número dice que esas unidades ya están en cocina, o sea
  > que no se pueden quitar sin autorización de gerente. Partido en dos y en
  > 10 px, un mesero con prisa no lo lee.

---

## 7 · El updater — la ronda completa, que por fin se puede

Llevaba pendiente desde el 15-ago porque hacía falta una versión N+1. La 0.2.5
**es** esa versión. Guía en `docs/CHECKLIST_ACTUALIZACIONES.md`.

- [ ] Con la **0.2.4 instalada**, pulsar «Buscar actualización» → ofrece la 0.2.5.
- [ ] El aviso enseña **la nota de la versión**, y se entiende sin saber de
      programación. Ver `avisoDeActualizacion()`.
- [ ] «Versión instalada» dice **0.2.4** y no un guion. Ése fue el arreglo del
      17-ago que **nunca se ha probado**: sólo actúa desde una 0.2.4 ya
      instalada, y hasta hoy no había a dónde saltar.
- [ ] Instalar. Windows enseña el aviso azul —«Más información» → «Ejecutar de
      todas formas»—, la caja se cierra y se vuelve a abrir sola.
- [ ] Al volver, «Versión instalada» dice **0.2.5**.

> Para compilar el bundle hay que exportar `TAURI_SIGNING_PRIVATE_KEY` y su
> contraseña **en la misma sesión de shell**, o revienta al firmar, al final del
> build. `tauri.conf.json` ya tiene la `pubkey` de verdad.

---

## 8 · Al cerrar la sesión de pruebas — NO OLVIDAR

El 17-ago la caja quedó en un hotspot (`10.245.x.x`) y con el transporte en
**Simulador**. Comprobar las dos **antes de que abra el local**:

- [ ] La caja **al wifi de AZUL**. Si se queda en el hotspot y ese teléfono se
      va, los meseros pierden el hub y el QR guardado apunta a una IP muerta.
- [ ] El transporte **a la impresora de Windows**. Éste muerde en silencio: los
      cobros pasan, todo «funciona», y no sale un papel en todo el servicio.

---

## Lo que queda sin verificar, y por qué

- **El pulso del cajón.** El de AZUL está averiado y sólo abre con llave. Hasta
  que se repare o se pruebe en otro cajón.
- **Las E2E.** `flujo-pos.spec.js` quedó con el regex del folio al día el
  18-ago, pero **no se ha corrido**: piden tenant y navegador. Y sigue en pie lo
  del §3.3 del lunes: unas E2E que nadie corre no son una red de seguridad, son
  una foto vieja que da sensación de cobertura. O entran en el ritual o se dice
  en voz alta que no cuentan.
- **El fallo 3.2**, el layout de `OpsHeader` en tablet. Diagnosticado y sin
  tocar. Al arreglarlo, regenerar el snapshot **sólo después**: antes convierte
  el fallo en la nueva referencia y lo entierra.
- **`scripts/pruebas-rust.sh`** corre en Linux e incluye `respaldo` —51 pruebas
  el 18-ago—. Lo que no compila fuera de Windows es el resto de `src-tauri`.

## Decisiones pendientes, que no son verificaciones

- **Fallo 7 · ¿entra `mesas` en `TABLAS_RESPALDADAS`?** Es lo que haría que la
  reserva del folio sobreviva al aparato. Y cambia cómo se resuelven conflictos
  de sala: adoptar el estado de una mesa desde un aparato muerto puede resucitar
  una que otro ya cerró. **Decisión pendiente, no olvido.**
- **§F · el cobro parcial al pedir la cuenta.** Lo único que queda del flujo de
  cuenta. Se dejó fuera a propósito: cambia qué se imprime y qué se cobra, y
  montarlo encima de cambios que no se habían visto funcionar era pedirlo. Ya se
  vieron. Son un par de horas contra una base que se sabe buena.

## Deuda conocida que sigue ahí

- `ModalCobro` aún no usa `lib/Autorizacion.js` — tercera copia evitada, segunda
  pendiente de migrar.
- CSP nulo en `tauri.conf.json` y `CorsLayer::permissive()` en el hub.
- `mesas.mesero_id` sigue muerto: bloquea tres de las cinco propuestas de sala.
- Queda por localizar el archivo que ensucia `matchMedia` entre ficheros. No
  rompe nada con aislamiento; sólo estorba al correr sin él.
- `total_divergente` lo calcula un trigger y **nada en el front lo lee**. Desde
  el arreglo del fallo 3 el front y Postgres coinciden exacto, así que el
  detector ya no vive al borde de gritar por todo: leerlo pasa a ser útil.
- `prettier` **no está en `devDependencies`**, así que `npm run format` usa el
  que cada máquina tenga instalado global. Tres ficheros siguen sin pasar por
  él: `Modificadores.js`, su prueba y `scripts/version.mjs`.
- **En release no hay consola.** `src-tauri/Cargo.toml` declara `tauri` sin la
  feature `devtools`, así que cualquier diagnóstico que dependa de la consola
  es, en producción, un diagnóstico que no existe. O se compila con devtools, o
  esos datos salen a una pantalla.

## Lo verificado, para no repetirlo

Todo lo del 15-ago —§0 a §11— y el respaldo de ventas con un teléfono muerto de
verdad, en `docs/VERIFICADO_15-AGO.md`. Y el descuento de inventario: seis
orígenes desde el 15-ago en `stock_salidas`, todos con exactamente una fila,
ninguno duplicado.

> Un hallazgo de aquello que conviene no perder: `1829724086159641` —la venta que
> estuvo dos días sin llegar a Supabase— **sí tiene su salida de stock**,
> aplicada a los once segundos del cobro. El inventario nunca dependió de que la
> venta subiera. Son dos caminos separados, y el que evita vender lo que no hay
> funcionó aunque el otro estuviera roto.
