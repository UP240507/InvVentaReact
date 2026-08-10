# Lista de Chris (5-ago) — triaje

Nueve apuntes. Agrupados por lo que realmente son, con las decisiones que hay
que tomar antes de programar. **No están en orden de importancia sino de
parentesco:** varios son el mismo problema con dos nombres.

---

## 1 · Marca (tres apuntes, un solo eslogan)

### 1.1 Splash screen de Tauri — ✅ HECHO (5-ago)

Ventana propia (`public/splash.html`), la principal arranca oculta. Se cierra
cuando la app está **usable** —sesión resuelta y datos hidratados— y no a los N
segundos: un temporizador cambiaría una espera honesta por una pantalla
congelada.

Contrapartida cubierta: si el front nunca avisa (error de JS, bundle roto), un
hilo en Rust muestra la principal a los 12 s. Un splash eterno y ninguna ventana
usable es peor que arrancar feo.

### 1.2 Pie del ticket impreso — ✅ HECHO (5-ago)

**Decisión A — texto: `InvVenta`, a secas.**
Se descartó «Impulsado por». El nombre suelto genera la pregunta _¿qué es esto?_
y esa pregunta trabaja mejor que la explicación. El eslogan completo va a la
cotización y a la landing: está escrito para alguien que evalúa comprar un
sistema, y esa persona no está leyendo un ticket.

**Decisión B — no se puede quitar. Ningún plan.**
Se descartó el modelo «plan alto la quita». La consecuencia de código es la
parte interesante: **la marca no viaja dentro del documento.**

Si fuera un campo del JSON, sería un dato — y un dato se quita. Bastaría un
`if (plan === 'premium')` en el front, o un cliente modificado que arme su
propio documento y lo mande por HTTP al hub. Al vivir en el **renderizador**,
imprimir un ticket y estampar la marca son la misma operación:

- `escpos.rs` la escribe si `tipo == "ticket"`. Garantía dura: para quitarla
  hay que recompilar el binario de la caja.
- `TicketImpresion.jsx` la escribe sin consultar `configuracion`. Garantía más
  blanda por naturaleza —el bundle es editable— pero no hay condición que
  tocar, y una prueba recorre seis nombres plausibles de bandera de plan
  (`sin_marca`, `whitelabel`, `premium`…) comprobando que ninguno la afecta.

**Nunca en la comanda de cocina** — cubierto por prueba. Ese papel no lo ve un
cliente y cada línea extra es rollo gastado ×200 comandas al día.

**De propina, la maqueta.** Al tocar el render salieron tres cosas que ya
estaban mal:

1. _Recibido_ y _Cambio_ eran una frase suelta centrada en el pie. Con un
   billete de $1,200 pasaba de 32 columnas y se partía en dos justo por donde
   el cliente comprueba que no le robaron. Ahora son filas de la columna del
   dinero.
2. La **pantalla del ticket rehacía los cálculos por su cuenta** en vez de usar
   `construirTicket`. Ya divergía del papel: la fila de Descuento nunca se
   mostraba y el IVA decía «(16%)» escrito a mano —un restaurante de frontera
   al 8% habría enseñado una tasa falsa junto a un importe correcto—. Ahora
   ambos pintan el mismo documento.
3. La **vista previa descartaba `ESC a`**, así que enseñaba todo pegado a la
   izquierda aunque en el papel saliera centrado. Una vista previa que miente
   manda a arreglar lo que no está roto.

### 1.3 Cotizaciones en PDF

Material de ventas, no producto — no toca el código de la app. Es un generador
aparte (o incluso una plantilla que rellenas). Conviene tratarlo como tal y no
mezclarlo con el backlog técnico.

---

## 2 · Sesiones de empleado (dos apuntes, **un solo problema**)

Los dos que anotaste —matar sesiones al cumplir el turno, y ver/cerrar sesiones
abiertas desde el checador— son la misma carencia: **hoy nadie puede ver quién
tiene sesión abierta, ni cerrarla.**

