# Checklist — TM-T20II, martes 11-ago

Para tener delante mientras se hace. El orden importa: cada paso descarta una
causa, y saltarse uno hace que un fallo del paso 5 parezca un fallo del código
cuando era del cable.

**Regla general: si un paso falla, PARA.** No se sigue al siguiente. Casi todo
el tiempo que se pierde en una prueba de hardware se pierde depurando software
contra un problema físico.

**Segunda regla, porque la impresora es de un restaurante que trabaja: no se
abre ninguna utilidad de configuración del dispositivo.** Ver el paso 1-bis — un
driver no reconfigura la impresora; la utilidad sí.

---

## Quién hace esta prueba

**Chris, en su máquina, fuera de horas de servicio.** No mandarle el `.exe` al
patrón para la primera prueba con hardware, y conviene tener escrito por qué:

- Nadie está delante cuando falle, y es la primera vez que ese binario toca una
  impresora.
- El instalador **no está firmado**: SmartScreen le va a decir a tu jefe que el
  programa es peligroso. Mala primera impresión para quien puede ser el primer
  cliente — y el certificado de firma es justo lo que sigue pendiente.
- Su computadora es probablemente **la de producción**, con la misma impresora.
  El riesgo que se quería evitar no baja: sube, y se corre a ciegas.

Al patrón se le enseña el **resultado**: papel impreso en la mano vale más que
un ejecutable que no sabe si instalar.

---

## 0 · Antes de tocar la impresora (5 min, en el escritorio)

- [ ] **Rellenar los datos fiscales** en Configuración: razón social, RFC,
      domicilio, teléfono. El ticket los lleva arriba desde el 6-ago, y con los
      campos vacíos no se puede juzgar el resultado impreso — sale un hueco y no
      se sabe si es un fallo de maquetado o que no había dato.

- [ ] **Corregir el RFC.** El de ejemplo es `ROGC010401AQ9` y la razón social es
      «Chávez Fernández Alberto». Un RFC de persona física empieza por las letras
      del apellido, así que debería empezar por `CAFA`. Va impreso en cada
      ticket: si se imprime hoy mal, se imprime mal en todas las pruebas.

- [ ] **Usar la app INSTALADA**, no `npm run tauri dev`. El 7-ago se probó en
      dev. El camino al spooler es el mismo, pero el directorio de trabajo y los
      permisos no, y lo que el cliente va a correr es el instalador.

---

## 1 · La impresora sola, sin computadora

- [ ] **Autoprueba:** apagar la impresora, mantener pulsado **FEED**, encenderla
      sin soltar. Suelta el botón cuando empiece a salir papel.

**Debe salir una hoja con su configuración** (modelo, firmware, interfaz).

> **Si NO sale:** el problema es la impresora, el papel o la corriente. No hay
> nada que hacer en el software. Revisar rollo (el papel térmico imprime por una
> sola cara), tapa bien cerrada, y cable de alimentación.
>
> **Para aquí.** No se pierde la mañana con el driver.

- [ ] En esa hoja, **anotar la interfaz** que declara: USB, serie o **Ethernet**.

**Esto decide el resto de la prueba, y por eso va antes que el driver.** Si dice
Ethernet, salta al paso 2-bis y **no instales nada**.

---

## 1-bis · Antes de instalar: dejar constancia de cómo estaba

La preocupación es legítima —es la impresora de un restaurante que trabaja— así
que conviene poder demostrar y deshacer lo que se tocó.

**Lo primero, la distinción que baja el riesgo de verdad: instalar un driver NO
reconfigura la impresora.** Los ajustes de la TM-T20II viven en su memoria y sólo
cambian si se ejecuta la _utilidad de configuración_ de Epson y se le escriben.
El paquete APD trae esa utilidad, pero instalar el driver no la corre.

> **REGLA: no abrir la TM-T20II Utility ni ninguna herramienta de configuración
> del dispositivo.** Con eso, el hardware queda exactamente como estaba.

Lo que sí cambia es Windows: el APD **añade una cola**. No reemplaza las que ya
existan — Windows admite varias colas para el mismo aparato.

- [ ] En PowerShell, **antes** de instalar, guardar el inventario:

```powershell
Get-Printer        | Select Name, DriverName, PortName, Shared | Format-Table
Get-PrinterDriver  | Select Name, Manufacturer | Format-Table
Get-PrinterPort    | Select Name, PrinterHostAddress | Format-Table
```

- [ ] Guardar esa salida en un archivo (`> C:\antes.txt`) o una captura.

Sirve para dos cosas: saber qué cola es nueva y cuál estaba, y —si alguien
pregunta— tener la prueba de qué se tocó y qué no.

- [ ] Anotar también **cuál es la impresora predeterminada** antes de empezar. Es
      lo que más fácil se cambia sin querer, y lo que más rápido se nota.

### Para deshacerlo

- Configuración → Bluetooth y dispositivos → Impresoras → la cola nueva →
  **Quitar**.
- Si hace falta, quitar también el driver: `Get-PrinterDriver` para ver el nombre
  exacto y `Remove-PrinterDriver -Name "..."` (con el spooler sin trabajos).
- Devolver la predeterminada a la que estaba.

---

## 2-bis · El atajo: si es Ethernet, sin driver

`transporte.rs` implementa **TCP directo al puerto 9100** —`TcpStream` con
timeout de 3 s— y manda los bytes ESC/POS tal cual. Sin cola de Windows, sin
driver, sin tocar el spooler.

