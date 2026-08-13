# 3.4 / 3.5 — Respaldo de ventas en el hub

**Estado (13-ago):** 🔨 **la copia está montada; la adopción no.**
**Prerrequisito:** ✅ resuelto el 10-ago (`lib/IdVenta.js`).

| Paso del §8 | Estado |
|---|---|
| 1 · `respaldo.rs` con sus pruebas | ✅ escrito — **12 pruebas, sin compilar todavía** |
| 2 · Rutas y cableado | ✅ tres rutas + **tres comandos de Tauri** (ver abajo) |
| 3 · `Hub.js` | ✅ `respaldar` · `confirmarRespaldo` · `respaldoPendiente` |
| 4 · `useSyncStore` respaldar y confirmar | ✅ + `lib/Respaldo.js` con 22 pruebas |
| 5 · `drenarRespaldo()` y el bloque en `HubScreen` | ⬜ **bloqueado, ver §10** |
| 6 · Prueba extremo a extremo | ⬜ |

**Un añadido al §4.2 del diseño original:** no bastan las rutas HTTP. La caja
cobra DENTRO de Tauri, donde `lib/Hub.js` no hace `fetch` sino `invoke`, así que
hay además tres comandos (`hub_respaldar`, `hub_confirmar_respaldo`,
`hub_respaldo_pendientes`). Sin ellos, el equipo que más vende sería el único
sin segunda copia. Es literalmente el fallo del pulso del cajón del 12-ago, y se
evitó por acordarse de él.

---

## 10 · Lo que apareció al escribirlo, y por qué la adopción no entra todavía

El diseño (§6) daba por hecho que `decrementar_stock` podía respaldarse usando
«la clave de la venta que lo originó». Al ir a implementarlo se miró la función
de verdad, y **no hay tal clave**:

```
decrementar_stock(p_items jsonb, p_restaurante_id uuid,
                  p_referencia text, p_usuario text)
```

`p_referencia` **no es un identificador: es una etiqueta para el humano.** En la
base de AZUL hay dos filas de `movimientos` con `referencia = 'Venta: Pizza x1'`
—una de noviembre y otra de febrero, tres meses de diferencia—. Son dos ventas
distintas del mismo platillo. Además, hoy el front **ni siquiera la manda**:
`descontarStockVenta` llama a la RPC sin `p_referencia`, así que 74 de los 339
movimientos no tienen referencia ninguna.

O sea: **la función no es idempotente y no hay con qué hacerla idempotente.**

Si la caja adoptara una venta huérfana y reejecutara su decremento, descontaría
un inventario ya descontado. **No daría error.** Dejaría el almacén mal y nadie
se enteraría hasta el conteo — exactamente el tipo de fallo que este proyecto
lleva dos semanas persiguiendo.

**Decisión:** `decrementar_stock` se queda **fuera** de `SE_RESPALDA`, y con ello
la adopción entera se aparca. Respaldar la venta pero no su descuento sería
peor que no respaldar: la venta adoptada entraría sin tocar inventario y el
kardex mentiría en silencio, que es justo lo que el §5 advertía.

### Lo que hace falta para desbloquearlo

Una migración que le dé a `decrementar_stock` **su propio ledger por venta**,
igual que ya lo tienen `registrar_visita_cliente` (`crm_visitas`) y
`canjear_puntos` (`crm_canjes`). En concreto:

1. Un parámetro `p_venta_id` de verdad (hay que **DROP y recrear**: añadir un
   parámetro con valor por defecto crea una sobrecarga y deja la llamada
   ambigua).
2. Guarda de idempotencia al principio: si ya hay salida registrada para esa
   venta, devolver el estado actual sin restar.
3. Que `descontarStockVenta` pase el id de la venta.

Es media sesión y arregla **un fallo que ya existe hoy**, independiente del
respaldo: si la cola reintenta un `decrementar_stock` tras un timeout
post-commit, hoy se descuenta dos veces. Los otros dos RPC ya se defienden de
eso; éste no.

### Lo que sí protege ya lo escrito

La copia existe: cada venta, comanda y movimiento que un teléfono encola queda
también en el disco de la caja, y se borra de allí cuando sube. Si un teléfono
muere, **el dato ya no se va con él**. Lo que falta es el brazo automático que
lo recoja — mientras tanto está en `respaldo-ventas.ndjson`, legible, y no se
pierde.

---

---

## 1 · El problema, en una frase

Hoy la cola de salida vive en el Dexie de cada dispositivo
(`useSyncStore.enqueueAction` → `localDB.sync_queue`). Si a un teléfono se le
acaba la batería, se le limpia el navegador o simplemente se pierde antes de
que vuelva la red, **las ventas que ese teléfono cobró se van con él**. No hay
segunda copia en ninguna parte.

