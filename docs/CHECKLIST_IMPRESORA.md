# Checklist — TM-T20II

> **RESULTADO (11-ago-2026): ✅ pasó.** Los cuatro documentos salen correctos a
> 48 columnas en una TM-T20II real. Lo que costó no fue el código: fue el
> `Port Type = COM` por defecto del asistente del APD, que con una USB crea una
> cola que nunca imprime y no dice por qué. Ese paso es el que hay que vigilar
> en cada instalación en casa de un cliente.
>
> El checklist se conserva para la siguiente impresora, que será de otro modelo.

Partido en dos: **lo que se hace esta noche sin la impresora** y **lo que exige
tenerla delante**. Casi todo cae en la primera parte, y eso importa porque la
impresora es de un restaurante que trabaja y no se puede tener secuestrada una
mañana entera.

Si la parte A queda hecha, la B son veinte minutos.

## Dos reglas

**1. Si un paso falla, PARA.** No se sigue al siguiente. Casi todo el tiempo que
se pierde en una prueba de hardware se pierde depurando software contra un
problema físico.

**2. No se abre ninguna utilidad de configuración del dispositivo.** Un driver
no reconfigura la impresora; la utilidad de Epson sí. Ver «Qué puede y qué no
puede desconfigurarse», abajo.

## Quién hace esta prueba

**Chris, en su máquina, fuera de horas de servicio.** No mandarle el `.exe` al
patrón para la primera prueba con hardware:

- Nadie está delante cuando falle, y es la primera vez que ese binario toca una
  impresora.
- El instalador **no está firmado**: SmartScreen le va a decir que el programa es
  peligroso. Mala primera impresión para quien puede ser el primer cliente — y el
  certificado de firma es justo lo que sigue pendiente.
- Su computadora es probablemente **la de producción**, con la misma impresora.
  El riesgo que se quería evitar no baja: sube, y se corre a ciegas.

Al patrón se le enseña el **resultado**: papel impreso en la mano vale más que un
ejecutable que no sabe si instalar.

---

# PARTE A — Esta noche, sin impresora

## A1 · El inventario, antes que nada

**Este paso es el único que no se puede recuperar.** Si se instala primero y se
mira después, se perdió la línea base.

Abrir PowerShell (tecla Windows → `powershell` → Enter). **No hace falta
administrador.** Pegar el bloque entero:

```powershell
$antes = "$HOME\Desktop\impresoras-antes.txt"
& {
  "=== $(Get-Date) ==="
  "--- Impresoras ---"
  Get-Printer | Select-Object Name, DriverName, PortName, Shared | Format-Table -AutoSize
  "--- Predeterminada ---"
  Get-CimInstance Win32_Printer | Where-Object Default | Select-Object Name
  "--- Drivers ---"
  Get-PrinterDriver | Select-Object Name, Manufacturer | Format-Table -AutoSize
  "--- Puertos ---"
  Get-PrinterPort | Select-Object Name, PrinterHostAddress | Format-Table -AutoSize
} | Tee-Object -FilePath $antes
```

`Tee-Object` lo enseña en pantalla **y** lo guarda en el Escritorio.

- [ ] Corrido y archivo guardado.
- [ ] Anotada cuál es la **predeterminada**. Es lo que más fácil se cambia sin
      querer y lo que más rápido se nota.

> Si `Get-Printer` no existe (Windows viejo):
> `Get-CimInstance Win32_Printer | Select Name, DriverName, PortName`

## A2 · Instalar el APD

- [ ] **APD v5.13** — paquete `APD_513_T20II_EWM.zip`, de la lista de drivers de
      Epson. **No necesita la impresora conectada.**

Es el _Advanced Printer Driver_, no el básico. Esa es la diferencia que importa:
el APD expone la impresora al spooler de forma que se le puedan mandar bytes
ESC/POS **en crudo**. El básico la trata como impresora de documentos y maqueta
lo que le llega, que para nosotros es basura.

- [ ] Valores por defecto durante la instalación.
- [ ] Reiniciar si lo pide (mejor esta noche que mañana).

