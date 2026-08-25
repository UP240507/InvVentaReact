# CONTRATO DE LICENCIA DE SOFTWARE Y SERVICIOS EN LA NUBE

**InvVenta — Plan Fundador** (modelo híbrido: software instalable + sincronización en la nube)

Fecha: ____________________

**PROVEEDOR:** ______________________________________  \
RFC: ____________________  \
Domicilio: ______________________________________  \
Correo: ____________________    Teléfono: ____________________

**CLIENTE (Restaurante):** ______________________________________  \
RFC: ____________________  \
Representante legal: ______________________________________  \
Domicilio fiscal: ______________________________________  \
Correo: ____________________    Teléfono: ____________________

En lo sucesivo, conjuntamente las «Partes» y por separado la «Parte».

---

## 1 · Objeto y naturaleza del servicio

El Proveedor es el autor y titular del sistema **InvVenta** («el Software»), una
aplicación de escritorio (Tauri/React) que se instala en las computadoras del
Cliente.

El Software opera en modo híbrido:

- **Funcionamiento local.** El Software se ejecuta nativamente en el dispositivo
  del Cliente y almacena datos localmente (IndexedDB/Dexie). Permite operar el
  punto de venta, mesas, inventario y los demás módulos **sin conexión a
  internet**.
- **Servidor en red local (hub).** La computadora principal publica el Software
  en la red del local, de modo que teléfonos y tabletas del Cliente pueden
  tomar órdenes contra ella **aunque no haya internet**. La impresión de
  comandas y tickets se realiza desde esa computadora.
- **Sincronización en la nube.** Cuando hay conexión, el Software sincroniza con
  la infraestructura del Proveedor, permitiendo respaldo, acceso desde varios
  dispositivos y recuperación ante fallas.

El Cliente contrata una licencia de uso **no exclusiva e intransferible** bajo el
«Plan Fundador», que comprende el programa instalable y el servicio de
sincronización, en los términos de este contrato.

## 2 · Periodo de prueba, precio y forma de pago

**Periodo de prueba (demo).** 7 (siete) días naturales de prueba gratuita.
Durante ese lapso el Software se provee «tal cual», sin tiempos de respuesta
garantizados. Al concluir el día 7, si no se confirma el pago, la sincronización
se suspende automáticamente y los datos alojados en la nube se eliminan a los 15
días naturales. **El Cliente puede solicitar su exportación antes de ese plazo**
(cláusula 11).

- **Plan Fundador (anual): $3,990.00 MXN** (tres mil novecientos noventa pesos
  00/100 M.N.), IVA incluido / más IVA — *marcar lo que corresponda*: ______
- **Instalación inicial: $0.00 MXN**, incluida en la anualidad **exclusivamente
  para los primeros 10 clientes fundadores**.

**Forma de pago.** Pago único anticipado por transferencia electrónica o tarjeta.
El acceso y la activación definitiva de la sincronización se habilitan dentro de
las 24 horas hábiles siguientes a la confirmación del pago.

**Reembolsos.** No hay reembolso parcial ni total una vez iniciado el periodo
contratado, **salvo incumplimiento grave imputable al Proveedor** que impida
usar el Software y que no sea subsanado dentro de los 15 días naturales
siguientes a la notificación del Cliente. En ese supuesto se reembolsará la
parte proporcional no devengada del periodo.

**Precio en la renovación.** El precio del Plan Fundador se mantiene durante la
primera renovación. Cualquier ajuste posterior se notificará al Cliente con al
menos **60 días naturales** de anticipación al vencimiento; si el Cliente no lo
acepta, podrá no renovar sin penalización.

## 3 · Instalación y dispositivos

El Software se instala en computadoras con Windows 10/11 o posterior. La
instalación puede realizarla el Cliente con el instalador que le proporcione el
Proveedor, o el Proveedor de manera remota en la sesión inicial.

**Aviso sobre el instalador.** El instalador y sus actualizaciones **no cuentan
con certificado de firma de código**, por lo que Windows mostrará un aviso de
SmartScreen («Windows protegió tu PC») en cada instalación. Es un comportamiento
esperado y no indica software malicioso; el Proveedor indicará cómo continuar.

