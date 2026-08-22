# Checklist de verificación — lo que FALTA por comprobar

Reescrito el 18-ago para la sesión de campo con la **0.2.6**. Este documento es
**sólo lo pendiente**: lo verificado el 15-ago vive en `docs/VERIFICADO_15-AGO.md`,
y el porqué de cada arreglo en `docs/PENDIENTE_LUNES.md`.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
varios cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados. El 15-ago pasó una vez: las comandas que
salían de más en mostrador parecían un bug propio y eran síntoma de otro.

**Y una regla nueva, que sale de lo del 18-ago:** los cinco arreglos de ese día
no vienen con la misma red debajo: dos los encierran pruebas nuevas —el fallo 5
en Rust, la reimpresión en `Comanda.test.js`—, tres **no los mira ninguna suite**
y uno ni siquiera se corrió. Está anotado en cada sección. Donde diga «sin red
debajo», el ojo es la única verificación que hay.

**Y una corrección:** el paso 2 de la sección 2 estaba mal escrito —pedía pulsar
un botón que en ese estado está apagado— y se descubrió al construir el botón de
copia. Un checklist que manda hacer lo imposible se salta, y saltarse un paso es
cómo se pierde el único que verificaba algo.

---

## 0 · Antes de salir de la máquina

- [x] `cargo test` en `src-tauri`. **Hecho el 18-ago**, en verde. Era lo único
      que sostenía los cambios de Rust fuera de `respaldo.rs`.
- [ ] `npm run test:run` completo. Lo corre `compilar.ps1` solo; se anota aquí
      porque es lo que autoriza a compilar, no un trámite.
- [ ] `npm run test:rapido`. Pendiente desde el 13-ago.

  > **Lo que tiene que dar, medido el 12-ago para que no vuelva a costar dos
  > días:** 6 fallos en `useConectividad.test.jsx`, y **no son una regresión**
  > —vienen de compartir estado global con `--isolate=false`; ese archivo solo
  > pasa 11 de 11—. **Si aparece un séptimo, ESE sí es nuevo.**

- [ ] Las **cinco** versiones en **0.2.6** (`npm run version` lo comprueba —
      desde el 18-ago también mira `Cargo.lock` y `package-lock.json`, que se
      quedaban fuera y se desalineaban solos).

---

## 1 · Paso cero en el local: en qué flujo está AZUL

- [ ] **Zonas de Producción** (`/zonas-produccion`), primer bloque: **«La cuenta
      de la mesa»**. Dos opciones: «Un solo papel — el ticket final»
      (`ticket_final`) o «Dos papeles — pre-cuenta y ticket»
      (`precuenta_y_ticket`).
- [ ] Y si la pantalla deja dudas, mirar la fila de configuración en Supabase.
      **`precuenta_y_ticket` es el valor por defecto** —`PosScreen.jsx:840` hace
      `configuracion?.flujo_cuenta || 'precuenta_y_ticket'`—, así que si nadie
      ha tocado nunca esa pantalla la columna puede venir `null` y el
      comportamiento ser el de dos papeles **por omisión, no por decisión**.

**Esto va antes que todo lo demás porque cambia qué prueba la sección 2.** El
contador de impresiones que arregló el fallo 2 sólo entra por la rama
`ticket_final`. Con `precuenta_y_ticket` se va por `enviarPreCuenta`, cuyo id ya
llevaba `Date.now()` más una secuencia y **por tanto nunca se dedupló**: ahí el
fallo 2 no existía. Si AZUL está en ese flujo, los papeles de abajo salen —pero
no prueban el arreglo, prueban un camino que ya funcionaba.

> **Si AZUL está en `precuenta_y_ticket`:** para ver el arreglo hay que pasar a
> `ticket_final` un momento, hacer la sección 2 y devolverlo. Ese cambio altera
> **qué papel se lleva el cliente**, así que no se toca con el local abierto.

---

## 2 · La cuenta, la reapertura y el folio — con impresora

Fallos 2, 3 y 7. **Los arreglos están y la suite los cubre por debajo**
(`Comanda.test.js`, `Fiscal.test.js`), pero el eslabón de `PosScreen` que los
conecta **no lo mira ninguna prueba**. Esto es la verificación, no una segunda
opinión.

- [ ] Mesa con productos → **Pedir Cuenta** → sale **un** papel.
- [ ] **«Imprimir copia»**, en el aviso naranja, sin tocar nada → sale **otro**
      papel, idéntico salvo la hora.

  > **Corregido el 18-ago, y conviene saber por qué.** Aquí decía «Pedir Cuenta
  > otra vez», y eso **no se puede hacer**: con `ticket_final`, en cuanto la
  > cuenta se imprime la mesa pasa a `por_cobrar`, `cuentaCerrada` se pone en
  > `true` y ese botón se apaga. El paso venía heredado del checklist viejo y
  > nadie lo había intentado. Para eso está el botón nuevo.
  >
  > La hora sí cambia: es la de esta impresión. `orden_actual` no guarda la de
  > la primera. El folio es lo que dice que son la misma cuenta.

