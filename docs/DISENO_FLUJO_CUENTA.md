# Diseño — la cuenta como documento final

**Estado:** diseñado, sin escribir. 10-ago-2026, para empezar el 11.
**Origen:** el flujo real de AZUL, descrito por Chris y contrastado con un ticket
físico del 06/08/2026 (folio 8588).

---

## 1 · El flujo que hay que soportar

1. El cliente pide la cuenta.
2. El mesero pulsa **Pedir Cuenta**. Si el cliente va a pagar sólo una parte —«te
   puedo pagar esto porque ya me tengo que ir»— se elige **aquí**, no después.
3. Se imprime **la cuenta**, con folio. Es el papel que se lleva a la mesa.
4. **La mesa queda bloqueada**: no se pueden agregar más cosas hasta que se cobre.
5. El cliente paga. 230 con 500, por ejemplo.
6. El cajero confirma en el modal de cobro → **se registra la venta con propina**
   y **se abre el cajón** si el pago fue en efectivo o mixto.
7. La mesa se libera.

**No hay segundo papel.** La cuenta que se llevó a la mesa ES el comprobante.

## 2 · Lo que ya está hecho

Verificado contra el código, no supuesto:

| Pieza                                      | Dónde                                                              |
| ------------------------------------------ | ------------------------------------------------------------------ |
| El cajón sólo con efectivo o mixto         | `Comanda.js:380` — ya es exactamente esa regla                     |
| Cobro parcial por platillos                | `ModalCobro` — `tipoDivision: 'platillos'` con selección por línea |
| Cambio, acotado al efectivo recibido       | `ModalCobro:335` — un sobrepago con tarjeta no genera cambio       |
| Propina en la venta                        | `fiscalTicket.propina`                                             |
| El documento de cuenta, con su maquetado   | `Comanda.js` → `construirPreCuenta`                                |
| `SON:` pegado al total                     | ya es el primer elemento del pie                                   |
| La columna de importe es el TOTAL de línea | coincide con AZUL (2 pan dulce = $28, no $28 c/u)                  |

**Cuatro de las siete piezas del flujo ya existen.** Lo que sigue es lo que falta.

---

## 3 · Los cambios

### A · La cuenta es el documento final — y el ticket se queda para mostrador

El papel que hoy llamamos «pre-cuenta» pasa a ser el documento definitivo de una
mesa. No es un cambio de formato: es dejar de imprimir un segundo papel al
cobrar.

**Pero `construirTicket` NO se retira.** La venta directa de mostrador no tiene
paso de «pedir cuenta»: ahí se cobra de golpe y el ticket al cobrar es el único
papel, con su método de pago y su cambio. Los dos documentos siguen existiendo,
cada uno en su flujo:

- **Mesa** → cuenta impresa antes de pagar. Un papel.
- **Mostrador** → ticket al cobrar. Un papel.

Conviene revisar el nombre: `construirPreCuenta` ya no describe lo que hace.

### B · Maquetado, según el ticket real de AZUL

Cuatro diferencias medidas contra el papel físico:

1. **El orden de los totales está invertido.** AZUL pone `TOTAL: $567.00` grande
   y arriba, luego el `SON:`, y **subtotal e IVA abajo, pequeños**. Nosotros
   hacemos subtotal → IVA → TOTAL al final.

   La suya es mejor para este papel: el cliente busca cuánto paga. El desglose es
   información secundaria y va donde corresponde.

2. **Subtotal e IVA comparten renglón:** `SUBTOTAL:$488.79   IVA:$78.21`.
   Nosotros gastamos dos líneas. En 32 columnas eso es caro.

3. **Falta el FOLIO.** El de AZUL lleva `FOLIO:8588`. Nuestra meta tiene Mesa,
   Personas, Atendió, Fecha y Hora — sin folio. Sin él, ese papel no se puede
   referenciar, y es justo lo que lo convierte en documento final.

4. **Las dos advertencias van al revés.** AZUL: fiscal primero, propina después.

Meta de AZUL, en orden: `MESA`, `MESERO`, `PERSONAS`, `ORDEN`, `FOLIO`, fecha.

> **Pendiente de confirmar (Chris, 11-ago):** qué es `ORDEN:4`. La hipótesis es
> un contador diario de aperturas de mesa — «la cuarta mesa del día». Si es eso,
> es un campo nuevo por tenant que se reinicia cada día.

### C · El folio se asigna al imprimir, y se conserva

Hoy el folio nace al cobrar (`siguienteFolio({serie: SERIE_VENTA})` en
`PosScreen`). Si la cuenta es el documento final, el folio tiene que existir
cuando se imprime.

**Regla: se asigna la primera vez que se imprime la cuenta y no cambia.** Una
reimpresión o una reapertura con PIN conservan el mismo número — es la misma
cuenta. Se guarda en `mesas.orden_actual`.

**La contrapartida, asumida a propósito:** una mesa que pide la cuenta y se va
sin pagar quema un folio. `Folio.js` advierte que un hueco en la serie de ventas
es la señal que busca un auditor, así que conviene que esté escrito que estos
huecos son por abandono y no por venta borrada.

