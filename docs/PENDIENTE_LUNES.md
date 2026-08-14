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

---

## 3 · Los dos fallos de las E2E (13-ago)

Se corrieron por primera vez en semanas: **7 pasaron, 2 fallaron.** Los dos
fallos son de naturaleza opuesta y conviene no confundirlos.

### 3.1 · El folio — **la prueba está desactualizada, el código está bien**

`e2e/flujo-pos.spec.js:123` busca `/POS-\d{5}/`. Ése es el formato **viejo**.
Los folios cambiaron al escribir `lib/Folio.js`: ahora son `AZUL7K-V-000123`
—prefijo del local, serie, consecutivo—.

Comprobado de punta a punta: `construirTicket` mete `{ etiqueta: 'Folio' }` en
`meta`, y `TicketImpresion` pinta `doc.meta` completo. **El ticket sí muestra el
folio.** Sólo hay que actualizar la expresión de la prueba, y de paso los tres
comentarios del archivo que siguen hablando de `POS-xxxxx`.

### 3.2 · El render en tablet — **esto sí es un fallo de verdad**

El snapshot de `render.spec.js` da 27 % de píxeles distintos. Al mirar la imagen
**actual** (no el diff, que superpone y engaña) se ve el problema:

- **«CONTROL DE PISO Y CUENTAS» se parte palabra por palabra en vertical.**
- La tira de atajos —«Mover la selección», «Abrir la mesa», «Reservar»…— se
  rompe en columnas de dos centímetros.
- Y se **encima** con la fila de contadores y con los botones.

Es un contenedor que perdió su ancho: cada palabra cae en su propia línea.

**La hipótesis, para empezar por ahí:** en `OpsHeader`, el bloque de acciones
lleva **`shrink-0`** y el de identidad `min-w-0`. En escritorio sobra sitio. En
una tablet de 1080 px, con el riel comiéndose ~208, quedan ~870 para una fila
de Mesas con cinco botones: **las acciones se quedan con todo el ancho y el
título con nada.** Es el mismo síntoma que ya está documentado en ese archivo
—«cortado sin puntos suspensivos»—, sólo que llevado al extremo.

**No se sabe desde cuándo está roto, y no hay que afirmar que fue lo del 13-ago:**
los cambios de ese día tocan alturas (`dvh`) y el viewport, no anchos. Lo más
probable es que lleve semanas ahí sin que nadie lo viera, **porque las E2E no se
corrían**. Ésa es la lección, más que el bug.

**Al regenerar el snapshot: sólo DESPUÉS de arreglar el layout.** Regenerarlo
antes convierte el fallo en la nueva referencia y lo entierra para siempre.

### NO hace falta una tablet para arreglar esto

Conviene dejarlo claro porque el 13-ago casi se aparca por eso. **El fallo no
depende del hardware, depende del ANCHO de la ventana.** La propia prueba de
Playwright es la tablet —corre en un viewport `ipad-landscape`, y por eso lo
cazó— y para verlo a ojo basta con **estirar una ventana de Chrome a ~1080 px**
y abrir el mapa de mesas.

Lo que sí necesita una tablet de verdad es **otra pregunta**: si se *siente*
bien usarlo —que los botones se toquen sin errar, que se lea a un brazo de
distancia—. Eso ningún viewport lo contesta. Pero es un juicio distinto de
«esto está roto», y eso último ya está demostrado y se puede corregir sin
esperar a conseguir nada.

### 3.3 · Y lo que hay que decidir

Unas E2E que nadie corre no son una red de seguridad: son una foto vieja que da
sensación de cobertura. O entran en el ritual —junto a `cargo test` y
`test:rapido`— o hay que asumir en voz alta que no cuentan.

---

## 4 · Lo fiscal de los gastos — notas, NO decidido

Chris trajo investigación el 13-ago. **No se programa todavía**; esto es para que
el día que se retome no se empiece de cero ni se repitan las verificaciones.

### Las reglas duras, verificadas (no de memoria)

- **El límite de $2,000 en efectivo sigue vigente** (art. 27 fr. III LISR). Un
  gasto por encima **pierde la deducibilidad aunque tengas factura**.
- **Los $2,000 INCLUYEN el IVA.** El SAT aclaró que se refiere al **total del
  CFDI**, no al subtotal. Un gasto de $1,900 + IVA ya se pasó. **Si la alerta se
  programa sobre el subtotal, avisaría tarde justo en los casos frontera** —que
  son los únicos donde el aviso sirve.
- **El combustible es excepción**: siempre por medio electrónico, **sin importar
  el monto**. Aunque sean $300 de gasolina.

### La pieza que las dos vías señalaron

La investigación llegó, desde el lado operativo, a lo mismo que el §2 de este
documento desde el lado del modelo: **el vale de caja / dinero en tránsito**.
Sale dinero a la tiendita → vale digital → al volver se captura lo gastado, si
hubo factura, y el cambio. Eso ES el «fondo, retiros y reposiciones» sin el cual
caja chica no puede responder cuánto queda.

Que dos caminos distintos apunten a la misma pieza es la mejor señal de que hay
que construirla.

### Idea de producto que vale la pena

**Reporte de merma fiscal:** «este mes se fueron $X en gastos sin factura».
No es un dato contable, es un argumento comercial — es la frase que hace que un
dueño cambie de proveedor de pan.

### Tres reglas de diseño, y las tres importan

1. **El umbral va en CONFIGURACIÓN, no quemado.** Los $2,000 llevan años
   iguales, pero el día que cambien, un número dentro del binario significa
   recompilar y republicar en cada restaurante.

2. **La app INFORMA, no decide.** Avisar «esto en efectivo pierde deducibilidad»
   está bien. Marcar un gasto como «no deducible» por su cuenta, no: la
   deducibilidad depende de cosas que el sistema no sabe —si el pan acabó en el
   menú o en la casa del dueño—. Ni nosotros ni el software somos su contador.

3. **El RÉGIMEN va por restaurante, no supuesto.** AZUL es **probablemente**
   Persona Moral —Chris dijo «lo más seguro»; **falta confirmarlo con la
   Constancia de Situación Fiscal**—. Y da igual lo que sea AZUL: InvVenta es
   multi-inquilino, así que si el código asume un régimen, el siguiente cliente
   recibe una pantalla que le miente.

   Importa porque cambia el DISCURSO de la función:

   | Régimen | Qué gana el dueño al facturar |
   |---|---|
   | Persona Moral | Baja ISR **e** IVA acreditable |
   | RESICO | **Sólo IVA** — las deducciones no bajan el ISR |