- [ ] **Reabrir**, agregar algo, **A Producción**, Pedir Cuenta → papel con el
      **total nuevo** y **el mismo folio**. **Éste es el fallo 2 de verdad** —el
      del 15-ago fue «tras reabrir, volver a pedir la cuenta no imprimía»—, así
      que si algo falla en esta sección, lo que importa es este paso.
- [ ] **Cobrar** → la venta lleva **ese** folio, no uno nuevo. Se confirma en
      `public.ventas`.
- [ ] Fallo 3: un ticket de **dos jugos de $40** dice `TOTAL $80.00`, con
`SUBTOTAL:$68.97 IVA:$11.03`. Antes decía `$80.01`.

- [ ] **«Imprimir copia» NO abre el cajón** y **no desbloquea la cuenta**: el
      aviso naranja sigue ahí y «A Producción» sigue apagado. Si la copia
      reabriera algo, el bloqueo dejaría de proteger lo que protege.
- [ ] En **Auditoría** hay un `CUENTA_IMPRESA` por cada papel, numerados. Es el
      único rastro: los papeles son idénticos.

### El cajón

- [ ] **NO se abre** al pedir la cuenta. Ese papel se imprime antes de cobrar y
      no debe mover dinero.
- [ ] ~~se abre al cobrar en efectivo~~ / ~~con tarjeta no~~ — **no se puede
      verificar**: el cajón de AZUL está averiado y sólo abre con llave. El
      pulso sale igual (`hub_abrir_cajon`). **Pendiente, no verificado.**

---

## 3 · El respaldo y la adopción — el fallo 5, cerrado el 18-ago

**Respaldado por dos pruebas nuevas en `respaldo.rs`**, una de ellas reabriendo
el archivo, y comprobado que fallan sin el arreglo. Esto de aquí verifica el
cableado en la caja de verdad.

- [ ] **Al instalar la 0.2.6, drenar una vez con «Recuperar ahora».** Lo que ya
      está en el disco lleva tokens de arranques muertos y no se distingue de lo
      de un teléfono revocado, así que se ofrecerá esa última vez. Adoptar de
      más es inofensivo: `upsert` sobre una clave ya única.

### La prueba que confirma el arreglo

- [ ] Quitar internet a la caja (que siga viendo su propia LAN), **cobrar una
      venta desde la caja**, y comprobar que queda pendiente de subir.
- [ ] **Cerrar la aplicación y volver a abrirla.**
- [ ] En la pantalla del hub, **«Por adoptar» debe seguir en 0**. Antes de este
      arreglo, ahí aparecía la venta que la caja acababa de cobrar ella misma.

  > Ése es el fallo entero: el token de emparejamiento se regenera en cada
  > arranque y el archivo de respaldo no, así que la caja dejaba de reconocer lo
  > suyo. Dentro de un mismo arranque **no se ve**: hay que reiniciar.

- [ ] Abrir `respaldo-ventas.ndjson` y ver que las líneas nuevas de la caja
      dicen `"dispositivo":"::caja::"` y no una cadena hexadecimal.

### La prueba que confirma que NO se rompió lo que servía

Igual de importante: la adopción tiene que seguir funcionando para los
teléfonos, que es para lo que existe.

- [ ] Cobrar desde un teléfono sin red, **revocar ese dispositivo** desde la
      caja —revocar lo saca de la ventana de vivo al momento, sin esperar los 15
      minutos— y pulsar «Recuperar ahora».
- [ ] Esa venta **sí** debe aparecer y subir. Comprobarla en `public.ventas`.

### El drenaje en ráfaga — **con SEIS ventas, no con una**

Hasta ahora este documento pedía «hacer una venta sin red y reconectar». Con
una, la cola se vacía tan rápido que no se ve nada de lo que hay que ver. Y el
caso real no es una: es el mesero que estuvo media hora en la terraza sin
cobertura.

**Qué protege ya, para saber qué NO estás probando.** La cola es serial —un
`for` con `await`, una tarea por vez—, va en orden de creación, no corre dos
pases a la vez, reintenta con espera creciente de 1 s a 60 s, y manda a
dead-letter lo que no tiene arreglo. Un `23505` cuenta como éxito. Nada de eso
está en duda. Lo que se prueba aquí es lo que **no** tiene freno.

- [ ] Con el teléfono **sin red** (modo avión, o fuera del wifi), cobrar
      **seis** ventas seguidas. Que alguna lleve modificador y alguna nota: son
      las que tumbaron el trigger el 15-ago.
- [ ] **Reconectar** y no tocar nada. **Cronometrar cuánto tarda en vaciarse.**

  > Ése es el número que de verdad importa, y por eso se anota: seis ventas son
  > unas treinta tareas. Si tardan un minuto, doscientas ventas son media hora
  > de teléfono despierto y en rango. Sin medirlo con seis, nadie sabe si
  > doscientas son viables.

