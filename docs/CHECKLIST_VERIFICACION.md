# Checklist de verificación — todo lo del 11 y 12-ago

Se escribió mucho en dos días y **casi nada se ha visto funcionar**. Este
documento es la lista de lo que falta comprobar, en el orden en que conviene
hacerlo: cada bloque supone que el anterior pasó.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
cinco cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados.

---

## 0 · Antes de nada — que compile y que pase la suite

- [ ] `cd src-tauri && cargo test`

  Toca Rust dos veces hoy: el **ancho configurable** (32/48) y el **pulso del
  cajón**. El primero ya compiló; el segundo **no se ha compilado nunca** — no
  hay toolchain de Rust en el entorno donde se escribió.

- [ ] `npm run test:rapido`

  El lote de lógica pura, sin DOM ni globales. **521 en verde.** `--isolate=false`
  aquí es seguro y rápido.

- [ ] `npm run test:run`

  **La suite entera, con aislamiento.** Debe dar TODO en verde.

### Sobre `--isolate=false`, que costó dos días de fantasmas

Durante el 10 y el 11-ago se dio por hecho que había «50 pruebas rotas» en
`src/features src/components`. **No había ninguna.** Los 12 fallos de
`MesasScreen.figuras` —los últimos que quedaban— pasan 19 de 19 al correr ese
archivo solo, igual que `BarraPestanas`, `PanelAcoplable`, `MarcaConmutador` y
`LoginPuerta`.

Todos los fallos venían de compartir estado global entre archivos con
`--isolate=false`. Ya se corrigieron dos casos concretos en `useConectividad`
—un `vi.mock` que llegaba tarde y un `document.visibilityState` sin restaurar—
y queda al menos uno más sin localizar entre los archivos que simulan
`matchMedia`.

> **Medido el 12-ago, para que no vuelva a costar dos días:** `npm run
> test:rapido` da **6 fallos en `useConectividad.test.jsx`**. Ese archivo solo
> pasa **11 de 11**. La contaminación sigue ahí y **no es una regresión**: se
> comprobó excluyendo lo escrito ese día y los seis fallos siguen apareciendo
> igual. Si aparece un séptimo, ESE sí es nuevo.

**La conclusión práctica: ese atajo dejó de pagarse solo.** Se adoptó para que la
suite cupiera en el tiempo de una llamada, y a cambio produjo tres falsas
alarmas, mandó a revertir un cambio correcto y ocultó durante dos días que en
realidad no había nada roto. Se queda para `src/lib src/store src/test
src/hooks` —funciones puras, sin DOM ni globales, donde es seguro— y **la
verificación de verdad se hace con `npm run test:run`**, que aísla.

## 1 · Los ajustes — nada funciona si no se guardan

Los dos viven en **Ajustes → Zonas de Producción** y comparten el aviso de
«falta guardar».

- [ ] **La cuenta de la mesa** → «Un solo papel — el ticket final».
- [ ] **Cuándo imprimir las comandas** → «Sólo cuando no llegó a la nube».
- [ ] Pulsar **Guardar** y recargar para confirmar que quedaron.

> Ya pasó una vez: el ajuste de comandas parecía no funcionar y en realidad
> nunca se había guardado. En la base seguía en `siempre`.

- [x] **Ajustes → Hub** → ancho del papel en **80 mm (48 columnas)**.

> **Fallo encontrado y arreglado (12-ago).** Al recargar, el selector volvía a
> 58 mm. El ajuste **sí se guardaba** —llegaba a `hub.json` y la impresora
> imprimía a 48 columnas—: lo que mentía era el selector. El ancho vivo lo
> devolvía `/salud` (el camino HTTP, el del teléfono) y **no** el comando
> `hub_estado`, que es el que usa la caja, o sea justo donde está la pantalla
> que lo configura. Sin ese dato, la pantalla cae a 58 por defecto.
>
> Mismo patrón que el pulso del cajón: dos capas correctas por separado y el
> hueco exactamente en medio. **Requiere recompilar** (`cargo` toca).

## 2 · El folio, que sigue diciendo `PTKL`

En la consola de la ventana de la app (clic derecho → Inspeccionar):

```js
localStorage.setItem('folio:prefijo-provisional', '1');
```

- [ ] Recargar. El siguiente folio debe empezar por **AZUL**, conservando los
      dos caracteres del dispositivo.