### El asistente de registro, y la trampa que trae

Al final sale **«Register, Change and Delete EPSON TM Printer»**. Aquí sí hay que
tocar, y hay un valor por defecto que rompe la instalación en silencio:

> **`Port Type` viene en `COM`.** Eso es puerto SERIE. Con una TM-T20II por USB,
> guardar así crea una cola apuntando a `COM3:` que **nunca va a imprimir** — y
> el COM3 puede pertenecer a otro dispositivo. El baud rate, la paridad y el
> flow control que aparecen sólo tienen sentido en serie.

- [ ] **`Port Type` → `USB`.**
- [ ] **`Port` → `Auto setup`.** Resuelve el puerto cuando la impresora aparezca,
      así que **no hace falta tenerla conectada** para registrar la cola. Por eso
      este paso cabe en la parte A.
- [ ] **`Set as Default Printer` DESMARCADO.** Viene así; dejarlo. Cambiar la
      impresora predeterminada del equipo es de las cosas que más se notan.
- [ ] Dejar el nombre `EPSON TM-T20II Receipt`. Es el que va a aparecer en el
      desplegable del hub.
- [ ] **Save Settings** → sección 5 → **Next**.
- [ ] **No tocar «Test Print».** Sin impresora no significa nada.

La cola aparecerá en Dispositivos e impresoras marcada como sin conexión. Es
correcto: no hay aparato al otro lado todavía.

## A3 · Ver qué añadió el driver, él solo

```powershell
$driver = "$HOME\Desktop\impresoras-tras-driver.txt"
# ...volver a correr el bloque de A1 cambiando $antes por $driver...
Compare-Object (Get-Content $antes) (Get-Content $driver)
```

Lo que salga con `=>` es lo nuevo.

**Probablemente NO aparezca ninguna cola, y no es un fallo.** Con USB el puerto no
existe hasta enchufar la impresora, así que el driver queda disponible pero sin
cola. Lo que sí debe aparecer es el **driver de Epson** en la sección de
`Get-PrinterDriver`. Eso confirma que la instalación funcionó.

Separar esto de mañana evita mezclar dos cosas: lo que trae el APD y lo que nace
al conectar el aparato.

## A4 · Datos fiscales y RFC

- [ ] **Rellenar los datos fiscales** en Configuración: razón social, RFC,
      domicilio, teléfono. El ticket los lleva arriba desde el 6-ago; con los
      campos vacíos sale un hueco y no se sabe si es fallo de maquetado o falta de
      dato.

- [ ] **Corregir el RFC.** El de ejemplo es `ROGC010401AQ9` y la razón social es
      «Chávez Fernández Alberto». Un RFC de persona física empieza por las letras
      del apellido: debería empezar por `CAFA`. Va impreso en cada ticket — si se
      imprime mal mañana, se imprime mal en las cuatro pruebas.

## A5 · Probar el hub sin impresora

Todo esto funciona hoy y deja cerrado medio checklist.

- [ ] **Usar la app INSTALADA**, no `npm run tauri dev`. El camino al spooler es
      el mismo, pero el directorio de trabajo y los permisos no — y lo que va a
      correr el cliente es el instalador.

- [ ] **El paso B3, entero, esta noche.** Ajustes → Hub → Impresora →
      «USB / Windows» → desplegar «Impresora instalada». Con la cola ya
      registrada en A2, **`EPSON TM-T20II Receipt` tiene que salir en la lista**.
      Si sale, B3 está probado y mañana sólo queda enchufar e imprimir.

  > **No mandes a imprimir desde el hub esta noche.** Sin impresora el trabajo se
  > encola y falla cinco veces con espera creciente, y deja un fallido que luego
  > hay que descartar a mano. Para probar impresión hoy, usa el simulador (abajo).

  > **No intentes imprimir a «Print to PDF».** `WindowsRaw` manda ESC/POS en
  > crudo y ese driver espera un documento: va a fallar o sacar basura, y ese
  > fallo no dice nada sobre el código.

