# Lo verificado en AZUL — 15-ago-2026

Registro de la prueba de campo. Lo que está aquí **se vio funcionar**, con la
impresora real conectada y Chris en el local. Lo que sigue pendiente vive en
`docs/CHECKLIST_VERIFICACION.md`, que a partir de hoy sólo contiene lo que falta.

**La mañana no se hizo.** El plan era que Chris cubriera §3, §4 y el descuento
de stock él solo, en Simulador. No hubo ninguna venta en Simulador ni tickets en
`impresiones`. Todo lo de abajo se midió por la tarde, del tirón.

---

## Lo que quedó verificado

### §0 · La suite

- `cd src-tauri && cargo test` — **verde.** Es la primera vez que compilan el
  pulso del cajón y los tres módulos del 13-ago (`respaldo.rs`, `anuncio.rs` y
  el plugin del updater). Se habían escrito sin toolchain a mano.
- `npm run test:run` — **verde**, la suite entera con aislamiento.

### §1 · Los ajustes

- **La cuenta de la mesa** → «Un solo papel — el ticket final». Guardado.
- **Cuándo imprimir las comandas** → «Sólo cuando no llegó a la nube». Guardado.
- **Aguantaron la recarga**, que es lo que la vez pasada falló: el ajuste parecía
  roto y en realidad nunca se había guardado.
- **Ancho de papel a 80 mm (48 columnas)**, confirmado en una impresión de
  prueba: acentos y ñ correctos, y la línea larga usando el ancho completo. El
  selector que mentía —devolvía el ancho por el camino HTTP y no por
  `hub_estado`— quedó arreglado en el binario 0.2.3.

### §2 · El folio

Ya estaba bien **desde antes**, y no hizo falta tocar nada: `AZULKL-V-000010` en
el papel del 12-ago, `AZULJ3-V-000006` hoy. Prefijo `AZUL` y los dos caracteres
del dispositivo.

### §3 · El flujo de la cuenta — un solo papel

- Mesa con productos → **Pedir Cuenta** → **sale UN papel**, con folio.
- El maquetado nuevo, comprobado en papel: **TOTAL solo y en grande**, `SON:`
  debajo, `SUBTOTAL:… IVA:…` en una sola línea, y las advertencias en el orden
  del ticket de AZUL — fiscal primero, propina después.
- **No dice «Recibido» ni «Cambio» ni «Pago:»**. No se ha pagado todavía.
- Cobrar en **efectivo** → **no sale un segundo papel**.
- **Mostrador**: al cobrar sí sale ticket, con su método de pago y su
  Recibido/Cambio.

> **Antes de §3 pasó algo que conviene recordar si esto se repite.** Al
> reconectar la impresora salió un documento del **12-ago** que llevaba tres
> días en la cola del hub y se vació en cuanto volvió el transporte. Habla bien
> de la cola y mal de contar papeles: **vaciar la cola antes de medir**, o un
> papel viejo se cuela y se cuenta como el segundo que no debía salir.

### §4 · El bloqueo de la cuenta

- Con la cuenta impresa, agregar un producto → **no deja**, con el aviso, el
  folio y el botón «Reabrir cuenta».
- «A Producción» y «Pedir Cuenta» apagados.
- **Reabrir con sesión de Admin** → entra directo, sin PIN.
- Tras reabrir se puede agregar, y **el folio NO cambió**.
- En **Auditoría** aparece `REAPERTURA_CUENTA` con quién autorizó.

*(Lo que falta de §4 y lo que falló al reabrir están en el checklist y en los
fallos de abajo.)*

### §5 · Las comandas de cocina

- **Con red**, mandar a producción desde una mesa → **no sale papel de cocina**.
  El KDS ya la tiene.
- **Sin wifi**, mandar a producción → **sí sale**, un par de segundos después.

Esta es la mitad que importaba. Lo fácil era que dejara de imprimir; lo que había
que demostrar es que **sigue imprimiendo cuando hace falta**.

### §5b · «¿Cómo lo quiere?» — modificadores y notas

