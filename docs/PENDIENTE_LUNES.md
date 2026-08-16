# Lo del lunes — después de la prueba del sábado

Se escribió el 13-ago por la noche con la regla de no tocar nada antes de la
verificación en AZUL. **La verificación ya se hizo, el 15-ago**, así que esa
puerta está abierta — pero delante de todo lo demás va lo que salió del local.

---

## 0 · Lo que salió de la verificación del 15-ago

Cuatro fallos, con causa y línea. El detalle está en
`docs/VERIFICADO_15-AGO.md`; aquí sólo el orden y por qué.

**El orden no es por gravedad, es por dependencia.** Mientras una venta muera en
el trigger, lo que vaya detrás en la cola se retrasa y parece otra cosa: el
15-ago eso produjo un falso quinto fallo que costó dos pruebas descartar.

1. **El trigger que castea `it->>'id'` a `bigint`.** Toda venta con nota o
   modificador se queda fuera de Supabase, con 22P02 y sin reintento. El item ya
   trae `receta_id` al lado; el trigger tiene que leerlo y caer a `id` sólo si
   falta. Una línea, y desbloquea medir lo demás.

   > **Hasta que esté:** que nadie use notas ni modificadores en ventas reales,
   > y no borrar los datos del navegador de la caja — la venta
   > `AZULJ3-V-000006` (total 209) sólo vive ahí.

2. **La reimpresión tras reabrir una cuenta no imprime, y no avisa.** Es **el
   mismo mecanismo que describe §1 de este documento**, y de hecho §1 ya lo
   había previsto en abstracto: el id sale del folio, el folio no cambia al
   reabrir, y `cola.rs` descarta por id ya impreso sin considerarlo error. Lo
   que §1 escribió como trampa a evitar resultó estar ya ocurriendo en el flujo
   de la cuenta. **Conviene arreglar los dos a la vez**: es la misma regla —el
   id cambia en cada copia, el papel no cambia nunca.

3. **El centavo de más.** `calcularVenta` redondea el subtotal y luego saca el
   IVA de esa cifra ya redondeada, así que dos jugos de $40 se cobran a $80.01.
   Con `precios_incluyen_iva` el precio de menú **es** el total y el IVA es el
   resto: `iva = brutoNeto − subtotal` da 11.03 y cuadra en 80.00. Ojo al
   tocarlo: hay que repasar el caso con descuento de línea y el de ticket.

4. **«Recuperar ahora» falla y dice «No había nada que recuperar».**
   `drenarRespaldo` devuelve `subidas.length`, así que fallar y no tener nada
   que hacer dan el mismo cero; el error sólo va a `console.warn` y la consola
   no abre en release. Distinguir los tres casos y decir cuántas fallaron.

   > Y con esto, una pregunta abierta: por qué una venta cobrada **por la caja**
   > pasó a «Por adoptar» al reiniciar la app, si la caja se excluye a sí misma
   > comparando tokens. Hipótesis: al reiniciar toma un token distinto. Se
   > comprueba en diez segundos y está anotado en el checklist.

### Y una cosa que el checklist pedía y el binario no permite

El paso de §2 —y el de mDNS— piden la consola de la ventana, pero
`src-tauri/Cargo.toml` declara `tauri` sin la feature `devtools`: en un build de
release no hay nada que abrir. Comprobado en la caja. Cualquier diagnóstico que
hoy dependa de la consola es, en producción, un diagnóstico que no existe. O se
compila con devtools, o esos datos salen a una pantalla.

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

|                                  | Qué da                                                                          | Qué cuesta                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A · Sólo las pestañas**        | Separa y filtra los gastos. La pantalla queda como Chris la describió.          | Muy poco. Pero «caja chica» sigue siendo un filtro con nombre ambicioso: no dice cuánto queda. |
| **B · Pestañas + fondo y saldo** | Responde «cuánto queda» y «cuánto hay que reponer». Es la caja chica de verdad. | Más: modelar fondo, retiros y reposiciones. Hay patrón en `lib/Arqueo.js`.                     |

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

Lo que sí necesita una tablet de verdad es **otra pregunta**: si se _siente_
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

   | Régimen       | Qué gana el dueño al facturar                  |
   | ------------- | ---------------------------------------------- |
   | Persona Moral | Baja ISR **e** IVA acreditable                 |
   | RESICO        | **Sólo IVA** — las deducciones no bajan el ISR |

---

## 5 · Impresión de reportes — el Corte Z y el vale de propina no imprimen

**No es código muerto: es código vivo que no puede funcionar dentro de la caja.**

`ReportesScreen.jsx` imprime así (líneas ~322 y ~362):