**Antes de programar hay que desambiguar «al cumplir el turno»**, porque son dos
cosas distintas y el comportamiento correcto es diferente:

- **Cerrar el turno de CAJA** (el arqueo, el corte del día) → tiene sentido
  cerrar todas las sesiones de empleado: la jornada del local terminó.
- **Cumplir las horas de JORNADA de un empleado** → ese empleado ya puede
  marcar salida, pero puede seguir trabajando horas extra. Cerrarle la sesión
  automáticamente le quitaría el POS de las manos con clientes en la mesa.

Mi lectura: lo primero sí, lo segundo no. Pero es tu decisión.

Lo segundo del par —**el panel de sesiones abiertas**— es lo que de verdad falta
y es útil por sí solo: el dueño necesita ver «quién está dentro ahora mismo» y
poder echar a alguien que se fue sin marcar salida, o cuyo dispositivo se quedó
prendido. Sin eso, el cierre automático es una regla a ciegas.

---

## 3 · Login: a dónde llega cada quien

Hoy `/login` es de correo+contraseña y `/loginempleados` de código+PIN, y no hay
un puente claro entre las dos. El síntoma ya está en el código: `handleSalir`
del checador tiene un comentario sobre un «estado zombi» —sesión de Supabase
sin empleado activo— que rebotaba en bucle entre pantallas.

Preguntas a resolver antes de tocar:

- ¿Cuál es la pantalla de arranque por defecto de un dispositivo?
- ¿Se recuerda por dispositivo? Una caja siempre abre en admin; una tablet de
  meseros siempre en PIN. Eso ya se podría derivar del **rol del dispositivo
  emparejado** (caja / mesero / kds), que el hub ya guarda desde el 5-ago.
- ¿Debe haber un enlace visible entre ambas, o el dispositivo decide y punto?

---

## 4 · Presentación

### 4.1 Renderización en distintas pantallas

Es el ítem **3.10** del roadmap (auditoría responsive de operación): POS, Mesas,
KDS, Espera, Checador y Propinero en 360 / 768 / 1080. Ya estaba planificado;
ahora tiene más urgencia porque los teléfonos ya entran de verdad.

### 4.2 CSS de las scrollbars — ✅ HECHO (5-ago)

Se derivan del **color de texto de cada superficie** con `color-mix`, no de un
gris fijo: así siguen al tema del tenant solas —claras sobre oscuro, oscuras
sobre claro— sin definir un token por tema.

- **No se adelgazaron a 6 px** donde hay ratón: 10 px es el mínimo agarrable, y
  la discreción se gana en color, no en tamaño.
- **La pista queda transparente**, para no dibujar un canal permanente al
  costado de cada lista.

`#area-impresion` conserva las nativas: ese bloque simula papel térmico y no
debe seguir el tema.

**Corregido el mismo día con los mockups en la mano.** Yo había razonado «10 px
porque en tablet se toca con el dedo», y es justo al revés: con el dedo la barra
no es un control —no se arrastra con precisión, se desplaza empujando el
contenido— y sólo roba ancho a listas que ya van justas. Tus maquetas la ocultan
por completo. Ahora se separa por `@media (pointer: coarse)`: sin barra en
teléfono y tablet, barra tematizada donde hay ratón.

---

## 5 · Legal, permisos, impuestos, costos

**Esto no es código y no debería vivir en la misma lista.** Es constitución de
la marca, régimen fiscal, facturación de tus propias ventas, y el marco de
protección de datos de tus clientes (que almacenan datos de sus empleados y de
sus comensales).

Puedo ayudarte a estructurar las preguntas y a preparar lo que sí toca al
software —política de privacidad, términos de servicio, qué datos se guardan y
dónde, borrado de datos de un tenant que se va—. Lo demás necesita **un contador
y probablemente un abogado en México**; no es algo en lo que deba improvisar.

Sugerencia: sacarlo a su propio documento y tratarlo en paralelo, no en la cola
técnica.

---

_Creado el 5-ago-2026._