La **nota** escrita en la línea del carrito sale impresa en la comanda de cocina.
La cadena que el 14-ago estaba rota —`construirItemsComanda` armaba el item campo
a campo y perdía todo dato nuevo en silencio— está entera.

Y ya al final del día, con el catálogo preparado —grupo creado en **Catálogos →
Modificadores** y atado a un platillo en **Recetas**, que es el paso que se
olvida— se comprobó el resto de la sección: el cuadro se abre solo, el botón
apagado dice cuál grupo falta, un platillo sin grupos entra de un solo toque, las
opciones salen en el KDS y sangradas en el papel de cocina, y la nota de una
línea ya enviada no se deja cambiar.

Lo importante, y confirmado explícitamente: **el mismo platillo con elecciones
distintas queda en DOS líneas**, no fundido en «2x». Es lo que sostiene
`firmaDeLinea()`, y es el fallo más caro que podía tener esa pantalla — fundidas,
la cocina saca dos iguales y nadie se entera hasta que el cliente devuelve el
plato.

### §6 · El teléfono

El botón con las iniciales del mesero, arriba a la derecha; lleva a Perfil; y al
cerrar sesión cae en `/loginempleados` (código + PIN), no en el formulario de
correo.

### §7 · El checador

- «Quién está trabajando» pide PIN de Admin o Gerente, y la lista muestra nombre,
  hora de entrada y tiempo dentro.
- **Los tres registros abiertos de AZUL** aparecen: Carlos Muñoz entre los
  activos, y Daniel Muñoz y Juan Pérez en «sin salida registrada».
- Cerrar un olvido exige `horas_jornada` configurado.
- Y lo que se comprobó en **Asistencias**, que es donde esto fallaría callado: la
  hora guardada al cerrar un olvido es **entrada + jornada**, una salida de hace
  semanas, no la de hoy. Si guardara la actual, el registro diría que estuvo 40
  días dentro.

### §8 · El aviso del KDS — sonido y notificaciones

Verificado entre el 15 y el 17-ago, sobre binarios que ya llevaban el arreglo:
`tauri-plugin-notification` entró en `0b07b88`, anterior a los modificadores, así
que la 0.2.2 ya lo tenía.

- Como **Chef**, aparece «Activar avisos», y al pulsarlo Windows pide permiso.
- El **cartel** sale con la mesa y los platillos, y se va a los 6 s.
- Marcar un item listo **no vuelve a sonar** — el error clásico de recalcular la
  lista y confundir cualquier cambio con una llegada.
- **Recargar con comandas en curso no suena**, ni al cambiar a Barra por lo que
  ya había, ni una comanda sólo de barra estando en Cocina.
- **Minimizado sale la notificación de Windows**, al volver el cartel sigue
  puesto, y dos comandas seguidas dan **una sola** notificación.
- Como **Gerente o Admin**, no aparece el botón y no suena nada.

Y dos cosas del teléfono que conviene dejar escritas:

- **El sonido dura ~1.6 s y eso es por diseño.** `lib/Campana.js`: tres notas de
  0.14 s, repetidas hasta tres veces. Es un timbre, no una alarma: suena y se
  calla en vez de insistir hasta que alguien lo reconozca. Si en AZUL se queda
  corto con el ruido de la cocina, se sube `repeticiones` — pero un aviso que
  insiste se acaba silenciando, y entonces no avisa nunca.
- **Suena con la pantalla apagada.** No estaba garantizado: los navegadores
  móviles suelen suspender el audio al bloquear.
- Las **notificaciones del sistema en teléfono** quedan fuera por decisión, no
  como pendiente. El sonido es la vía en el móvil.

### §9 · La salida del KDS — el barista puede irse

Verificado el 17-ago, entero: como Barista el botón dice «Mi perfil» y lleva ahí,
el gorro de chef del encabezado también, y en Mi perfil aparece el riel con
«Monitor Cocina» para volver. Como Admin el mismo botón dice «Salir» y lleva a
`/dashboard`, cerrar sesión cae en `/loginempleados`, y con entrada abierta
primero exige marcar salida. En el POS, salir desde Mostrador con sesión de
mesero cae en `/mesas`.

