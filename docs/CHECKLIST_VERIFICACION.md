# Checklist de verificación — lo que FALTA por comprobar

Este documento es sólo lo pendiente. **Lo que ya se verificó el 15-ago vive en
`docs/VERIFICADO_15-AGO.md`**, junto con los tres fallos que aparecieron y su
diagnóstico.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
varios cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados. El 15-ago pasó una vez: las comandas que
salían de más en mostrador parecían un bug propio y eran síntoma de otro.

---

## Antes de medir nada del camino de la cola

Los tres fallos del 15-ago están sin arreglar, y el primero **ensucia cualquier
medición** que dependa de que una venta suba: mientras una venta muera en el
trigger, lo que vaya detrás en la cola se retrasa y parece otra cosa.

1. El trigger que castea `it->>'id'` a `bigint`.
2. La reimpresión tras reapertura.
3. El centavo de más en el total.
4. «Recuperar ahora» que falla y dice «No había nada que recuperar».

Ver `docs/VERIFICADO_15-AGO.md`. Los cuatro son de pocas líneas.

- [ ] **Pendiente de comprobar, y va con el fallo 4:** comparar el
      `"dispositivo":"840ce96da4be84e5"` de la anotación en el `.ndjson` con el
      token que la caja tiene ahora. Si son distintos, la caja deja de
      reconocer sus propias ventas pendientes tras un reinicio y se ofrece a
      adoptarlas bajo otra identidad.

---

## 0 · Que compile y que pase la suite

- [ ] `npm run test:rapido`

  El lote de lógica pura, sin DOM ni globales. `--isolate=false` aquí es seguro
  y rápido.

> `cargo test` y `npm run test:run` se corrieron el 15-ago, los dos en verde.
> Hay que repetirlos después de arreglar los tres fallos.

### Sobre `--isolate=false`, que costó dos días de fantasmas

Durante el 10 y el 11-ago se dio por hecho que había «50 pruebas rotas» en
`src/features src/components`. **No había ninguna.** Todos los fallos venían de
compartir estado global entre archivos con `--isolate=false`.

> **Medido el 12-ago, para que no vuelva a costar dos días:** `npm run
> test:rapido` da **6 fallos en `useConectividad.test.jsx`**. Ese archivo solo
> pasa **11 de 11**. La contaminación sigue ahí y **no es una regresión**. Si
> aparece un séptimo, ESE sí es nuevo.

**La verificación de verdad se hace con `npm run test:run`**, que aísla.

## 3 · Lo que queda del flujo de la cuenta

- [ ] **El cajón NO se abre** al pedir la cuenta. Ese papel se imprime antes de
      cobrar y no debe mover dinero.
- [ ] ~~el cajón se abre al cobrar en efectivo~~ / ~~con tarjeta no se abre~~ —
      **no se puede verificar**: el cajón del restaurante está averiado y sólo
      abre con la llave. El pulso ESC/POS sale igual (`hub_abrir_cajon`), pero
      no hay forma de comprobarlo hasta que se repare o se pruebe en otro cajón.
      **Queda pendiente, no verificado.**

> El código sí dice lo correcto: `construirPreCuenta` devuelve `abrirCajon:
> false` explícito, y `handlePedirCuenta` lo vuelve a pasar al reusar el ticket.
> Falta el papel —o mejor, el cajón— que lo demuestre.

- [ ] **Reimprimir tras reabrir** — bloqueado por el fallo 2. Cuando esté
      arreglado: reabrir, agregar algo, volver a pedir la cuenta, y que **salga
      un papel nuevo** con el total nuevo, el mismo folio y su aviso de copia.

## 4 · Lo que queda del bloqueo de la cuenta

- [ ] Reabrir desde una sesión de **mesero** → **pide PIN**; con el PIN de un
      encargado, reabre.

> La tarde del 15-ago se hizo entera con sesión de dueño, así que el camino del
> PIN no se tocó.

## 5b · «¿Cómo lo quiere?» — los grupos de modificadores

La **nota libre** ya se verificó hasta el papel. Lo que sigue sin verse son los
**grupos**: no se preparó catálogo, así que ninguna venta llevó opciones.

