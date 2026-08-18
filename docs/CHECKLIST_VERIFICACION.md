# Checklist de verificación — lo que FALTA por comprobar

Este documento es sólo lo pendiente. **Lo que ya se verificó el 15-ago vive en
`docs/VERIFICADO_15-AGO.md`**, junto con los tres fallos que aparecieron y su
diagnóstico.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
varios cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados. El 15-ago pasó una vez: las comandas que
salían de más en mostrador parecían un bug propio y eran síntoma de otro.

---

## Antes de medir nada del camino de la cola

1. ~~El trigger que castea `it->>'id'` a `bigint`.~~ **Arreglado el 17-ago.**
   Era el que ensuciaba cualquier medición del camino de la cola; ya no estorba.
2. ~~La reimpresión tras reapertura.~~ **Arreglado el 17-ago** (`655916e`),
   pendiente de verse en papel.
3. ~~El centavo de más en el total.~~ **Arreglado el 17-ago** (`7cdd689`),
   pendiente de verse en papel.
4. ~~«Recuperar ahora» que falla y dice «No había nada que recuperar».~~ **Arreglado** (`f5fea58`).
5. ~~El `23505` marcado como fallo.~~ **Arreglado** (`140415d`). Sigue abierta
   la exclusión por token: ya no reparte rojos, pero la caja adopta lo suyo.
6. ~~La auditoría no se respalda.~~ **Arreglado** (`7021425`).
7. El folio reservado vive sólo en el aparato. **Mitigado** (`655916e`,
   `cfbc428`): la causa frecuente arreglada y el hueco queda explicado en
   auditoría. Falta decidir si `mesas` se respalda.

Ver `docs/VERIFICADO_15-AGO.md`. Los que quedan son de pocas líneas.

- [ ] **Pendiente de comprobar, y va con el fallo 4:** comparar el
      `"dispositivo":"840ce96da4be84e5"` de la anotación en el `.ndjson` con el
      token que la caja tiene ahora. Si son distintos, la caja deja de
      reconocer sus propias ventas pendientes tras un reinicio y se ofrece a
      adoptarlas bajo otra identidad.

---

## 0 · Que compile y que pase la suite

- [ ] `npm run test:rapido`

  El lote de lógica pura, sin DOM ni globales. `--isolate=false` aquí es seguro
  y rápido.

> **Obligatorio antes de compilar el 18-ago.** El 17 se tocaron `Fiscal.js`,
> `Comanda.js`, `PosScreen.jsx`, `useSyncStore.js`, `useAppStore.js`,
> `Respaldo.js` y `HubScreen.jsx`. Se corrieron **663 pruebas de `src/lib` y
> `src/store` en verde**, pero **las suites de pantalla no**, y `PosScreen` y
> `HubScreen` están tocados. `compilar.ps1` las corre solo.

### Sobre `--isolate=false`, que costó dos días de fantasmas

Durante el 10 y el 11-ago se dio por hecho que había «50 pruebas rotas» en
`src/features src/components`. **No había ninguna.** Todos los fallos venían de
compartir estado global entre archivos con `--isolate=false`.

> **Medido el 12-ago, para que no vuelva a costar dos días:** `npm run
> test:rapido` da **6 fallos en `useConectividad.test.jsx`**. Ese archivo solo
> pasa **11 de 11**. La contaminación sigue ahí y **no es una regresión**. Si
> aparece un séptimo, ESE sí es nuevo.

**La verificación de verdad se hace con `npm run test:run`**, que aísla.

## 3 · Lo que queda del flujo de la cuenta

- [ ] **El cajón NO se abre** al pedir la cuenta. Ese papel se imprime antes de
      cobrar y no debe mover dinero.
- [ ] ~~el cajón se abre al cobrar en efectivo~~ / ~~con tarjeta no se abre~~ —
      **no se puede verificar**: el cajón del restaurante está averiado y sólo
      abre con la llave. El pulso ESC/POS sale igual (`hub_abrir_cajon`), pero
      no hay forma de comprobarlo hasta que se repare o se pruebe en otro cajón.
      **Queda pendiente, no verificado.**

> El código sí dice lo correcto: `construirPreCuenta` devuelve `abrirCajon:
> false` explícito, y `handlePedirCuenta` lo vuelve a pasar al reusar el ticket.
> Falta el papel —o mejor, el cajón— que lo demuestre.

### La reapertura, con impresora — 18-ago

Ya no está bloqueado: el arreglo entró el 17-ago y la suite pasa. Falta el papel.
Son cuatro, y el tercero es el que junta los dos arreglos:

- [ ] Mesa con productos → **Pedir Cuenta** → sale **un** papel.
- [ ] **Pedir Cuenta otra vez**, sin tocar nada → sale **otro** papel, idéntico.
      Antes no salía nada y tampoco avisaba.