- [ ] Mientras drena, **mirar el KDS en otro aparato**. El eco de realtime es la
      parte que no tiene freno: cada fila que entra a la nube es un evento para
      todos los dispositivos conectados a la vez. Si algo se va a atragantar,
      es ahí.
- [ ] Al terminar: las **seis** están en `public.ventas`, y el panel de errores
      del teléfono está **vacío**.
- [ ] En `stock_salidas`, **una fila por venta**. Ni cero ni dos. Es la misma
      comprobación que cerró §10 el 17-ago, ahora bajo carga.

> **Si algo cae en dead-letter, NO lo descartes.** Reencólalo y anota el motivo.
> Un fallo sistemático —un trigger, una policy— manda las seis de golpe, porque
> los errores permanentes van a dead-letter en el primer intento a propósito.
> Es lo que habría pasado el 15-ago con el trigger de los modificadores si
> hubiera habido cien ventas acumuladas en vez de unas pocas: no se pierde
> nada, pero alguien tiene que reencolarlas a mano.

> **Y una consecuencia conocida, para que no la apuntes como fallo nuevo:** si
> la fila de una venta muere en dead-letter, **la RPC de stock que va detrás se
> ejecuta igual**. El almacén se mueve para una venta que no está en los libros.
> No es un descuido: es lo que dice el hallazgo del 17-ago —«el inventario nunca
> dependió de que la venta subiera, son dos caminos separados»— y por eso el que
> evita vender lo que no hay funcionó mientras el otro estaba roto. Si aparece,
> se anota; no se arregla en caliente.

---

## 4 · La dirección por nombre — nuevo el 18-ago

**Sin red debajo:** `HubScreen.jsx` no tiene suite. Esto es todo lo que hay.

- [ ] En la pantalla del hub aparece **«Dirección por nombre»** junto a la de
      IP, con `http://invventa-caja.local:3000`.
- [ ] Abrirla **desde un teléfono** y **desde otra PC** del local.
- [ ] Con la caja en el wifi de AZUL, no en un hotspot: el descubrimiento por
      nombre depende de la red, y un extensor que cree su propia subred lo rompe.

  > **Si la línea NO aparece, no es un fallo de la pantalla:** significa que el
  > anuncio no salió, y entonces es correcto no enseñarla. Enseñar una dirección
  > que la red no resuelve manda a teclear algo que no funciona y a concluir que
  > el hub está roto. Si no aparece y quieres saber por qué, el hub lo dice al
  > arrancar por consola —que en release no se ve—, así que el diagnóstico real
  > es probar si otro equipo resuelve `.local` en esa red.

---

## 5 · El botón de reimprimir — nuevo el 18-ago

`Reportes → Corte de Caja (Z) → Tickets del turno`, un icono de impresora por
fila. **Sin red debajo:** `ReportesScreen.jsx` no tiene suite. Lo que sí está
probado es la capa de abajo (`Comanda.test.js`, 102 en verde).

- [ ] Cobrar una venta, ir a Reportes y **pulsar el botón**: sale un papel.
- [ ] **Pulsarlo otra vez** → sale **otro** papel. Éste es el paso que importa:
      si el número de copia no subiera, `cola.rs` descartaría el segundo por id
      ya impreso, **sin error y sin papel**, y el cajero le diría al cliente
      «ya salió» mientras la impresora no hace nada.
- [ ] Los papeles son **idénticos al original**: sin «REIMPRESIÓN», sin «copia
      2», sin nada añadido.
- [ ] **El cajón NO se abre** con ninguna de las copias.
- [ ] La copia de una venta **de mesa** dice el nombre de la mesa, no
      «Mostrador».
- [ ] En **Auditoría** aparece un `REIMPRESION_TICKET` por cada copia, con folio
      y número. Es el único rastro que existe: desde el papel no se puede
      distinguir un original de una copia.
- [ ] En Supabase, `ventas.copias_impresas` de esa venta subió.

> **Si AZUL está en `ticket_final`:** la copia lleva «Pago: EFECTIVO» y el papel
> que se llevó el cliente no lo llevaba, porque aquél era la cuenta. Es
> deliberado (decisión del 18-ago) y está explicado en `PENDIENTE_LUNES.md` §1.
> No lo apuntes como fallo.
>
> **Y no esperes ver «Recibido» ni «Cambio» en la copia.** `cambio_entregado`
> no se guarda en la base, así que la reimpresión no lo sabe — y preferimos
> callarlo antes que imprimir un cero que sería mentira.

---

## 6 · Los dos recortes de interfaz — nuevo el 18-ago

**Sin red debajo:** ninguna suite mira el layout.

- [ ] **Mesas:** seleccionar la mesa de la **esquina superior izquierda**. El
      anillo tiene que verse entero por los cuatro lados. Ahí es donde se
      cortaba, porque el contenedor con scroll no tenía margen ni arriba ni a la
      izquierda.
