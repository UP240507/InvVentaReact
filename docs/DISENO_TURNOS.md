# Turnos matutino / vespertino — diseño

> **Estado: escrito el 22-ago, SIN implementar.** Nada de esto toca la base
> hasta que Chris lo revise. Decisiones tomadas en la sesión del 22-ago; el
> resumen corto está en `PENDIENTE_LUNES.md` §0e.

## 0 · La trampa de nombres, y va primero porque lo condiciona todo

**`ventas.turno_id` YA EXISTE**, y no significa lo que este documento va a
llamar «turno».

```
ventas.turno_id           uuid  →  turnos(id)
propinas_reparto.turno_id uuid  →  turnos(id)
```

La tabla `turnos` es la **sesión de caja**: `fecha_apertura`, `fondo_inicial`,
`efectivo_declarado`, `diferencia`. Alguien la abre, alguien la cierra, y se
arquea contra el dinero del cajón. Es el corte Z. Funciona y tiene 19 filas.

Lo que Chris pide es otra cosa: **la franja del día** —mañana y tarde— para
poder comparar producto, nómina y propinas entre las dos.

**Son conceptos distintos y no coinciden.** Una sesión de caja puede cruzar el
corte horario; dos sesiones pueden caer en la misma franja; y una franja existe
aunque nadie haya abierto caja.

Reutilizar `turno_id` sería repetir el error que se evitó en los gastos con
`origen` —dos significados en una columna— pero con dinero de por medio y en la
tabla más consultada del sistema. **No se reutiliza.**

### El nombre que se usa aquí: `franja`

| Concepto       | Tabla / columna             | Qué es                           |
| -------------- | --------------------------- | -------------------------------- |
| Sesión de caja | `turnos`, `ventas.turno_id` | Lo de siempre. **No se toca.**   |
| Franja del día | `ventas.franja`, etc.       | Matutino / vespertino. Lo nuevo. |

En pantalla se le sigue diciendo **«Turno matutino»** y **«Turno vespertino»**,
que es como se habla en un restaurante. La divergencia entre la palabra de la
interfaz y la del esquema es un coste, y se paga a propósito: es mucho menor
que tener dos `turno` que significan cosas distintas.

## 1 · Las decisiones tomadas

### 1.1 · La franja se deriva del reloj

Cada venta ya lleva hora. No hace falta que nadie abra ni cierre nada, y por
tanto no hay «la noche que a nadie se le ocurrió cerrar el turno».

El corte es **configurable por local** —AZUL no tiene por qué cambiar a la
misma hora que un desayunador— y vive en `configuracion`.

### 1.2 · Inventario: dimensión, nunca partición

`franja` en los movimientos y **un solo stock**.

**El argumento que lo decide: el stock físico no se puede partir.** El
refrigerador es uno. Un «inventario de la mañana» es ficción contable y va a
divergir del físico en silencio — que es el modo de fallo de esta casa.

AZUL separa físicamente porque **no tiene sistema**: sin trazabilidad, cortar
el inventario en dos es la única forma de saber a qué turno reclamarle un
faltante. **La división es un sustituto de la trazabilidad, no un requisito del
negocio.** Con `franja` en cada movimiento, la pregunta «¿cuánto consumió cada
turno?» se contesta sin partir nada.

Decisión de Chris (22-ago): se diseña **el caso general de cualquier
restaurante**, no la práctica de AZUL. Lo que AZUL conteste cambiará qué
reportes hacen falta, no cómo se guardan los datos.

### 1.3 · La venta a caballo va a la franja del COBRO

Abierta 15:50, cobrada 16:10 → vespertino.

Chris preguntó si convenía dejarlo configurable. **Ahí hay dos preguntas y sólo
una es opinable:**

- **El dinero no se opina.** El corte Z cuadra contra el efectivo del cajón. Si
  la venta contara para la mañana pero el billete entró en el cajón de la
  tarde, **los arqueos de las dos franjas salen mal a la vez**: a uno le sobra
  y al otro le falta. No hay ajuste que arregle dónde está el billete.
- **A quién se le acredita el trabajo, sí.** «Cuántas mesas sacó la mañana»,
  las propinas, la productividad del mesero. Eso se contesta **en el reporte**,
  filtrando por hora de apertura de la mesa — sin tocar el esquema y sin
  añadir un interruptor.