**Dispositivos incluidos en el Plan Fundador:** 1 (una) computadora principal
—la caja, que además hace de servidor local e impresión— y **hasta 3 (tres)
dispositivos móviles o tabletas** conectados a ella para toma de órdenes.

> El Software **no impide técnicamente** conectar más dispositivos a la red
> local. El límite es contractual y el Cliente se obliga a respetarlo; conectar
> más dispositivos de los contratados requiere ampliación de plan.

**Requisitos mínimos a cargo del Cliente:** Windows 10/11, 4 GB de RAM, red local
propia (wifi o cable) con la caja y los dispositivos en la **misma red**, e
internet para la sincronización.

**Impresión.** El Software imprime en **impresoras térmicas compatibles con
ESC/POS** conectadas a la computadora principal. El Cliente es responsable de
proveer y mantener la impresora, el rollo de papel y, en su caso, el cajón de
dinero. El Proveedor no responde por fallas del hardware de impresión ni por
modelos que no implementen el estándar.

## 4 · Alcance del servicio

**Incluido en el Plan Fundador:**

- Licencia de uso del Software en modo local y en la nube.
- Modo sin conexión con sincronización automática al recuperarla.
- Servidor local para dispositivos móviles del local.
- Impresión de comandas, cuentas y tickets en impresora térmica.
- Soporte técnico estándar (cláusula 5).
- Una (1) sesión de capacitación inicial remota de 60 minutos.
- Actualizaciones de mantenimiento (cláusula 4 bis).

**No incluido (se cotiza por separado):**

- Módulos Premium (por ejemplo, sistema de lealtad o configuración avanzada de
  zonas de impresión).
- **Timbrado de facturación electrónica (CFDI).** El Software **registra los
  datos fiscales de las ventas y permite descargar el XML del comprobante**,
  pero **no timbra**: el Cliente debe contratar y utilizar su propio PAC.
- Instalación en más dispositivos de los permitidos.
- Multi-sucursal (más de un local bajo una sola cuenta).
- Migración de datos desde otro sistema y **captura inicial del catálogo**
  (menú, recetas, insumos, precios). El Proveedor entrega el sistema
  configurado y capacita para capturarlo; **la carga del catálogo es del
  Cliente** salvo que se contrate aparte.
- Hardware de cualquier tipo, y su instalación o reparación.

### 4 bis · Actualizaciones

Las actualizaciones **no se instalan solas**. El Software avisa de que hay una
versión nueva y una persona del Cliente decide cuándo instalarla, porque el
proceso cierra y reabre la aplicación y muestra el aviso de Windows descrito en
la cláusula 3. El Proveedor recomienda hacerlo con el local cerrado.

El Proveedor podrá publicar actualizaciones que corrijan fallas o mejoren el
Software. No se compromete a desarrollar funcionalidades nuevas concretas salvo
acuerdo por escrito.

## 5 · Soporte técnico y mantenimiento

**Soporte estándar:** lunes a viernes de 9:00 a 18:00 (tiempo del Centro de
México), por **correo electrónico y WhatsApp** al contacto indicado en la
carátula. Tiempo de respuesta: hasta 24 horas hábiles.

**Qué cubre el soporte:** fallas del Software, dudas de operación y
configuración del sistema.

**Qué no cubre:** la red o el wifi del local, el equipo de cómputo, la impresora
y sus consumibles, el servicio de internet, ni la capacitación de personal nuevo
más allá de la sesión incluida.

**Incidentes fuera de horario.** Ante pérdida de internet o fallas de
sincronización fuera del horario de soporte, **el Cliente continúa operando en
modo local**: el punto de venta, las comandas y la impresión siguen funcionando
sin nube. La sincronización se reanuda automáticamente al volver la conexión, y
el incidente se atiende a primera hora del siguiente día hábil.

