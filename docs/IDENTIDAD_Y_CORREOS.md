# Identidad: quién tiene correo, quién no, y por qué

*Decidido con Chris el 5-ago-2026. Este documento manda sobre el código; si
algo no coincide, es el código lo que está mal.*

---

## La pregunta que NO es

«¿Correo personal o correo de empresa?» suena a la pregunta correcta y no lo es
para este mercado. Un restaurante de barrio no tiene dominio propio ni buzones
corporativos: el dueño va a poner su Gmail y el gerente el suyo. Un `admin@`
con buena pinta que nadie abre es **peor** que un Gmail feo.

La pregunta real es: **¿es un buzón que esa persona puede abrir hoy?** De eso
depende que pueda recuperar su cuenta, y nada más importa.

---

## Las tres clases de identidad

| Clase | Correo | Cómo entra | Recuperación |
|---|---|---|---|
| **Dueño / tenant** | Real, suyo | `/login`, correo + contraseña | Enlace por correo |
| **Staff elevado** (gerente) | Real, suyo | `/login`, correo + contraseña | Enlace por correo |
| **Staff operativo** (mesero, cocina) | Sintético `emp.{id}@staff.invventa.app` | `/loginempleados`, código del restaurante + PIN | **Ninguna.** Un admin le cambia el PIN |

### Por qué el staff operativo lleva correo sintético

No es un atajo: es la decisión correcta. Un mesero no debería necesitar cuenta
de correo para fichar, y pedirle una crea tres problemas — el que no tiene, el
que da uno falso, y el que se va del trabajo y su buzón sigue siendo la llave.
El correo sintético existe solo porque Supabase Auth exige un identificador con
forma de correo; **no es un buzón y nunca se le manda nada**.

Consecuencia asumida y correcta: **si un mesero olvida su PIN, no hay
autoservicio.** Va con un administrador y se lo cambia. Es lo mismo que pasa
hoy con una caja registradora, y es lo que un dueño espera.

### Por qué el staff elevado sí lleva correo real

Ya está implementado y validado en la EF `crear-empleado-auth`: los roles con
el flag `elevado` **exigen** correo válido y contraseña ≥8. Entran por la misma
puerta que el dueño, así que necesitan el mismo camino de vuelta.

Una nota de la historia del proyecto que conviene no repetir: antes se creaban
con correo sintético y **nadie podía iniciar sesión**. Se corrigió en la v3 de
esa función.

---

## La regla del correo del dueño

**El correo del dueño es la única llave de su negocio.** No hay superadmin, no
hay segundo factor, no hay nadie a quien llamar dentro del sistema.

### Se verifica antes de PAGAR, no antes de probar

Decisión de Chris. El razonamiento:

- **Verificar al registrarse** metería un paso extra en el momento más frágil
  del embudo: alguien probando el producto por primera vez. La fase 1 costó
  bastante conseguir que un desconocido pudiera darse de alta sin fricción.
- **No verificar nunca** deja el peor escenario posible vivo: un cliente que
  **paga** y luego no puede entrar, sin buzón al que mandarle el rescate.

El punto medio es el checkout. Probar es gratis y sin fricción; cobrar exige un
correo real. Implementado en la Edge Function `create-checkout` —en el
servidor, no solo en la pantalla, porque el cliente nunca es la única barrera—
y devuelve `codigo: 'correo_sin_confirmar'` para que la UI pueda ofrecer el
reenvío.

### Lo que queda pendiente para que esto funcione de verdad

El registro crea al dueño con `email_confirm: true`, o sea que Supabase lo da
por confirmado **sin comprobar nada**. Mientras eso siga así, el candado del
checkout pasa siempre y no protege de nada. Ver **S.4** en
`docs/PENDIENTES_MANUALES.md`.

---

## Rescate: cuando el dueño se queda fuera de todos modos

Decisión de Chris: **procedimiento de soporte manual.** Sin código, sin
segundo admin obligatorio, sin códigos de recuperación en papel que se pierden.
Te convierte en el cuello de botella, y es aceptable mientras el número de
clientes sea pequeño.

### Runbook

1. **Verificar identidad antes de tocar nada.** Como mínimo: el **código del
   restaurante** (`AZUL-C172`), el nombre fiscal o RFC, y el importe del último
   cargo de Stripe. Quien pide el rescate tiene que saber cosas que solo sabe
   el dueño. *Cambiar un correo es entregar el negocio entero a quien lo pida.*
2. Supabase → *Authentication* → *Users* → buscar por el correo viejo.
3. Editar el correo por el nuevo, ya verificado con la persona.
4. Actualizar también la fila de `usuarios` de ese tenant (columna `email`), o
   quedarán desalineadas: Auth con uno y la tabla con otro.
5. Pedirle que use **¿Olvidaste tu contraseña?** con el correo nuevo. **No le
   pongas tú una contraseña**: acabaría viajando por WhatsApp.
6. Anotarlo en un registro de soporte: fecha, quién lo pidió, cómo se verificó.

**Cuándo dejar de hacer esto a mano:** en cuanto haya suficientes clientes para
que el rescate deje de ser excepcional. Ahí toca reabrir la decisión — segundo
admin, o verificación en el alta.

---

## Qué NO hacer, y por qué

- **No pedir correo a los meseros.** Ver arriba: crea más problemas de los que
  resuelve.
- **No fabricar correos con dominios que parezcan reales** (`admin@invventa.com`).
  Un correo sintético debe *parecer* sintético — por eso `@staff.invventa.app`
  con el prefijo `emp.`. Si parece real, alguien intentará mandarle algo.
- **No poner al dueño y al gerente el mismo correo.** Funciona hasta que uno de
  los dos se va, y entonces el que se queda no puede recuperar su cuenta.
- **No resolver el olvido de contraseña poniendo una tú.** Acaba en un chat.

---

*Actualizado: 5-ago-2026.*