Y un motivo más para no meter el ajuste: **cambiarlo reescribiría el pasado.**
El mismo día daría cifras distintas antes y después de tocarlo.

## 2 · Derivar o estampar — y aquí me corrijo

Al presentar la opción «se deriva del reloj» dije como ventaja que **los datos
históricos se pueden reclasificar hacia atrás**. Es verdad, y **choca de frente
con el argumento de §1.3**: si mover el corte horario reclasifica el pasado,
entonces un ajuste sí reescribe los reportes de un mes cerrado — justo lo que
se rechazó.

No se puede tener las dos cosas. La salida:

**La franja se calcula al ESCRIBIR y se guarda en la fila.**

- El pasado queda **inmutable**. Mover el corte de las 16:00 a las 15:00 afecta
  a lo que venga, no a lo ya cobrado. Un mes cerrado sigue diciendo lo mismo
  dentro de un año.
- Y para las filas que ya existen, **un relleno de una sola vez** dentro de la
  migración, calculado desde su propia hora. Es explícito, ocurre una vez, y
  queda escrito que ocurrió.
- Si algún día hace falta reclasificar, es una **acción de administrador con
  rastro en auditoría**, no el efecto secundario de tocar un ajuste.

«Derivado del reloj» sigue siendo cierto en lo que importaba: **nadie tiene que
acordarse de abrir ni cerrar nada.** Sólo que el reloj se consulta una vez, al
guardar.

### La hora es LOCAL, no UTC

El corte son «las 16:00» del local. `fecha` es `timestamptz`, así que el cálculo
tiene que hacerse en la zona del restaurante o la franja saldrá corrida.

Ya hay precedente y ya costó una vez: `lib/Fechas.js` existe porque un gasto
capturado después de las 18:00 en México se sellaba con el día siguiente y
**desaparecía del periodo**. Mismo error, otra columna.

## 3 · Esquema

### 3.1 · La configuración

```sql
alter table public.configuracion
  add column if not exists franjas_activas boolean not null default false,
  add column if not exists franja_corte    time    not null default '16:00';
```

**Apagado por defecto, y es lo más importante de esta migración.** Con
`franjas_activas = false` no cambia absolutamente nada en ninguna pantalla: ni
filtros nuevos, ni columnas en los reportes, ni una palabra distinta. Un
restaurante de un solo turno no tiene por qué enterarse de que esto existe.

Una sola hora de corte, no dos. Un día tiene dos franjas porque tiene un corte;
pedir «inicio y fin» de cada una invita a dejar huecos —¿de 23:00 a 06:00 qué
es?— y a que alguien los deje sin querer.

### 3.2 · La columna, donde hace falta

```sql
-- 'matutino' | 'vespertino' | null (= sin clasificar)
alter table public.ventas       add column if not exists franja text
  check (franja is null or franja in ('matutino','vespertino'));
alter table public.movimientos  add column if not exists franja text
  check (franja is null or franja in ('matutino','vespertino'));
alter table public.gastos       add column if not exists franja text
  check (franja is null or franja in ('matutino','vespertino'));
```

**Nullable, y `null` significa «sin clasificar»** — igual que `gastos.escala`.
Las filas de un local que nunca activó las franjas se quedan en `null`, y eso
es información: no se inventa una franja para datos capturados cuando el
concepto no existía.

**Índices** por `(restaurante_id, franja, fecha)` en las tres.

### 3.3 · Lo que NO lleva columna, y por qué

- **`comandas`** — se deriva de su venta. Una comanda sin venta es una comanda
  no cobrada, y ésa se mira por otro sitio.
- **`nominas`** — cubre un periodo de días, no una franja. Partirla exigiría
  saber qué horas trabajó cada quien en cada franja, y eso lo dice
  `asistencias`, no la nómina. **Reporte, no columna.**
- **`propinas_reparto`** — ya lleva `turno_id` (sesión de caja) y `rango_desde`
  / `rango_hasta`. Con esos dos la franja se deduce; una columna más sería una
  tercera fuente de verdad para lo mismo.

### 3.4 · El caso incómodo: `gastos.fecha` es `date`

**No tiene hora.** Un gasto no puede saber su franja a partir de su propio dato
de negocio.

- **Al capturar**, se estampa desde el reloj del momento (`created_at`), que es
  cuando alguien lo registró — y en la práctica es cuando ocurrió, porque los
  gastos del turno se capturan en el turno.
