# Dejar AZUL en blanco antes de cargar el menú de verdad

**Estado: escrito el 23-ago, SIN EJECUTAR.** Se corre el día que el patrón dé
luz verde a las recetas. Nada de este documento se ha aplicado.

Decisión de Chris (23-ago): cuando haya menú, se limpia lo de prueba y se
puebla el sistema entero. Se conservan la configuración, los empleados y los
roles; el resto del catálogo se recaptura.

---

## 0 · La regla que no se salta: NUNCA `TRUNCATE`

**Esta base es multi-tenant y compartida.** `TRUNCATE` no admite `WHERE`: se
lleva por delante a todos los locales de la tabla, no sólo a AZUL. Y hay un
agravante ya comprobado el 22-ago: **`TRUNCATE` se salta RLS**, así que ni
siquiera la política de fila protege.

Todo lo de abajo va con `delete ... where restaurante_id = ...`. Sin excepción.

---

## 1 · Lo que se conserva, y por qué

| Tabla | Qué es | Se conserva |
| --- | --- | --- |
| `configuracion` | Flujo de cuenta, IVA, datos fiscales, logo, franjas | **Sí** — borrarla devuelve la caja a valores de fábrica |
| `roles_permisos` | Los 7 roles con sus capacidades | **Sí** — es el activo más caro de recrear y el más fácil de equivocar |
| `staff` | Sairi, Diego, Beto, Carlos, Alan | **Sí**, con PIN nuevos (§4) |
| `modificadores` | «Tipo de leche», «Extras», «Términos» | **Sí** — son reales, no de prueba |

## 2 · Lo que se borra

**Operación** (todo son datos de prueba): `ventas` · `comandas` ·
`movimientos` · `stock_salidas` · `turnos` · `propinas_reparto` · `gastos` ·
`gastos_recurrentes` · `nominas` · `asistencias` · `ordenes_compra` ·
`folios_reservados` · `facturas` · `auditoria` · `login_intentos` ·
`clientes` · `crm_visitas` · `crm_canjes`.

**Catálogo que se recaptura**: `recetas` (6 de ejemplo) · `productos` (10
insumos con unidades inconsistentes) · `mesas` («12», «11», «A») ·
`proveedores` («Emma», «Quesos», «saad»).

> **Por qué los insumos también.** No es que estorben: es que están mal. Diez
> filas y ya hay tres formas de decir lo mismo —`lt` contra `L`, `pza` contra
> `pz`— y un «tortilla de míz». Conservarlos obliga a que quien capture los
> doscientos siguientes imite el error, y el costo promedio ponderado no olvida.
> Ver `DISENO_ALCANCE_INVENTARIO.md`.

## 3 · El orden, que lo dictan las claves foráneas

`ventas` apunta a `clientes`, `turnos` y `propinas_reparto`; `comandas` a
`mesas`; `movimientos` a `productos`; `gastos` a `categorias_gasto`; y `mesas`
se apunta a sí misma por `mesa_principal_id`. Fuera de ese orden, el `delete`
falla — ruidosamente, que es lo bueno.

```sql
-- AZUL. Cambiar aquí y en ningún otro sitio.
-- 15e2e574-6222-445c-afcd-c04925001aae

begin;

-- ── 1 · Operación ────────────────────────────────────────────────────────
delete from public.facturas          where restaurante_id = :rid;
delete from public.ventas            where restaurante_id = :rid;
delete from public.propinas_reparto  where restaurante_id = :rid;
delete from public.turnos            where restaurante_id = :rid;
delete from public.crm_canjes        where restaurante_id = :rid;
delete from public.crm_visitas       where restaurante_id = :rid;
delete from public.clientes          where restaurante_id = :rid;
delete from public.comandas          where restaurante_id = :rid;
delete from public.stock_salidas     where restaurante_id = :rid;
delete from public.movimientos       where restaurante_id = :rid;
delete from public.folios_reservados where restaurante_id = :rid;
delete from public.gastos            where restaurante_id = :rid;
delete from public.gastos_recurrentes where restaurante_id = :rid;
delete from public.nominas           where restaurante_id = :rid;
delete from public.asistencias       where restaurante_id = :rid;
delete from public.ordenes_compra    where restaurante_id = :rid;
delete from public.login_intentos    where restaurante_id = :rid;
delete from public.auditoria         where restaurante_id = :rid;

-- ── 2 · Catálogo que se recaptura ────────────────────────────────────────
delete from public.recetas           where restaurante_id = :rid;
delete from public.productos         where restaurante_id = :rid;
update public.mesas set mesa_principal_id = null where restaurante_id = :rid;
delete from public.mesas             where restaurante_id = :rid;
delete from public.proveedores       where restaurante_id = :rid;

-- NO se tocan: configuracion · roles_permisos · staff · modificadores ·
--              suscripciones · usuarios · restaurantes

commit;
```

**Antes del `commit`, contar.** Un `select count(*)` por tabla dentro de la
misma transacción: si algún número no es el esperado, `rollback` y a mirar. Una
transacción abierta es la única oportunidad de arrepentirse.