- [ ] **Imprimir de verdad, a disco.** Cambiar «Cómo se conecta» a **Simulador (a
      disco)** y mandar la Prueba, una pre-cuenta, un ticket y una comanda. Los
      bytes reales quedan en:

  ```
  %APPDATA%\app.invventa.pos\impresiones\
  ```

  Un `.escpos` por trabajo. Esto ejercita **app → hub → cola → transporte**: todo
  el camino menos el cable.

- [ ] **Ver el papel** con la previsualización, que devuelve el ticket como texto
      con el ancho aplicado. Ahí se juzga maquetado y acentos sin gastar rollo.

- [ ] **Los extras de la cola**, que tampoco necesitan impresora: encolar varios y
      ver que se serializan, y **reiniciar la app** para comprobar que los
      pendientes sobreviven en disco.

---

# PARTE B — Mañana, con la impresora

## B1 · La impresora sola, sin computadora

- [ ] **Autoprueba:** apagar, mantener pulsado **FEED**, encender sin soltar.
      Soltar cuando empiece a salir papel.

**Debe salir una hoja con su configuración** (modelo, firmware, interfaz).

> **Si NO sale:** el problema es la impresora, el papel o la corriente. Revisar
> rollo (el térmico imprime por una sola cara), tapa bien cerrada, alimentación.
> **Para aquí.** No hay nada que hacer en el software.

- [ ] **GUARDAR ESA HOJA.** Es la foto del «antes» del hardware. Ver B5.
- [ ] Anotar la **interfaz** que declara.

> **Si dijera Ethernet**, existe un atajo sin driver: `transporte.rs` implementa
> TCP directo al puerto 9100 (`TcpStream`, timeout de 3 s). Ajustes → Hub →
> «Red (IP, puerto 9100)», meter la IP, y saltar a B4.
>
> Poco probable en esta unidad: el 7-ago Windows la vio como **dispositivo
> desconocido**, y eso es síntoma de USB — una Ethernet ni siquiera habría
> aparecido como dispositivo.

## B2 · Conectar

- [ ] Conectar el USB y encender. Evitar hubs; puerto directo.
- [ ] Comprobar que aparece en **Dispositivos e impresoras** como impresora, no
      como «dispositivo desconocido».

> **Si sigue como desconocido:** el driver no la reconoció. Probar otro puerto
> USB y reinstalar el APD con la impresora ya conectada.
>
> **Para aquí.** Sin cola en Windows, `transporte.rs` en modo `WindowsRaw` no
> tiene contra qué escribir. No es un fallo del código.

## B3 · Que la app la vea

- [ ] Ajustes → Hub → «USB / Windows» → «Impresora instalada».
- [ ] **La TM-T20II tiene que aparecer en la lista.** No se teclea el nombre: se
      elige, justamente porque en Windows se llaman cosas como
      `POS-58 Printer(1)` y un espacio de más deja la caja muda sin decir por qué.
- [ ] Seleccionar y **Guardar**. Debe salir «Impresora: …».

## B4 · Imprimir, en este orden

De menos a más complejo, para que un fallo señale a un sitio concreto.

- [ ] **1. Prueba** → el camino entero: app → hub → cola → spooler → papel.
      **Si esto sale, lo demás son problemas de maquetado, no de conexión.**
- [ ] **2. Pre-cuenta** → datos reales de una mesa, sin folio de venta.
- [ ] **3. Ticket** → el que lleva los datos fiscales arriba. Aquí se juzga A4.
- [ ] **4. Comanda** → prueba el enrutamiento por zona, lo único que los otros
      tres no tocan.

- [ ] Guardar o fotografiar los papeles. Sirven para comparar al ajustar el ancho.

## B5 · Cerrar: demostrar que la impresora quedó igual

- [ ] **Segunda autoprueba** (FEED + encendido).
- [ ] Comparar con la hoja de B1.

