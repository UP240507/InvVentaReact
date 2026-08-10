# Pendientes manuales (dashboards, no hay forma de hacerlo por código)

Todo lo de esta lista está bloqueado por un panel de administración externo.
No es deuda técnica: es configuración que solo Chris puede hacer, y cada línea
dice qué pasa si no se hace.

> **Decisión de Chris (5-ago): esto se revisa TODO junto, casi al final.**
> No hace falta ir haciéndolos sobre la marcha; se van anotando aquí y se
> despachan en una sola sesión antes de lanzar. Este documento es la lista
> viva: cuando aparezca un pendiente manual nuevo, se añade aquí y no se
> interrumpe el trabajo por él.

## Índice rápido para esa sesión final

| # | Bloquea… | Minutos |
|---|----------|---------|
| S.1 | **Verificar** la recuperación de contraseña — pasos detallados abajo | 5 |
| S.2 | Nada: solo la imagen del correo | 10 |
| S.3 | Nada hoy; sube el listón de seguridad | 2 |
| S.4 | **Que se confirme el correo del dueño al registrarse** | 5 |
| S.5 | ⛔ **BLOQUEANTE de lanzamiento** — mitigado a mano mientras tanto | 30 |
| E.1 | Que el cliente cambie de plan o de tarjeta sin escribirte | 5 |
| E.2 | El IVA automático | 15 |
| E.3 | **El lanzamiento. Es el último paso, por definición.** | 30 |
| D.1 | Nada: son datos viejos, ya no se generan mal | 20 |

**La única con matiz: S.1.** No bloquea el lanzamiento *más adelante*, pero sí
impide **probar** el flujo de recuperación mientras tanto. O sea que el código
escrito el 29-jul se queda sin verificación en caliente hasta esa sesión final.
Es asumible —son 5 minutos y el motor tiene 34 aserciones—, pero conviene
saberlo: si algo falla ahí, se descubrirá tarde.

---

## Supabase — Authentication

| # | Qué | Dónde | Si no se hace |
|---|-----|-------|---------------|
| S.1 | **Redirect URLs** para el flujo de recuperación | Authentication → URL Configuration → Redirect URLs | Supabase manda el correo, el usuario pulsa el enlace y la redirección **falla**. El flujo entero queda inservible. |
| S.2 | **Plantilla del correo "Reset Password"** | Authentication → Email Templates | Llega el correo por defecto, en inglés y sin marca. Funciona, pero no parece de tu producto. |
| S.3 | **Leaked Password Protection** | Authentication → Settings | Se aceptan contraseñas ya filtradas en brechas conocidas. Es el único control de calidad de contraseña que de verdad aporta — la política del código solo exige longitud, a propósito. |
| S.4 | **Confirmación de correo del dueño** | Authentication → Providers → Email | Sin esto cualquiera se registra con un correo inventado y se queda sin forma de recuperar su cuenta. Ver abajo. |
| S.5 | **SMTP propio + dominio** ⛔ | Authentication → Emails → SMTP Settings | **Subió a bloqueante el 5-ago**, cuando se decidió confirmar el correo al registrarse: ahora un correo que no llega es un cliente que **no puede ni empezar el trial**. El SMTP por defecto de Supabase es de cortesía y va a unos pocos correos por hora; al pasar el límite no hay error visible, simplemente no llega nada. Hace falta proveedor propio (Resend, SendGrid) **antes de que se registre el primer cliente real**, no antes de cobrar.<br><br>**Mitigación acordada (Chris, 5-ago):** mientras tanto, las altas se hacen acompañadas —Chris exige al comprador un correo real en el momento de la venta— así que el volumen es de unas pocas al día y el SMTP de cortesía aguanta. Eso convierte S.5 en bloqueante de **lanzamiento abierto**, no de las primeras ventas.<br><br>**Lo que de verdad lo bloquea es un DOMINIO,** no elegir proveedor: sin dominio verificado, Resend solo envía a la dirección con la que se abrió la cuenta. Y el dominio hace falta igual para la landing (4.4) y para desplegar la app en web. |