La caja, en cambio, es un equipo fijo, enchufado, con disco. Ya guarda ahí la
cola de impresión y el registro de dispositivos. El respaldo va al mismo sitio.

---

## 2 · La decisión de arquitectura

**El hub sólo RESPALDA. La caja DRENA.**

El teléfono sigue siendo quien sincroniza con Supabase. Antes de encolar en
Dexie manda una copia al hub, que la persiste en disco. Si el teléfono muere,
la caja —que tiene una sesión real de administrador— adopta lo que quedó sin
confirmar y lo sube ella.

### Por qué no que el hub sincronice él mismo

Era la opción cómoda: el teléfono hace POST y se olvida. El precio es
inaceptable. El hub es un proceso Rust sin sesión de Supabase; para escribir en
`ventas` necesita un JWT que satisfaga RLS, y sólo hay dos formas de
conseguirlo:

- **Guardar tokens de empleados en disco en la caja.** Custodia de credenciales
  ajenas en una máquina que está en la barra de un restaurante, con tokens que
  además caducan y habría que refrescar.
- **Darle `service_role`.** Es saltarse RLS entera. La misma sesión en que
  cerramos una adopción de tenant ajeno no puede terminar poniendo la llave
  maestra en un equipo de un cliente.

Con «el hub sólo respalda» el problema desaparece: el hub nunca habla con
Supabase, sólo guarda bytes y los devuelve a quien esté autorizado.

### Por qué no un espejo ciego sin drenaje

Un log append-only que nadie sincroniza sirve para reconstruir a mano tras un
desastre, pero no cierra el caso que motiva todo esto: el teléfono murió y la
venta nunca llegó. Reconstruir a mano significa que alguien tiene que darse
cuenta, y nadie se da cuenta de una venta que no está.

---

## 3 · Prerrequisito, ya resuelto

`PosScreen` asignaba `id: Date.now()` a las ventas y `CMD-${Date.now()}` a las
comandas. El reloj lo comparten todos los teléfonos, así que dos cobros
simultáneos daban dos filas distintas con la misma clave.

Mientras cada dispositivo sincronizaba por su cuenta el fallo era ruidoso
(23505 → dead-letter). Con un respaldo que **deduplica por clave** —y tiene que
deduplicar, porque la LAN reenvía POSTs— se habría convertido en un descarte
silencioso: peor que la pérdida que este trabajo viene a evitar.

Resuelto en `lib/IdVenta.js`: milisegundo × 1024 + carril de dispositivo, donde
el carril son los dos caracteres que `Folio.js` ya sorteó, leídos como número en
base 32. Biyectivo, no un hash. Ver el módulo para el porqué de cada pieza.

**Consecuencia para este diseño: la clave de una venta ya es única entre
dispositivos, así que `${tabla}::${data.id}` sirve como clave de deduplicado
sin inventar nada.**

---

## 4 · Piezas nuevas

### 4.1 · Rust — `src-tauri/src/hub/respaldo.rs` (nuevo)

Mismo esqueleto que `cola.rs`, del que conviene copiar tres cosas: la
persistencia en disco, la memoria de claves ya vistas, y la regla de que
**nada de esto bloquea al que llama**.

```rust
pub struct Anotacion {
    pub clave: String,        // "ventas::1829286241974646"
    pub dispositivo: String,  // token del emisor, para saber de quién huérfanar
    pub tarea: serde_json::Value, // { tabla | rpc, metodo, data } tal cual
    pub creado_ms: u128,
}

pub struct Respaldo { /* Mutex<Interior>, archivo: PathBuf */ }

impl Respaldo {
    pub fn nuevo(archivo: PathBuf) -> Arc<Self>;
    pub fn anotar(&self, a: Anotacion) -> Recibo;   // Anotado | Duplicado
    pub fn confirmar(&self, claves: &[String]) -> usize;
    pub fn pendientes(&self, huerfanas_desde_ms: u128) -> Vec<Anotacion>;
    pub fn resumen(&self) -> Resumen;               // para la pantalla de diagnóstico
}
```

Diferencias deliberadas respecto a `cola.rs`:

- **No hay hilo trabajador.** El respaldo no hace nada por su cuenta; sólo
  guarda y entrega. Todo el movimiento lo empuja alguien de fuera.
- **Persistencia append-only (NDJSON), no reescritura completa.** `cola.rs`
  serializa el estado entero en cada `guardar()`. Con trabajos de impresión
  pequeños eso da igual; con ventas —que llevan `items` dentro— el archivo
  crece a megabytes y reescribirlo en cada cobro es gasto por gasto. Una línea
  JSON por anotación, compactación al arrancar descartando las confirmadas.