El destino lo calcula `lib/Escape.js` y `Escape.test.js` lo comprueba contra
todos los roles y contra roles inventados. Lo que se acaba de ver en pantalla es
que esa garantía llega hasta los botones de verdad.

> **De aquí salió una petición nueva**, que no es un fallo sino diseño: el KDS
> debería ser **sólo lectura fuera de tu estación**. Ver `PENDIENTE_LUNES.md` §7.

### §10 · mDNS

Verificado el 17-ago: `http://invventa-caja.local:3000` abre la app **desde el
teléfono y desde otra PC**. La caja se encuentra por nombre, que es lo que evita
que un cambio de IP por DHCP deje a todos los teléfonos del local sin hub a la
vez, en hora de comida y sin ningún error a la vista.

Se probó estando la caja en un hotspot. Conviene repetirlo una vez en el wifi de
AZUL, que es la red donde va a vivir — el tethering aísla clientes y rompe
multicast con facilidad, así que si funcionó ahí, en una red normal debería ir
mejor, no peor.

> **El primer punto del checklist era inejecutable** y se retira: pedía leer
> `[hub] anunciado como…` en la consola de la caja, y esa consola no existe en un
> build de release. Lo que importa es que la dirección abra, y abre.
>
> **Y falta enseñarla.** `Anuncio::url()` está escrita, probada, y su comentario
> dice «para enseñarla junto a la de IP en la pantalla del hub» — pero nadie la
> llama salvo un `println!`. El servidor no la expone y `HubScreen` no la pinta.
> Hoy el nombre funciona y **ningún usuario tiene forma de descubrirlo**. Ver
> `PENDIENTE_LUNES.md`.

### §11 · Lo responsivo, en aparatos de verdad

Verificado el 17-ago, entero y fuera del simulador del navegador: con el teclado
abierto en un modal del ERP **el botón de guardar sigue siendo tocable**, el zoom
con dos dedos funciona, y en **tablet en horizontal** el Dashboard enseña los
cuatro KPIs en fila.

Era la única sección que no se podía delegar a una prueba: `modales-teclado.test.js`
impide que vuelva a colarse un `vh`, pero no puede ver si el resultado se ve bien.

### §4 · El PIN de mesero

Comprobado el 17-ago: reabrir una cuenta desde una sesión de mesero **pide PIN**,
y con el de un encargado reabre. Con eso §4 queda entero salvo la reimpresión,
que es el fallo 2.

### §10 · El descuento de inventario es idempotente

Medido con naranja, en el corte de red:

| | |
|---|---|
| Antes | **80 kg** |
| Un jugo, que consume | **0.2** |
| Después del reintento | **79.8 kg** |

**Un solo descuento**, con la cola reintentando tras recuperar la red. Arregla un
fallo que ya existía: hasta el 13-ago un reintento tras un timeout post-commit
descontaba dos veces sin decir nada.

Falta la prueba dura en la nube: que `stock_salidas` tenga **una sola fila** para
esa comanda. El número se leyó en la caja.

### §10 · El respaldo de ventas de la caja

Se verificó **con un fallo real en vez de uno simulado**, que es mejor prueba que
la planeada.

La venta `AZULJ3-V-000006` (total 209) es la que el trigger rechazó, y estaba
entera en `%APPDATA%\app.invventa.pos\respaldo-ventas.ndjson`, con su folio y sus
dos líneas. En Ajustes → Hub, **«Sin confirmar» se quedó en 1 y no bajó** — que
es exactamente lo correcto: esa venta no va a llegar a Supabase hasta que se
arregle el fallo 1. El contador es una alarma fiel.

> **Mientras esa venta siga sin subir, no borrar los datos del navegador de la
> caja.** Sólo vive ahí.

