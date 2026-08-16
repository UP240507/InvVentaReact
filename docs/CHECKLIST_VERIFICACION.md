# Checklist de verificación — todo lo del 11 y 12-ago

Se escribió mucho en dos días y **casi nada se ha visto funcionar**. Este
documento es la lista de lo que falta comprobar, en el orden en que conviene
hacerlo: cada bloque supone que el anterior pasó.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
cinco cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados.

---

## RESULTADO — verificación en AZUL, 15-ago-2026 (tarde)

La mañana **no se hizo**: no hubo ventas en Simulador ni comprobación de stock
en solitario. Todo lo de abajo se midió por la tarde, con la impresora real
conectada y con Chris en el local.

**Verificado:** §0 (Chris, `cargo test` y la suite npm, en verde), §1, §2 —de
rebote—, §3, §4 salvo lo que se dice abajo, §5 completo, el descuento de stock
de §10 y el respaldo de la caja de §10.

**Sin verificar, y anotado sin disimulo:** §5b sólo se ejercitó con nota libre
—ningún grupo de modificadores atado en Recetas llegó a una venta—, §6, §7, §8,
§9, §11, la mitad del respaldo que exige matar un teléfono, y el pulso del
cajón, que sigue averiado en el local.

### Los dos fallos encontrados, en el orden en que conviene atacarlos

**1 · La venta con nota o modificador NO llega a Supabase. 22P02, permanente.**

Síntoma exacto, tal cual salió en pantalla:

```
ventas INSERT · PERMANENTE (22P02)
folio: AZULJ3-V-000006 · total: 209
invalid input syntax for type bigint: "1781461782580::nota:Sin cebolla, sin mostaza"
```

La causa está en `supabase/migrations/20260811042805_verificar_total_venta_lectura_defensiva_config.sql`,
línea 61:

```sql
nullif(it->>'id','')::bigint as receta_id,
```

El trigger desempaqueta `ventas.items` y castea el `id` de cada línea a
`bigint`. Desde el 14-ago ese `id` ya no es el número del producto: es la firma
que `firmaDeLinea()` construye con la selección y la nota dentro. Postgres
rechaza el cast y **tumba el INSERT entero**.

El patrón de siempre: el trigger es del 11-ago y era correcto para el dato de
entonces, los modificadores son del 14 y también son correctos, y el hueco está
exactamente en medio. Ningún lado dio error; el único que se queja es Postgres,
en el último salto, y la venta se queda en el equipo.

Alcance: **toda venta que lleve al menos una línea con nota o con modificador.**
Como el fallo es permanente, no se reintenta sola.

El arreglo es de una línea y el dato bueno ya viaja al lado del malo — el mismo
item trae `"receta_id":1781461782580`. El trigger tiene que leer `receta_id` y
caer a `id` sólo si falta.

> **Consecuencia colateral, que al principio se diagnosticó como un fallo
> aparte y no lo era.** En mostrador salieron ticket + dos comandas con red,
> que es justo lo que el ajuste `sin_nube` debía evitar. La cola sube en serie
> y la comanda iba detrás de una venta que estaba muriendo, así que
> `llegoALaNube` agotó sus 2 s y el papel salió. Un cobro de mostrador **sin**
> notas imprimió sólo el ticket: mismo bug, no dos. Queda dicho porque la
> primera prueba que se diseñó para separarlos comparaba mesa contra mostrador
> cuando la variable real era nota contra sin nota.

**2 · Tras reabrir una cuenta, volver a pedirla no imprime nada. En silencio.**

Con el flujo en `ticket_final`, `handlePedirCuenta` llama a `enviarTicket` y
`construirTicket` arma el id así (`lib/Comanda.js:450`):

```js
id: `ticket::${venta.id ?? venta.folio}${sufijoCopia(copia)}`,
```

`datosCuenta` no lleva `id`, así que cae al **folio** — y el folio, a propósito,
**no cambia al reabrir**: el cliente ya tiene ese número en la mano. Resultado:
el segundo documento tiene el id del primero, el hub lo reconoce como ya
impreso (`hub/cola.rs:155`) y lo descarta como duplicado.

Y el descarte no se nota: `Recibo::Duplicado` **no es un error** para el hub —lo
dice su propio comentario—, así que la promesa vuelve con `ok` y el aviso «No se
pudo imprimir la cuenta» nunca aparece. El mesero pulsa, no sale papel y nadie
dice nada.

