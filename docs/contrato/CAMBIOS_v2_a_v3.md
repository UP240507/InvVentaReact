# Qué cambió del contrato v2 al v3, y por qué

Revisión del 23-ago. **Quien revisó no es abogado:** el valor de esta lista está
en el contraste entre lo que promete el papel y lo que hace el sistema de
verdad. La parte legal fina —LFPDPPP, transferencia internacional de datos,
validez de la limitación de responsabilidad— conviene que la vea un abogado en
Aguascalientes antes de firmar.

## Lo que el contrato prometía y el sistema no podía cumplir

**1. Obligaba al Cliente a hacer respaldos que no puede hacer.** El §6 c) decía
«realizar respaldos periódicos de datos críticos». **El Software no exporta
nada**: cero coincidencias de `csv`, `xlsx` o `exportar` en todo el código. Se
le pedía al cliente algo que la pantalla no le permite. Quitado: el respaldo es
parte del servicio contratado.

**2. Decía que el Software no emite facturas, y sí gestiona CFDI.** Hay una
pantalla de Facturas que registra datos fiscales y **descarga el XML**. La
distinción real es el **timbrado**, que es del PAC del Cliente. Tal como estaba,
el contrato contradecía lo que el cliente ve en su propia pantalla.

**3. No decía qué pasa con los datos al terminar.** Era el hueco más caro: el
contrato regulaba la eliminación tras la demo, pero no la salida del cliente al
cabo de un año. Añadido: 30 días para pedirlos, 10 hábiles para entregarlos, sin
costo, en CSV o volcado. **Ojo: hoy esa cláusula no se puede cumplir con un
botón** — habrá que hacerlo a mano desde la base hasta que exista la exportación
(que es, además, el punto 1 de `QUE_TIENE_INVVENTA2.md`).

**4. Ignoraba el hub en red local.** El contrato describía una app de escritorio
con IndexedDB y nada más. Pero la caja **publica el sistema en la red del local**
y los teléfonos trabajan contra ella. Es media arquitectura del producto y es lo
que hace que el local siga vendiendo sin internet. Ahora está en la cláusula 1.

**5. El límite de dispositivos no existe en el código.** Decía «1 computadora y
1 tablet». El hub **no impide** conectar más. Se subió a 3 móviles (más realista
para un restaurante con meseros) y se dice explícitamente que el límite es
contractual, no técnico. Prometer un candado que no está puesto es peor que no
prometerlo.

**6. No mencionaba la impresión.** El sistema imprime por ESC/POS y hay un cajón
de dinero de por medio. Sin cláusula, una impresora incompatible o un cajón
averiado —como el de AZUL hoy— acaba siendo problema del Proveedor. Añadido a
requisitos y a lo que no cubre el soporte.

**7. No avisaba del aviso de Windows.** No hay certificado de firma de código
(decisión de Chris, 11-ago), así que **SmartScreen sale en cada instalación y en
cada actualización**. Un cliente que ve «Windows protegió tu PC» sin
advertencia previa piensa que le mandaron un virus. Ahora está escrito, y con
él que las actualizaciones **no se instalan solas**.

**8. Prometía «capacitación» pero no decía quién carga el menú.** «Migración de
datos» estaba excluida, pero cargar el catálogo no es una migración y es
exactamente lo que un restaurante espera que le hagan. Ahora se dice: la carga
del catálogo es del Cliente salvo que se contrate aparte.

## Lo que faltaba, en lo legal

**9. Dónde están los datos.** La infraestructura está en **Estados Unidos**
(`us-east-1`). Eso es una transferencia internacional en términos de la LFPDPPP
y el Cliente tiene que poder reflejarla en su Aviso de Privacidad. No estaba.

**10. Notificación de vulneraciones.** La LFPDPPP obliga a informarlas. Añadido
un plazo de 72 horas.

**11. La limitación de responsabilidad, tal como estaba, podía caerse entera.**
En México no se puede renunciar por anticipado a la responsabilidad por dolo.
Añadida la salvedad de dolo y negligencia grave, que es lo que hace que el resto
de la cláusula se sostenga.

**12. «Sin reembolso» sin excepción.** Si el Proveedor incumple y no lo subsana,
negar cualquier devolución es la clase de cláusula que un juez tumba. Añadida la
excepción por incumplimiento grave no subsanado en 15 días.

**13. Renovación automática sin decir a qué precio.** Añadido: precio congelado
la primera renovación y aviso de 60 días para cualquier ajuste.

**14. Faltaban confidencialidad, fuerza mayor, cesión, notificaciones, acuerdo
íntegro y nulidad parcial.** Son las cláusulas de cierre habituales; ninguna es
polémica y su ausencia se nota justo cuando hay un problema.

**15. De quién son los datos.** El contrato decía de quién es el software pero
no de quién son las ventas del restaurante. Ahora lo dice, y también que el
Proveedor puede usar datos **agregados y anonimizados** para mejorar el
producto — que es lo que se va a querer hacer y conviene tenerlo autorizado.

## Los dos anexos nuevos

**Anexo A**, el alcance funcional, para que «qué incluye» no sea una discusión
dentro de un año. **Anexo B**, los requisitos técnicos, que es la lista de lo
que el cliente tiene que poner y que hoy se cuenta de palabra.

## Lo que hay que decidir antes de firmar

- [ ] **¿El precio lleva IVA incluido o más IVA?** Está marcado para elegir en
      la cláusula 2. Es la ambigüedad más cara de un contrato de una página.
- [ ] **Los datos del Proveedor**: persona física o moral, RFC y domicilio.
- [ ] **El correo y el WhatsApp de soporte** que se ponen en la carátula.
- [ ] **Si el límite de 3 dispositivos móviles es el bueno** para AZUL.
- [ ] Que un abogado revise las cláusulas 8, 10 y 11.
