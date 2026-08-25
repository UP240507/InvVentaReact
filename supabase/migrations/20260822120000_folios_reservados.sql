-- ─────────────────────────────────────────────────────────────────────────────
-- folios_reservados — la reserva de un folio sobrevive al aparato que la hizo
--
-- ── EL FALLO QUE CIERRA (medido en AZUL el 17-ago) ──────────────────────────
-- `handlePedirCuenta` acuña el folio ANTES de cobrar. Tiene que hacerlo: el
-- papel que se deja en la mesa lleva número. Hasta hoy esa reserva vivía sólo
-- en `mesa.orden_actual`, o sea en el almacenamiento local del aparato. Si el
-- aparato muere entre imprimir y cobrar, la reserva muere con él, y quedan dos
-- daños distintos:
--
--   1. El cliente tiene un papel citando `V-000004` y el cobro posterior emite
--      otro número. **El papel y la venta no se pueden conciliar.** Éste es el
--      grave, y es peor que un hueco: no es que falte un número, es que hay un
--      documento en la calle que no corresponde a nada.
--   2. Un HUECO en la serie de ventas — exactamente la señal que `Folio.js`
--      dice querer evitar, y exactamente donde la buscaría un auditor.
--
-- ── POR QUÉ UNA TABLA NUEVA Y NO `mesas` EN EL RESPALDO ─────────────────────
-- Era lo que decía el plan, y está mal. Las tres tablas que ya se respaldan
-- —`ventas`, `comandas`, `movimientos`, más `auditoria`— son **hechos que sólo
-- se añaden**: reproducirlos desde un aparato muerto no puede deshacer nada.
-- `mesas` es lo contrario: **estado mutable y compartido**. Adoptar el estado
-- de una mesa desde un teléfono que murió a las 20:05 puede resucitar una mesa
-- que otro aparato cerró a las 20:20 — un fallo peor que el que se venía a
-- arreglar, y de los que no dan error.
--
-- Una RESERVA, en cambio, sí es un hecho que sólo se añade. Cabe en el NDJSON
-- del hub tal cual, con la misma clave `${tabla}::${id}` que el resto, y sin
-- tocar cómo se resuelven los conflictos de sala.
--
-- ── APPEND-ONLY DE VERDAD, NO POR COSTUMBRE ────────────────────────────────
-- No hay columna `estado` ni `consumido`. Marcar una reserva como consumida
-- exigiría un UPDATE, y un UPDATE es justo lo que convierte esta tabla en algo
-- que el respaldo no puede reproducir sin riesgo. **Que una reserva se haya
-- consumido se sabe mirando si existe una venta con ese folio**: dos hechos y
-- una consulta, en vez de un estado que mantener sincronizado entre aparatos
-- que a veces no se hablan.
--
-- Y se hace cumplir con permisos (abajo), no con una nota en un comentario.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.folios_reservados (
  -- El propio folio es la clave. No hace falta inventar otra: `Folio.js` ya
  -- garantiza unicidad por construcción (prefijo de dispositivo + consecutivo),
  -- y usarlo como `id` hace que la clave de respaldo del hub
  -- —`folios_reservados::AZUL7K-V-000004`— sea legible cuando haya que
  -- diagnosticar algo por teléfono.
  id             text primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,

  -- 'V' | 'C'. Se guarda aunque vaya dentro del folio: filtrar por serie es la
  -- consulta natural y no se hace con `like`.
  serie          text not null default 'V',

  -- Para qué mesa se reservó. Sin esto, un folio huérfano no dice a qué cuenta
  -- pertenecía y la conciliación se vuelve adivinanza. `text` y sin FK a
  -- propósito: la mesa puede haberse borrado y el hecho sigue siendo cierto.
  mesa_id        text,
  mesa_nombre    text,

  -- Quién la acuñó. Es lo que permite leer «el aparato que murió reservó
  -- éstos», que es la pregunta que se hace al adoptar.
  dispositivo    text,
  usuario        text,

  -- Cuánto sumaba la cuenta al imprimirla. No es dinero contable —la venta es
  -- la que manda— pero convierte un hueco anónimo en algo investigable: dice
  -- de cuánto era la cuenta que se imprimió y nunca se cobró.
  total_impreso  numeric(12,2),

  reservado_en   timestamptz not null default now()
);

create index if not exists folios_reservados_restaurante_fecha
  on public.folios_reservados (restaurante_id, reservado_en desc);

-- Para la conciliación: «reservas de esta mesa», que es como se busca cuando
-- otro aparato recoge una cuenta que no abrió.
create index if not exists folios_reservados_mesa
  on public.folios_reservados (restaurante_id, mesa_id);

alter table public.folios_reservados enable row level security;

-- ── Los permisos son los que hacen el append-only ──────────────────────────
-- Insertar y leer, nada más. Sin update no hay forma de reescribir una reserva
-- ya hecha, y sin delete no hay forma de borrar la prueba de un folio que se
-- imprimió. Una tabla que existe para que no falten números no puede permitir
-- que le quiten números.
-- Los `drop ... if exists` no son adorno: esta migracion ya esta APLICADA en
-- AZUL bajo otro sello de version (20260822022834), asi que un `db push` desde
-- el repo la vuelve a correr. Sin esta linea, `create policy` revienta con
-- "already exists" y detiene el push entero a media tanda.
drop policy if exists folios_reservados_lee on public.folios_reservados;
create policy folios_reservados_lee on public.folios_reservados
  for select to authenticated
  using (restaurante_id = public.get_restaurante_id());

drop policy if exists folios_reservados_inserta on public.folios_reservados;
create policy folios_reservados_inserta on public.folios_reservados
  for insert to authenticated
  with check (restaurante_id = public.get_restaurante_id());

-- Nada de `grant ... to public`: la misma regla que el resto del esquema.
revoke all on public.folios_reservados from public;
grant select, insert on public.folios_reservados to authenticated;

comment on table public.folios_reservados is
  'Folios acunados al imprimir una cuenta, antes de que exista la venta. Solo '
  'se inserta y se lee: que una reserva se consumio se sabe mirando si hay una '
  'venta con ese folio. Sirve para conciliar el papel que tiene el cliente con '
  'la venta emitida cuando el aparato que imprimio muere por el camino.';