## 4 · Lo que hay que arreglar aprovechando el viaje

- [ ] **El RFC.** `configuracion.rfc` dice `ROGC010401AQ9`, que es el de ejemplo
      y **no corresponde a la razón social** (`DISENO_FLUJO_CUENTA.md` §6: el
      real empieza por `CAFA`). Ese dato se imprime como emisor en cada ticket.
- [ ] **Las unidades.** Normalizar la lista de `configuracion.unidades` y
      **decidir la unidad de consumo de cada insumo antes de capturar**, no
      después. La regla: la unidad de inventario es la unidad de consumo.
- [ ] **Las categorías.** `configuracion.categorias` tiene tres (`Lácteos`,
      `Carnes`, `Bebidas`) y son de insumo; las recetas usaban otras cinco. Fijar
      las dos listas antes de que entren doscientas filas.
- [ ] **Los PIN**, que estuvieron en el repositorio. Es el momento.

## 5 · Las tres trampas que NO están en la base

**Aquí es donde esto se tuerce en silencio.** Vaciar Postgres no vacía la caja.

### 5.1 · El respaldo del hub resucita las ventas

La caja guarda cada venta en `respaldo-ventas.ndjson`. Si se limpia la base y
alguien pulsa **«Recuperar ahora»**, esas 121 ventas de prueba **vuelven a
subir**, y no da error: el `upsert` las acepta como si fueran nuevas.

- [ ] Con la app **cerrada**, vaciar el archivo de respaldo del hub.
- [ ] Al abrir, comprobar que «Por adoptar» está en 0 y el contador de respaldo
      también.

### 5.2 · Cada aparato tiene su copia local (Dexie)

La caja, los teléfonos y las tablets guardan el catálogo y las ventas en
IndexedDB. Tras limpiar la nube, un aparato que no se refresque **sigue
enseñando el menú viejo**, y peor: puede tener cosas en su cola de salida.

- [ ] En **cada** aparato: cerrar sesión y volver a entrar, o limpiar los datos
      del sitio. Uno por uno, y anotar cuáles se hicieron.
- [ ] Comprobar en cada uno que el catálogo aparece vacío antes de empezar a
      capturar.

### 5.3 · El consecutivo del folio no vive en la base

`lib/Folio.js` lo guarda en el `localStorage` de cada dispositivo. Borrar las
ventas **no lo reinicia**, y eso está bien.

- [ ] **Recomendación: no reiniciarlo.** Que la numeración siga donde iba no le
      molesta a nadie, y reiniciarla es la vía directa a dos ventas con el mismo
      folio si algo quedó vivo en un aparato que no se limpió. Un hueco al
      principio de la serie se explica en una línea; un folio repetido, no.

## 6 · Los otros cuatro locales de prueba

Decisión de Chris (23-ago): **se borran los cuatro** — `Doña pelos`, `prueba1`
y los dos `cabañon`. Mismo procedimiento, tabla por tabla y con `where`, más su
fila en `restaurantes`, `configuracion`, `suscripciones` y `usuarios`.

> **Consecuencia que hay que tener presente:** las **E2E de flujo** siguen
> bloqueadas hasta que exista un tenant desechable, porque escriben en el tenant
> vivo. Con la semilla de `supabase/seed/plantilla_local.sql` crear uno cuesta
> un minuto, así que borrarlos deja de ser caro — pero hay que acordarse de
> crearlo antes de correrlas.

## 7 · El ensayo, que es gratis

**Antes de tocar AZUL, correr el procedimiento entero contra uno de los locales
de prueba que de todos modos se van a borrar.** Si el orden de los `delete`
está mal, se descubre ahí y no con el local de verdad a medio limpiar.

## 8 · La copia, antes de nada

- [ ] Copiar a un esquema aparte lo que se va a borrar, por si acaso:

```sql
create schema if not exists respaldo_prepoblado;
create table respaldo_prepoblado.ventas       as select * from public.ventas       where restaurante_id = :rid;
create table respaldo_prepoblado.movimientos  as select * from public.movimientos  where restaurante_id = :rid;
create table respaldo_prepoblado.recetas      as select * from public.recetas      where restaurante_id = :rid;
create table respaldo_prepoblado.productos    as select * from public.productos    where restaurante_id = :rid;
create table respaldo_prepoblado.auditoria    as select * from public.auditoria    where restaurante_id = :rid;
```

Ocupa nada —121 ventas y 382 movimientos— y se tira cuando el sistema lleve un
mes operando.

## 9 · El orden del día D

1. Copia (§8).
2. Ensayo contra un tenant de prueba (§7).
3. Apps **cerradas**. Vaciar el respaldo del hub (§5.1).
4. Los `delete` de AZUL, en una transacción, contando antes del `commit` (§3).
5. Borrar los otros cuatro locales (§6).
6. Limpiar cada aparato (§5.2).
7. Arreglar RFC, unidades y categorías (§4).
8. Abrir y comprobar: catálogo vacío, configuración intacta, roles y empleados
   en su sitio, «Por adoptar» en 0.
9. **Ahora sí**, cargar el menú.