## 3 · El flujo de la cuenta — un solo papel

- [ ] Mesa con productos → **Pedir Cuenta**.
- [ ] **Sale UN papel**, con folio.
- [ ] **El cajón NO se abre.** Es lo más importante de este paso: ese papel se
      imprime antes de cobrar y no debe mover dinero.
- [ ] El maquetado nuevo: **TOTAL arriba y grande**, luego `SON:`, y abajo
      `SUBTOTAL:… IVA:…` en una sola línea. Advertencia fiscal primero, propina
      después.
- [ ] **No dice «Recibido» ni «Cambio» ni «Pago:»** — no se ha pagado todavía.

- [ ] Cobrar en **efectivo** → **no sale un segundo papel**.
- [ ] ~~el cajón se abre~~ / ~~con tarjeta no se abre~~ — **no se puede
      verificar**: el cajón del restaurante está averiado y sólo abre con la
      llave. El pulso ESC/POS sale igual (`hub_abrir_cajon`), pero no hay forma
      de comprobarlo hasta que se repare o se pruebe en otro cajón. **Queda
      pendiente, no verificado.**

- [ ] **Mostrador** (venta directa, sin mesa) → al cobrar **sí** sale ticket,
      con método de pago y cambio. Ese flujo no cambió.

## 4 · El bloqueo de la cuenta

- [ ] Con la cuenta impresa, intentar agregar un producto → **no deja**, y sale
      el aviso con el folio y el botón «Reabrir cuenta».
- [ ] «A Producción» y «Pedir Cuenta» quedan apagados.
- [ ] **Reabrir** con una sesión que tenga `autoriza_descuentos` (Admin,
      Gerente o Capitán) → entra directo, **sin pedir PIN**.
- [ ] Reabrir desde una sesión de mesero → **pide PIN**; con el PIN de un
      encargado, reabre.
- [ ] Tras reabrir: se puede agregar, y **el folio NO cambió**.
- [ ] En **Auditoría** aparece `REAPERTURA_CUENTA` con quién autorizó.

## 5 · Las comandas de cocina

- [ ] Con red, mandar a producción → **no sale papel de cocina** (el KDS ya la
      tiene).
- [ ] **Apagar el wifi**, mandar a producción → **sí sale**, unos dos segundos
      después.

> Ese retraso es el sondeo esperando a ver si la comanda sube. Está acotado a
> propósito: cocina no puede esperar más.

> Lo fácil es que deje de imprimir. **Lo que hay que verificar es que siga
> imprimiendo cuando hace falta.**

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
      suena**; el aviso es de la estación que se está mirando, como se acordó.

- [ ] **Minimizar la ventana** (o irse a otra app) y mandar una comanda → sale
      la **notificación de Windows**.
- [ ] Al volver a la ventana, **el cartel sigue puesto** y recién entonces
      empieza a contar sus 6 s.
- [ ] Mandar dos seguidas estando fuera → **una sola notificación**, no dos
      apiladas. Al volver, lo que importa es la pantalla.

> **Esto falló el 12-ago y se arregló, pero hay que recompilar.** Sonaba y la
> notificación no salía nunca. Dos causas, las dos del mismo tipo de siempre:
>
> 1. **WebView2 no implementa la API web `Notification`.** En el teléfono
>    funcionaba; en la caja `Notification.permission` se quedaba en `'default'`
>    para siempre, `requestPermission()` no enseñaba ningún diálogo y no había
>    error que mirar. Ahora se usa `tauri-plugin-notification`, que habla con el
>    centro de notificaciones de Windows de verdad.
> 2. **Minimizar no es «oculto».** Se preguntaba por `document.visibilityState`,
>    y una ventana de Tauri minimizada —o tapada por WhatsApp— **sigue diciendo
>    'visible'**. Ahora manda el **foco**, que sí se pierde.
>
> **Dos avisos para cuando no aparezca la notificación, y no sean bugs:**
>
> - En Windows el plugin **sólo funciona con la app INSTALADA**. Con el `.exe`
>   suelto, o en `tauri dev`, el toast sale con el icono de PowerShell o no
>   sale. Si en la cocina van a correr el ejecutable a pelo, **esto no va a
>   funcionar** y hay que instalarlo de verdad.
> - El **asistente de concentración** de Windows silencia los toasts sin
>   decírselo a nadie. Es lo primero que hay que mirar.
>
> Por eso el cartel de la pantalla ahora **espera**: su cuenta atrás no corre
> mientras la ventana está desatendida. Aunque Windows se trague el toast, quien
> vuelve de la barra encuentra el aviso puesto en vez de una pantalla muda. El
> sonido, que es el que nunca falló, sigue siendo la primera línea.

