# Cómo probar el emparejamiento (QR + dispositivos)

> **Lo importante primero: casi todo esto se prueba SIN impresora.** La única
> parte que necesita hardware es ver salir el papel. El QR, el emparejamiento,
> el registro de dispositivos y la revocación funcionan hoy con la caja y el
> navegador que ya tienes.
>
> Está ordenado de menos a más: cada bloque que pasa reduce lo que puede estar
> fallando en el siguiente.

---

## Bloque A · Sin nada (5 minutos)

```bash
npm test                     # 156 aserciones
cd src-tauri && cargo test   # 37 aserciones
cd ..
```

**Qué esperar:** todo en verde. Si `cargo test` falla, es la primera vez que se
compila `lib.rs` en tu máquina — mira el paso 0 de `PRUEBA_HARDWARE_FASE3.md`,
que lista los sospechosos por probabilidad.

---

## Bloque B · La caja sola (10 minutos, sin teléfono)

```bash
npm run tauri dev
```

**1. El hub arranca.** En la consola debe salir:

```
[hub] escuchando en http://192.168.x.x:3000
```

Apunta esa IP. Si dice `0.0.0.0`, el hub no encontró la interfaz de red — suele
pasar si solo tienes levantada una VPN.

**2. Abre `Sistema → Hub e impresora` (`/hub`).**

Debe verse: **Hub activo**, la dirección, y arriba un **QR**.

**3. La prueba más barata que existe: apunta el QR con la cámara del teléfono
sin abrirlo.**

El teléfono debe mostrar la URL completa, algo como
`http://192.168.1.7:3000/?token=a1b2c3d4…`. Con eso ya sabes que el codificador
QR funciona de verdad, contra una cámara real, y no solo contra mis pruebas.

- Si la cámara no reconoce nada: prueba a alejar el teléfono unos 20 cm; un QR
  de 220px pide algo de distancia. Si sigue sin leerse, dímelo — sería un fallo
  del codificador y tengo con qué diagnosticarlo.

**4. Emparejar sin teléfono.** En el navegador de escritorio (Chrome, no la
ventana de Tauri) abre la URL que te mostró la cámara.

**Qué debe pasar:**

- Carga la app, servida por la caja.
- **El `?token=` desaparece de la barra de direcciones** en cuanto carga. Eso es
  deliberado: un token en la URL acaba en el historial y en cualquier captura.
- Al volver a `/hub` en la caja, aparece un dispositivo nuevo en **Dispositivos
  emparejados**, con nombre tipo `Windows · Chrome` y "Activo ahora mismo".

Si el dispositivo NO aparece, el canje falló. Mira la consola del navegador: la
app pide `POST /hub/emparejar` y si eso da 401 el token del QR ya no es válido
(¿reiniciaste la caja? el token cambia en cada arranque — vuelve a `/hub` y usa
el QR nuevo).

**5. Imprime desde ese navegador.** Con el transporte en **Simulador**, pulsa
_Imprimir prueba_. El contador de **Impresos** debe subir, y deben aparecer
archivos `.escpos` en `%APPDATA%\app.invventa.pos\impresiones`.

**6. Revoca.** En la caja, pulsa **Revocar** en ese dispositivo. Vuelve al
navegador y pulsa _Imprimir prueba_ otra vez.

**Qué debe pasar:** deja de imprimir de inmediato, sin reiniciar la caja. Vuelve
a escanear el QR y recupera el acceso.

**7. La prueba que justifica todo el diseño.** Empareja **dos** navegadores
distintos (Chrome y Edge, o una ventana normal y una de incógnito). Revoca uno.

**El otro debe seguir imprimiendo.** Si los dos se caen, el token es compartido
y el registro de dispositivos no está haciendo su trabajo — dímelo.

---

## Bloque C · Con teléfono (10 minutos, sin impresora todavía)

**1. Conecta el teléfono al mismo wifi que la caja.** Es el requisito que más
veces se olvida: si el teléfono está en datos móviles, no ve la caja.

**2. Escanea el QR y abre el enlace.**

**Qué debe pasar:** carga la app completa —servida por la caja, no por la nube—
y el teléfono aparece en la lista de la caja como `Android · Chrome` o similar.