**Ventanas de mantenimiento.** El Proveedor podrá realizar mantenimientos en
horarios de bajo tráfico (madrugadas). Durante esas ventanas la sincronización
puede pausarse y el sistema opera en modo local. Los mantenimientos
programados que superen 30 minutos se avisarán con 24 horas de anticipación.

## 6 · Responsabilidades del Cliente

El Cliente se obliga a:

a) Proveer equipo compatible y mantener el Software actualizado.
b) Designar a una persona administradora responsable de las cuentas, los roles y
   los PIN de acceso, y mantener esas credenciales bajo resguardo.
c) Capturar y mantener su catálogo, precios y existencias.
d) Conservar sus comprobantes y cumplir sus obligaciones fiscales.
e) No realizar ingeniería inversa, descompilación, sublicenciamiento, reventa ni
   cesión del Software.
f) Utilizar el Software conforme a la ley y no almacenar en él datos ajenos a su
   operación.

> **El respaldo es del Proveedor.** A diferencia de la versión anterior de este
> contrato, aquí **no se obliga al Cliente a realizar respaldos**: el respaldo
> automático es parte del servicio contratado (cláusula 1) y el Cliente no
> dispone hoy de una herramienta propia para hacerlo. Pedirle algo que el
> sistema no le permite hacer sería una obligación imposible.

## 7 · Propiedad intelectual

El Software, su código fuente, su documentación y sus marcas son propiedad
exclusiva del Proveedor. Este contrato **no transfiere la propiedad**, sólo
otorga una licencia de uso durante su vigencia.

**Los datos del Cliente son del Cliente.** Las ventas, el catálogo, los clientes
y los registros de personal capturados en el Software son propiedad del Cliente.
El Proveedor no los explota comercialmente ni los cede a terceros.

El Proveedor podrá usar datos **agregados y anonimizados** —sin identificar al
Cliente ni a persona alguna— con fines estadísticos y de mejora del Software.

## 8 · Datos personales (LFPDPPP)

Respecto de los datos personales que el Cliente ingrese al Software (clientes,
empleados, nóminas, asistencias):

- El **Cliente es el Responsable** del tratamiento, y se obliga a contar con su
  propio Aviso de Privacidad y a recabar los consentimientos que la ley exija.
- El **Proveedor es Encargado** y trata esos datos únicamente para prestar el
  servicio, conforme a las instrucciones del Cliente.

**Subencargados y ubicación de los datos.** El Proveedor se apoya en
proveedores de infraestructura (Supabase, sobre Amazon Web Services). **El
Cliente reconoce y autoriza que sus datos se alojan en servidores ubicados en
los Estados Unidos de América**, lo que constituye una transferencia
internacional en términos de la LFPDPPP y debe reflejarse en el Aviso de
Privacidad del Cliente.

**Medidas de seguridad.** El Proveedor mantiene control de acceso por usuario,
aislamiento de la información entre clientes, cifrado en tránsito y respaldos
periódicos.

**Vulneraciones.** El Proveedor notificará al Cliente cualquier vulneración de
seguridad que afecte de forma significativa sus datos **dentro de las 72 horas**
siguientes a que tenga conocimiento de ella, informando su alcance y las medidas
adoptadas.

**Devolución y supresión.** Al terminar el contrato aplica la cláusula 11.

## 9 · Confidencialidad

Cada Parte se obliga a guardar confidencialidad sobre la información comercial,
técnica y operativa de la otra a la que tenga acceso, durante la vigencia y por
**2 (dos) años** posteriores a su terminación. No se considera confidencial la
información que sea de dominio público sin culpa de la Parte receptora.

## 10 · Limitación de responsabilidad

El Software se proporciona «tal cual». El Proveedor **no garantiza
disponibilidad del 100 %** del servicio de sincronización, que depende de
infraestructura de terceros y de la conectividad del Cliente. La operación
local, en cambio, no depende de internet.

El Proveedor no será responsable por pérdidas económicas, de utilidad o de datos
derivadas de fallas del hardware del Cliente, de su red, de su impresora, del
mal uso del sistema, ni por sanciones derivadas del incumplimiento de
obligaciones fiscales del Cliente.

