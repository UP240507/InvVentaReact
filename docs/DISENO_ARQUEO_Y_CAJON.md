# El cajón, el arqueo y quién firma

Diseño del 31-ago. **Sin construir.** Cubre tres cosas que son la misma
ceremonia: el botón de abrir cajón, el desglose por denominaciones, y el cierre
de turno autorizado.

---

## 1 · El problema, dicho con precisión

La versión fácil es «no es seguro dejar la llave en la caja». Es cierta pero se
queda corta, y si se ataca así se construye lo que no es.

**El cajón ya se abre solo en cada venta en efectivo** (`PosScreen.jsx:1615`).
Tiene que hacerlo: sin eso el cajero no puede dar cambio. O sea que el cajón
lleva abierto todo el servicio, y ningún candado nuevo va a cambiar eso.

Lo que hace peligrosa a la llave no es que abra el cajón. Es que **lo abre sin
dejar un nombre**.

Y aquí está el hueco de verdad, encontrado mirando el código el 31-ago:

> **Hoy `abrirCajon()` no escribe NADA en Auditoría.** Ni al cobrar, ni nunca.
> El parámetro `origen` existe en la firma (`lib/Hub.js:658`) y la aplicación lo
> llama sin argumentos. **Ninguna apertura deja nombre**, ni con llave ni sin
> ella.

### La tesis

**El control es el registro, no el candado.**

No se puede cerrar con llave un cajón que un cajero necesita durante seis horas.
Lo que sí se puede es hacer que **cada vez que se abre quede quién, cuándo y por
qué**. Con eso la llave deja de ser un agujero y pasa a ser lo que debe ser: el
camino de excepción, en el bolsillo del dueño —no del gerente— y para cuando el
hub esté caído.

---

## 2 · Las tres aperturas

Sólo hay tres razones por las que ese cajón se abre. Cada una lleva un trato
distinto, y confundirlas es lo que rompe el diseño.

| Apertura | ¿PIN? | Por qué |
|---|---|---|
| **Venta en efectivo** | **No** | Pedir autorización para dar cambio para el servicio. Ya es automática; lo único que falta es el registro. |
| **Fuera de venta** (contar a media tarde, cambiar un billete grande) | **Sí** | Hoy **no existe ningún botón para esto**, y ésa es exactamente la razón por la que la llave es imprescindible. |
| **Apertura y cierre de turno** | **Sí** | Es el momento en que el dinero se cuenta y se declara. |

**Que no exista hoy el botón del caso 2 es la causa raíz de que haya una llave en
la caja.** Mientras no exista, quitar la llave no es una decisión que se pueda
tomar.

---

## 3 · Dos capacidades, y por qué no puede ser una

Aquí hay una trampa circular que conviene ver antes de escribir código: si abrir
el cajón para contar exigiera la misma autorización que firmar el conteo, el
cajero no podría ni empezar a contar sin tener al gerente al lado los diez
minutos enteros.

Se separa en dos:

- **`abre_cajon`** — puede abrir el cajón desde el botón. **La tiene el cajero.**
  No es un privilegio: es su trabajo. Lo que la hace valer es que cada uso queda
  registrado con su nombre.
- **`autoriza_arqueo`** — su PIN **firma un cierre de turno**. Gerente y Admin.
  No abre nada por sí sola.

**Y no se reutiliza `abre_caja`.** Ese flag ya existe y significa «puede abrir
caja/turno» (`lib/Permisos.js:14`), que es otra cosa. Están a un carácter de
distancia y colgarle la autorización del dinero le daría acceso al cajón a
cualquiera que pueda iniciar un turno.

### Dónde va el PIN en el cierre, y por qué al final

El PIN podría pedirse al empezar el cierre (autoriza el acceso) o al declarar
(atestigua la cifra). **Va al declarar.**

Si se pide al principio, lo que se ha autorizado es *una caja abierta* — y si el
gerente se va mientras el cajero cuenta, la firma no dice nada del número. Si se
pide al final, lo que se firma es **una cantidad**. Cuando la caja no cuadre, el
documento que hace falta es el segundo.

El cajero abre para contar (con su nombre en el registro), cuenta, y el cierre se
firma sobre la cifra ya contada.

---

## 4 · El desglose por denominaciones

**Obligatorio en apertura y en cierre** (decisión de Chris, 31-ago).

### Por qué

`turnos.fondo_inicial` y `turnos.efectivo_declarado` son hoy dos `numeric` que
**alguien teclea**. Son afirmaciones sin nada detrás, de la misma familia que la
pantalla del hub afirmando que el nombre resuelve o la nota de versión anunciando
funciones que el binario no traía.

Con desglose, el total deja de ser una afirmación y pasa a ser **derivado de un
conteo que queda guardado**. Y eso cambia la investigación cuando algo falta: hoy
sólo se sabe «faltan 500»; con desglose se sabe si falta **un billete de 500** o
si son **500 en monedas de diez**. Uno huele a robo y el otro a cambio mal dado
durante seis horas.

También caza el error más común contando efectivo, que es transponer cifras:
1,250 por 1,520.

**Y en la apertura vale más de lo que parece:** un fondo de $1,000 en un solo
billete no puede dar cambio. Hoy la pantalla dice «1000» y esconde el dato
operativo.

### La regla que decide si funciona

**El desglose SUSTITUYE al campo del total. No se pone al lado.**

Si se piden las dos cosas, la gente teclea el total e inventa el desglose, y
habríamos añadido trabajo para ganar una mentira mejor escrita.

