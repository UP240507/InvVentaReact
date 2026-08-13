# Checklist de verificación — todo lo del 11 y 12-ago

Se escribió mucho en dos días y **casi nada se ha visto funcionar**. Este
documento es la lista de lo que falta comprobar, en el orden en que conviene
hacerlo: cada bloque supone que el anterior pasó.

**La regla, igual que con la impresora: si un paso falla, para y dilo.** Con
cinco cambios encima del mismo flujo, seguir adelante convierte un fallo
localizable en tres síntomas mezclados.

---

## 0 · Antes de nada — que compile y que pase la suite

- [ ] `cd src-tauri && cargo test`

  Toca Rust dos veces hoy: el **ancho configurable** (32/48) y el **pulso del
  cajón**. El primero ya compiló; el segundo **no se ha compilado nunca** — no
  hay toolchain de Rust en el entorno donde se escribió.

- [ ] `npm run test:rapido`

  El lote de lógica pura, sin DOM ni globales. **521 en verde.** `--isolate=false`
  aquí es seguro y rápido.

- [ ] `npm run test:run`

  **La suite entera, con aislamiento.** Debe dar TODO en verde.

### Sobre `--isolate=false`, que costó dos días de fantasmas

Durante el 10 y el 11-ago se dio por hecho que había «50 pruebas rotas» en
`src/features src/components`. **No había ninguna.** Los 12 fallos de
`MesasScreen.figuras` —los últimos que quedaban— pasan 19 de 19 al correr ese
archivo solo, igual que `BarraPestanas`, `PanelAcoplable`, `MarcaConmutador` y
`LoginPuerta`.

Todos los fallos venían de compartir estado global entre archivos con
`--isolate=false`. Ya se corrigieron dos casos concretos en `useConectividad`
—un `vi.mock` que llegaba tarde y un `document.visibilityState` sin restaurar—
y queda al menos uno más sin localizar entre los archivos que simulan
`matchMedia`.

> **Medido el 12-ago, para que no vuelva a costar dos días:** `npm run
> test:rapido` da **6 fallos en `useConectividad.test.jsx`**. Ese archivo solo
> pasa **11 de 11**. La contaminación sigue ahí y **no es una regresión**: se
> comprobó excluyendo lo escrito ese día y los seis fallos siguen apareciendo
> igual. Si aparece un séptimo, ESE sí es nuevo.

**La conclusión práctica: ese atajo dejó de pagarse solo.** Se adoptó para que la
suite cupiera en el tiempo de una llamada, y a cambio produjo tres falsas
alarmas, mandó a revertir un cambio correcto y ocultó durante dos días que en
realidad no había nada roto. Se queda para `src/lib src/store src/test
src/hooks` —funciones puras, sin DOM ni globales, donde es seguro— y **la
verificación de verdad se hace con `npm run test:run`**, que aísla.

## 1 · Los ajustes — nada funciona si no se guardan

Los dos viven en **Ajustes → Zonas de Producción** y comparten el aviso de
«falta guardar».

- [ ] **La cuenta de la mesa** → «Un solo papel — el ticket final».
- [ ] **Cuándo imprimir las comandas** → «Sólo cuando no llegó a la nube».
- [ ] Pulsar **Guardar** y recargar para confirmar que quedaron.

> Ya pasó una vez: el ajuste de comandas parecía no funcionar y en realidad
> nunca se había guardado. En la base seguía en `siempre`.

- [ ] **Ajustes → Hub** → ancho del papel en **80 mm (48 columnas)**.

## 2 · El folio, que sigue diciendo `PTKL`

En la consola de la ventana de la app (clic derecho → Inspeccionar):

```js
localStorage.setItem('folio:prefijo-provisional', '1');
```

- [ ] Recargar. El siguiente folio debe empezar por **AZUL**, conservando los
      dos caracteres del dispositivo.

## 3 · El flujo de la cuenta — un solo papel

- [ ] Mesa con productos → **Pedir Cuenta**.
- [ ] **Sale UN papel**, con folio.
- [ ] **El cajón NO se abre.** Es lo más importante de este paso: ese papel se
      imprime antes de cobrar y no debe mover dinero.
- [ ] El maquetado nuevo: **TOTAL arriba y grande**, luego `SON:`, y abajo
      `SUBTOTAL:… IVA:…` en una sola línea. Advertencia fiscal primero, propina
      después.
- [ ] **No dice «Recibido» ni «Cambio» ni «Pago:»** — no se ha pagado todavía.

- [ ] Cobrar en **efectivo** → **no sale un segundo papel** y **el cajón se
      abre**.
- [ ] Cobrar otra mesa con **tarjeta** → el cajón **no** se abre.

- [ ] **Mostrador** (venta directa, sin mesa) → al cobrar **sí** sale ticket,
      con método de pago y cambio. Ese flujo no cambió.

## 4 · El bloqueo de la cuenta

- [ ] Con la cuenta impresa, intentar agregar un producto → **no deja**, y sale
      el aviso con el folio y el botón «Reabrir cuenta».
- [ ] «A Producción» y «Pedir Cuenta» quedan apagados.
- [ ] **Reabrir** con una sesión que tenga `autoriza_descuentos` (Admin,
      Gerente o Capitán) → entra directo, **sin pedir PIN**.