**La otra mitad, verificada el 17-ago.** Se montó un hotspot sin salida a
internet con la caja y un teléfono dentro, se cobró, y se le borraron al teléfono
los datos de sitio antes de devolverle nada — matarlo a propósito con la venta
dentro. Tras revocar el dispositivo, «Por adoptar» marcó **5** y «Recuperar
ahora» las subió: 3 ventas de la caja, 1 del teléfono y 1 comanda. Las cinco
comprobadas en `public.ventas` y `public.comandas`, no en el mensaje de la app.

Lo escrito el 13-ago deja de ser una suposición.

De aquí salieron los fallos **6** y **7**, que no van del respaldo sino de lo que
el respaldo *no* cubre.

> **Y una etiqueta que engaña, de las baratas de arreglar:** el bloque se llama
> «Respaldo de ventas» y sus contadores incluyen **comandas**. Por eso «5» no
> cuadraba con las 4 ventas y costó diez minutos de susto pensando que se había
> perdido una. Que separe las dos cosas, o que diga «pendientes».

---

## Los siete fallos encontrados

En el orden en que conviene atacarlos, que no es el de gravedad sino el de
dependencia: hasta que el primero esté arreglado, su ruido se mete en cualquier
medición del camino de la cola.

### 1 · La venta con nota o modificador NO llega a Supabase — **ARREGLADO el 17-ago**

> **Cerrado, y comprobado por el lado que cuenta.** La corrección está en
> `supabase/migrations/20260817090000_verificar_total_venta_id_de_linea_no_numerico.sql`,
> aplicada a la base de AZUL y verificada en `pg_proc` (el cast viejo ya no está
> en el cuerpo de la función).
>
> La venta que lo destapó está en la nube, entera:
>
> | | |
> |---|---|
> | folio | `AZULJ3-V-000006` |
> | total | 209.00 |
> | subtotal / IVA / propina | 163.79 / 26.21 / 19.00 |
> | líneas | Jugo + Hamburguesa |
> | `total_divergente` | `false` |
>
> No es un `success: true`: es la fila consultada en `public.ventas`.

Síntoma exacto, tal cual salió en pantalla:

```
ventas INSERT · PERMANENTE (22P02)
folio: AZULJ3-V-000006 · total: 209
invalid input syntax for type bigint: "1781461782580::nota:Sin cebolla, sin mostaza"
```

La causa, en `supabase/migrations/20260811042805_verificar_total_venta_lectura_defensiva_config.sql`,
línea 61:

```sql
nullif(it->>'id','')::bigint as receta_id,
```

El trigger desempaqueta `ventas.items` y castea el `id` de cada línea a `bigint`.
Desde el 14-ago ese `id` ya no es el número del producto: es la firma que
`firmaDeLinea()` construye con la selección y la nota dentro. Postgres rechaza el
cast y **tumba el INSERT entero**.

El patrón que define este proyecto: el trigger es del 11-ago y era correcto para
el dato de entonces, los modificadores son del 14 y también son correctos, y el
hueco está exactamente en medio. Ningún lado dio error. El único que se queja es
Postgres, en el último salto, y la venta se queda en el equipo.

**Alcance:** toda venta con al menos una línea con nota o modificador. Y como el
fallo es permanente, no se reintenta sola.

El arreglo es de una línea, y el dato bueno ya viaja al lado del malo — el mismo
item trae `"receta_id":1781461782580`. El trigger tiene que leer `receta_id` y
caer a `id` sólo si falta.

> **Consecuencia colateral, que al principio se diagnosticó como un fallo aparte
> y no lo era.** En mostrador salieron ticket + dos comandas *con red*, que es
> justo lo que el ajuste `sin_nube` debía evitar. La cola sube en serie y la
> comanda iba detrás de una venta que estaba muriendo, así que `llegoALaNube`
> agotó sus 2 s y el papel salió. Un cobro de mostrador **sin** notas imprimió
> sólo el ticket: mismo bug, no dos.
>
> Queda escrito porque la primera prueba que se diseñó para separarlos comparaba
> mesa contra mostrador cuando la variable real era nota contra sin nota.

### 2 · Tras reabrir una cuenta, volver a pedirla no imprime nada — **ARREGLADO el 17-ago**

