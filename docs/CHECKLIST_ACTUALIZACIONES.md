# Actualizaciones de la caja — lo que falta hacer TÚ

El código del auto-updater está puesto. Lo que queda **no se puede escribir
desde aquí**: son dos llaves que sólo debes tener tú y un archivo que hay que
publicar en cada versión.

---

## 1 · Generar las llaves de firma del updater (una sola vez)

> **Ojo, esto NO es el certificado de firma de código que decidiste no comprar.**
> Son cosas distintas y conviene no confundirlas:
>
> - **Certificado de firma de código** (el que cuesta dinero): le dice a
>   *Windows* quién publica la app. Sin él sale el aviso azul de SmartScreen.
>   Sigue descartado, y sigue anotado que con flujo de dinero se reconsidera.
> - **Llaves del updater** (esto, gratis): le dicen a *la propia app* que la
>   actualización viene de ti y no de alguien que se metió en medio. Sin ellas
>   el updater no arranca — y no debería: un updater sin firma es una puerta
>   para que cualquiera que controle la red instale lo que quiera en la caja.

```bash
npm run tauri signer generate -- -w ~/.tauri/invventa.key
```

Te va a pedir una contraseña. **Apúntala donde apuntas las cosas que no se
pueden perder.** Si pierdes la llave privada, los equipos ya instalados no
aceptarán ninguna actualización futura: hay que reinstalarlos a mano, uno por
uno, en cada restaurante.

Salen dos cosas:

- **La clave pública** — se pega en `src-tauri/tauri.conf.json`, en
  `plugins.updater.pubkey`, sustituyendo `PEGA_AQUI_LA_CLAVE_PUBLICA`. Va al
  repositorio; es pública a propósito.
- **La clave privada** (`~/.tauri/invventa.key`) — **nunca** al repositorio.

## 2 · Variables de entorno al compilar

**No se ponen solas.** Son variables del shell y hay que dárselas al build cada
vez. Tauri no las lee de ningún archivo, y **no deben ir a `.env`**: ese archivo
acaba en copias, en capturas y —el día menos pensado— en el repositorio.

Y no es que sin ellas el instalador salga sin firma: **con
`createUpdaterArtifacts: true`, el build FALLA.** Es a propósito. Un instalador
sin firmar que se publica sin que nadie se dé cuenta es peor que un error.

En PowerShell, **sólo para esta ventana** (que es lo que se quiere):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\.tauri\invventa.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "la-contraseña"
npm run tauri build
```

`TAURI_SIGNING_PRIVATE_KEY` admite **el contenido** de la llave o **la ruta** al
archivo. Se usa el contenido porque la ruta con `~` no la expande PowerShell y
el error que sale entonces —«no se encontró la llave»— manda a buscar en el
sitio equivocado.

**Si la llave no tiene contraseña, hay que poner la variable igual, vacía**
(`$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""`). Sin definirla, el proceso se
queda esperando una contraseña que nadie va a teclear y el build parece colgado.

Para no repetirlo cada vez, un `firmar.ps1` **fuera del repositorio** con esas
tres líneas. Fuera, no dentro: es el archivo que no puede acabar en GitHub.

## 3 · Publicar una versión

### a) Subir el número — **en los tres sitios a la vez**

La versión vive en `package.json`, `src-tauri/tauri.conf.json` y
`src-tauri/Cargo.toml`. El 13-ago estaban en 0.0.0, 0.1.0 y 0.1.0: **ya se
habían separado sin que nadie lo notara**, porque separarse no rompe nada.

Y el día que importa, falla mal: el updater compara el número del `latest.json`
con el que Tauri metió DENTRO del instalador. Si te guías por un `package.json`
desfasado para nombrar el release, publicas un `latest.json` que dice una
versión sobre un instalador que por dentro dice otra — y las cajas no se
actualizan **sin dar ningún error**.

```bash
npm run version                # las enseña y avisa si no coinciden
npm run version -- 0.2.0       # las pone las tres
npm run version -- patch       # 0.1.0 → 0.1.1
```

### b) Compilar

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\.tauri\invventa.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "tu-contraseña"
npm run tauri build
```