- [ ] **Reabrir**, agregar algo, **A Producción**, Pedir Cuenta → papel con el
      **total nuevo** y **el mismo folio**.
- [ ] **Cobrar** → la venta lleva **ese** folio, no uno nuevo. Se confirma en
      `public.ventas`.
- [ ] Y de paso, el fallo 3: un ticket de **dos jugos de $40** debe decir
      `TOTAL $80.00`, con `SUBTOTAL:$68.97 IVA:$11.03`. Antes decía `$80.01`.

## 10 · Lo que queda del 13-ago

- [ ] `scripts/pruebas-rust.sh` — incluye `respaldo`, así que la lógica del
      respaldo se puede verificar también fuera de Windows.

### El respaldo de ventas — **cerrado el 17-ago**

Verificado con un teléfono muerto de verdad: hotspot sin internet, cobro, borrado
de los datos de sitio, revocación del dispositivo, «Por adoptar» en 5 y las cinco
anotaciones subidas y comprobadas en la base. Ver `VERIFICADO_15-AGO.md`.

De ahí salieron los fallos 6 y 7, que no son del respaldo sino de lo que deja
fuera.

### El descuento de inventario — la prueba dura

- [x] En Supabase, `stock_salidas` tiene **una fila por comanda** (o por venta en
      mostrador). **Comprobado el 17-ago**: seis orígenes desde el 15-ago, todos
      con exactamente una fila. Ninguno duplicado.

> Con esto §10 queda cerrado por los dos lados: el contador de la caja (80 kg →
> 79.8 tras el reintento) y la tabla de la nube.
>
> Un hallazgo de paso: `1829724086159641` —la venta que estuvo dos días sin
> llegar a Supabase— **sí tiene su salida de stock**, aplicada a los once
> segundos del cobro. El inventario nunca dependió de que la venta subiera. Son
> dos caminos separados y el que evita vender lo que no hay funcionó aunque el
> otro estuviera roto.

### Al cerrar la sesión de pruebas — NO OLVIDAR

El 17-ago la caja quedó en un hotspot (`10.245.x.x`) y con el transporte en
**Simulador**. Las dos cosas hay que devolverlas antes de que abra el local:

- [ ] La caja **al wifi de AZUL**. Si se queda en el hotspot y ese teléfono se
      va, los meseros pierden el hub y el QR guardado apunta a una IP muerta.
- [ ] El transporte **a la impresora de Windows**. Éste muerde en silencio: los
      cobros pasan, todo «funciona», y no sale un papel en todo el servicio.

### El updater

La ronda completa necesita publicar una versión N+1 a la que saltar. La guía está
en `docs/CHECKLIST_ACTUALIZACIONES.md`.

> `tauri.conf.json` ya tiene la `pubkey` pegada de verdad. Para compilar el
> bundle hay que exportar `TAURI_SIGNING_PRIVATE_KEY` y su contraseña **en la
> misma sesión de shell**, o revienta al firmar, al final del build.

---

## Lo que NO se hizo, y por qué

**§F del diseño — preguntar por el cobro parcial al pedir la cuenta.**

Es lo único que queda del flujo. Se dejó fuera a propósito: cambia **qué se
imprime y qué se cobra**, y va montado encima de otros cambios que no se habían
visto funcionar. El 15-ago se vieron: §3 y §4 están en verde salvo la
reimpresión. Cuando los tres fallos estén arreglados, §F son un par de horas
contra una base que se sabe buena.

## Deuda conocida que sigue ahí

- `ModalCobro` aún no usa `lib/Autorizacion.js` — tercera copia evitada, segunda
  pendiente de migrar.
- ~~El `id` de `auditoria` sale de `Date.now()`.~~ Arreglado el 17-ago: usa
  `SERIE_AUDITORIA`, que llevaba reservada sin usar desde `IdVenta.js`.
- CSP nulo en `tauri.conf.json` y `CorsLayer::permissive()` en el hub.
- ~~La reimpresión de documentos existe en `Comanda.js` y nadie la llama.~~ Ya
  se llama: el contador de impresiones de `orden_actual` entra en el id.
- `mesas.mesero_id` sigue muerto: bloquea tres de las cinco propuestas de sala.
- Queda por localizar el archivo que ensucia `matchMedia` entre ficheros. No
  rompe nada con aislamiento; sólo estorba al correr sin él.
- `total_divergente` lo calcula un trigger y **nada en el front lo lee**. Desde
  el arreglo del fallo 3 el front y Postgres coinciden exacto, así que el
  detector ya no vive al borde de gritar por todo: leerlo pasa a ser útil.