> Commit `655916e`. `orden_actual` lleva un contador de impresiones que entra en
> el id, y el ticket deja de estampar el aviso de copia —texto de cocina en el
> papel de un cliente—. Las comandas lo conservan.
>
> **Y salió un tercero por el camino:** «A Producción» armaba `orden_actual`
> desde cero y **borraba el folio reservado**, así que reabrir, mandar algo a
> cocina y cobrar acuñaba un folio nuevo. Es una explicación del hueco
> `AZULHN-V-000004` más mundana que la del teléfono muerto, y no necesita que
> muera nada. Arreglado en el mismo commit.
>
> `Comanda.test.js` en verde con cuatro pruebas nuevas, y la suite entera en la
> máquina de Chris. **Falta verlo en papel**, con impresora: los cuatro pasos
> están en `CHECKLIST_VERIFICACION.md`.

Con el flujo en `ticket_final`, `handlePedirCuenta` llama a `enviarTicket`, y
`construirTicket` arma el id así (`lib/Comanda.js:450`):

```js
id: `ticket::${venta.id ?? venta.folio}${sufijoCopia(copia)}`,
```

`datosCuenta` no lleva `id`, así que cae al **folio** — y el folio, a propósito,
**no cambia al reabrir**: el cliente ya tiene ese número en la mano. Resultado: el
segundo documento llega con el id del primero, el hub lo reconoce como ya impreso
(`hub/cola.rs:155`) y lo descarta.

Y el descarte no se nota. `Recibo::Duplicado` **no es un error** para el hub —lo
dice su propio comentario—, así que la promesa vuelve con `ok` y el aviso «No se
pudo imprimir la cuenta» nunca aparece. El mesero pulsa, no sale papel, nadie
dice nada.

Importa más de lo que parece: reabrir es exactamente el caso en que hace falta un
papel nuevo, porque se agregó algo y el total cambió. El cliente se queda con una
tira cuyo total ya no es el suyo.

Conecta con la deuda ya anotada: «la reimpresión de documentos existe en
`Comanda.js` y nadie la llama». La reimpresión tras reapertura es justo eso, con
su aviso impreso y su sufijo de copia.

### 3 · Dos jugos de $40 se cobran a $80.01

Lo vio Chris en el papel. No es cosmético: el total que se cobra no es el que dice
el menú.

Con `precios_incluyen_iva`, `lib/Fiscal.js` hace esto:

```js
const subtotal = round2(baseAntesDesc - descuentoTicket); // 80/1.16 = 68.9655 → 68.97
const iva      = round2(subtotal * rate);                 // 68.97*0.16 = 11.0352 → 11.04
const total    = round2(subtotal + iva + propina);        // → 80.01
```

El IVA sale del subtotal **ya redondeado**, así que el redondeo se propaga hacia
arriba. Cuando el precio incluye IVA no hay que derivar el total: el precio de
menú **es** el total, y el IVA es el resto. Con `iva = brutoNeto − subtotal` da
`11.03`, la suma cuadra exacta y el papel dice `80.00`.

No dispara ninguna alarma, y conviene saber por qué: el trigger
`verificar_total_venta` calcula lo mismo sin redondear en medio
—`round(v_base * (1 + v_iva_rate), 2)` = `80.00`— y compara contra una tolerancia
de `0.02`. La divergencia máxima por este camino es de ~1.1 centavos, así que
`total_divergente` **nunca** se marca por esto. Pasa bajo el radar por poco.

Es el aviso de la cabecera de `Comanda.js` cumpliéndose por el otro lado: allí se
prohibió que el hub hiciera aritmética para no tener dos motores de dinero. El
segundo motor acabó estando en Postgres, y no coinciden.

### 4 · «Recuperar ahora» falla y dice «No había nada que recuperar»

Encontrado al final del día, y por accidente: al reabrir la app, el panel del
respaldo pasó a **«Sin confirmar: 1 · Por adoptar: 1»**. Al pulsar **Recuperar
ahora**, el aviso dijo **«No había nada que recuperar»** y los dos contadores se
quedaron en 1.

