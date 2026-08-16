# Consumos de personal — diseño

Chris, 14-ago. **Aplica a todos, incluido el dueño.**

Son **tres cosas independientes** y confundirlas es el error caro:

1. **El inventario se descuenta SIEMPRE.** Sin excepción, cueste o no cueste.
2. **El precio admite descuento** — de 0 % a cortesía total. Unas cosas se
   cobran y otras no.
3. **Lo que quede a cargo se descuenta del sueldo.**

Que sean tres y no una es justo lo que no se puede modelar como «una venta con
descuento»: una venta ata las tres a la vez.

---

## 1 · Por qué NO es una venta al 100 % de descuento

`cortesia` ya existe en `TIPOS_DESCUENTO`, así que hoy se puede cobrar una
comanda al 100 %. Funciona, descuenta stock y pasa por cocina. Y aun así no
sirve:

- **Entra como venta de $0.** Sube el número de tickets y hunde el ticket
  promedio. En un local donde ocho personas comen a diario, en un mes eso
  falsea los dos números que el dueño mira todos los días.
- **No sabe de quién fue.** Una venta no tiene empleado a cargo, tiene mesero.
- **No hay dónde poner lo que se le cobra.** Una venta cobrada es una venta
  cobrada; no puede quedar pendiente hasta la nómina.

## 2 · Por qué tampoco es una merma

`MermasScreen` ya mueve stock sin venta, con motivo obligatorio y registro en
`movimientos`. Es el pariente más cercano. Pero:

- **No pasa por cocina**, y un empleado que pide chilaquiles necesita que
  alguien los prepare.
- `movimientos.usuario` es **texto libre**, no una referencia a `staff`. Para
  descontar de una nómina hace falta un `staff_id` de verdad.
- Una merma es producto que se perdió. Esto es producto que alguien se comió,
  y puede que lo pague. No es lo mismo y mezclarlos hace que ninguno de los dos
  reportes sirva.

## 3 · Tabla `consumos`

```
id                bigint
restaurante_id    uuid        -- RLS, como todo
staff_id          bigint      -- FK a staff. NO texto libre.
fecha             timestamptz
turno_id          bigint      -- para que salga en el corte del turno
items             jsonb       -- mismo shape que venta.items (reaprovecha todo)
importe_lista     numeric     -- lo que costaría en carta
descuento         jsonb       -- {tipo,valor} de lib/Descuentos.js, tal cual
importe_a_cargo   numeric     -- lista − descuento. Lo que se le cobra.
a_cocina          boolean     -- se elige al registrarlo
comanda_id        text        -- si fue a cocina
nomina_id         bigint      -- NULL = todavía no cobrado. Ver §5.
usuario_registro  text        -- quién lo capturó
activo            boolean
```

`descuento` guarda la política aplicada y el importe resultante, pero **no se
teclea a mano**: se calcula. Cómo, en §3-bis.

## 3-bis · La regla real de AZUL, que no es «base gratis, extras al 75 %»

Chris, 14-ago, con el caso concreto:

> Unos chilaquiles con arrachera cuestan **140** para el cliente. Para un
> trabajador sólo se cobra el extra de arrachera, **45**, menos el **25 %**.

|                    |         Cliente |            Trabajador |
| ------------------ | --------------: | --------------------: |
| Chilaquiles (base) | incluido en 140 |          **cortesía** |
| Extra arrachera    | incluido en 140 | 45 − 25 % = **33.75** |
| **Total**          |      **140.00** |             **33.75** |

Y del inventario salen **las dos cosas completas**, cueste lo que cueste al
trabajador.

**Lo que hace que esto funcione no es la distinción platillo/extra.** Es el
ingrediente. Va gratis todo lo que sea tortilla, huevo, crema, queso fresco,
verdura simple (jitomate, cebolla, lechuga, espinaca…), tés, aguas de fruta y
cafés (de olla, americano, espressos). Los chilaquiles salen gratis **porque
están hechos de cosas gratis**, no porque sean el platillo base. Y la arrachera
se cobra porque la arrachera se cobra.

