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

1. Subir `src-tauri/tauri.conf.json` → `version` (y `package.json` si quieres
   que coincidan).
2. `npm run tauri build`.
3. Crear un release en GitHub y subir **el instalador** y **su `.sig`**.
4. Subir también un `latest.json` con esta forma:

```json
{
  "version": "0.2.0",
  "notes": "Qué cambió, en una línea que entienda el dueño del restaurante.",
  "pub_date": "2026-08-13T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<el contenido del archivo .sig>",
      "url": "https://github.com/UP240507/InvVentaReact/releases/download/v0.2.0/InvVenta_0.2.0_x64-setup.exe"
    }
  }
}
```

El endpoint ya está apuntando a
`releases/latest/download/latest.json`, así que mientras el release sea el
«latest» de GitHub, las cajas lo encontrarán solas.

> **`notes` lo lee una persona, no un desarrollador.** «Corrige que el cajón no
> abría al cobrar con tarjeta» sirve; «fix: cola.rs abrir_cajon» no.

---

## 4 · Lo que hay que probar antes de confiar

- [ ] Instalar la versión N en una máquina limpia.
- [ ] Publicar la N+1 y pulsar **Buscar actualizaciones** en Ajustes.
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
