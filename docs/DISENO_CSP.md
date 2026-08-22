# El CSP de la caja — **ACTIVADO el 22-ago**

> **Estado: puesto.** `tauri.conf.json` lleva la política de §2. Entra en la
> **0.2.7** — decisión de Chris, 22-ago. La 0.2.6 ya se publicó sin ella.
>
> **El riesgo que había que cubrir antes de encenderlo:** un CSP mal puesto no
> da un error legible. Bloquea una petición y la pantalla se queda a medias, o
> en blanco. Y sólo pasa **en el build instalado**: en `tauri dev` la política
> es otra. Sin devtools en release, eso es un fallo silencioso metido a
> propósito — justo el patrón que este proyecto persigue.
>
> **Por eso el CSP no entró solo.** Entró con `lib/AvisosCsp.js` (§6), que
> recoge cada bloqueo y lo enseña en Ajustes › Hub. Encender la política sin
> ese detector habría sido lo que este documento decía evitar.

## 1 · Qué protege, y de qué no

Hoy `csp: null` significa que la ventana de la caja **no tiene ninguna
restricción**: si algún día entra un script de terceros —una dependencia
comprometida, un `dangerouslySetInnerHTML` con datos de la base— puede hablar
con cualquier dominio y llevarse lo que hay en `localStorage`, que es el token
del hub y la sesión de Supabase con su JWT.

Lo que **no** arregla: nada de lo que ya se puede hacer desde la propia app.
Un CSP no impide que alguien con la ventana delante haga cosas; para eso está
el no compilar con `devtools` (ver §4).

## 2 · La política, lista para pegar

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost http://localhost:* http://127.0.0.1:* https://*.supabase.co wss://*.supabase.co; worker-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'"
}
```

Línea por línea, y **cada una está por algo concreto**:

| Directiva                                               | Por qué                                                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'self'`                                     | Tauri añade solo su nonce a los scripts que inyecta cuando hay CSP. No hace falta `'unsafe-inline'`.                                                                                |
| `style-src 'unsafe-inline'`                             | Por el `<style>` del `index.html` **y** por los `style={{}}` de React, que cuentan como estilo en línea. Sin esto la app sale sin maquetar.                                         |
| `img-src … https:`                                      | `configuracion.logo_url` es una URL remota. `data:` y `blob:` por los iconos y cualquier imagen generada.                                                                           |
| `font-src 'self' data:`                                 | **Desde el 18-ago las cuatro familias se sirven del bundle**, así que aquí ya no hacen falta los dominios de Google. Antes de eso habrían tenido que entrar.                        |
| `connect-src ipc: http://ipc.localhost`                 | El puente IPC de Tauri en Windows. Sin esto **no funciona ni un comando `hub_*`**: ni imprimir, ni el cajón, ni el respaldo. Es el que más fácil se olvida y el que más ruido hace. |
| `connect-src http://localhost:* http://127.0.0.1:*`     | Los endpoints del hub que la caja llama por HTTP y no por IPC: `configurarAncho`, `/dispositivos`, `/salud`.                                                                        |
| `connect-src https://*.supabase.co wss://*.supabase.co` | REST **y** WebSocket. El `wss` es el realtime; sin él la app funciona pero deja de recibir ecos en vivo, y eso se nota tarde.                                                       |
| `object-src 'none'`, `frame-src 'none'`                 | No hay ni plugins ni iframes. Cerrarlos es gratis.                                                                                                                                  |

## 3 · Cómo verificarlo, porque a ojo no se ve

### Lo que YA se verificó, y cómo (22-ago)

Se sirvió el **build real** de `dist/` con la **misma cabecera CSP** que lleva
la caja, se cargó en Chromium y se recogieron los eventos
`securitypolicyviolation`:

```
VIOLACIONES CSP: 0
MEDIDO: fuenteBody "DM Sans" · hojasCargadas 2 · nodosEnRoot 1 · fuentesListas 8
```

**Y con un control negativo**, porque un banco que no puede fallar no prueba
nada: repitiendo lo mismo con `font-src 'none'` salieron **16 violaciones**, con
las ocho woff2 nombradas una a una. El banco caza lo que tiene que cazar.