### S.4 — Confirmación del correo del dueño

**Historia corta: aquí me equivoqué dos veces y la segunda la descubrió una
prueba real. Vale la pena que quede escrito.**

- *Primer intento:* «quita `email_confirm: true`». Incompleto — `admin.createUser`
  es API de administración y **no manda ningún correo**.
- *Segundo intento:* «quítalo, manda el correo desde el front y **desactiva**
  *Confirm email*, así se puede entrar sin confirmar y solo se bloquea el pago».
  **Falso.** Chris lo probó: con la opción desactivada, Supabase **sigue sin
  dejar iniciar sesión** a una cuenta sin confirmar. El estado intermedio que yo
  daba por hecho —"sin confirmar pero usable"— no existe de forma fiable en
  GoTrue.

**Decisión final (Chris, 5-ago): se confirma al registrarse.** Y hay un
argumento a favor que yo había pesado mal: **verificar al pagar es peor para el
usuario**. Con el candado en el checkout, quien se equivoca al teclear su correo
se entera *después de dos semanas* de haber cargado su menú y sus precios. Al
registrarse se entera en el minuto uno, sin nada invertido.

**Configuración:**

| Pieza | Dónde | Estado |
|---|---|---|
| *Confirm email* **ACTIVADO** | Authentication → Providers → Email | **Manual, tuyo** |
| Sin `email_confirm` al crear el dueño | `registrar-restaurante` | ✅ hecho |
| `auth.resend({type:'signup'})` tras el alta | `RegistroScreen` | ✅ hecho |
| Aviso "confirma tu correo" en el alta | `RegistroScreen` | ✅ hecho |
| Login distingue "sin confirmar" y ofrece reenvío | `LoginScreen` | ✅ hecho |
| Candado de pago (redundante, se queda) | `create-checkout` | ✅ hecho |

El candado del checkout ya no es la defensa principal —si nadie entra sin
confirmar, nadie llega ahí sin confirmar— pero se deja: no estorba y cubre
cuentas creadas por otras vías.

**Pasos:**

1. Dashboard → *Authentication* → *Providers* → *Email* → **activar**
   *Confirm email*. (Sí, es lo que ya habías hecho al principio.)
2. `supabase functions deploy registrar-restaurante`
3. `npm run build`

**Cómo comprobar que quedó bien**, con un correo real:

- Das de alta un restaurante → la pantalla dice claramente que confirmes, con tu
  correo a la vista.
- Llega el correo. Pulsas el enlace.
- Ya puedes iniciar sesión.
- Si intentas entrar ANTES de confirmar, el login **no** dice "contraseña
  incorrecta": dice que falta activar la cuenta y ofrece reenviar el correo.

**Si el correo no llega, es S.5 y ahora es bloqueante.** Sin correo no hay alta
posible: el cliente no puede ni empezar el trial.

### S.1 — Redirect URLs (paso a paso)

**Dónde:** Supabase → proyecto **Base de datos Azul** (`aorrfmxduefqwlrhfzzf`) →
*Authentication* → *URL Configuration*.

**Site URL:** `http://localhost:5173`
(Es el destino por defecto cuando no se manda `redirectTo`. Hoy no hay web
pública; cuando la haya, ésta pasa a ser el dominio de producción.)

**Redirect URLs — añade estas tres:**

```
http://localhost:5173/nueva-contrasena
http://192.168.*.*:3000/nueva-contrasena
http://10.*.*.*:3000/nueva-contrasena
```

**Por qué comodines y por qué así.** La caja recibe su IP por DHCP y cambia; con
la dirección exacta habría que reconfigurar el dashboard cada vez que el router
la rote. Supabase acepta comodines y **sus separadores son `.` y `/`**, así que
un `*` cubre un octeto y hacen falta dos. Se limita a los rangos privados
(`192.168.x.x` y `10.x.x.x`) y **al puerto y la ruta exactos**: no se usa `/**`,
que abriría cualquier ruta del hub como destino de redirección.