### Las denominaciones van en `configuracion`

`configuracion.denominaciones`, **no una lista dura en el componente**. Es
exactamente el error que se encontró el 28-ago con las unidades:
`configuracion.unidades` no lo lee nadie y `IngredientesScreen.jsx:50` lleva su
propia lista, que además **no coincide** con la de la semilla.

Por defecto, México:

```json
{
  "billetes": [1000, 500, 200, 100, 50, 20],
  "monedas":  [20, 10, 5, 2, 1, 0.5]
}
```

Separadas en dos grupos porque la pantalla los agrupa así y porque el que cuenta
los cuenta así. Que $20 esté en los dos no es un error: existen las dos cosas.

---

## 5 · Modelo de datos

### `turnos` — dos columnas nuevas

```sql
alter table public.turnos
  add column if not exists fondo_desglose    jsonb,
  add column if not exists efectivo_desglose jsonb,
  add column if not exists arqueo_autorizado_por text;
```

`fondo_inicial` y `efectivo_declarado` **se quedan** y pasan a ser calculados
desde el desglose. No se tocan ni se renombran: los leen el corte Z, los reportes
y el cálculo de `diferencia`, y cambiarlos sería reescribir media aplicación para
ganar limpieza.

### La forma del jsonb

```json
{ "1000": 2, "500": 3, "100": 10, "20": 4, "0.5": 6 }
```

La denominación es la clave, en texto —las claves de jsonb son texto de todas
formas— y el valor es **cuántas piezas hay**, no el importe. Se guarda el conteo
y no el subtotal a propósito: el importe se deriva y el conteo no, y lo que hay
que poder auditar es lo que la persona contó.

**Un desglose vacío (`{}`) no es lo mismo que ausente (`null`).** `{}` es «conté
y no había nada»; `null` es «no se contó». Si no se distinguen, un cierre sin
contar se lee después como una caja vacía.

### Auditoría — dos eventos nuevos

- **`CAJON_ABIERTO`** — quién, cuándo y **motivo**: `venta` · `manual` ·
  `apertura_turno` · `cierre_turno`. Si es venta, con su folio.
- **`ARQUEO_DECLARADO`** — turno, esperado, declarado, diferencia, el desglose,
  quién contó y **quién firmó**.

---

## 6 · Las trampas, escritas antes de caer en ellas

### El pulso no se encola. El registro sí.

Y **van en direcciones opuestas**, que es lo que lo hace fácil de equivocar.

`abrirCajon` está deliberadamente fuera de la cola (`lib/Hub.js:653`): *«un pulso
reintentado abriría el cajón cuando la impresora vuelva —veinte minutos después, o
al día siguiente— con dinero dentro y nadie delante»*. Eso no cambia.

Pero **el registro es dato, no acción física**, y ése sí tiene que ir por la cola
de siempre y no perderse nunca. Si el registro viajara pegado al pulso, un hub
caído dejaría la apertura sin nombre — que es justo lo que este diseño existe
para evitar.

### El cierre no puede bloquearse porque el cajón no abra

`abrirCajon` no reintenta y puede fallar (hub apagado, impresora sin corriente).
**El cierre de turno tiene que poder completarse igual**: se registra que la
apertura falló, se cuenta abriendo con la llave, y el turno se cierra. Si no, un
hub caído deja al local sin poder cerrar la caja, y la solución de todos sería
volver a dejar la llave a mano — deshaciendo el diseño entero.

### La diferencia sale del desglose, nunca de un número tecleado

`diferencia = esperado − suma(desglose)`. Si algún día se añade un campo de total
para casos raros, la discrepancia contra el desglose **se registra**, no se pisa
en silencio.

### El cajero cuenta su propia caja

Es lo normal en un restaurante y no hay que fingir lo contrario. Lo que hace que
el conteo valga no es quién lo teclea, es que **queda firmado por alguien más y
con el detalle de las piezas**.

---

## 7 · Lo que este diseño NO resuelve

**La llave sigue existiendo.** Tiene que existir: el hub se cae, la impresora se
queda sin corriente, y el dinero tiene que poder sacarse. Lo que cambia es que
deja de ser una herramienta de uso diario y pasa a ser el camino de excepción.

**Dónde vive la llave es procedimiento, no código:** con el dueño, no en el local
y no con el gerente. Quien firma el arqueo no debería poder abrir el cajón sin
dejar rastro, o su firma no vale nada. Eso va escrito en el **Anexo B del
contrato** junto a la reserva de DHCP, no en el software.

---

## 8 · Qué hay que construir, por orden

1. **Registrar toda apertura.** Es lo más barato y lo que más da: sin ello,
   ninguno de los botones de abajo significa nada. Incluye la que ya existe, la
   de la venta en efectivo.
2. **`configuracion.denominaciones`** y que la pantalla las lea.
3. **Botón «Abrir cajón»** con `abre_cajon`, registrado con motivo `manual`.
4. **Desglose en apertura de turno**, sustituyendo el campo de fondo inicial.
5. **Cierre de turno**: desglose, esperado contra declarado, y **PIN de
   `autoriza_arqueo` sobre la cifra**.
6. **Corte Z**: que el papel lleve el desglose. Es el documento que se archiva.

**Pruebas que no pueden faltar, con control negativo:** que el fallo del cajón no
impida cerrar el turno · que `{}` y `null` no se confundan · que la diferencia
salga de la suma del desglose · que un rol sin `autoriza_arqueo` no pueda firmar.