### La bandera va en el ingrediente

En `productos` (que es lo que edita `IngredientesScreen`):

```
cobrable_personal  boolean
```

**Y no en una pantalla nueva.** Chris propuso copiar `IngredientesScreen` y
añadirle la casilla; mejor la casilla en la pantalla que ya existe. Una lista
aparte se desincroniza sola: el ingrediente que se dé de alta el mes que viene
no aparecería en ella, o aparecería en un estado que nadie eligió. El dato es
del ingrediente, así que vive con el ingrediente.

### Por categoría primero, por ingrediente después

`productos` ya tiene `categoria`, y la lista de Chris **se agrupa casi sola**:
verduras, básicos de despensa, bebidas calientes. Marcar doscientos
ingredientes uno por uno es la clase de tarea que se hace a medias.

Entonces dos niveles:

1. **Por categoría**, en Configuración: el valor por defecto.
2. **Por ingrediente**, en Ingredientes: la excepción. Hace falta — «queso
   fresco» va gratis y no todos los quesos.

### Nada de valor por defecto invisible

Un ingrediente sin decidir **no puede caer en `true` ni en `false` sin más**.
Cualquiera de los dos es un silencio: o se le cobra de más a alguien, o el local
regala comida sin enterarse.

La pantalla de Ingredientes lleva un filtro **«sin decidir»** y un distintivo en
la fila. Que el hueco se vea, en vez de resolverse solo.

### Qué se cobra exactamente

**Una línea vendible —platillo o modificador— es cobrable si alguno de sus
ingredientes lo es.** Las cobrables se cobran a **precio de carta menos el
porcentaje** (25 % hoy, configurable). Las demás, cero.

- Chilaquiles → tortilla, huevo, crema, queso fresco, verdura → **$0** ✓
- Extra arrachera → arrachera es cobrable → 45 × 0.75 = **$33.75** ✓

**Consecuencia que hay que aceptar a propósito:** unos huevos con jamón, donde
el huevo es gratis y el jamón no, se cobran **enteros** al 75 %. Repartir el
precio del platillo entre sus ingredientes según coste sería «más justo» y
sería un error: el empleado tiene que poder mirar su recibo y entender por qué
le descontaron eso. **Una regla que no se puede explicar a quien pierde el
dinero es una regla que va a acabar en discusión**, y la discusión la pierde
siempre el sistema.

Si algún día hace falta afinar, se afina marcando el platillo, no repartiendo
centavos.

### Depende de que los modificadores tengan precio

Sin `precio` en la opción «Extra Arrachera» no hay 45 que cobrar. Eso es el
**§8 de `PENDIENTE_LUNES.md`**, y va **antes** que esto. No es una preferencia
de orden: sin ello, este cálculo da cero siempre y parecería que funciona.

## 4 · El inventario, que es la parte que no puede fallar

Va por `decrementar_stock` con **`p_origen = 'CONS-<id>'`**, el mismo camino
que las ventas y las comandas.

No es por comodidad: esa RPC ya tiene el ledger `stock_salidas` con
`insert … on conflict do nothing`, así que un reintento de la cola tras un
timeout **no descuenta dos veces**. Inventarse un camino paralelo aquí sería
reabrir a mano el agujero que se cerró el 13-ago.

## 5 · `nomina_id` es el candado contra el doble cobro

Al procesar una nómina se recogen los consumos del periodo con
`nomina_id IS NULL`, se suman, y **se marcan con el id de esa nómina**. Un
consumo ya marcado no vuelve a entrar nunca.

Sin ese campo, reprocesar una nómina —algo que pasa: se corrige un turno y se
vuelve a generar— le cobraría a la persona su comida dos veces. Y no daría
ningún error: saldría un número más grande, y nadie revisa un número que no
sabe que está mal.

Es el mismo patrón que `stock_salidas` y que `crm_canjes`. Van tres.

## 6 · Nóminas necesita deducciones, y hoy sólo suma

Esquema actual: `total_sueldos`, `total_propinas`, `gran_total`, `detalles`.
`gran_total = sueldos + propinas`. **No hay ni un solo concepto que reste.**

