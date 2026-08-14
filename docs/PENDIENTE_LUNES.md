# Lo del lunes — después de la prueba del sábado

Dos cosas decididas el 13-ago por la noche. **Ninguna se toca antes de la
verificación en AZUL**: son cambios encima de un sistema que todavía no se ha
visto funcionar, y hoy ya pasó dos veces que un cambio nuevo tapara el
diagnóstico de otro.

---

## 1 · Reimpresión del ticket

**Lo que pidió Chris:** un botón para cuando un cliente quiere una copia. **La
copia es un duplicado EXACTO del original — sin texto extra de ningún tipo.**

### Lo que ya está hecho, y nadie llama

`construirTicket(venta, { configuracion, copia, abrirCajon })` **ya acepta
`copia`** desde el 11-ago. Es la «reimpresión que existe y nadie usa» del
backlog. Falta el botón y dos ajustes.

### La trampa, que es la importante

`sufijoCopia()` le pone `::c2` al id de la copia 2. **Eso hay que conservarlo**,
aunque el papel salga idéntico, porque `cola.rs` **descarta por id ya impreso**.
Si el botón mandara siempre el mismo id:

- primera reimpresión: sale;
- **segunda: la cola la descarta como duplicada, no sale papel y no hay error.**

El cajero le diría al cliente «ya salió» mientras la impresora no hace nada. El
fallo silencioso de siempre.

**Regla, entonces: el id cambia en cada copia; el papel no cambia nunca.**

### Los tres cambios

1. **`avisosDeCopia()` deja de aplicarse a los TICKETS.** Hoy imprime
   `REIMPRESIÓN (copia N) — NO PREPARAR DE NUEVO`, que está escrito para
   comandas de cocina y en un ticket de cliente no significa nada. **Se
   conserva para las comandas**, donde sí evita que cocina prepare dos veces.

2. **Contador persistido en la venta** (`copias_impresas`). En estado local se
   perdería al recargar y volvería el descarte por duplicado. Además es un dato
   que el dueño quiere: «este ticket se reimprimió tres veces» es una señal.

3. **Botón en Reportes → «Tickets del turno»**, que ya lista cada venta con
   folio, hora y total. Esa pantalla ya está gateada por `gestion`, así que
   reimprimir queda en Admin/Gerente sin añadir permisos nuevos.
   **`abrirCajon: false`**, obviamente: una copia no mueve dinero.

### Auditoría — decisión de Chris: SÍ

Acción `REIMPRESION_TICKET`, con folio, número de copia y quién la pidió. Mismo
patrón que `REAPERTURA_CUENTA`.

**Y aquí está el porqué, que conviene no perder:** al ser la copia un duplicado
exacto, **desde el papel es imposible distinguir un original de una copia**. Es
lo que Chris quiere y es lo que el cliente espera — pero significa que el único
rastro de que hubo un duplicado es la auditoría. Sin ella, dos tickets idénticos
circulando no dejan huella en ninguna parte.

---

## 2 · Gastos en dos pestañas: caja chica y caja grande

**Lo que pidió Chris:** dividir la pantalla de gastos en dos tabs.

- **Caja chica** — donde se queda la pantalla «a la hora de la chinga». Es la
  vista por defecto: los gastos pequeños del turno.
- **Caja grande** — los gastos fuertes.

Que caja chica sea la pestaña por defecto no es un detalle de UI: es la que se
usa con prisa y con gente esperando, así que es la que no debe costar un clic.

### Ya estaba evaluada, y salió la nº 1 de las cinco

`docs/EVALUACION_5_PROPUESTAS.md` §2. Sin prerrequisitos, valor inmediato, y con
el patrón de arqueo ya escrito en `lib/Arqueo.js` que se puede copiar.

### La trampa que ya está documentada

**`gastos.origen` YA EXISTE y significa otra cosa**: sus valores son `manual` y
`recurrente`, o sea la procedencia del registro, no de qué caja salió el dinero.
Reutilizarla metería dos significados en una columna y el día que alguien filtre
por `origen` obtendrá una mezcla.

**Va un eje nuevo: `caja: 'chica' | 'grande'`.**

### Lo que hay que decidir antes de escribir

La evaluación levantó algo que sigue abierto, y conviene resolverlo con Chris el
lunes en vez de descubrirlo a media implementación:

> **Una etiqueta no es una caja.** Con dos tabs y una columna `caja`, la
> pregunta «¿cuánto queda en la caja chica?» **no se puede responder**. Para eso
> hacen falta **fondo, retiros y reposiciones** — o sea, un arqueo pequeño.

Dos alcances posibles:

| | Qué da | Qué cuesta |
|---|---|---|
| **A · Sólo las pestañas** | Separa y filtra los gastos. La pantalla queda como Chris la describió. | Muy poco. Pero «caja chica» sigue siendo un filtro con nombre ambicioso: no dice cuánto queda. |
| **B · Pestañas + fondo y saldo** | Responde «cuánto queda» y «cuánto hay que reponer». Es la caja chica de verdad. | Más: modelar fondo, retiros y reposiciones. Hay patrón en `lib/Arqueo.js`. |

**Mi lectura:** empezar por A, pero **sabiendo que es A**. Ponerle «caja chica» a
un filtro y llamarlo terminado es lo que hace que dentro de dos meses alguien
pregunte cuánto queda y la respuesta sea «eso no lo hace». Si el nombre promete
un saldo, hay que llegar a B.

Lo que sí encaja sin inventar nada desde el principio: **la firma de quién pidió
y quién autorizó**, con el mismo PIN que ya funciona para los descuentos en
`ModalCobro`, y con rastro en auditoría.
