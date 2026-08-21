# El CSP de la caja — escrito el 18-ago, **sin activar**

> **Estado: NO está puesto.** `tauri.conf.json` sigue con `"csp": null`.
> Activarlo es cambiar una línea, y va **después** de la ronda de papel de la
> 0.2.6 — decisión de Chris, 18-ago.
>
> **El porqué de esperar:** un CSP mal puesto no da un error legible. Bloquea
> una petición y la pantalla se queda a medias, o en blanco. Y sólo pasa **en el
> build instalado**: en `tauri dev` la política es otra. Meterlo en la misma
> versión en la que se verifican cinco cosas a la vez convierte un fallo
> localizable en tres síntomas mezclados, que es exactamente lo que
> `CHECKLIST_VERIFICACION.md` prohíbe en su primera línea.

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

| Directiva | Por qué |
|---|---|
| `script-src 'self'` | Tauri añade solo su nonce a los scripts que inyecta cuando hay CSP. No hace falta `'unsafe-inline'`. |
| `style-src 'unsafe-inline'` | Por el `<style>` del `index.html` **y** por los `style={{}}` de React, que cuentan como estilo en línea. Sin esto la app sale sin maquetar. |
| `img-src … https:` | `configuracion.logo_url` es una URL remota. `data:` y `blob:` por los iconos y cualquier imagen generada. |
| `font-src 'self' data:` | **Desde el 18-ago las cuatro familias se sirven del bundle**, así que aquí ya no hacen falta los dominios de Google. Antes de eso habrían tenido que entrar. |
| `connect-src ipc: http://ipc.localhost` | El puente IPC de Tauri en Windows. Sin esto **no funciona ni un comando `hub_*`**: ni imprimir, ni el cajón, ni el respaldo. Es el que más fácil se olvida y el que más ruido hace. |
| `connect-src http://localhost:* http://127.0.0.1:*` | Los endpoints del hub que la caja llama por HTTP y no por IPC: `configurarAncho`, `/dispositivos`, `/salud`. |
| `connect-src https://*.supabase.co wss://*.supabase.co` | REST **y** WebSocket. El `wss` es el realtime; sin él la app funciona pero deja de recibir ecos en vivo, y eso se nota tarde. |
| `object-src 'none'`, `frame-src 'none'` | No hay ni plugins ni iframes. Cerrarlos es gratis. |

## 3 · Cómo verificarlo, porque a ojo no se ve

**En un build instalado**, no en `tauri dev`. Y con la consola cerrada, que es
como lo va a tener el cliente. Si algo de esto falla, el CSP es el sospechoso:

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