Hace falta:

- `total_deducciones numeric default 0`
- `gran_total = sueldos + propinas − deducciones`
- en `detalles`, por empleado, el desglose de sus consumos — no basta el total:
  quien recibe menos dinero del que esperaba va a preguntar por qué, y la
  respuesta tiene que estar en el recibo, no en una consulta a la base.

## 7 · El dueño — el caso que Chris levantó y que rompe el modelo

**El dueño no tiene nómina.** Puede no tener `salario_base`, y desde luego no
se le descuenta de un sueldo que no existe.

Si se ignora, pasa lo peor: el consumo se registra con `importe_a_cargo > 0`,
`nomina_id` se queda en `NULL` para siempre, y la cifra engorda mes a mes como
una deuda que nadie va a cobrar. Un saldo silencioso que ensucia el reporte.

**Propuesta:** al registrar un consumo de alguien sin nómina, la pantalla lo
dice y ofrece dos salidas, ninguna silenciosa:

- **Cortesía** — importe a cargo 0. Es lo normal para el dueño.
- **Retiro** — se registra a cargo, pero va a un cubo de _retiros del
  propietario_, no a nómina. Contablemente es otra cosa y conviene que el
  contador lo vea separado (relacionado con lo de persona moral / RESICO de
  `PENDIENTE_LUNES.md` §4).

Lo que no puede hacer es aceptarlo callando.

## 8 · Reportes

Sección propia con su total. **Nunca como venta.** El dueño quiere ver de un
vistazo cuánto se va al mes en consumo de personal — que suele ser un número
que sorprende— sin que eso le mueva el ticket promedio.

Mínimo: total del periodo, desglose por persona, y cuánto de eso está pendiente
de cobrar en la próxima nómina.

## 9 · Orden de trabajo

**0. Precio en los modificadores** (`PENDIENTE_LUNES.md` §8). Bloqueante: sin
él, todo lo de abajo calcula cero y lo parece todo bien.

1. Migración: `productos.cobrable_personal`, tabla `consumos` + RLS,
   `total_deducciones` en `nominas`, y la política (% y defectos por categoría)
   en configuración.
2. `lib/Consumos.js` con pruebas, **antes que cualquier pantalla**. Lo que hay
   que fijar ahí es el ejemplo de los chilaquiles con arrachera —140 para el
   cliente, 33.75 para el trabajador— como caso literal, más el ingrediente sin
   decidir, más el dueño.
3. La casilla en `IngredientesScreen` + filtro «sin decidir» + defectos por
   categoría en Configuración.
4. Pantalla de registro del consumo.
5. Enganche con nóminas: recoger pendientes de la semana, marcar `nomina_id`,
   desglose por persona y **sueldo neto**.
6. Sección en Reportes.

**Los pasos 1 y 2 antes que la pantalla.** El riesgo de esto no está en la
interfaz, está en cobrar dos veces y en descontar dos veces del stock.

## 10 · El periodo es SEMANAL

Chris, 14-ago: «se acumulan los consumos de cada semana, se cobran de la nómina
y ahora sí da el sueldo neto».

Dos cosas que salen de esa frase:

- El corte es **semanal**, y tiene que cuadrar con el periodo de la nómina
  (`fecha_inicio` / `fecha_fin`), no con la semana natural. Si un consumo cae
  entre dos periodos por un desfase de horas, se cobra en el siguiente — nunca
  en ninguno, y nunca en los dos. Para eso está `nomina_id`.
- **«Sueldo neto» es un concepto que hoy no existe.** `gran_total` es bruto.
  Es el número que el trabajador espera ver, así que es el que tiene que salir
  grande en el recibo, con las deducciones arriba explicadas una por una.

## 11 · Por qué no se escribió el 14-ago

La prueba de campo era al día siguiente y lo que se verificaba era **el
descuento de inventario**. Meter código nuevo en ese camino la víspera
convertiría un fallo de consumos en un fallo de stock, sin forma de saber cuál
de los dos fue. Mismo criterio que se aplicó a los modificadores con el precio
y el inventario.