```js
const win = window.open('', '_blank', 'width=340,height=700');
win.document.write(`<html>…`);
setTimeout(() => {
  win.print();
  win.close();
}, 500);
```

Eso es un patrón de navegador. En la caja —Tauri sobre WebView2— `window.open`
no devuelve una ventana manipulable, así que `win.document` revienta y el botón
**no hace absolutamente nada visible**. Ni imprime, ni avisa, ni deja rastro
salvo un error en una consola que nadie mira. La quinta vez este mes que el
fallo es un silencio.

Y aunque funcionara, imprimiría **por el diálogo de Windows a una hoja A4**, no
por la térmica. El Corte Z es justamente lo que el dueño quiere pegado en la
libreta al cerrar: tiene que salir por la misma impresora que los tickets.

**Lo que hay que hacer:** los dos documentos pasan a la cola del hub como
ESC/POS, igual que el ticket y la comanda. Ya existe todo el camino
(`lib/Comanda.js` → `hub/cola.rs`); falta el constructor del documento «corte»
y el del «vale». El HTML de arriba sirve de especificación del contenido: se
tira, pero se copian los campos.

**Ojo con `TicketImpresion.jsx:28`** — `window.print()` a secas, que imprime la
ventana ENTERA de la aplicación. Mismo origen, misma revisión.

## 6 · El logo del restaurante — el campo existe, el ticket no lo usa

`ConfiguracionScreen` guarda `logo_url` y **lo único que lo lee es su propia
vista previa**. No llega al ticket ni en pantalla ni en papel.

Son dos trabajos de tamaño muy distinto y conviene no meterlos en el mismo saco:

- **En pantalla / PDF** — trivial, un `<img>`. Media hora.
- **En la térmica** — `hub/escpos.rs` **no sabe imprimir imágenes hoy**: no hay
  una sola línea de raster. Sí es posible (`GS v 0`), pero es trabajo de verdad:
  bajar la imagen, escalarla al ancho exacto en puntos (384 para 58 mm, 576 para
  80 mm), convertirla a 1 bit con tramado y empaquetarla en bytes. Medio día
  largo en Rust y quisquilloso de afinar en una impresora concreta.

**Y hay un problema de diseño antes que el técnico:** `logo_url` es una URL. Una
caja sin internet no puede descargarla. Si el logo va a imprimirse, tiene que
guardarse **local y ya convertido** —el hub lo cachea la primera vez, o se sube
como archivo en vez de como enlace—. Decidir eso antes de escribir el ESC/POS;
si no, sale una función que falla justo el día que se cae la red, que es el día
en que este programa presume de seguir funcionando.

## 7 · Barrido de jerga de programador en pantalla (hecho el 13-ago, mantener)

Se quitaron los dos `npm run build` de `HubScreen` — se le estaban diciendo al
dueño del restaurante, que no tiene consola. El dato útil (la fecha de la
compilación) se queda; cambia el destinatario de la instrucción: «avisa a
soporte con esta fecha».

**La regla:** en un texto que ve el cliente no aparece Supabase, ni npm, ni
`dist/`, ni nombres de archivo, ni «endpoint». Si el diagnóstico es para
nosotros, el texto tiene que decirle al cliente **a quién avisar**, no qué
teclear. Conviene un barrido periódico; lo que hay hoy está limpio salvo
comentarios de código, que no se ven.

## 8 · Modificadores: precio y descuento de inventario

El 13-ago se conectó «¿cómo lo quiere?» de punta a punta —modal en el POS,
comanda, KDS, ticket— **deliberadamente sin precio ni stock**. Falta eso.

**Precio.** Las opciones ya traen `precio` y viaja hasta `opcionesElegidas()`
en `lib/Modificadores.js`. Sumarlo es aritmética sobre la línea del carrito.
Lo que hay que decidir antes de escribirlo:

- ¿El precio de la opción es **por unidad del platillo** o por línea? Dos
  hamburguesas con extra queso, ¿son $15 o $30? (Casi seguro $30, pero
  escribirlo mal no da error, da una cuenta mal cobrada.)
- El ticket y la comanda tienen que empezar a imprimir el `+$15` **el mismo día
  que se empieza a cobrar**, ni antes ni después. Hoy `Comanda.js` lo omite a
  propósito: un papel que enseñe «+$15» junto a un total que no lo incluye es
  una discusión con el cliente en la mesa.

**Inventario — es el trozo delicado, y no hay hueco donde meterlo.**
`descontarStockVenta(items, sustituciones, origen)`: ese segundo argumento son
_sustituciones_, que es otra cosa. Un «extra tocino» que baja tocino son deltas
**adicionales**. Hay que abrir un tercer camino en `construirDeltasStock`.