Salen dos archivos en `src-tauri/target/release/bundle/nsis/`: el
`InvVenta_<version>_x64-setup.exe` y su `.sig`.

### c) Generar el `latest.json`

```bash
npm run release -- "Corrige que el cajón no abría al cobrar con tarjeta."
```

Lee la versión y **la firma reales del último build** y escribe
`release/latest.json`. Se genera en vez de escribirse a mano porque la firma son
420 caracteres en base64: copiarla a mano es una errata esperando a ocurrir, y
el síntoma sería «la actualización no se instala» sin más pista.

**La nota va en el comando, y sin ella el script no escribe nada.** Es a
propósito: si fuera un campo que se edita en el archivo después, sería un paso
manual al final, y un paso manual al final es el que alguien se salta el día que
tiene prisa. Lo que se publicaría entonces es un aviso que dice «PON AQUI QUE
CAMBIO» en la pantalla de un restaurante.

**Esa frase la lee tu patrón, no un programador.** «Corrige que el cajón no
abría al cobrar con tarjeta» sirve; «fix: cola.rs abrir_cajon» no. Sale en el
aviso, encima de la explicación del mensaje de Windows:

```
Hay una versión nueva (0.2.1).

Corrige que el cajón no abría al cobrar con tarjeta.

Al instalarla, la caja se va a cerrar y volver a abrir sola.

Windows va a mostrar un aviso azul diciendo que no reconoce el
programa. Es normal y pasa en cada actualización: …
```

### d) Publicar en GitHub

Crear un release con la etiqueta **`v<version>`** (con la `v`; es lo que espera
la URL del `latest.json`) y subir **tres** archivos:

1. `InvVenta_<version>_x64-setup.exe`
2. `InvVenta_<version>_x64-setup.exe.sig`
3. `latest.json`

El endpoint apunta a `releases/latest/download/latest.json`, así que mientras
ese release sea el «latest» de GitHub, las cajas lo encuentran solas.

> **El botón tiene que estar en la versión INSTALADA.** Es lo que casi se nos
> escapa el 13-ago: el updater estaba entero —plugin, llaves, endpoint, textos—
> y no había ningún botón que lo disparara. Publicar así habría dejado esa
> instalación sin forma de comprobar nada nunca: el botón de la versión
> siguiente no sirve, porque para llegar a ella hay que actualizar primero.

> **La primera publicación no actualiza a nadie, y está bien.** Si la caja tiene
> instalado 0.1.0 y publicas 0.1.0, el updater compara y no hay nada que hacer.
> Ésa es la línea de salida: la siguiente ya se actualiza sola.

## 4 · Lo que hay que probar antes de confiar

- [ ] Instalar la versión N en una máquina limpia.
- [ ] Publicar la N+1 y pulsar **Buscar actualizaciones** en
      **Ajustes → Hub e impresora** (sólo sale en la caja: el updater no existe
      fuera de Tauri y un botón que no hace nada es peor que ninguno).
- [ ] Sale el aviso **con el texto que menciona el aviso azul de Windows**. Ese
      texto es la mitad del trabajo: sin él, el cliente interpreta que la app
      está infectada y llama.
- [ ] Se instala, la caja se reinicia sola y **el hub vuelve a levantar**.
- [ ] **Las ventas sin subir siguen ahí después del reinicio.** Es lo que hay
      que mirar con más atención: una actualización que se lleve por delante la
      cola o el respaldo convierte una mejora en una pérdida de dinero.
- [ ] La impresora sigue configurada (el `hub.json` no se toca al actualizar).

---

## 5 · Por qué NO se busca sola al arrancar

El arranque de la caja es lo primero que pasa a las once de la mañana, y no es
momento de proponerle nada a nadie. La política acordada es **sólo
actualizaciones de seguridad, raras y avisadas**, así que un sondeo automático
sería ruido casi todo el año y, el día que sirva, llegará en mal momento.

Se busca a mano, desde Ajustes, cuando tú decidas. Está en
`src/lib/Actualizacion.js`.