**Si las dos hojas son idénticas, hay prueba física de que no se cambió nada en
el aparato.** Es el mismo truco que el `Compare-Object` de Windows, pero para el
hardware — y es lo que se le enseña al patrón si pregunta.

- [ ] En Windows: `Compare-Object` entre `$driver` y un tercer inventario. Lo
      único nuevo debería ser la cola de la TM-T20II.

---

## Lo que va a salir mal, y ya lo sabemos

**El papel saldrá correcto pero estrecho**, usando unos dos tercios del rollo.

`ANCHO` está fijo en **32 columnas** y la TM-T20II es de 80 mm, o sea **48**. El
diseño se hizo contra el ticket de 58 mm de referencia.

No se arregló a ciegas a propósito: hacerlo configurable sin poder ver el
resultado es escribir dos formatos y verificar cero. **Con el papel delante es
media hora.** Es el primer cambio de código después de esta prueba.

## Si hay que parar antes de terminar

**El paso B4.1 solo ya vale la sesión.** Imprimir la Prueba demuestra el camino
entero, que es lo único que nunca se ha comprobado. Lo demás es maquetado, y el
maquetado se sigue viendo con el simulador a disco.

Si toca dejarlo:

- [ ] Quitar la cola nueva si se instaló.
- [ ] Devolver la impresora predeterminada a la que estaba.
- [ ] Anotar en qué paso se quedó y qué se vio.

## Notas del README del APD

Del `APD5_README_EN.TXT`, lo que cambia algo:

- **La 5.11R1 arregló «USB-connected printer may not be recognized».** Es
  literalmente el síntoma del 7-ago: se conectó la TM-T20II y Windows no la
  detectó. No era el cable ni el código — era un bug conocido del driver. La 5.13
  lo lleva incluido.
- **Desinstalación limpia:** `APD_513_T20II.exe /uninstall`.
- **§3.7 — si la impresora se comparte por red entre varios equipos, todos deben
  usar la MISMA versión de APD.** No aplica a una USB que se lleva de un sitio a
  otro, pero sí si en el restaurante la comparten desde otra PC: conviene saber
  qué versión tienen antes de mezclar.
- El paquete instala también **StatusAPI** en
  `C:\Program Files (x86)\Epson\Advanced Printer Tool\`. No lo usamos —se
  escribe crudo al spooler— pero sale en el `Compare-Object`.

## Qué puede y qué no puede desconfigurarse

Hay dos configuraciones distintas y sólo una viaja con la impresora.

**El driver y la cola viven en cada computadora**, en el registro de esa máquina.
Instalar el APD en un equipo **no puede** tocar la cola de otro: no existe canal
por el que eso ocurra.

**Los ajustes internos viven en la impresora** —densidad, página de códigos,
cortador, emulación— y esos sí van con el aparato a donde se lleve. Sólo cambian
si se ejecuta la utilidad de Epson y se le escriben, o moviendo los DIP switches
físicos. Instalar el driver no la ejecuta.

De ahí la regla 2. Con eso, el hardware queda exactamente como estaba, y B5 lo
demuestra.

### Para deshacer lo de Windows

**Lo limpio es el desinstalador de Epson**, que quita driver y StatusAPI de una
vez (README §3.2):

```
APD_513_T20II.exe /uninstall
```

Mejor que ir borrando la cola y el driver a mano. El README además da el orden
para recuperarse de un error de instalación: `/uninstall`, quitar la causa,
reinstalar.

A mano, si hiciera falta:

- Configuración → Bluetooth y dispositivos → Impresoras → la cola nueva →
  **Quitar**.
- `Get-PrinterDriver` para el nombre exacto y `Remove-PrinterDriver -Name "..."`
  (con el spooler sin trabajos).
- Devolver la predeterminada a la que estaba.

---

## Después

1. `ANCHO` configurable (32 / 48 columnas) — media hora con el papel delante.
2. Ajustes de maquetado que sólo se ven en papel.

Y anotar en `docs/PRUEBA_HARDWARE_FASE3.md` lo aprendido, para que la siguiente
impresora de otro modelo no empiece de cero.