**Si la autoprueba dijo Ethernet, este es el camino, y elimina el riesgo entero.**

- [ ] Sacar la IP de la impresora. Suele venir en la misma hoja de autoprueba; si
      no, la da el router o el botón de estado de red.
- [ ] Ajustes → Hub → Impresora → «Cómo se conecta»: **Red (IP, puerto 9100)**.
- [ ] Meter la IP y guardar. El puerto 9100 es el valor por defecto.
- [ ] Saltar al paso 4.

> Aunque sea USB, vale la pena saber que esta ruta existe: para un restaurante
> con la impresora lejos de la caja, la variante de red evita el cable largo y
> la instalación de driver en cada equipo.

---

## 2 · Que Windows la vea (sólo si es USB o serie)

- [ ] Instalar **APD v5.13** — paquete `APD_513_T20II_EWM.zip`, de la lista de
      drivers de Epson.

Es el _Advanced Printer Driver_, no el básico. Esa es la diferencia que importa:
el APD expone la impresora al spooler de forma que se le puedan mandar bytes
ESC/POS **en crudo**. El básico la trata como una impresora de documentos y
maqueta lo que le llega, que para nosotros es basura.

No necesita la impresora conectada para instalarse.

- [ ] Conectar el USB y encender.
- [ ] Comprobar que aparece en **Dispositivos e impresoras** como impresora, no
      como «dispositivo desconocido».

> **Si sigue como desconocido:** el driver no la reconoció. Probar otro puerto
> USB (evitar hubs), y reinstalar el APD con la impresora ya conectada.
>
> **Para aquí.** Sin cola de impresión en Windows, `transporte.rs` en modo
> `WindowsRaw` no tiene contra qué escribir. No es un fallo del código.

---

## 3 · Que la app la vea

- [ ] Abrir la app instalada → **Ajustes → Hub**.
- [ ] En «Impresora», elegir **USB / Windows** en «Cómo se conecta».
- [ ] Desplegar **«Impresora instalada»**.

**La TM-T20II tiene que aparecer en esa lista.** No hay que teclear el nombre: el
hub enumera las colas de Windows y las ofrece. Se elige de la lista justamente
porque en Windows suelen llamarse cosas como `POS-58 Printer(1)` y un espacio de
más deja la caja sin imprimir sin decir por qué.

- [ ] Seleccionarla y **Guardar**. Debe salir el aviso «Impresora: …».

> **Si la lista sale vacía:** el hub no ve ninguna cola. Confirmar el paso 2, y
> que la app se abrió DESPUÉS de instalar el driver.

---

## 4 · Imprimir, en este orden

Cada documento prueba algo distinto. El orden va de menos a más complejo, para
que un fallo señale a un sitio concreto.

- [ ] **1. Prueba** (botón en la misma pantalla del Hub)
      → prueba el camino entero: app → hub → cola → spooler → papel.
      Si esto sale, el resto son problemas de maquetado, no de conexión.

- [ ] **2. Pre-cuenta**
      → primer documento con datos reales de una mesa. Sin folio de venta.

- [ ] **3. Ticket de venta**
      → el que lleva los datos fiscales arriba. Aquí se juzga el paso 0.

- [ ] **4. Comanda de cocina**
      → prueba el enrutamiento por zona, que es lo único que los otros tres no
      tocan.

---

## 5 · Lo que va a salir mal, y ya lo sabemos

**El papel saldrá correcto pero estrecho**, usando unos dos tercios del rollo.

`ANCHO` está fijo en **32 columnas** y la TM-T20II es de 80 mm, o sea **48**. El
diseño se hizo contra el ticket de 58 mm de referencia.

No se arregló a ciegas a propósito: hacerlo configurable sin poder ver el
resultado es escribir dos formatos y verificar cero. **Con el papel delante es
media hora.** Es el primer cambio de código a hacer después de esta prueba.

- [ ] Guardar los papeles impresos, o fotografiarlos. Sirven para comparar
      cuando se ajuste el ancho.

---

## 6 · Si sobra tiempo

- [ ] **Cortar papel a mitad de trabajo** para ver que la cola reintenta y no
      pierde el ticket. `cola.rs` tiene 5 intentos con espera creciente.
- [ ] **Apagar la impresora y cobrar igual.** El cobro NO debe bloquearse; el
      ticket tiene que salir cuando la impresora vuelva. Es la regla que manda
      sobre todas las demás en ese módulo.
- [ ] **Imprimir desde el teléfono** emparejado, no desde la caja. Es el camino
      real del mesero y pasa por la LAN.

---

## Si hay que parar antes de terminar

No hace falta hacerlo todo. **El paso 4.1 (imprimir la Prueba) ya vale la
sesión**: demuestra el camino entero —app → hub → cola → spooler → papel— que es
lo único que nunca se ha comprobado. Los otros tres documentos son maquetado, y
el maquetado se puede seguir viendo con el simulador a disco sin impresora
delante, como se hizo el 6-ago.

Si toca dejarlo:

- [ ] Quitar la cola nueva si se instaló (ver 1-bis).
- [ ] Devolver la impresora predeterminada a la que estaba.
- [ ] Anotar en qué paso se quedó y qué se vio.

---

## Después

Lo que sale de aquí, casi seguro:

1. `ANCHO` configurable (32 / 48 columnas) — media hora con el papel delante.
2. Ajustes de maquetado que sólo se ven en papel.

Y queda anotado en `docs/PRUEBA_HARDWARE_FASE3.md` lo que se aprendió, para que
la siguiente impresora de otro modelo no empiece de cero.