- **Sin `MAX_INTENTOS`.** Aquí no hay nada que reintentar: el respaldo no
  sincroniza. Una anotación vive hasta que alguien la confirma.

### 4.2 · Rust — `servidor.rs`

Tres rutas nuevas, con la distinción de autorización que el módulo **ya
modela** y que aquí importa más que en impresión:

| Ruta | Método | Autorización | Por qué |
|---|---|---|---|
| `/hub/respaldo` | POST | `autorizado()` | Cualquier dispositivo emparejado deja su copia |
| `/hub/respaldo/confirmar` | POST | `autorizado()` | Cada uno confirma lo suyo |
| `/hub/respaldo/pendientes` | GET | **`autorizado_admin()`** | Devuelve ventas de OTROS dispositivos |

El `autorizado_admin` de `pendientes` no es ceremonia: ese endpoint entrega los
cobros de todo el local. Con `autorizado()` a secas, un teléfono emparejado se
llevaría el historial de ventas de la caja.

También hay que acotar `CorsLayer::permissive()` — está anotado como deuda
aparte, pero con estas rutas dentro pasa de higiene a relevante.

### 4.3 · Rust — `mod.rs`

Una línea en `arrancar()`, junto a la cola:

```rust
let respaldo = Respaldo::nuevo(carpeta_datos.join("respaldo-ventas.ndjson"));
```

y el campo correspondiente en `EstadoHub`.

### 4.4 · Front — `src/lib/Hub.js`

Tres funciones, mismo patrón que `imprimir()` / `cola()`:

```js
export async function respaldar(anotaciones, opciones = {})
export async function confirmarRespaldo(claves, opciones = {})
export async function respaldoPendiente(opciones = {})
```

### 4.5 · Front — `src/store/useSyncStore.js`

Es donde vive el grueso, y hay que tocarlo con cuidado porque es el camino del
dinero.

1. **Campo nuevo en el ítem de cola:** `respaldado: false`.
2. **`enqueueAction` respalda tras encolar**, en el mismo `fire and forget` que
   ya dispara `processQueue`. Un fallo de red hacia el hub **no puede** tumbar
   el cobro: el respaldo es una SEGUNDA copia, nunca la única.
3. **`processQueue` confirma al terminar bien:** cuando una tarea sube a
   Supabase, su clave va a `confirmarRespaldo()`.
4. **`respaldarPendientes()`**, que barre los ítems con `respaldado: false` y
   reintenta el POST. Cubre el caso «el hub estaba apagado cuando se cobró».
5. **`drenarRespaldo()`**, sólo en la caja: pide `/hub/respaldo/pendientes`,
   sube lo que venga y confirma.

### 4.6 · Front — pantalla

`HubScreen` ya tiene el sitio: junto al estado de la cola de impresión, un
bloque con «N ventas respaldadas sin confirmar» y un botón de drenar manual. El
drenaje automático está bien, pero un número visible es lo que hace que alguien
se dé cuenta de que algo lleva días atascado.

---

## 5 · Qué se respalda, y qué no

**No toda la `sync_queue`.** Respaldar cambios de configuración o de recetas es
ruido: se rehacen desde la pantalla en treinta segundos. Lo que no se rehace es
un cobro que ya ocurrió.

La lista vive **en un solo sitio dentro de `useSyncStore`**, no en cada
pantalla. Es la lección de `Payload.js`: pedirle a cada vista que se acuerde de
marcar sus filas es pedir que alguna se olvide, y el síntoma —una venta sin
respaldar— tarda semanas en notarse.

```js
const SE_RESPALDA = {
  tablas: ['ventas', 'comandas', 'movimientos'],
  rpcs: ['decrementar_stock', 'registrar_visita_cliente', 'canjear_puntos'],
};
```

**Ojo con esto:** la lista tiene que cubrir el cobro ENTERO, no sólo la fila de
`ventas`. Si se respalda la venta pero no `decrementar_stock`, la venta
adoptada por la caja entra sin descontar inventario y el kardex queda mintiendo
sin que nada falle. Hace falta una prueba que afirme que todo lo que
`PosScreen.finalizarCobro` emite cae dentro de la lista — si mañana el cobro
emite algo nuevo, que se entere la suite y no el turno de cierre.

---

## 6 · Decisiones finas, con su porqué

### Idempotencia: `upsert`, no `insert`

El drenaje debe usar `upsert`, no `insert`. Puede darse una carrera real: el
teléfono revive con red justo cuando la caja lo daba por muerto y las dos suben
la misma venta. Con `insert` eso es un 23505 que acaba en dead-letter — un
error rojo por algo que salió bien. Con `upsert` sobre una clave que ya es
única, la segunda escritura es inofensiva.