**Antes de probar, hay catálogo que preparar** (hoy sólo Chilaquiles tiene un
grupo atado, y las tres opciones de «Tipo de leche» apuntan por error al mismo
producto):

- [ ] En **Catálogos → Modificadores**, un grupo de prueba realista — p. ej.
      «Término», única y obligatoria, con «Término medio» y «Bien cocido».
- [ ] Comprobar que el recuadro azul **«En la caja se verá así»** dice lo que
      esperas al marcar y desmarcar las dos casillas. Son cuatro combinaciones
      y dos no son evidentes.
- [ ] En **Catálogos → Recetas**, atar el grupo a un platillo. **Este paso es
      el que se olvida**: sin él, el grupo no aparece en el POS y parece roto.

Y ya en la caja:

- [ ] Tocar ese platillo → **se abre solo** el cuadro «¿Cómo lo quiere?».
- [ ] Con el grupo obligatorio sin responder, el botón está apagado **y dice
      cuál falta**.
- [ ] Un platillo **sin** grupos entra al carrito **de un solo toque**. Si pide
      confirmación, está mal: en una barra con cola eso hace inservible el POS.
- [ ] **Dos veces el mismo platillo con elecciones distintas = DOS líneas.**
      Uno término medio y otro bien cocido no pueden fundirse en «2x». Es el
      fallo más caro de esta pantalla: la cocina sacaría dos iguales y nadie se
      entera hasta que el cliente devuelve el plato.
- [ ] Mandar a producción → en el **KDS** salen las opciones en grande y la
      nota con su 📝.
- [ ] En el **papel de cocina**, las opciones salen sangradas debajo del
      platillo, igual que los componentes de un paquete.
- [ ] Intentar cambiar la nota de una línea **ya enviada** → lo impide y
      explica por qué (el papel que tiene el cocinero ya salió).

> **Nada de esto suma precio ni descuenta inventario, y es a propósito.** Si ves
> una opción con precio en el catálogo, **no la uses**: se elegiría y no se
> cobraría. Ver `docs/PENDIENTE_LUNES.md` §8.

> **Y hasta que el fallo 1 esté arreglado, esto sólo se prueba en ventas de
> mentira.** Una venta real con modificadores no llega a Supabase.

## 6 · El teléfono

- [ ] Arriba a la derecha aparece un botón con **las iniciales** del mesero.
- [ ] Lleva a **Perfil**, y desde ahí se puede cerrar sesión.
- [ ] Al salir, cae en **`/loginempleados`** (código + PIN), no en el formulario
      de correo.

## 7 · El checador

- [ ] Botón **«Quién está trabajando»** → pide PIN de Admin o Gerente.
- [ ] La lista muestra nombre, hora de entrada y tiempo dentro.
- [ ] **Los tres registros abiertos de AZUL** aparecen: Carlos Muñoz entre los
      activos, y **Daniel Muñoz y Juan Pérez en «sin salida registrada»** —
      llevan más de 40 días y ya no están en la plantilla.
- [ ] Cerrarlos exige que **`horas_jornada` esté configurado**; si está en 0,
      el panel lo dice y no deja. Configúralo antes.
- [ ] Al cerrar un olvido, la hora que se guarda es **entrada + jornada**, no la
      actual. Compruébalo en Asistencias: una salida de hace semanas, no de hoy.

## 8 · El aviso del KDS — sonido y notificaciones

Se prueba **con una sesión de Chef o Barista** (por PIN). Con la sesión de dueño
por correo no debe sonar nada, y eso también se verifica.

- [ ] Entrar al KDS como **Chef** → arriba aparece **«Activar avisos»**.

> Sale a propósito. El navegador no deja sonar hasta que alguien toca la
> pantalla, así que en vez de fallar callado —que es igual a no tener aviso— se
> pide el toque a la vista. **Si no aparece ese botón y tampoco suena, eso sí es
> un fallo.**

- [ ] Pulsarlo → Windows pide permiso de notificaciones. **Aceptar.** El botón
      desaparece.
- [ ] Desde el POS, mandar una comanda a **Cocina** → suena y sale el cartel
      abajo a la derecha con la mesa y cuántos platillos. Se va solo a los 6 s.
- [ ] Marcar un item listo → **no vuelve a sonar**. Es el error clásico: la
      lista se recalcula y cualquier cambio parece una llegada.