La alternativa —una serie propia para cuentas— se descarta: el papel y la venta
dejarían de compartir número, que es justo lo que hace útil el folio.

### D · Bloqueo tras imprimir, con PIN para reabrir

**No hace falta un estado nuevo.** `mesas.estado = 'por_cobrar'` ya lo pone
`handlePedirCuenta` (`PosScreen:513`), y hoy **no bloquea nada** — verificado:
`PosScreen` no consulta ese estado en ningún sitio. La mesa se pinta distinta en
el mapa y el mesero puede seguir agregando como si nada.

Con la cuenta impresa, `por_cobrar` significa **cuenta cerrada**:

- Bloqueado: agregar productos, cambiar cantidades, mandar a producción.
- Permitido: cobrar, reimprimir la cuenta, reabrir con PIN.

**El bloqueo necesita llave.** El cliente que pide la cuenta y luego pide un café
pasa todo el tiempo; sin escape, el mesero se queda atascado y el bloqueo deja de
proteger para empezar a estorbar. Se reusa el patrón que ya existe y está probado
—autorización por PIN, como los descuentos y las salidas anticipadas—, no se
inventa un segundo camino.

> **Decisión pendiente:** qué capacidad autoriza la reapertura.
> `autoriza_descuentos` (Admin, Gerente, Capitán de Meseros) es la que ya
> significa «autoriza una excepción en la mesa», así que encaja. La alternativa
> es `gestion`, que deja fuera al Capitán.

La reapertura deja rastro en auditoría: quién reabrió, qué mesa, con qué folio.

### E · El cajón se desacopla del papel

**Este es el cambio que hay que hacer sí o sí, o el cajón deja de abrirse.**

Hoy el pulso viaja dentro del documento (`escpos.rs:446`, `doc.abrir_cajon`) y
**no existe ninguna ruta suelta** para dispararlo — comprobado en `servidor.rs` y
en `Hub.js`. Si la cuenta es el único papel y se imprime antes de saber el método
de pago, no se le puede marcar `abrirCajon`; y al cobrar ya no hay segundo
documento que lleve el pulso.

**El cajón es una acción, no un documento.** Se dispara al pulsar **confirmar y
cerrar cuenta** en `ModalCobro`, si el método es efectivo o mixto.

Hace falta:

- Ruta nueva en `servidor.rs` (p. ej. `POST /hub/cajon`), con `autorizado()`.
- `abrirCajon()` en `lib/Hub.js`.
- La llamada en el confirmar de `ModalCobro`.

**Y una regla que importa más de lo que parece: ese pulso NO se encola.**

`cola.rs` reintenta cinco veces con espera creciente, y eso es correcto para un
ticket. Para un cajón es peligroso: se abriría solo veinte minutos más tarde,
cuando vuelva la impresora, con dinero expuesto y nadie delante. **Intento único,
sin reintentos.** Si falla, el cajero lo abre con la llave — que es lo que hace
hoy cuando la impresora está apagada.

### F · Preguntar por el cobro parcial al pedir la cuenta

El modo por platillos ya existe en `ModalCobro`, pero se elige **después**,
cuando el cliente ya dijo que paga. En el flujo real la pregunta va antes, porque
determina qué papel se imprime: la cuenta completa o la parte que se lleva quien
se va.

No es lógica nueva —la selección por línea está escrita y probada—, es moverla al
momento de «Pedir Cuenta».

---

## 4 · Orden de implementación

1. **Maquetado (B).** Puro formato en `Comanda.js`, con pruebas, y se ve con la
   previsualización sin gastar papel. Es lo único de esta lista que se puede
   verificar hoy mismo.
2. **Cajón desacoplado (E).** Rust + una llamada. Independiente del resto y
   verificable con `cargo test`. **Bloquea todo lo demás**: sin esto, el flujo
   nuevo deja el cajón muerto.
3. **Folio al imprimir (C).** Toca `Folio.js` y `handlePedirCuenta`.
4. **Bloqueo con PIN (D).** Depende de 3, porque la cuenta bloqueada tiene que
   llevar ya su folio.
5. **Parcial al pedir la cuenta (F).** Lo último: es mover UI existente.

Los pasos 1 y 2 no rompen nada de lo que hay hoy y pueden entrar sueltos.

## 5 · Pendientes de confirmar

- [ ] Qué es `ORDEN` en el ticket de AZUL (Chris, 11-ago).
- [ ] Qué capacidad autoriza reabrir una cuenta: `autoriza_descuentos` o
      `gestion`.
- [ ] Si al reimprimir la cuenta se marca como copia (`sufijoCopia` y
      `avisosDeCopia` ya existen en `Comanda.js` y **nadie los llama desde la
      interfaz** — la maquinaria de reimpresión está escrita y sin cablear).

## 6 · Datos fiscales reales de AZUL

Del ticket físico. **Van en Configuración, en la base — no en este repo**, que se
pushea a GitHub. Se anota aquí sólo la corrección detectada:

El RFC de ejemplo era `ROGC010401AQ9` y no correspondía a la razón social. El
real empieza por `CAFA`, como se había deducido de las letras del apellido.