- [ ] **POS:** la etiqueta **`Enviado: n`** en **una sola línea**. Probar en la
      tablet o estirando una ventana de Chrome a ~1080 px, que es donde rompía.

  > No es estética: ese número dice que esas unidades ya están en cocina, o sea
  > que no se pueden quitar sin autorización de gerente. Partido en dos y en
  > 10 px, un mesero con prisa no lo lee.

---

## 7 · El Corte Z y el vale de propina, en papel térmico — nuevo el 18-ago

Hasta hoy estos dos botones **no hacían nada** dentro de la caja: usaban
`window.open`, que en WebView2 no devuelve una ventana usable. Ahora van por la
misma cola del hub que los tickets. **Sin red debajo en la pantalla**
(`ReportesScreen.jsx` no tiene suite); lo probado es el documento
(`Comanda.test.js`, 102 en verde).

- [ ] `Reportes → Corte de Caja (Z)`, elegir un turno y pulsar **«Imprimir Z»**:
      sale un papel **por la térmica**, no un diálogo de Windows.
- [ ] Las cifras del papel **cuadran con las de la pantalla**: tickets,
      efectivo, tarjeta, propinas, fondo, total.
- [ ] **`TOTAL EN CAJA` = fondo inicial + efectivo.** Sin tarjeta y sin
      propinas: es lo que tiene que haber físicamente en el cajón. Contarlo una
      vez contra el dinero real.
- [ ] **Pulsarlo dos veces seguidas → salen DOS papeles.** Es el paso que
      importa: el corte se reimprime a propósito (uno para la libreta, otro para
      el dueño) y `cola.rs` descarta por id repetido sin dar error.
- [ ] **El cajón NO se abre** al imprimir el corte.
- [ ] Con un turno **sin cerrar**, el papel dice **«En curso»** en la línea de
      Cierre, no un hueco.
- [ ] Con la impresora apagada: sale el aviso rojo, **no** un «listo» falso.
- [ ] `Reportes → Propinas por mesero`, botón de impresora de un mesero con
      propinas: sale el **vale**, con el importe en grande, **el importe con
      letra** y la línea de firma con espacio suficiente para firmarla en la
      tira de 58 mm.
- [ ] En **Auditoría** aparece `VALE_PROPINA_IMPRESO` con el mesero, el importe
      y el periodo. (El corte **no** se audita, y es a propósito: es un resumen
      de datos que ya están en la base. El vale es dinero contra una firma.)
- [ ] **POS:** cobrar una venta y, en el ticket que aparece, pulsar
      **«Imprimir»** → sale **papel térmico**, no la ventana entera de la app.
      Pulsarlo dos veces saca dos papeles y sube `copias_impresas`.

---

## 8 · El KDS en sólo lectura y por estación — nuevo el 18-ago

Los dos ajustes viven en `Roles y Permisos`. **Antes de nada, la comprobación
que protege a todos los locales:**

- [ ] **Sin tocar ningún ajuste, el KDS se marca exactamente como ayer.** Éste
      es el paso crítico: los flags son restricciones justamente porque
      `getCapacidades` reemplaza en vez de mezclar, y un error aquí deja sin
      marcar a todas las cocinas al publicar. Si esto falla, **no publicar**.
- [ ] Activar **«sólo lectura»** en un rol de supervisión y entrar al KDS con
      él: banda visible arriba, items **atenuados**, y al tocar uno **se abre el
      modal de PIN** — no se queda sin responder.
- [ ] Con el PIN de encargado se desbloquea y **ya se puede marcar**. En
      Auditoría queda `KDS_DESBLOQUEADO` con quién autorizó.
- [ ] Activar **«estación fija»** en el rol de cocina, con un empleado que
      tenga estación: sus platillos sí, los de barra no.
- [ ] **Deshacer también está bloqueado**, no sólo marcar. Es el mismo botón a
      propósito: «no tocas esta estación» se explica; «puedes desmarcar pero no
      marcar», no.
- [ ] Con «estación fija» activada y un empleado **sin estación asignada**: se
      le deja marcar y **la pantalla avisa** de que el ajuste no está haciendo
      nada. Un ajuste que promete y no cumple es peor que uno apagado.

---

## 9 · El aviso de modificadores sin atar — nuevo el 18-ago

La trampa gorda de la configuración: haces el grupo bien y no pasa nada, porque
falta atarlo en Recetas.

- [ ] `Catálogos → Modificadores`: cada grupo enseña **«En N platillos»** o
      **«Todavía sin usar»**, y el número coincide con la realidad.
- [ ] Atar un grupo a un platillo en Recetas y volver: el chip **cambia solo**.
- [ ] El grupo sin usar enseña además **dónde se ata**, no sólo que no está
      atado.

---

## 9b · Los dos arreglos del 21-ago — nuevo