Lo que pasó de verdad: la adopción intentó subir la venta, chocó contra el mismo
trigger del fallo 1, y `drenarRespaldo` (`store/useSyncStore.js:677`) la capturó
en su `catch`. La captura es correcta —una que falle no debe detener a las demás,
y la venta se queda en el disco para el siguiente intento—, pero el resultado
sale de `subidas.length`, así que **fallar y no tener nada que hacer devuelven el
mismo cero** y el usuario lee lo segundo.

El error sólo va a `console.warn`, y la consola no abre en un build de release.
O sea: **un fallo de recuperación de una venta es hoy invisible.**

Lo mínimo sería distinguir los tres casos —nada que hacer, subidas, fallaron N—
y decir cuántas fallaron.

> **Lo seguro sí está bien, y conviene dejarlo dicho:** sólo se confirman las que
> subieron de verdad (`confirmarRespaldo(subidas)`). Pulsar el botón **no puede
> perder la venta**. El problema es lo que cuenta, no lo que hace.

**Y queda una pregunta abierta, que es la más interesante:** ¿por qué esa venta
pasó a «Por adoptar» justo al reiniciar la app? La cobró la caja, y la caja se
excluye a sí misma comparando tokens (`hub/servidor.rs:465`,
`dispositivo == quien_pregunta`). La hipótesis es que **al reiniciar tomó un
token distinto**, de modo que sus propias anotaciones dejaron de reconocerse como
suyas y, sin señales del token viejo en 15 minutos, pasaron a contar como
dispositivo muerto. Si es así, la caja se ofrece a adoptar lo suyo bajo otra
identidad — justo la carrera que ese `if` existe para evitar.

Se confirma comparando el `"dispositivo":"840ce96da4be84e5"` que lleva esa
anotación en el `.ndjson` con el token que la caja tenga ahora. **Sin comprobar
directamente — pero ver el fallo 5, que es evidencia fuerte de que sí ocurrió.**

### 5 · Un reintento sobre una fila que ya existe se marca como fallo permanente

Apareció al arreglar el fallo 1, y trae dentro la confirmación de la pregunta de
arriba.

Al aplicar la corrección del trigger y pulsar **Recuperar ahora**, la venta subió
— y en el log de auditoría quedó esto:

```
ventas INSERT · PERMANENTE (23505)
folio: AZULJ3-V-000006 · total: 209
duplicate key value violates unique constraint "ventas_pkey"
```

Ya no es `22P02`. Es una fila que **ya existe**: la venta llegó por los **dos
caminos a la vez**. La adopción del hub usa `upsert` y funcionó; la cola propia
del dispositivo usa `insert` y chocó.

Y eso es exactamente lo que `hub/servidor.rs:465` decía que no debía pasar:

> «La caja no adopta lo suyo propio: eso lo sube su propia cola, y hacerlo por
> los dos caminos a la vez sería pedirle a `upsert` que arregle una carrera que
> se puede evitar.»

**La carrera ocurrió.** Así que la exclusión por token no se aplicó, y la
hipótesis de que la caja toma un token distinto al reiniciar pasa de plausible a
bastante probable. Sigue faltando la comparación directa de los dos tokens, que
es lo que la confirmaría del todo.

Lo que hay que corregir, aparte de la exclusión: **un `23505` al reintentar algo
que ya está no es un fallo.** La fila existe, el objetivo se cumplió. Marcarlo en
rojo y dejarlo en el log de auditoría es alarmar por algo que salió bien — y
entrena a ignorar el panel donde vive el aviso de verdad.

### 6 · La auditoría tiene un agujero justo donde muere un dispositivo

Salió el 17-ago al probar el respaldo con un teléfono muerto de verdad, y es lo
más serio que ha aparecido en toda la verificación.

Las dos fuentes, consultadas directamente:

| | |
|---|---|
| `public.ventas` | `AZULHN-V-000005`, $188, Diego Perez, **20:09:18** |
| `public.auditoria` | última entrada a las **19:40:12** |

