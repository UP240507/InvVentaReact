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

La otra mitad —«Por adoptar», el teléfono que muere con la venta dentro— sigue
sin probarse.

---

## Los cinco fallos encontrados

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

### 2 · Tras reabrir una cuenta, volver a pedirla no imprime nada. Y no avisa.

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