Las dos entradas de rango privado cubren la mayoría de routers domésticos y de
hotspot de teléfono. Si tu red usara `172.16–31.x.x`, añade también
`http://172.*.*.*:3000/nueva-contrasena`.

**Lo que NO hay que poner:** la dirección de la ventana de Tauri
(`tauri://localhost` o `http://tauri.localhost`). No existe fuera de la app, y
el código ya no la usa nunca — ver la nota de abajo.

### S.2 — Plantilla del correo (paso a paso)

**Dónde:** *Authentication* → *Emails* → plantilla **Reset Password**.

Lo mínimo que cambia la percepción: asunto en español y el nombre del producto.
El cuerpo debe conservar `{{ .ConfirmationURL }}` tal cual — es lo que Supabase
sustituye por el enlace real.

```
Asunto:  Recupera tu contraseña de InvVenta

Cuerpo:
<h2>Recupera tu contraseña</h2>
<p>Pediste crear una contraseña nueva para tu cuenta de InvVenta.</p>
<p><a href="{{ .ConfirmationURL }}">Crear contraseña nueva</a></p>
<p>El enlace caduca en una hora y solo se puede usar una vez.
   Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>
```

**Ojo con el enlace de un solo uso:** algunos antivirus y filtros corporativos
"pre-visitan" los enlaces de los correos para escanearlos, y eso **consume** el
enlace antes de que el usuario lo pulse. Si aparece "el enlace ya no sirve" sin
que nadie lo haya usado, ése es el sospechoso.

---

## Stripe

| # | Qué | Dónde | Si no se hace |
|---|-----|-------|---------------|
| E.1 | **Activar Customer Portal** | Settings → Billing → Customer portal | La EF `customer-portal` está desplegada y BillingScreen la llama, pero Stripe devuelve error: el cliente no puede cambiar de plan ni actualizar su tarjeta sin escribirte. |
| E.2 | **Stripe Tax** | Settings → Tax | El IVA no se calcula automáticamente. Habría que facturarlo a mano. |
| E.3 | **Repetir todo en LIVE mode** | Products, Webhooks, Secrets | Los 5 prices, el endpoint del webhook y los secrets están en **test mode**. En LIVE no existe nada: el primer cliente real que intente pagar no puede. **Es el último paso antes de lanzar.** |

---

## Datos, no configuración

| # | Qué | Por qué |
|---|-----|---------|
| D.1 | Revisar las **nóminas de julio** ya calculadas | El arreglo de UTC del 27-jul cambió `lib/Nominas.diasTrabajados`: antes contaba los días en UTC, así que un turno de noche caía en el día siguiente. Las nóminas calculadas **antes** del arreglo pueden tener días trabajados de más o de menos. El código ya está bien; lo que hay que revisar son las filas viejas. |

---

## Ajuste en el teléfono (Android)

| # | Qué | Por qué |
|---|-----|---------|
| A.1 | Al conectarte al wifi del local **sin internet**, Android pregunta algo como *«esta red no tiene acceso a internet, ¿mantener conexión?»*. Hay que decir **sí / mantener**. | Si se dice que no —o si el ajuste *«cambiar a datos móviles automáticamente»* está activo—, Android enruta TODO por la red celular. La IP de la caja (`192.168.x.x`) deja de ser alcanzable y cualquier impresión da **failed to fetch**, aunque el wifi aparezca conectado. No es un fallo de la app: el teléfono decidió irse por otra puerta. |

**Cómo distinguirlo en 5 segundos:** abre `http://LA-IP-DE-LA-CAJA:3000/hub/salud`
en el navegador del teléfono. Si responde un JSON, la red está bien y el
problema es de la app. Si no responde, es el enrutamiento del teléfono.

---

*Actualizado: 5-ago-2026.*