**Notas en una línea con parte ya enviada.** Sin red debajo en la pantalla; la
aritmética sí está probada (`repartirPorNota`, 8 pruebas).

- [ ] Mandar **una** pizza a cocina. Volver a tocar Pizza (la línea dice «2x,
      Enviado 1») y pulsar el icono de nota: **ahora se abre**, y el cuadro
      avisa de que la nota va sólo a la unidad que no ha salido.
- [ ] Al aceptar quedan **dos líneas**: una de 1 con «Enviado 1» y sin nota, y
      otra de 1 con la nota. **Las cantidades suman lo mismo que antes.**
- [ ] Mandar la nueva a cocina: sale **su propia comanda**, con la nota.
- [ ] Con **todo** ya enviado, el icono avisa de que hay que agregar otra
      unidad primero — y no se queda mudo.
- [ ] Abrir la nota y aceptar **sin cambiar nada** deja el carrito igual: ni
      líneas de más ni cantidades movidas.

**Comensales antes de la cuenta.**

- [ ] Mesa nueva: el contador de la cabecera enseña **«—»**, no 1.
- [ ] Pulsar **«Pedir Cuenta»** sin haberlo puesto → se abre el cuadro. **No
      imprime y la mesa NO queda marcada por cobrar** si se cancela.
- [ ] Teclear el número (o Enter) → imprime, y el papel lleva la línea
      **«Personas: N»**.
- [ ] Reimprimir la cuenta: sale el **mismo** número.
- [ ] En **mostrador** no se pide nada. Y **mandar a cocina nunca lo pide**:
      eso frenaría el servicio por un dato de reporte.

---

## 9c · El CSP, encendido — nuevo el 22-ago

**Va en la 0.2.7 y sólo se nota en el build instalado**: en `tauri dev` la
política es otra. Lo que rompe el aspecto de la app ya se verificó en banco
—0 violaciones sobre el build real, y 16 en el control negativo—, así que aquí
sólo queda lo que un navegador no puede tener: IPC, Supabase y realtime.

- [ ] La app **abre y se ve maquetada**, con sus tipografías (→ `style-src`,
      `font-src`). Si esto falla, el banco mintió y hay que mirarlo.
- [ ] **Iniciar sesión** contra Supabase (→ `connect-src https:`).
- [ ] **Imprimir** un ticket de prueba desde la pantalla del hub (→ `ipc:`).
      **Es el que más fácil se olvida:** sin `ipc:` no funciona ni un comando
      del hub — ni imprimir, ni el cajón, ni el respaldo.
- [ ] La pantalla del hub enseña **la cola y el ancho de papel**
      (→ `localhost:*`).
- [ ] Abrir el KDS y mandar una comanda desde otro aparato: **tiene que
      aparecer sola** (→ `wss:`, el realtime). Éste se nota tarde si falla.
- [ ] El **logo** del restaurante, si está configurado (→ `img-src https:`).
- [ ] **Y al terminar, mirar `Ajustes › Hub`.** Si la tarjeta roja «Bloqueos de
      seguridad» no aparece, no hubo ninguno. Si aparece, dicta lo que dice: ahí
      está la directiva y la URL exactas.

> **Cómo salir si algo falla:** volver `"csp": null`, recompilar y publicar. No
> hay estado que migrar ni datos que arreglar — es una línea de configuración.

---

## 9d · El folio reservado sobrevive al aparato — nuevo el 22-ago

**Antes de nada, aplicar la migración `20260822120000_folios_reservados.sql`.**
Sin ella el POS encola filas para una tabla que no existe y la cola se llena de
fallos — ruidosos, eso sí, no callados.

- [ ] Con el flujo en **`ticket_final`**, pedir la cuenta de una mesa. En
      Supabase aparece una fila en `folios_reservados` con **el folio como
      `id`**, la mesa, el usuario y el total impreso.
- [ ] **Reimprimir esa misma cuenta NO crea una segunda fila.** El cliente ya
      tiene ese papel; el hecho es uno solo.
- [ ] Cobrarla. En `Reportes → Corte de Caja` **no** aparece en «Cuentas
      impresas sin cobrar»: la venta ya lleva ese folio.
- [ ] **La prueba que importa.** Pedir la cuenta de otra mesa y **NO cobrarla**.
      Aparece en la lista, con su folio y de cuánto era. Eso es un hueco
      documentado; antes era un hueco invisible.
- [ ] Con el flujo en **`precuenta_y_ticket`** no se reserva nada, y es
      correcto: ese papel no lleva número, así que no hay nada que conciliar.
- [ ] **En la caja, `Ajustes → Hub`:** después de pedir una cuenta, el contador
      de respaldo sube. La reserva viaja con las ventas.
- [ ] Intentar **borrar** una fila de `folios_reservados` desde el cliente:
      **tiene que fallar.** Sólo hay `select` e `insert`. Una tabla que existe
      para que no falten números no puede dejar que le quiten números.

---