Los tres RPC ya son idempotentes por su cuenta: `registrar_visita_cliente` y
`canjear_puntos` atrapan `unique_violation` sobre `crm_visitas` / `crm_canjes` y
devuelven el estado actual. `decrementar_stock` **no** lo es —resta cada vez que
se le llama— así que su clave de respaldo tiene que ser la de la venta que lo
originó, y confirmarse con ella.

### Cuándo se considera huérfana una anotación

Cuando el dispositivo emisor no la ha confirmado **y** `dispositivos.validar()`
no lo ha visto en más de 15 minutos. El registro ya guarda «visto por última
vez»; no hay que añadir nada.

Quince minutos y no uno porque un mesero que se mete en la cámara de frío pierde
la LAN un rato y vuelve. Y porque, con `upsert`, equivocarse hacia el drenaje es
barato: lo caro es no drenar nunca.

### El orden del drenaje no importa

Comprobado contra el esquema el 10-ago: **no hay FK de `crm_visitas.venta_id` ni
de `crm_canjes` hacia `ventas`**. Las únicas FK en juego son a `productos`,
`clientes`, `mesas` y `restaurantes`, que ya existen. Así que las anotaciones se
pueden subir en cualquier orden y una que falle no bloquea a las demás.

Vale la pena reverificarlo si se añaden FK: dejaría de ser cierto y habría que
ordenar por `creado_ms`.

### RLS en el drenaje

La caja drena con la sesión del administrador, del mismo tenant. La fila ya
lleva su `restaurante_id`, así que el `WITH CHECK` de `tenant_ventas` pasa. Esto
depende de que un hub sirva a un solo restaurante, que es el caso hoy y conviene
que lo siga siendo.

### Retención

Una anotación confirmada se borra en la siguiente compactación. Las no
confirmadas no caducan nunca: una venta de hace tres semanas que nadie subió
sigue siendo dinero. Lo que sí conviene es que la pantalla grite cuando la más
vieja pase de un día.

### El respaldo no cifra nada

`respaldo-ventas.ndjson` queda en claro en el disco de la caja, igual que
`dispositivos.json`. Es coherente con lo que ya hay y con el modelo de amenaza
—quien tiene acceso físico a la caja tiene acceso al POS entero—, pero conviene
que esté escrito y no dado por supuesto.

---

## 7 · Casos que hay que probar

Rust (`respaldo.rs`, junto a las pruebas de `cola.rs`):

- Dos POST con la misma clave → una sola anotación (`Duplicado`).
- Reinicio del proceso con anotaciones sin confirmar → se recuperan del disco.
- Confirmar una clave inexistente no rompe nada.
- `pendientes()` no devuelve las confirmadas.
- La compactación no pierde anotaciones vivas.

Front (`useSyncStore`):

- El cobro se completa aunque `/hub/respaldo` devuelva error o no responda.
- Una tarea que sube a Supabase queda confirmada en el hub.
- `respaldarPendientes()` recupera lo que se cobró con el hub apagado.
- Todo lo que emite un cobro cae en `SE_RESPALDA` (la prueba del §5).
- El drenaje usa `upsert` y no deja nada en dead-letter al repetirse.

Extremo a extremo, y es el que de verdad demuestra que esto sirve:

- Cobrar en el teléfono sin red → **cerrar la pestaña y borrar su IndexedDB** →
  drenar desde la caja → la venta está en Supabase, con su folio y su total.

---

## 8 · Orden de implementación

1. `respaldo.rs` con sus pruebas, sin tocar el servidor. Se puede verificar
   entero con `cargo test`.
2. Las tres rutas y el cableado en `mod.rs`.
3. `Hub.js` — las tres funciones cliente.
4. `useSyncStore`: respaldar y confirmar. Aquí ya se puede comprobar a mano que
   el archivo del hub se llena y se vacía.
5. `drenarRespaldo()` y el bloque en `HubScreen`.
6. La prueba extremo a extremo.

Los pasos 1-2 no tocan nada que esté hoy en producción. El 4 sí toca el camino
del dinero: conviene que entre solo, con la suite en verde antes y después.

---

## 9 · Lo que este diseño NO resuelve

- **Una caja que muere con el respaldo dentro.** El respaldo protege contra la
  pérdida de un teléfono, no contra la del equipo fijo. Si eso importa, es otro
  trabajo (copia a un segundo disco o a la nube en cuanto haya red).
- **El precio sigue viniendo del cliente.** Respaldar una venta manipulada la
  respalda igual de mal. Es el hallazgo del §3 de la auditoría del 10-ago y
  necesita el trigger de total divergente, que es independiente de esto.
- **El amplificador de wifi.** Si el extensor crea su propia subred, el teléfono
  no encuentra el hub y no hay respaldo que valga. Requisito de instalación, no
  ticket.