- **Si no carga:** firewall de Windows. Al primer arranque pregunta si permites
  `InvVenta` en redes privadas; si dijiste que no, hay que abrirlo a mano en
  _Firewall de Windows Defender → Permitir una aplicación_.
- **Si carga pero se ve rota:** el `dist` empaquetado está viejo. `npm run build`
  antes de `tauri build`.

**3. Corta el internet del local** (deja el wifi, desconecta el WAN del router) y
repite. Debe funcionar igual: el hub no necesita nube para servir la app ni para
imprimir.

---

## Bloque D · Ya con impresora

Aquí entra `PRUEBA_HARDWARE_FASE3.md`, que cubre el motor ESC/POS, la cola y los
reintentos. Lo único que añade el emparejamiento es que la comanda que manda el
teléfono debe salir **sin precios** y con el nombre de la estación en grande.

---

## Lo que NO va a funcionar todavía, para que no lo busques

- **mDNS.** Si el router rota la IP por DHCP, el QR viejo deja de servir y hay
  que volver a escanear el nuevo. Mientras tanto, **fija la IP de la caja en el
  router** — resuelve esto y también la tercera Redirect URL de Supabase para la
  recuperación de contraseña.
- **El KDS sin internet.** La comanda se imprime, pero la pantalla de cocina no
  la ve: el relay por WebSocket local es el ítem 3.6 y está declarado v2.
- **Rotar el token de emparejamiento a voluntad.** Hoy cambia solo al reiniciar
  el hub. Si el QR de la pared se compromete, reinicia la caja.

---

## Un fallo que corregí al escribir esto

La primera versión guardaba el token del QR y lo usaba tal cual para imprimir.
Funcionaba —salía el papel—, pero nadie llamaba a `/hub/emparejar`: la lista de
dispositivos se quedaba vacía, no había nada que revocar, y cada teléfono
acababa con el token de la **caja**, que es el de administración. Es decir,
cualquier teléfono emparejado podía revocar a los demás y reconfigurar la
impresora.

Ahora el token del QR se canjea por uno propio, y **si el canje falla no se
guarda nada**: es preferible que el teléfono no imprima y haya que volver a
escanear, a que se quede con permisos que no le tocan. El bloque B paso 7 es
justamente la prueba de que esto quedó bien.

---

_Escrito el 5-ago-2026._

---

## Requisitos de red del local (6-ago)

Tres cosas que **no se pueden resolver por código** y hay que dejar puestas al
instalar. Se descubrieron pensando el caso «el teléfono cambia de red».

### 1 · Un amplificador de wifi debe ir en MODO PUENTE

El teléfono llega al hub por su IP en la LAN. Si el repetidor hace **NAT** y
coloca al teléfono en otra subred, esa IP deja de ser alcanzable y **no hay
arreglo posible desde la app**: mDNS —que es lo que resolvería el
descubrimiento— tampoco cruza subredes.

En modo puente el repetidor extiende la misma red y todo sigue funcionando sin
tocar nada.

### 2 · La IP de la caja, fija en el router

Reserva de DHCP por MAC. Si el router se la cambia, los dispositivos
emparejados apuntan a una IP que ya no es la caja y hay que reescanear el QR de
`/hub`. Es lo que mitigará mDNS (3.3) cuando esté, pero la reserva es gratis y
no falla.

### 3 · Qué pasa si un teléfono se va a datos móviles

Comportamiento esperado, **no es un fallo**:

- La app **sigue abriendo**: el service worker la tiene precacheada con
  `navigateFallback`, así que ni siquiera recargar la rompe.
- Se **sigue vendiendo**: las ventas van a Dexie y suben a Supabase por los
  datos móviles.
- **No se imprime.** El hub está en la LAN del local y por datos móviles no se
  llega. La barra de estado lo dice con todas las letras —«Sin conexión con la
  caja — no se puede imprimir»— y los avisos posteriores explican que la venta
  sí quedó registrada.

Lo que el mesero tiene que hacer es **acercarse**, y ése es exactamente el
mensaje que se le da. No hay nada que reintentar ni que configurar.
