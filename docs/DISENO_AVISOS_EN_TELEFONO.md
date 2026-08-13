# Avisos de comanda nueva en el teléfono — qué se puede y qué cuesta

**Pregunta de Chris (12-ago):** «¿cómo hacemos para que en los teléfonos salgan
las notificaciones? En la compu ya salen.»

**Respuesta corta:** sí se puede desde la red local, pero el precio es
**instalar un certificado en cada teléfono**, y eso es peor —más frágil y más
invasivo— que instalar una app. La recomendación es la app de Android con
Tauri. Abajo está el porqué, con lo que verifiqué.

---

## 1 · Por qué la compu sí y el teléfono no

No es el permiso. Es que en el teléfono **la API de notificaciones no existe**.

Los teléfonos entran por `http://192.168.x.x:3000`, servidos por la caja. Los
navegadores sólo habilitan las llamadas «poderosas» —notificaciones, service
workers, cámara, wake lock— en **contextos seguros**: HTTPS, o `localhost`. Una
IP de red local por HTTP **no** califica, en ningún navegador moderno. Como el
objeto `Notification` directamente no está, no hay permiso que denegar ni error
que leer: el fallo silencioso de siempre.

En la caja funciona porque ahí no es una web: es Tauri, con
`tauri-plugin-notification` hablando con Windows.

**Y hay un segundo muro, independiente del primero.** Aunque la LAN fuera
HTTPS, en Chrome de Android `new Notification(...)` **lanza excepción** —
«Illegal constructor»—. En móvil hay que pasar sí o sí por
`ServiceWorkerRegistration.showNotification()`, o sea que además del certificado
hace falta un **service worker registrado**. Y el service worker tiene su propia
exigencia: Chrome **se niega a registrarlo si el certificado no es de confianza**.
No basta con darle a «continuar de todos modos» en la advertencia roja.

El proyecto ya tiene service worker (`vite-plugin-pwa`, activo en la build web).
No es el que falta. Falta el certificado que lo deje registrarse.

## 2 · La opción «que funcione en la red local»

Es la que pediste primero, así que la miré en serio.

**Qué habría que hacer:**

1. Que el hub sirva **HTTPS** (axum + rustls) además de HTTP.
2. Que genere en el primer arranque una **autoridad certificadora propia** y un
   certificado para su IP o nombre.
3. Que **cada teléfono instale esa autoridad** como de confianza.

El paso 3 es el que la mata. En Android son siete pantallas de Ajustes, exige
que el teléfono **tenga PIN o huella configurada**, y termina con un aviso del
sistema del estilo «un tercero podría estar vigilando tu red», que en algunas
versiones se queda fijo. En iPhone son dos sitios distintos: instalar el perfil
y además activarlo a mano en *Ajustes → General → Información → Ajustes de
confianza de certificados*.

Ahora súmale la realidad del restaurante: **los teléfonos suelen ser de los
meseros**. Pedirle a alguien que instale una autoridad certificadora en su
teléfono personal —y que acepte esa advertencia— es pedir mucho, y hay que
repetirlo con cada persona que entra. Y si la caja cambia de IP (DHCP), el
certificado deja de cuadrar.

**Veredicto: técnicamente posible, operativamente peor que la alternativa.** No
lo descarto por difícil, lo descarto porque el trámite se repite por persona y
por aparato, y deja al usuario con una advertencia de seguridad permanente.

## 3 · La opción recomendada: app de Android con Tauri

Al ser app nativa **desaparece el problema de raíz**: no hay origen inseguro que
valga, no hace falta certificado, y `tauri-plugin-notification` —el mismo que ya
funciona en Windows— **también corre en Android**. Es un target más del mismo
código, no un proyecto aparte.

**Lo que hay que montar:** SDK y NDK de Android, Java, `tauri android init`, y
un APK firmado que se reparte a los teléfonos (sideload; no hace falta Play
Store). Instalar un APK es **un** interruptor —«permitir apps de esta fuente»—
contra las siete pantallas del certificado.

### La decisión de fondo que hay que tomar antes de escribir código

Hoy el teléfono **carga la app desde la caja**. Eso tiene una virtud que es fácil
no ver hasta que se pierde: **actualizas la caja y todos los teléfonos quedan
actualizados solos**. Un APK con los archivos dentro rompe eso — a partir de ahí
hay que repartir APKs cada vez, y aparece el problema clásico de tener la caja en
una versión y los teléfonos en otra, que en un sistema que sincroniza órdenes no
es cosmético.