**Hay un cobro en los libros sin ningún `COBRO_TICKET` en el registro.** Tampoco
está la comanda de las 20:08. Y la pantalla se titula «Registro inmutable de
seguridad y operaciones».

La causa está en `lib/Respaldo.js:33`:

```js
export const TABLAS_RESPALDADAS = ['ventas', 'comandas', 'movimientos'];
```

`auditoria` no está en la lista. La venta se salvó porque el hub la respalda; su
fila de auditoría se fue con el teléfono.

No es un descuido cualquiera por dónde cae: **el hueco aparece exactamente en el
escenario que un auditor miraría con más atención** — un dispositivo que
desapareció con dinero dentro. Los libros y el registro discrepan justo ahí, y
la discrepancia no distingue un teléfono sin batería de alguien borrando su
rastro.

Al arreglarlo conviene pensar qué más comparte esa condición. `movimientos` sí
está respaldado; `auditoria` no. La pregunta no es sólo «añadir auditoría», es
**qué otras tablas se pierden cuando muere un dispositivo** y si la lista se
escribió pensando en el dinero y olvidando el rastro.

### 7 · Un folio impreso puede no llegar a existir nunca

Consecuencia del mismo escenario, y explica el hueco `AZULHN-V-000004` que
apareció al contar las ventas recuperadas.

`handlePedirCuenta` acuña el folio **antes de cobrar** —tiene que hacerlo: el
papel que se lleva a la mesa es el comprobante y necesita número— y lo guarda en
`mesa.orden_actual.folio`, que vive en el almacenamiento local del dispositivo.

El teléfono pidió cuenta (acuñó `V-000004`), murió con esa reserva dentro, y el
cobro posterior acuñó `V-000005`. Resultado: **el cliente se quedó con un papel
que cita un folio que no existe en los libros**, y la serie de ventas tiene un
hueco.

Es justo lo que `Folio.js` dice que quiere evitar —«un hueco en una serie de
ventas es exactamente la señal que un auditor busca»— entrando por otra puerta:
allí se separaron las series para que las comandas no gastaran números de venta,
y aquí los gasta una cuenta que nunca se cobró.

> **Lo que está bien y conviene no romper al arreglarlo:** que el folio se acuñe
> antes es correcto, y que no cambie al reabrir también — se comprobó el mismo
> día en producción (`REAPERTURA_CUENTA` de la mesa 12 a las 19:39:59 con folio
> `AZULHN-V-000003`, cobrada a las 19:40:12 con ese mismo folio). El problema no
> es acuñar pronto: es que la reserva sólo exista en un aparato que puede morir.

---

## Lo operativo — resuelto el 17-ago

Las dos restricciones que hubo que imponer el fin de semana **ya no aplican**:

- ~~Que nadie use notas ni modificadores en ventas reales.~~ El trigger está
  arreglado; las ventas con nota o modificador suben con normalidad.
- ~~No borrar los datos del navegador de la caja.~~ La venta que sólo vivía en
  ese equipo ya está en Supabase.

## Lo que el checklist decía mal, y ya está corregido

- **§2 no hacía falta**: el folio llevaba días saliendo con `AZUL`.
- **Y además era inejecutable en producción**: pedía la consola del navegador, y
  `src-tauri/Cargo.toml` declara `tauri` sin la feature `devtools`, así que en un
  build de release no hay nada que abrir. Se comprobó en la caja: no abre. Si
  algún día hace falta repetir ese paso, o se compila con devtools o hace falta
  un botón en Ajustes. Que un paso dependa de una consola que el binario de
  producción no tiene es un fallo del checklist.
- **El updater no necesita generar llaves**: `tauri.conf.json` ya tiene la
  `pubkey` pegada de verdad, no el `PEGA_AQUI_LA_CLAVE_PUBLICA`. Lo que sigue
  haciendo falta para compilar el bundle es exportar `TAURI_SIGNING_PRIVATE_KEY`
  y su contraseña **en la misma sesión de shell**, o revienta al firmar, al final
  del build.