- [ ] Reabrir desde una sesión de mesero → **pide PIN**; con el PIN de un
      encargado, reabre.
- [ ] Tras reabrir: se puede agregar, y **el folio NO cambió**.
- [ ] En **Auditoría** aparece `REAPERTURA_CUENTA` con quién autorizó.

## 5 · Las comandas de cocina

- [ ] Con red, mandar a producción → **no sale papel de cocina** (el KDS ya la
      tiene).
- [ ] **Apagar el wifi**, mandar a producción → **sí sale**, unos dos segundos
      después.

> Ese retraso es el sondeo esperando a ver si la comanda sube. Está acotado a
> propósito: cocina no puede esperar más.

> Lo fácil es que deje de imprimir. **Lo que hay que verificar es que siga
> imprimiendo cuando hace falta.**

## 6 · El teléfono

- [ ] Arriba a la derecha aparece un botón con **las iniciales** del mesero.
- [ ] Lleva a **Perfil**, y desde ahí se puede cerrar sesión.
- [ ] Al salir, cae en **`/loginempleados`** (código + PIN), no en el formulario
      de correo.

## 7 · El checador

- [ ] Botón **«Quién está trabajando»** → pide PIN de Admin o Gerente.
- [ ] La lista muestra nombre, hora de entrada y tiempo dentro.
- [ ] **Los tres registros abiertos de AZUL** aparecen: Carlos Muñoz entre los
      activos, y **Daniel Muñoz y Juan Pérez en «sin salida registrada»** —
      llevan más de 40 días y ya no están en la plantilla.
- [ ] Cerrarlos exige que **`horas_jornada` esté configurado**; si está en 0,
      el panel lo dice y no deja. Configúralo antes.
- [ ] Al cerrar un olvido, la hora que se guarda es **entrada + jornada**, no la
      actual. Compruébalo en Asistencias: una salida de hace semanas, no de hoy.

## 8 · El aviso del KDS — sonido y notificaciones

Se prueba **con una sesión de Chef o Barista** (por PIN). Con la sesión de dueño
por correo no debe sonar nada, y eso también se verifica.

- [ ] Entrar al KDS como **Chef** → arriba aparece **«Activar avisos»**.

> Sale a propósito. El navegador no deja sonar hasta que alguien toca la
> pantalla, así que en vez de fallar callado —que es igual a no tener aviso— se
> pide el toque a la vista. **Si no aparece ese botón y tampoco suena, eso sí es
> un fallo.**

- [ ] Pulsarlo → Windows pide permiso de notificaciones. **Aceptar.** El botón
      desaparece.
- [ ] Desde el POS, mandar una comanda a **Cocina** → suena y sale el cartel
      abajo a la derecha con la mesa y cuántos platillos. Se va solo a los 6 s.
- [ ] Marcar un item listo → **no vuelve a sonar**. Es el error clásico: la
      lista se recalcula y cualquier cambio parece una llegada.
- [ ] **Recargar el KDS con comandas en curso → NO suena.** Lo que ya estaba en
      pantalla al abrir no acaba de llegar.
- [ ] Cambiar a la pestaña **Barra** → tampoco suena por lo que ya había.
- [ ] Mandar una comanda **sólo de barra** estando en la pestaña Cocina → **no
      suena**; el aviso es de la estación que se está mirando, como se acordó.

- [ ] **Minimizar la ventana** (o irse a otra app) y mandar una comanda → sale
      la **notificación de Windows**, no el cartel.
- [ ] Mandar dos seguidas estando fuera → **una sola notificación**, no dos
      apiladas. Al volver, lo que importa es la pantalla.

- [ ] Entrar al KDS como **Gerente o Admin** → **no aparece el botón y no suena
      nada.** Entran a supervisar; un pitido por comanda es ruido.

---

## Lo que NO se hizo, y por qué

**§F del diseño — preguntar por el cobro parcial al pedir la cuenta.**

Es lo único que queda del flujo. Se dejó fuera a propósito: cambia **qué se
imprime y qué se cobra**, y va montado encima de otros cinco cambios que
todavía no se han visto funcionar. Meter una modificación del camino del dinero
sobre una base sin verificar es cómo se producen los fallos que luego cuesta
media sesión aislar — hoy ya pasó una vez con el cajón.

Cuando este checklist esté en verde, §F son un par de horas y se puede probar
contra algo que se sabe bueno.

## Deuda conocida que sigue ahí

- `ModalCobro` aún no usa `lib/Autorizacion.js` — tercera copia evitada, segunda
  pendiente de migrar.
- El `id` de `auditoria` sigue saliendo de `Date.now()` (ver backlog §7).
- CSP nulo en `tauri.conf.json` y `CorsLayer::permissive()` en el hub.
- La reimpresión de documentos existe en `Comanda.js` y **nadie la llama**.
- `mesas.mesero_id` sigue muerto: bloquea tres de las cinco propuestas de sala.
- Queda por localizar el archivo que ensucia `matchMedia` entre ficheros. No
  rompe nada con aislamiento; sólo estorba al correr sin él.