- [ ] Entrar al KDS como **Gerente o Admin** → **no aparece el botón y no suena
      nada.** Entran a supervisar; un pitido por comanda es ruido.

## 9 · La salida del KDS — que el barista pueda irse

El 12-ago quedaste encerrado en la sesión de barista. `/kds` es pantalla
completa (sin riel) y su botón «Salir» navegaba a `getRutaInicial()`, que para
Chef y Barista **es `/kds`**: el botón no hacía nada. Como el logout vive en
`/perfil`, no había ninguna salida.

Ya no se arregla pantalla por pantalla. El destino lo calcula `lib/Escape.js` y
`Escape.test.js` lo comprueba contra **todos los roles y contra roles inventados**
—incluido uno con las capacidades corruptas—, en todas las pantallas sin riel. La
garantía que da: nunca devuelve la pantalla actual, y siempre devuelve algo que
el rol puede abrir o `/checador`, que es pública.

- [ ] Como **Barista**, el botón de arriba dice **«Mi perfil»**, no «Salir», y
      lleva ahí. El texto sigue al destino: mandar a alguien al perfil bajo un
      cartel que dice «Salir» es mentirle, y ese botón se lee todos los días.
- [ ] El **gorro de chef** del encabezado también lleva al perfil (pedido de
      Chris). Es un extra de escritorio: en teléfono ese bloque está oculto, por
      eso el botón sigue siendo la salida de verdad.
- [ ] Como **Admin**, el mismo botón dice **«Salir»** y lleva a `/dashboard`,
      igual que siempre.
- [ ] Desde ahí, **Cerrar sesión** funciona y lleva a `/loginempleados`.
- [ ] Si tiene entrada abierta sin salida, primero exige marcar salida. Es lo
      correcto: la sesión no debe ser la puerta de atrás del checador.
- [ ] En **Mi perfil** aparece el riel con **«Monitor Cocina»** para volver.
- [ ] En el **POS**, salir desde Mostrador con una sesión de mesero → cae en
      `/mesas`. Ese botón tenía el mismo agujero tapado con un `?? '/mesas'`
      que suponía que todo el mundo puede abrir el mapa.

> **Si mañana se agrega una tercera pantalla sin riel**, hay que anotarla en
> `RUTAS_PANTALLA_COMPLETA` (`lib/Navegacion.js`). Entra sola en la matriz de
> `Escape.test.js` y la suite no pasará hasta que tenga salida para todos los
> roles. Es la parte que impide que esto vuelva a ocurrir; el resto sólo arregla
> lo de ahora.

> Ese botón estaba marcado en el código como «no-op consciente». No lo era.
> Está anotado en el backlog §8 junto con lo que apareció al arreglarlo y **no**
> se tocó: de quién lee las capacidades el riel lateral.

---

## Lo que NO se hizo, y por qué

**§F del diseño — preguntar por el cobro parcial al pedir la cuenta.**

Es lo único que queda del flujo. Se dejó fuera a propósito: cambia **qué se
imprime y qué se cobra**, y va montado encima de otros cinco cambios que
todavía no se han visto funcionar. Meter una modificación del camino del dinero
sobre una base sin verificar es cómo se producen los fallos que luego cuesta
media sesión aislar — hoy ya pasó una vez con el cajón.

Cuando este checklist esté en verde, §F son un par de horas y se puede probar
contra algo que se sabe bueno.

## Deuda conocida que sigue ahí

- `ModalCobro` aún no usa `lib/Autorizacion.js` — tercera copia evitada, segunda
  pendiente de migrar.
- El `id` de `auditoria` sigue saliendo de `Date.now()` (ver backlog §7).
- CSP nulo en `tauri.conf.json` y `CorsLayer::permissive()` en el hub.
- La reimpresión de documentos existe en `Comanda.js` y **nadie la llama**.
- `mesas.mesero_id` sigue muerto: bloquea tres de las cinco propuestas de sala.
- Queda por localizar el archivo que ensucia `matchMedia` entre ficheros. No
  rompe nada con aislamiento; sólo estorba al correr sin él.