- [ ] **Recargar el KDS con comandas en curso → NO suena.** Lo que ya estaba en
      pantalla al abrir no acaba de llegar.
- [ ] Cambiar a la pestaña **Barra** → tampoco suena por lo que ya había.
- [ ] Mandar una comanda **sólo de barra** estando en la pestaña Cocina → **no
      suena**; el aviso es de la estación que se está mirando.

- [ ] **Minimizar la ventana** (o irse a otra app) y mandar una comanda → sale
      la **notificación de Windows**.
- [ ] Al volver a la ventana, **el cartel sigue puesto** y recién entonces
      empieza a contar sus 6 s.
- [ ] Mandar dos seguidas estando fuera → **una sola notificación**, no dos
      apiladas.

- [ ] Entrar al KDS como **Gerente o Admin** → **no aparece el botón y no suena
      nada.** Entran a supervisar; un pitido por comanda es ruido.

> **Esto falló el 12-ago y se arregló.** Sonaba y la notificación no salía nunca.
> Dos causas, las dos del mismo tipo de siempre:
>
> 1. **WebView2 no implementa la API web `Notification`.** `Notification.permission`
>    se quedaba en `'default'` para siempre y no había error que mirar. Ahora se
>    usa `tauri-plugin-notification`.
> 2. **Minimizar no es «oculto».** Una ventana de Tauri minimizada —o tapada por
>    WhatsApp— **sigue diciendo `'visible'`**. Ahora manda el **foco**.
>
> **Dos avisos para cuando no aparezca la notificación, y no sean bugs:**
>
> - En Windows el plugin **sólo funciona con la app INSTALADA**. Con el `.exe`
>   suelto, o en `tauri dev`, el toast sale con el icono de PowerShell o no sale.
>   La caja tiene la 0.2.3 instalada, así que esta condición ya se cumple.
> - El **asistente de concentración** de Windows silencia los toasts sin
>   decírselo a nadie. Es lo primero que hay que mirar.

## 9 · La salida del KDS — que el barista pueda irse

- [ ] Como **Barista**, el botón de arriba dice **«Mi perfil»**, no «Salir», y
      lleva ahí. El texto sigue al destino: mandar a alguien al perfil bajo un
      cartel que dice «Salir» es mentirle, y ese botón se lee todos los días.
- [ ] El **gorro de chef** del encabezado también lleva al perfil. Es un extra
      de escritorio: en teléfono ese bloque está oculto.
- [ ] Como **Admin**, el mismo botón dice **«Salir»** y lleva a `/dashboard`.
- [ ] Desde ahí, **Cerrar sesión** funciona y lleva a `/loginempleados`.
- [ ] Si tiene entrada abierta sin salida, primero exige marcar salida. La
      sesión no debe ser la puerta de atrás del checador.
- [ ] En **Mi perfil** aparece el riel con **«Monitor Cocina»** para volver.
- [ ] En el **POS**, salir desde Mostrador con una sesión de mesero → cae en
      `/mesas`.

> **Si mañana se agrega una tercera pantalla sin riel**, hay que anotarla en
> `RUTAS_PANTALLA_COMPLETA` (`lib/Navegacion.js`). Entra sola en la matriz de
> `Escape.test.js` y la suite no pasará hasta que tenga salida para todos los
> roles.

## 10 · Lo que queda del 13-ago

- [ ] `scripts/pruebas-rust.sh` — incluye `respaldo`, así que la lógica del
      respaldo se puede verificar también fuera de Windows.

### El respaldo de ventas — la mitad que falta

El respaldo de la caja ya se verificó, y con un fallo real. Lo que no se ha
probado es el camino del **teléfono que muere con la venta dentro**, que es la
razón por la que existe: «Por adoptar» sigue marcando 0.

- [ ] Cobrar **desde el teléfono, sin internet** (wifi del local sí, datos no).
- [ ] **Cerrar la pestaña del teléfono y borrar sus datos de sitio** — o sea,
      simular que el teléfono murió con la venta dentro.
- [ ] Esperar 15 minutos (o revocar el dispositivo desde la caja para acelerar).
- [ ] En la caja, **«Por adoptar» marca 1** → pulsar **Recuperar ahora**.
- [ ] La venta está en Supabase, con su folio y su total.