Dos caminos, y conviene elegir a conciencia:

| | **Assets dentro del APK** | **APK como cascarón, carga desde la caja** |
|---|---|---|
| Actualizar | repartir APK cada vez | automático, como hoy |
| Funciona sin la caja prendida | sí | no (igual que hoy) |
| Riesgo | versiones desparejas | hay que **dar acceso IPC a un origen remoto**, y la IP cambia por restaurante |

El cascarón conserva lo bueno de hoy, pero significa autorizar a que una página
servida por la LAN llame a los plugins nativos. El servidor es nuestro, así que
no es descabellado — pero es una decisión de seguridad explícita, no un detalle
de configuración, y hay que resolver cómo se autoriza una IP que cambia en cada
local.

**Mi lectura:** empezar por el cascarón, porque perder la actualización
automática es un costo que se paga todos los días y el otro es un permiso que se
concede una vez y se documenta. Pero es tu decisión y quiero que la tomes con
esto delante.

### Una limitación que hay que decir por adelantado

`tauri-plugin-notification` hace notificaciones **locales**: las lanza la app,
y para eso **la app tiene que estar viva**. Si Android mata el proceso —o el
mesero la cierra deslizando— no llega nada. Para un aparato **dedicado** a
cocina o barra, apoyado en la barra con la app abierta, es exactamente lo que
hace falta. Para «me llega el aviso aunque tenga el teléfono guardado y la app
cerrada» haría falta **push de verdad** (FCM), que es servidor, cuentas de
Google y otro proyecto entero.

Como dijiste que lo que se necesita es **avisar de que llegó una comanda
nueva**, y quien tiene que enterarse es cocina o barra, el aparato dedicado es
el caso real y la limitación no estorba. Conviene tenerla escrita para no
descubrirla después.

## 4 · Mientras tanto, lo que el teléfono SÍ hace hoy

Esto ya funciona sobre `http`, sin tocar nada, porque **el audio no exige
contexto seguro**:

- **Suena.** El pitido sintetizado funciona igual en el teléfono.
- **Sale el cartel** en la pantalla, y no se va hasta que alguien vuelva a
  atender la ventana.

O sea: con la app abierta, el teléfono ya avisa. Lo único que falta es el aviso
**cuando están fuera de la app** — y ése es justo el que necesita la app nativa.

Si quieres que el interino sea más difícil de ignorar antes de meternos con
Android, lo barato y que funciona en `http` es **vibración** (`navigator.vibrate`,
Android sí, iPhone no) y **parpadear el título** de la pestaña. Medio día, y no
compromete nada de lo de arriba.

## 5 · Lo que hay que verificar cuando se haga

- [ ] El APK instala y arranca en un teléfono del restaurante.
- [ ] Con la app **en segundo plano**, llega una comanda → **sale la
      notificación de Android**.
- [ ] Con la app cerrada del todo → **no llega** (comportamiento esperado, no
      es un fallo: anotarlo para no perseguirlo).
- [ ] El teléfono **sigue imprimiendo** por el hub. Es lo que más fácilmente se
      rompe al cambiar de contenedor y lo que nadie prueba.
- [ ] El emparejamiento por QR sigue funcionando.
- [ ] Si se eligió el cascarón: actualizar la caja **actualiza el teléfono**.

---

## Apéndice · Por qué no se puede servir la app desde internet

Sería lo más barato —dominio con HTTPS de verdad, certificado válido, service
worker, notificaciones y PWA instalable, todo gratis— **y no sirve**: una página
servida por HTTPS **no puede llamar a `http://192.168.x.x:3000`**. El navegador
lo bloquea por contenido mixto. Y el teléfono necesita el hub para imprimir.

Anotado porque es la primera idea que a cualquiera se le ocurre, incluido yo, y
conviene que quede escrito por qué se descartó en vez de volver a proponerla
dentro de tres meses.

Nota relacionada: Chrome está metiendo además un **permiso propio para acceder a
la red local** desde una página web. Aunque resolviéramos lo del certificado,
sería una pieza más que se mueve bajo los pies. La app nativa queda fuera de esa
categoría.