Eso cubre `script-src`, `style-src`, `font-src`, `worker-src` y las imágenes
locales — o sea, **todo lo que rompe el aspecto de la app**. Las 16 violaciones
del control negativo, dicho sea de paso, confirmaron que la deduplicación de
`AvisosCsp` era necesaria: son 16 eventos y **una sola causa**.

### Lo que NO se puede verificar fuera de la caja

Un navegador no tiene `ipc:`, ni sesión de Supabase, ni realtime. Esto va **en
un build instalado**, no en `tauri dev`, y con la consola cerrada:

- [ ] La app **abre y se ve maquetada** (si sale sin estilos → `style-src`).
- [ ] Las tipografías son las de siempre, no las del sistema (→ `font-src`).
- [ ] **Iniciar sesión** contra Supabase (→ `connect-src https:`).
- [ ] **Imprimir** un ticket de prueba desde la pantalla del hub (→ `ipc:`).
- [ ] La pantalla del hub enseña la cola y el ancho de papel (→ `localhost:*`).
- [ ] Abrir el KDS y mandar una comanda desde otro aparato: tiene que aparecer
      sola (→ `wss:`, el realtime).
- [ ] El logo del restaurante, si está configurado (→ `img-src https:`).

> **Cómo salir si algo falla:** volver `"csp": null`, recompilar y publicar. No
> hay estado que migrar ni datos que arreglar — es una línea de configuración.

## 4 · Lo que NO se hace, y por qué

**No se compila con `devtools` en release.** Decisión de Chris, 18-ago, y es la
correcta por un motivo más concreto que «que no vean el código»: con la consola
abierta, `window.__TAURI_INTERNALS__.invoke` está a mano, y ahí vive
`hub_abrir_cajon`. Una línea tecleada en la consola **abre el cajón**. Sumado a
que `localStorage` guarda el token del hub y el JWT de la sesión, y a que la
caja vive en la barra rodeada de personal, el saldo está claro.

Eso deja abierto lo que apuntaba `PENDIENTE_LUNES.md`: **cualquier diagnóstico
que dependa de la consola, en producción no existe.** La salida no es abrir la
consola sino sacar los avisos a una pantalla — y es mejor que la consola, no un
premio de consolación: una consola sólo sirve si quien está delante es técnico,
y una pantalla la lee el dueño por teléfono y te la dicta. Diseño pendiente.

## 5 · Lo que este CSP no cubre

**Sólo protege la ventana de Tauri.** Los teléfonos cargan la app desde el hub
por HTTP, y `ServeDir` no manda ninguna cabecera `Content-Security-Policy`. Si
algún día se quiere la misma red debajo para los meseros, hay que añadir la
cabecera en `hub/servidor.rs`. No es lo mismo copiar la política tal cual: el
origen de los teléfonos es `http://<ip>:3000`, no `tauri://`, así que `ipc:`
sobra y `connect-src 'self'` ya cubre el hub.

## 6 · El detector, porque el CSP falla callado

`src/lib/AvisosCsp.js`, enganchado desde `main.jsx` **antes de montar React** —
los bloqueos que más importan (una fuente, una hoja de estilo, el bundle)
ocurren antes de que haya nada montado.

- Escucha `securitypolicyviolation`, que es lo que el navegador dispara por cada
  bloqueo.
- **Deduplica por directiva y ORIGEN**, no por ruta. El control negativo de §3
  demuestra por qué: ocho fuentes bloqueadas son 16 eventos y un solo problema.
- **Guarda en `localStorage`**, porque el bloqueo típico ocurre en el arranque
  sin nadie mirando y la app se recarga. Un aviso que se pierde al recargar no
  sirve para diagnosticar por teléfono, que es el caso real.
- **Avisa en pantalla una sola vez por firma.** Una lluvia de avisos tapa la
  aplicación justo cuando hay que usarla.
- Y se lee en **Ajustes › Hub**, en una tarjeta que sólo aparece si hay algo.
  Una tarjeta vacía permanente enseña a ignorarla.

No manda nada a ningún sitio. La caja no reporta telemetría y esto no va a ser
lo primero que lo haga.

**Es además el primer trozo de la pantalla de errores** que quedó pendiente al
decidir que no hay devtools en release (§4). Nace pequeña y con un caso de uso
concreto, que es como debe nacer.