> Sin ese último paso, lo escrito el 13-ago es una suposición. Es exactamente el
> tipo de cosa que parece funcionar hasta el día que hace falta.

> **Ojo:** hazlo con una venta **sin notas ni modificadores** hasta que el fallo
> 1 esté arreglado, o no se sabrá si no llegó por el teléfono o por el trigger.

### El descuento de inventario — la prueba dura

- [ ] En Supabase, `stock_salidas` tiene **una fila por comanda** (o por venta en
      mostrador).

> El 15-ago se comprobó en la caja: 80 kg → 79.8 kg tras el reintento, un solo
> descuento. Pero el contador local podría estar bien y `stock_salidas` tener dos
> filas. Son cinco minutos y cierran §10.

### mDNS

- [ ] En la consola de la caja sale `[hub] anunciado como
      http://invventa-caja.local:3000`.
- [ ] Desde un **iPhone** o desde otra PC, esa dirección abre la app.
- [ ] Desde **Android puede que no funcione**, y no es un fallo: Chrome resuelve
      `.local` de forma irregular. Por eso el QR sigue llevando la IP.

> La consola de la caja **no se abre en un build de release** (`tauri` sin la
> feature `devtools`). El primer punto necesita otra vía: o un build con
> devtools, o leerlo del log, o simplemente probar la dirección desde el
> teléfono, que es lo que de verdad importa.

### El updater

La ronda completa necesita publicar una versión N+1 a la que saltar. La guía está
en `docs/CHECKLIST_ACTUALIZACIONES.md`.

> `tauri.conf.json` ya tiene la `pubkey` pegada de verdad. Para compilar el
> bundle hay que exportar `TAURI_SIGNING_PRIVATE_KEY` y su contraseña **en la
> misma sesión de shell**, o revienta al firmar, al final del build.

## 11 · Lo responsivo del 13-ago (3.10)

Dos reglas globales, no veintinueve revisiones. Se comprueban en un teléfono de
verdad, no en el simulador del navegador — el teclado del simulador no ocupa
espacio y es justo lo que se está probando.

- [ ] Abrir cualquier modal del ERP con formulario (Clientes, Proveedores,
      Ingredientes…) en un **teléfono**, tocar un campo para que salga el
      teclado → **el botón de guardar sigue siendo tocable**.
- [ ] Hacer **zoom con dos dedos** en cualquier pantalla → ahora deja. Antes no.
- [ ] En una **tablet en horizontal**, el Dashboard enseña **cuatro KPIs en
      fila**, no dos.

> El barrido de `src/test/modales-teclado.test.js` impide que vuelva a colarse
> un `vh`, pero no puede comprobar que el resultado se vea bien. Eso son tus
> ojos y un teléfono.

---

## Lo que NO se hizo, y por qué

**§F del diseño — preguntar por el cobro parcial al pedir la cuenta.**

Es lo único que queda del flujo. Se dejó fuera a propósito: cambia **qué se
imprime y qué se cobra**, y va montado encima de otros cambios que no se habían
visto funcionar. El 15-ago se vieron: §3 y §4 están en verde salvo la
reimpresión. Cuando los tres fallos estén arreglados, §F son un par de horas
contra una base que se sabe buena.

## Deuda conocida que sigue ahí

- `ModalCobro` aún no usa `lib/Autorizacion.js` — tercera copia evitada, segunda
  pendiente de migrar.
- El `id` de `auditoria` sigue saliendo de `Date.now()` (ver backlog §7).
- CSP nulo en `tauri.conf.json` y `CorsLayer::permissive()` en el hub.
- La reimpresión de documentos existe en `Comanda.js` y **nadie la llama** —
  ahora se sabe que hace falta: es el fallo 2.
- `mesas.mesero_id` sigue muerto: bloquea tres de las cinco propuestas de sala.
- Queda por localizar el archivo que ensucia `matchMedia` entre ficheros. No
  rompe nada con aislamiento; sólo estorba al correr sin él.
- `total_divergente` lo calcula un trigger y **nada en el front lo lee**. Con el
  fallo 3 se supo además que su tolerancia de `0.02` es lo único que impide que
  cada venta salga marcada.