Y antes hay una pregunta de diseño que los datos de AZUL dejan a la vista: el
grupo **«Tipo de leche»** tiene tres opciones —Entera, Deslactosada, Almendra—
y **las tres apuntan al mismo producto** (`Leche Entera`). Puede ser un error de
captura, pero también apunta a que ese grupo no es una _suma_ sino una
_sustitución_: si el cliente pide almendra, no hay que descontar leche entera
además, hay que descontar almendra **en vez de**. Son dos mecanismos distintos
y el formulario de hoy no distingue entre ellos.

**Preguntarle al restaurante qué querían decir con ese grupo antes de escribir
código.** Si la respuesta es «sustitución», la pantalla de modificadores
necesita una casilla más («esta opción sustituye a un insumo de la receta»), y
eso cambia el modelo de datos.

## 9 · La curva de aprendizaje de los modificadores (parcialmente atacada)

Chris (13-ago): es la parte del sistema que más cuesta configurar. De las cuatro
causas que salieron al mirarla, **dos ya están arregladas**:

- ✅ El formulario se contradecía: «puede elegir varios **o ninguno**» junto a
  una casilla «El cajero DEBE seleccionar». Ahora hay un recuadro **«En la caja
  se verá así»** que lo dice en una frase, generada por `textoDeReglas()` — la
  MISMA función que usa el modal del POS, así que lo prometido al configurar es
  literalmente el texto que se lee al vender.
- ✅ La combinación «múltiple + obligatorio» = «al menos una» no estaba escrita
  en ningún sitio. Ahora sí.

**Sigue pendiente:**

- **El grupo no hace nada hasta que se ata en Recetas**, y eso no se anuncia en
  ninguna parte. Es la trampa gorda: haces todo bien y concluyes que está roto.
  Un aviso en la pantalla de modificadores («este grupo todavía no está en
  ningún platillo — átalo en Recetas») lo resolvería, y además es dato que ya
  está en memoria.
- **Vista previa de cómo se verá en el POS**, para el concepto grupo vs opción.
  Enseñar en vez de explicar.
- **El panel de ayuda** que pidió Chris, para el recorrido de tres pantallas.
  Va el tercero a propósito: si los dos de arriba están hechos, el panel tiene
  mucho menos que explicar.
- **El vínculo con inventario viene apagado por defecto** («No afecta
  inventario»). Alguien da de alta «Extra tocino» y el tocino nunca se
  descuenta, sin error ni aviso. Cuando se implemente §8, avisar al guardar un
  grupo cuyas opciones no descuentan nada.

## 10 · Consumos de personal (Chris, 14-ago) — diseño en documento aparte

Ver **`docs/DISENO_CONSUMOS_PERSONAL.md`**, actualizado con la regla real de
AZUL. **Depende del §8 (precio en los modificadores): sin él calcula cero y
parece que funciona.** Resumen de por qué no es trivial:

**La regla no es «base gratis, extras al 75 %», es por ingrediente.** Van
gratis tortilla, huevo, crema, queso fresco, verdura simple, tés, aguas de
fruta y cafés; lo demás al 75 %. Los chilaquiles salen gratis porque están
hechos de cosas gratis. Bandera `cobrable_personal` en `productos`, con valor
por defecto por categoría y excepción por ingrediente — y filtro «sin decidir»,
porque un ingrediente que caiga en sí o en no sin que nadie lo elija es o
cobrarle de más a alguien o regalar comida sin enterarse.

Son **tres cosas independientes** y una venta las ata a la vez, que es por lo
que no sirve una comanda al 100 % de descuento:

1. el inventario se descuenta **siempre**;
2. el precio admite descuento variable, de 0 % a cortesía;
3. lo que quede a cargo se descuenta **del sueldo**.

Tres cosas que hay que tocar y que hoy no existen:

- Tabla `consumos` con `staff_id` de verdad (`movimientos.usuario` es texto
  libre y no sirve para descontar de una nómina).
- **`nominas` no tiene deducciones**: `gran_total = sueldos + propinas`, no hay
  un solo concepto que reste.
- **El dueño no tiene nómina.** Si no se resuelve, su consumo queda con importe
  a cargo y `nomina_id` nulo para siempre — una deuda que engorda cada mes y
  que nadie va a cobrar. Va a un cubo de _retiros del propietario_, o a
  cortesía, pero elegido en pantalla, nunca en silencio.

Y el candado: **`nomina_id` en cada consumo**. Reprocesar una nómina —que pasa,
se corrige un turno y se vuelve a generar— cobraría la comida dos veces sin dar
ningún error. Mismo patrón que `stock_salidas` y `crm_canjes`; van tres.