Importa más de lo que parece: reabrir una cuenta es exactamente el caso en que
hace falta un papel nuevo —se agregó algo y el total cambió—, y el cliente se
queda con una tira cuyo total ya no es el suyo.

Relacionado con la deuda ya anotada: «la reimpresión de documentos existe en
`Comanda.js` y nadie la llama». La reimpresión tras reapertura es precisamente
eso, con su aviso impreso y su sufijo de copia.

### Lo que el checklist decía mal, y ya está corregido abajo

- **§2 no hacía falta.** El folio ya salía como `AZULKL-V-000010` el 12-ago y
  hoy como `AZULJ3-V-000006`: el prefijo `AZUL` lleva días bien. Lo de `PTKL`
  estaba viejo.
- **El paso de §2 es inejecutable en producción de todos modos**: pide la
  consola del navegador, y `src-tauri/Cargo.toml` declara `tauri` sin la feature
  `devtools`, así que en un build de release no hay nada que abrir. Se comprobó
  en la caja: no abre.
- **§10 no necesita generar llaves**: `tauri.conf.json` ya tiene la `pubkey`
  pegada de verdad, no el `PEGA_AQUI_LA_CLAVE_PUBLICA`.

---

## 0 · Antes de nada — que compile y que pase la suite

- [x] `cd src-tauri && cargo test` — **15-ago, verde.** Lo corrió Chris en su
      máquina; compila por primera vez el pulso del cajón y los tres módulos
      del 13-ago.

  Toca Rust dos veces hoy: el **ancho configurable** (32/48) y el **pulso del
  cajón**. El primero ya compiló; el segundo **no se ha compilado nunca** — no
  hay toolchain de Rust en el entorno donde se escribió.

- [ ] `npm run test:rapido`

  El lote de lógica pura, sin DOM ni globales. **521 en verde.** `--isolate=false`
  aquí es seguro y rápido.

- [x] `npm run test:run` — **15-ago, verde.**

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

- [x] **La cuenta de la mesa** → «Un solo papel — el ticket final». **15-ago.**
- [x] **Cuándo imprimir las comandas** → «Sólo cuando no llegó a la nube».
      **15-ago.**
- [x] Pulsar **Guardar** y recargar para confirmar que quedaron. **15-ago:
      aguantaron la recarga.**

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

- [x] Recargar. El siguiente folio debe empezar por **AZUL**, conservando los
      dos caracteres del dispositivo.

> **15-ago: no hacía falta y además no se puede.** El folio ya salía bien desde
> antes — `AZULKL-V-000010` en el papel del 12-ago, `AZULJ3-V-000006` hoy. Y el
> paso es inejecutable en un build de release: `Cargo.toml` declara `tauri` sin
> la feature `devtools`, así que clic derecho → Inspeccionar no abre nada. Se
> probó en la caja. Si algún día hace falta repetirlo, o se compila con
> devtools o hace falta un botón en Ajustes; depender de una consola que el
> binario de producción no tiene es un fallo del checklist.

## 3 · El flujo de la cuenta — un solo papel

> **15-ago, antes de §3.** Al reconectar la impresora salió un documento del
> **12-ago** que llevaba tres días en la cola del hub y se vació al volver el
> transporte. Bien por la cola; mal para contar papeles. Si se repite la
> prueba, **vaciar la cola antes** — si no, un papel viejo se cuela en medio y
> se cuenta como el segundo que no debía salir.

- [x] Mesa con productos → **Pedir Cuenta**. **15-ago.**
- [x] **Sale UN papel**, con folio. **15-ago.**
- [ ] **El cajón NO se abre.** Es lo más importante de este paso: ese papel se
      imprime antes de cobrar y no debe mover dinero.
- [x] El maquetado nuevo: **TOTAL arriba y grande**, luego `SON:`, y abajo
      `SUBTOTAL:… IVA:…` en una sola línea. Advertencia fiscal primero, propina
      después. **15-ago, comprobado en papel.**
- [x] **No dice «Recibido» ni «Cambio» ni «Pago:»** — no se ha pagado todavía.
      **15-ago.**

- [x] Cobrar en **efectivo** → **no sale un segundo papel**. **15-ago.**
- [ ] ~~el cajón se abre~~ / ~~con tarjeta no se abre~~ — **no se puede
      verificar**: el cajón del restaurante está averiado y sólo abre con la
      llave. El pulso ESC/POS sale igual (`hub_abrir_cajon`), pero no hay forma
      de comprobarlo hasta que se repare o se pruebe en otro cajón. **Queda
      pendiente, no verificado.**