## 9e · Gastos en dos pestañas — nuevo el 22-ago

Necesita la migración `20260822130000_gastos_escala.sql`.

- [ ] `Gastos` abre en **«Del turno»**, no en «Todos». Es la que se usa con
      prisa.
- [ ] Registrar un gasto nuevo: el formulario ya viene en «del turno» y la
      ayuda dice que **no lleva saldo ni reposiciones**. Nadie debe esperar
      aquí una caja chica.
- [ ] Registrar uno «fuerte». Cada uno aparece **sólo en su pestaña**.
- [ ] **El paso que importa:** los gastos de antes de hoy salen en **las dos**
      pestañas, con el distintivo «Sin clasificar», y arriba dice cuántos
      quedan. Ninguno puede quedarse fuera de las dos vistas.
- [ ] Abrir uno de ésos, elegir escala y guardar: desaparece del aviso y se
      queda en una sola pestaña.
- [ ] **El total del periodo NO cambia al cambiar de pestaña.** La pestaña
      filtra la lista, no las cifras: si el total bajara, una pestaña estaría
      haciendo que el mes pareciera más barato de lo que fue.
- [ ] Editar un gasto viejo **sin tocar la escala** lo deja sin clasificar, no
      lo mete en «del turno» por defecto.

---

## 9f · Duplicar receta — nuevo el 22-ago

- [ ] `Catálogos → Recetas`, icono de copiar en una receta con insumos y
      modificadores. Se abre el formulario con **todo relleno**.
- [ ] El nombre dice **«(copia)»** y el **código POS está vacío**. Ése es el
      importante: la columna no es única en la base, y dos platillos con el
      mismo código no dan error — se descubren cuando el POS trae el que no era.
- [ ] **Cerrar sin guardar no deja nada.** Duplicar no crea filas por sí solo.
- [ ] Guardar crea una receta NUEVA: la original sigue igual, con su código.
- [ ] Duplicar dos veces seguidas da «(copia)» y **«(copia 2)»**, no dos
      nombres iguales.
- [ ] Duplicar una copia da «(copia 2)», **no «(copia) (copia)»**.
- [ ] Cambiar una cantidad en la copia **no toca la receta original**.

---

## 9g · El buscador de insumos y Enter — nuevo el 22-ago

**Sin red debajo en la pantalla**: la lógica tiene 22 pruebas, pero el foco, la
lista y el clic no los cubre ninguna suite.

- [ ] `Recetas → editar una → Ingredientes`. Donde estaba el desplegable hay un
      campo de texto: **escribir «que» deja «Queso fresco» arriba**.
- [ ] **Escribir «limon» SIN acento encuentra «Limón».** Éste es el que
      importa: sin él, quien carga el catálogo cree que el insumo no existe y
      lo da de alta otra vez, partiendo el inventario.
- [ ] **↓ y ↑ mueven** la selección; **Enter la toma** y el foco salta solo a
      la cantidad.
- [ ] Con **una sola** coincidencia, Enter la toma sin tener que bajar.
- [ ] Con **dos o más** y ninguna resaltada, Enter **no elige nada**. No debe
      adivinar.
- [ ] **Enter en la cantidad agrega** el ingrediente y el foco **vuelve al
      buscador**. Cargar tres ingredientes seguidos sin tocar el ratón.
- [ ] Un insumo **archivado no aparece** en la lista.
- [ ] Buscar algo que no existe dice que **no hay coincidencias** — no enseña
      la lista entera.
- [ ] Cerrar el formulario y abrir otra receta: **el buscador está vacío**, no
      con el texto de la anterior.

---

## 9h · Merma plegada y vista previa del modificador — nuevo el 22-ago

- [ ] `Recetas → Ingredientes`: donde estaba el campo de merma hay un
      **«+ Merma»**. La fila se teclea sin pasar por él.
- [ ] **El paso que importa:** poner una merma distinta de 0 y agregar el
      ingrediente; al volver a un ingrediente con merma puesta, **el campo se
      ve** aunque nadie lo haya desplegado. Un valor puesto no se esconde: la
      merma cambia el costo del platillo.
- [ ] `Catálogos → Modificadores → editar un grupo`: debajo de «En la caja se
      verá así» hay **«Pruébalo»** con las opciones tocables.
- [ ] Con **«Selección única»**, tocar dos opciones deja **una** marcada.
      Con **«múltiple»**, deja **las dos**. Ésa es la distinción que hay que
      poder ver sin leer nada.
- [ ] Con **obligatorio** marcado y nada elegido, aparece el aviso de que el
      cajero no podrá agregar el platillo. Al elegir una, desaparece.
- [ ] Cerrar y abrir otro grupo: **la prueba está en blanco**, no con lo tocado
      en el anterior.

---

## 10 · El updater — la ronda completa, que por fin se puede

Llevaba pendiente desde el 15-ago porque hacía falta una versión N+1. La 0.2.6
**es** esa versión. Guía en `docs/CHECKLIST_ACTUALIZACIONES.md`.