- **En el relleno**, los gastos ya existentes se quedan en `null`. Deducir la
  franja de `created_at` para una fila de hace tres meses sería inventar un
  dato: `created_at` es cuándo se tecleó, no cuándo se gastó.

## 4 · Migración, en el orden en que se aplica

1. **Configuración** (§3.1). Sin efecto visible: todo apagado.
2. **Columnas + índices** (§3.2). Sin efecto: nadie las escribe todavía.
3. **Relleno de una sola vez**, sólo para `ventas` y `movimientos`, y **sólo
   para los locales con `franjas_activas = true`** — o sea ninguno el día que
   se aplique. Se deja escrito para cuando alguien lo active:

   ```sql
   update public.ventas v set franja = case
     when (v.fecha at time zone 'America/Mexico_City')::time < c.franja_corte
       then 'matutino' else 'vespertino' end
   from public.configuracion c
   where c.restaurante_id = v.restaurante_id
     and c.franjas_activas and v.franja is null;
   ```

4. **`lib/Franjas.js`** — `franjaDe(fecha, corte, zona)` y `etiquetaDeFranja()`,
   puras y con pruebas. Es donde vive la regla, y donde se prueba el caso de
   medianoche y el del cambio de horario.
5. **Escritura**: el POS estampa al cobrar, `Inventario` al mover, `Gastos` al
   capturar. Una línea en cada sitio, leyendo de `lib/Franjas.js`.
6. **Lectura**: filtro de franja en Reportes, junto al de periodo. Igual que las
   pestañas de gastos: **el total del periodo sigue siendo el de todo**, y el
   filtro cambia la lista, no las cifras globales.
7. **La pantalla de turnos** en Configuración, que sustituye a la que se ocultó
   el 22-ago: activar/desactivar y la hora del corte. Va la última a propósito
   — hasta que los pasos 1-6 existan, activar no haría nada.

## 5 · Cómo se verifica que no rompió nada

La prueba que protege a todos los locales, y va primero:

- **Con `franjas_activas = false`, todo se comporta exactamente como hoy.**
  Mismo corte Z, mismos reportes, mismas cifras, ninguna palabra nueva en
  pantalla. Si esto falla, no se publica.

Después:

- Cobrar antes y después del corte: cada venta cae en su franja.
- **La venta a caballo:** abrir mesa a las 15:50, cobrar a las 16:10 → cuenta
  como **vespertino**, y el efectivo cuadra con el arqueo de la tarde.
- Mover el corte horario **no cambia** ninguna venta ya cobrada.
- Un movimiento de inventario cae en su franja, y **el stock total no se
  duplica ni se parte**: sigue siendo un número por producto.
- Un gasto capturado se estampa; uno de antes se queda «sin clasificar» y se ve
  como tal.

## 6 · Lo que este diseño NO hace, dicho para que nadie lo espere

- **No parte el inventario.** Ver §1.2. Si alguien pide «el inventario de la
  mañana» como cubo aparte, la respuesta es que no existe y por qué.
- **No cierra la franja.** No hay un «cerrar turno matutino» — el corte Z sigue
  siendo el de la sesión de caja, que es otra cosa (§0).
- **No reparte la nómina** entre franjas. Eso sale de `asistencias`, y es un
  reporte que todavía no existe.
- **No decide si AZUL lo necesita.** Chris apuntó la pregunta de fondo: _¿lo
  quieren porque lo necesitan o por costumbre?_ Este diseño hace que la
  respuesta no importe para el esquema — con las franjas apagadas, el sistema
  es el de hoy.

## 7 · Las preguntas que quedan abiertas

Ninguna bloquea los pasos 1-4; todas se pueden contestar antes del 5.

1. **¿Un empleado puede estar en las dos franjas el mismo día?** Afecta al
   reporte de productividad, no al esquema.
2. **¿El efectivo se traspasa entre franjas o cada una tiene su fondo?** Hoy no
   se plantea, porque el arqueo va por sesión de caja y no por franja. Si
   alguien quiere arquear por franja, esto se vuelve una pregunta grande.
3. **¿Corte Z por franja o uno al día?** Ligado a la anterior. Mi lectura: el
   corte Z se queda como está —es de la sesión de caja— y las franjas viven en
   los reportes.