- [x] **Mostrador** (venta directa, sin mesa) → al cobrar **sí** sale ticket,
      con método de pago y cambio. Ese flujo no cambió. **15-ago.**

- [ ] **FALLA — reabrir la cuenta y volver a pedirla no imprime nada, y no
      avisa.** Ver el bloque de resultados arriba, fallo 2: el id del documento
      sale del folio, el folio no cambia al reabrir, y el hub descarta el
      segundo como duplicado sin considerarlo un error.

## 4 · El bloqueo de la cuenta

- [x] Con la cuenta impresa, intentar agregar un producto → **no deja**, y sale
      el aviso con el folio y el botón «Reabrir cuenta». **15-ago.**
- [x] «A Producción» y «Pedir Cuenta» quedan apagados. **15-ago.**
- [x] **Reabrir** con una sesión que tenga `autoriza_descuentos` (Admin,
      Gerente o Capitán) → entra directo, **sin pedir PIN**. **15-ago.**
- [ ] Reabrir desde una sesión de mesero → **pide PIN**; con el PIN de un
      encargado, reabre. **No se probó**: la tarde se hizo con sesión de dueño.
- [x] Tras reabrir: se puede agregar, y **el folio NO cambió**. **15-ago.**
- [x] En **Auditoría** aparece `REAPERTURA_CUENTA` con quién autorizó.
      **15-ago.**

> **15-ago: aquí salió el fallo 2.** Tras reabrir, «Pedir Cuenta» no vuelve a
> imprimir y tampoco avisa. Ver el bloque de resultados. Es justo el caso en
> que hace falta papel nuevo: se reabre para agregar algo, y el total cambia.

## 5 · Las comandas de cocina

- [x] Con red, mandar a producción → **no sale papel de cocina** (el KDS ya la
      tiene). **15-ago, en mesa.**
- [x] **Apagar el wifi**, mandar a producción → **sí sale**, unos dos segundos
      después. **15-ago.** Es la mitad que importaba y salió bien.

> **15-ago, y no es un fallo de §5.** En mostrador *con red* sí salieron las
> comandas. Resultó ser el fallo 1: iban detrás de una venta que moría en el
> trigger, y el sondeo agotó sus 2 s esperándola. Un cobro de mostrador sin
> notas imprimió sólo el ticket.

> Ese retraso es el sondeo esperando a ver si la comanda sube. Está acotado a
> propósito: cocina no puede esperar más.

> Lo fácil es que deje de imprimir. **Lo que hay que verificar es que siga
> imprimiendo cuando hace falta.**

## 5b · «¿Cómo lo quiere?» — modificadores y notas (nuevo el 13-ago)

Hasta el 13-ago **el punto de venta no tenía forma de personalizar una línea**:
ni modificadores ni nota. El catálogo de grupos existía, el enlace en Recetas
existía, la comanda sabía imprimir la nota y el KDS sabía pintarla — pero nadie
producía el dato. Un mesero no podía pedir «término medio».

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
- [ ] La nota libre se pone desde el **icono de la nota en la línea del
      carrito** (📝), también en productos sin grupos («sin hielo»).
- [ ] **Dos veces el mismo platillo con elecciones distintas = DOS líneas.**
      Uno término medio y otro bien cocido no pueden fundirse en «2x». Es el
      fallo más caro de esta pantalla: la cocina sacaría dos iguales y nadie se
      entera hasta que el cliente devuelve el plato.
- [ ] Mandar a producción → en el **KDS** salen las opciones en grande y la
      nota con su 📝.
- [~] Por la tarde, con impresora: en el **papel de cocina** las opciones salen
      sangradas debajo del platillo, igual que los componentes de un paquete.
      **15-ago, a medias:** la **nota libre** sí sale en la comanda impresa. Los
      **grupos de modificadores no se ejercitaron** — no se llegó a preparar el
      catálogo ni a atar ninguno en Recetas, así que ninguna venta llevó
      opciones. La cadena hasta el papel está demostrada para la nota; para las
      opciones sigue sin verse.
- [ ] Intentar cambiar la nota de una línea **ya enviada** → lo impide y
      explica por qué (el papel que tiene el cocinero ya salió).