- [ ] Con la versión **anterior instalada**, pulsar «Buscar actualización» →
      ofrece la 0.2.6.
- [ ] El aviso enseña **la nota de la versión**, y se entiende sin saber de
      programación. Ver `avisoDeActualizacion()`.
- [ ] «Versión instalada» dice la **anterior** y no un guion. Ése fue el arreglo
      del 17-ago que **nunca se ha probado**: sólo actúa desde una versión que
      ya lo lleve dentro, y hasta ahora no había a dónde saltar desde una.
- [ ] Instalar. Windows enseña el aviso azul —«Más información» → «Ejecutar de
      todas formas»—, la caja se cierra y se vuelve a abrir sola.
- [ ] Al volver, «Versión instalada» dice **0.2.6**.

> Para compilar el bundle hay que exportar `TAURI_SIGNING_PRIVATE_KEY` y su
> contraseña **en la misma sesión de shell**, o revienta al firmar, al final del
> build. `tauri.conf.json` ya tiene la `pubkey` de verdad.

---

## 11 · Al cerrar la sesión de pruebas — NO OLVIDAR

El 17-ago la caja quedó en un hotspot (`10.245.x.x`) y con el transporte en
**Simulador**. Comprobar las dos **antes de que abra el local**:

- [ ] La caja **al wifi de AZUL**. Si se queda en el hotspot y ese teléfono se
      va, los meseros pierden el hub y el QR guardado apunta a una IP muerta.
- [ ] El transporte **a la impresora de Windows**. Éste muerde en silencio: los
      cobros pasan, todo «funciona», y no sale un papel en todo el servicio.

---

## Lo que queda sin verificar, y por qué

- **El pulso del cajón.** El de AZUL está averiado y sólo abre con llave. Hasta
  que se repare o se pruebe en otro cajón.
- **Las E2E de flujo.** `flujo-pos.spec.js` quedó con el regex del folio al día
  el 18-ago, pero **no se ha corrido**: piden tenant y navegador, y sobre todo
  **escriben en el tenant de AZUL en vivo** (turnos, ventas, movimientos). Por
  eso NO entraron en el guion de publicar: la puerta es `e2e/humo.spec.js`, que
  no toca la base. Correrlas a mano sigue siendo válido — sabiendo lo que
  escriben. La salida real es un tenant desechable. Y sigue en pie lo
  del §3.3 del lunes: unas E2E que nadie corre no son una red de seguridad, son
  una foto vieja que da sensación de cobertura. O entran en el ritual o se dice
  en voz alta que no cuentan.
- **El fallo 3.2**, el layout de `OpsHeader` en tablet. **Se intentó arreglar
  el 18-ago y NO SE REPRODUCE.** Banco en Chromium contra el CSS compilado, con
  el componente real: `subtituloAncho: 333, subtituloLineas: 1`, idéntico a
  1024, 1100 y 1280 px, con y sin el arreglo propuesto; y por debajo de 1024 el
  bloque es `hidden`. No se tocó el header: es compartido por todas las
  pantallas de operación y cambiarlo por una hipótesis que no se reproduce es
  cómo se rompen tres pantallas para arreglar cero. **Lo siguiente es correr la
  E2E y mirar la captura actual**, no editar CSS. Y al regenerar el snapshot,
  sólo después de entender qué se ve: antes convierte el fallo en la nueva
  referencia y lo entierra.
- **`scripts/pruebas-rust.sh`** corre en Linux e incluye `respaldo` —51 pruebas
  el 18-ago—. Lo que no compila fuera de Windows es el resto de `src-tauri`.

## Decisiones pendientes, que no son verificaciones

- **Fallo 7 · ¿entra `mesas` en `TABLAS_RESPALDADAS`?** Es lo que haría que la
  reserva del folio sobreviva al aparato. Y cambia cómo se resuelven conflictos
  de sala: adoptar el estado de una mesa desde un aparato muerto puede resucitar
  una que otro ya cerró. **Decisión pendiente, no olvido.**
- **§F · el cobro parcial al pedir la cuenta.** Lo único que queda del flujo de
  cuenta. Se dejó fuera a propósito: cambia qué se imprime y qué se cobra, y
  montarlo encima de cambios que no se habían visto funcionar era pedirlo. Ya se
  vieron. Son un par de horas contra una base que se sabe buena.

## Deuda conocida que sigue ahí

- **El eco de realtime no tiene freno.** La cola de salida es serial y con
  espera creciente; lo que entra a Supabase, en cambio, sale hacia **todos** los
  dispositivos conectados sin ninguna contención. Un drenaje de doscientas
  ventas son más de mil eventos repartidos a la vez entre teléfonos y KDS. No
  corrompe nada, pero es la parte del camino que nadie ha visto bajo carga — de
  ahí el paso nuevo de §3.