**La responsabilidad máxima del Proveedor se limita al monto efectivamente
pagado por el Cliente en los 12 meses anteriores al hecho que la origine.**

Esta limitación **no aplica en casos de dolo o negligencia grave** del Proveedor,
ni respecto de aquello que la ley no permita limitar.

## 11 · Vigencia, terminación y destino de los datos

**Vigencia.** 12 (doce) meses contados a partir de la fecha de activación.

**Renovación.** Automática por periodos iguales, salvo notificación por escrito
de cualquiera de las Partes con al menos 30 días naturales de anticipación al
vencimiento. El precio se rige por la cláusula 2.

**Terminación anticipada.** El Cliente puede terminar en cualquier momento sin
derecho a reembolso, salvo el supuesto de la cláusula 2. El Proveedor puede
terminar con causa justificada, previo aviso de 15 días naturales.

**Qué pasa con el Software al terminar.** Cesa la licencia de uso y se suspende
la sincronización en la nube. El Cliente se obliga a dejar de usar el Software y
a desinstalarlo.

**Qué pasa con los datos, que es lo que importa.** A la terminación, por
cualquier causa:

1. El Cliente dispone de **30 días naturales** para solicitar la entrega de sus
   datos.
2. El Proveedor los entregará dentro de los **10 días hábiles** siguientes a la
   solicitud, en formato de uso común (CSV y/o volcado de base de datos), **sin
   costo adicional**.
3. Transcurrido ese plazo sin solicitud, el Proveedor podrá suprimirlos
   definitivamente, salvo lo que deba conservar por obligación legal.

## 12 · Disposiciones generales

**Cesión.** El Cliente no puede ceder este contrato sin consentimiento escrito
del Proveedor. El Proveedor podrá cederlo a una sociedad de la que sea titular,
notificando al Cliente.

**Caso fortuito y fuerza mayor.** Ninguna Parte será responsable por
incumplimientos derivados de caso fortuito o fuerza mayor, incluyendo fallas
generalizadas de energía, telecomunicaciones o de los proveedores de
infraestructura. La Parte afectada lo notificará a la brevedad.

**Notificaciones.** Se harán a los correos indicados en la carátula y se tendrán
por recibidas al día hábil siguiente de su envío.

**Acuerdo íntegro.** Este contrato, con sus anexos, sustituye cualquier acuerdo
previo entre las Partes sobre su objeto. Sus modificaciones deberán constar por
escrito firmado por ambas.

**Nulidad parcial.** Si alguna cláusula resultara nula, las demás seguirán
vigentes.

**Ley aplicable y jurisdicción.** Se rige por las leyes de los Estados Unidos
Mexicanos. Para cualquier controversia, las Partes se someten a los tribunales
competentes del estado de Aguascalientes, renunciando a cualquier otro fuero.

---

## Anexo A · Alcance funcional incluido

Punto de venta y mesas · comandas a cocina y barra (pantalla o impresión) ·
inventario y recetas con descuento automático de existencias · compras y
recepción de mercancía · mermas y ajustes · turnos de caja y corte Z ·
propinas · empleados, roles y asistencias · nóminas · reportes y auditoría ·
clientes.

Los módulos marcados como Premium en la cláusula 4 no forman parte de este
alcance.

## Anexo B · Requisitos técnicos a cargo del Cliente

Computadora con Windows 10/11 y 4 GB de RAM · red local propia con todos los
dispositivos en la misma red · internet para sincronización · impresora térmica
compatible con ESC/POS · rollo de papel · cajón de dinero (opcional) ·
dispositivos móviles para toma de órdenes, dentro del límite de la cláusula 3.

---

En la ciudad de Aguascalientes, Aguascalientes, a los ______ días del mes de
_________________ de 2026.

<br>

| PROVEEDOR | CLIENTE |
| --- | --- |
| | |
| Nombre y firma | Nombre y firma |

<br>

| TESTIGO 1 | TESTIGO 2 |
| --- | --- |
| | |
| Nombre y firma | Nombre y firma |