> **Nada de esto suma precio ni descuenta inventario, y es a propósito.** Es la
> condición que permitió que entrara dos días antes de esta prueba: lo que hoy
> se verifica es que el stock se descuenta bien, y meter código nuevo en el
> camino del inventario esa misma semana convertiría un fallo de modificadores
> en un fallo de inventario sin forma de distinguirlos. Si ves una opción con
> precio en el catálogo, **no la uses el sábado**: se elegiría y no se cobraría.
> Ver `docs/PENDIENTE_LUNES.md` §8.

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

---

## 10 · Lo del 13-ago — TODO EL RUST ESTÁ SIN COMPILAR

Tres módulos nuevos de Rust se escribieron sin toolchain a mano. **Antes que
nada:**

- [ ] `cd src-tauri && cargo test`

  Toca `respaldo.rs` (12 pruebas), `anuncio.rs` (2) y el plugin del updater.
  Además `cargo` va a bajar tres dependencias nuevas: `tauri-plugin-notification`,
  `mdns-sd` y `tauri-plugin-updater`.

- [ ] `scripts/pruebas-rust.sh` — ahora incluye `respaldo`, así que la lógica
      del respaldo se puede verificar también fuera de Windows.

### El respaldo de ventas

- [x] En **Ajustes → Hub** aparece el bloque **«Respaldo de ventas»**. **15-ago.**
- [x] Cobrar en la caja → **«Sin confirmar» sube y vuelve a bajar** en unos
      segundos, cuando la venta llega a Supabase. **15-ago.**
- [x] Existe `%APPDATA%\app.invventa.pos\respaldo-ventas.ndjson`. **15-ago.**

> **15-ago: el respaldo se verificó con un fallo real, no con uno simulado.** La
> venta `AZULJ3-V-000006` (total 209) es la que el trigger rechazó, y estaba
> entera en el `.ndjson`, con su folio y sus dos líneas. «Sin confirmar» se
> quedó en **1** y no bajó, que es exactamente lo correcto: esa venta no va a
> llegar a Supabase hasta que se arregle el fallo 1. El contador es una alarma
> fiel. Mejor prueba que la planeada.
>
> **No borrar los datos del navegador de la caja** mientras esa venta siga sin
> subir.

La prueba que de verdad demuestra que esto sirve, y la única que vale:

- [ ] Cobrar **desde el teléfono, sin internet** (wifi del local sí, datos no).
- [ ] **Cerrar la pestaña del teléfono y borrar sus datos de sitio** — o sea,
      simular que el teléfono murió con la venta dentro.
- [ ] Esperar 15 minutos (o revocar el dispositivo desde la caja para acelerar).
- [ ] En la caja, **«Por adoptar» marca 1** → pulsar **Recuperar ahora**.
- [ ] La venta está en Supabase, con su folio y su total.

> Sin ese último paso, lo escrito hoy es una suposición. Es exactamente el tipo
> de cosa que parece funcionar hasta el día que hace falta.

### El descuento de inventario, que ahora es idempotente

- [x] Mandar a producción una mesa → el stock baja **una vez**. **15-ago.**
- [x] Cortar la red justo después y dejar que la cola reintente → **no vuelve a
      bajar**. **15-ago.** Medido con naranja: **80 kg antes, 79.8 kg después**
      de un jugo que consume 0.2. Un solo descuento tras el reintento.
- [ ] En Supabase, `stock_salidas` tiene una fila por comanda (o por venta en
      mostrador). **Pendiente**: el número se leyó en la caja, no en la nube.
      Son cinco minutos y es la prueba dura del guardia — el contador local
      podría estar bien y `stock_salidas` tener dos filas.

> Esto arregla un fallo que **ya existía**: hasta hoy, un reintento tras un
> timeout post-commit descontaba dos veces sin decir nada.

### mDNS

- [ ] En la consola de la caja sale `[hub] anunciado como
      http://invventa-caja.local:3000`.
- [ ] Desde un **iPhone** o desde otra PC, esa dirección abre la app.
- [ ] Desde **Android puede que no funcione**, y no es un fallo: Chrome resuelve
      `.local` de forma irregular. Por eso el QR sigue llevando la IP.

### El updater

Ver `docs/CHECKLIST_ACTUALIZACIONES.md`. **Corregido el 15-ago:** la `pubkey`
ya está pegada de verdad en `tauri.conf.json`, no el marcador de posición. Lo
que sigue haciendo falta para compilar el bundle es exportar
`TAURI_SIGNING_PRIVATE_KEY` y su contraseña **en la misma sesión de shell**, o
la compilación revienta al firmar, al final del build.

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