- **Una venta en dead-letter no detiene su RPC de stock.** Van como tareas
  distintas y la cola sigue adelante, así que el almacén se mueve para una venta
  que no llegó a los libros. Es coherente con lo decidido el 17-ago —los dos
  caminos son separados a propósito— pero conviene tenerlo escrito aquí y no
  sólo en un hallazgo suelto.

- ~~`ModalCobro` aún no usa `lib/Autorizacion.js`.~~ **Migrado el 18-ago.** Con
  tres copias, la que divergía siempre era la de «empleado activo», porque su
  fallo no se nota probando: todo funciona, sólo que autoriza descuentos alguien
  que ya no trabaja aquí.
- CSP nulo en `tauri.conf.json` y `CorsLayer::permissive()` en el hub.
- `mesas.mesero_id` sigue muerto: bloquea tres de las cinco propuestas de sala.
- ~~Queda por localizar el archivo que ensucia `matchMedia` entre ficheros.~~
  **Localizado el 18-ago, y no era `matchMedia`.** Los tres sitios que parchean
  `matchMedia` —`PanelAcoplable`, `MesasScreen.figuras`, `ModalCobro.figuras`—
  **restauran los tres**, y además ninguno entra en `test:rapido`, que sólo
  corre `src/lib src/store src/test src/hooks`. Esa nota llevaba tiempo siendo
  falsa.

  Lo que sí pasa, y es lo que produce **los 6 fallos de `useConectividad`**:

  ```
  npx vitest run --isolate=false src/hooks/useConectividad.test.jsx   → 11/11
  npx vitest run --isolate=false src/lib/QR.test.js  src/hooks/useConectividad.test.jsx → 6 fallos
  npx vitest run --isolate=false src/hooks/useConectividad.test.jsx  src/lib/QR.test.js → 11/11
  ```

  **Es `src/lib/QR.test.js`, y sólo si va DELANTE.** Con `Hub`, `Recuperacion`,
  `Respaldo`, `Metricas`, `Alertas` o `Escape` delante, pasa. Y QR no rompe
  otras pruebas de DOM —con `BarraPestanas` o `PanelAcoplable` detrás, todo en
  verde—: es específico de ese par.

  **O sea que la atribución que había era falsa:** no es «`waitFor` agotándose
  en máquina lenta». Aislado pasa siempre; el archivo tarda 98 ms. Es
  contaminación, y depende del orden.

  El síntoma exacto: el contenedor que renderiza `Sonda` **no queda colgado de
  `document.body`** —testing-library imprime un `<body />` vacío y aparte el
  árbol con los `data-testid` dentro—, así que `screen` no encuentra nada.
  Huele a dos instancias del registro de módulos de testing-library, no a
  tiempo. **Falta el porqué; la receta para reproducirlo está arriba.**

- `Hub.test.js` dejaba `window.location` pisado entre ficheros —
  `vi.unstubAllGlobals()` no deshace un `Object.defineProperty`—. **Arreglado el
  18-ago:** los dos `describe` que lo redefinían ahora lo reponen. No cambia los
  6 de arriba, pero era una trampa de verdad en el mismo camino.
- ~~`total_divergente` lo calcula un trigger y **nada en el front lo lee**.~~
  **Arreglado el 18-ago:** un chip «Cuadra mal» en la lista de tickets del
  turno. No costó ni una consulta —el `select('*')` del store ya lo traía a la
  memoria del navegador para morir ahí— y sólo tiene sentido desde el arreglo
  del fallo 3: antes el front y Postgres discrepaban por construcción y sólo la
  tolerancia de dos centavos evitaba que saltara en cada venta.
- ~~`prettier` **no está en `devDependencies`**.~~ **Arreglado el 18-ago:**
  fijado a `3.9.6` **sin acento circunflejo**, a propósito — un rango `^` deja
  que dos máquinas formateen distinto, que es el problema que se venía a
  cerrar. Los tres ficheros pendientes ya pasaron por él.
- **En release no hay consola.** `src-tauri/Cargo.toml` declara `tauri` sin la
  feature `devtools`, así que cualquier diagnóstico que dependa de la consola
  es, en producción, un diagnóstico que no existe. O se compila con devtools, o
  esos datos salen a una pantalla.

## Lo verificado, para no repetirlo

Todo lo del 15-ago —§0 a §11— y el respaldo de ventas con un teléfono muerto de
verdad, en `docs/VERIFICADO_15-AGO.md`. Y el descuento de inventario: seis
orígenes desde el 15-ago en `stock_salidas`, todos con exactamente una fila,
ninguno duplicado.

> Un hallazgo de aquello que conviene no perder: `1829724086159641` —la venta que
> estuvo dos días sin llegar a Supabase— **sí tiene su salida de stock**,
> aplicada a los once segundos del cobro. El inventario nunca dependió de que la
> venta subiera. Son dos caminos separados, y el que evita vender lo que no hay
> funcionó aunque el otro estuviera roto.
