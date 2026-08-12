# Roadmap al 100% — InvVenta (sin CFDI/facturación)

> **Definición de 100%:** producto SaaS vendible e instalable — un restaurante ajeno a AZUL
> puede darse de alta, pagar un plan, operar offline en Tauri e imprimir comandas,
> sin intervención manual de Chris. El timbrado CFDI queda explícitamente fuera
> de este roadmap (Facturama se integra después; `Fiscal.js` no se toca).
>
> Punto de partida: **~70%** (19-jul-2026). Cada fase indica el avance que aporta.

---

## DÓNDE ESTAMOS — ~96% (6-ago-2026)

| Fase                                       | Aporta      | Estado                                        |
| ------------------------------------------ | ----------- | --------------------------------------------- |
| 0 · Seguridad y deuda                      | 70 → 74     | ✅ completada (24-jul)                        |
| 1 · Monetización                           | 74 → 84     | ✅ completada (25-jul)                        |
| 2 · Proyecto D (rediseño)                  | 84 → 92     | ✅ completada (27-jul) — los 6 ítems cerrados |
| 2.5 · Gastos y costos fijos                | intercalada | ✅ cerrada (26-jul)                           |
| 3 · Caja-hub, impresión, multi-dispositivo | 92 → 98     | 🔨 ~⅔ — ver abajo                             |
| 4 · Hardening y lanzamiento                | 98 → 100    | ⬜ sin empezar                                |

**El número importa menos que la naturaleza de lo que queda.** El 96 % se
alcanzó escribiendo código; el 4 % restante **no se puede escribir desde el
editor**: es hardware, distribución y un segundo inquilino de verdad. Es la
parte que no admite atajos y la que suele tardar más de lo que aparenta.

### Lo que falta, en concreto

**Fase 3 — lo que queda (por orden de riesgo):**

| Ítem                                | Qué falta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Riesgo                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Impresión en papel**              | **✅ CERRADO 11-ago.** Primera impresión en una TM-T20II real: los cuatro documentos —prueba, cuenta, ticket y comanda— salen correctos a **48 columnas**. El ancho pasó de constante fija a configurable por impresora (`ConfigHub.ancho_papel`, selector en Ajustes → Hub, 32 para 58 mm y 48 para 80 mm). Quedó comprobado lo que sólo se podía comprobar en papel: tabla de caracteres, corte y ancho. El driver es **APD v5.13** y su asistente viene con `Port Type = COM` por defecto, que con una USB crea una cola muerta — documentado en `docs/CHECKLIST_IMPRESORA.md` porque se repetirá en cada instalación. | —                                                                                                                                                                                                    |
| **3.12 Shell desktop**              | El instalador NSIS **ya se genera y se probó (11-ago)**. Falta el **auto-updater**. La **firma de código se descarta** — decisión de Chris, 11-ago: ver 3.12 abajo.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **Medio** — ya no hay nada con plazo ajeno.                                                                                                                                                          |
| **3.4 / 3.5 — encolado por el hub** | **No existen.** El hub sólo imprime y empareja: no hay endpoint de encolado ni worker que drene a Supabase. Hoy cada dispositivo guarda en su propio Dexie y sincroniza cuando ÉL tiene internet.                                                                                                                                                                                                                                                                                                                                                                                                                         | **Medio** — funciona, pero si a un teléfono se le acaba la batería o se le limpia el navegador antes de que vuelva la red, esas ventas se pierden. Con la cola en la caja estarían a salvo en disco. |
| **3.3 mDNS**                        | Si el router rota la IP por DHCP hay que reescanear el QR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Bajo** — se mitiga fijando la IP en el router.                                                                                                                                                     |
| **3.10 responsive**                 | Métricas/Dashboard y las reglas globales del ERP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Bajo** — todo lo demás de operación está cerrado.                                                                                                                                                  |
| **3.6 relay KDS**                   | Declarado **v2**, fuera del lanzamiento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                    |

**Fase 4 — sin empezar (4.1 a 4.4):** QA con un segundo inquilino real, E2E
ampliado, telemetría y runbook, y la landing con instalador descargable.

### Deuda viva que no cuelga de ninguna fase

- **El `id` de la venta** sigue siendo `Date.now()` pisando la secuencia de
  Postgres. Dos dispositivos en el mismo milisegundo colisionan en la PK.
- **Sin `UNIQUE` en `folio`** (decisión consciente de Chris, 6-ago).
- **`sinPersistencia()`** escrita y sin cablear.
- **Datos fiscales del emisor sin capturar** en Configuración.
- **La identidad visual sin decidir**: tres sistemas en circulación, tabla en
  `docs/MOCKUPS_RESPONSIVE.md`.

### Cómo se llegó aquí desde el 5-ago

La fase 3 estaba «validada salvo el papel». Al mirar el papel de verdad —contra
un ticket real de Soft Restaurant— apareció que **el papel no estaba tan cerca
como parecía**: faltaba la pre-cuenta entera, el folio colisionaba, y el nombre
del emisor decía «InvVenta». Nada de eso daba error; se encontró comparando.

Esa es la razón de que el 4 % restante no se pueda estimar a la ligera: lo que
queda es justo el tipo de trabajo donde aparecen cosas así.

---

## Fase 0 — Seguridad y deuda pendiente · 70% → 74% · ✅ COMPLETADA (24-jul)

| #   | Ítem                    | Estado                                                                                                                                                                                        |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Rate-limit `login-pin`  | ✅ Ya estaba vivo (EF v9): tabla `login_intentos` con índices (ip, created_at), ventana 15 min, 10 fallos/IP → 429, reset al éxito, poda inline sin cron. Verificado contra la EF desplegada. |
| 0.2 | Limpieza auth huérfanos | ✅ `auth.users` sin rastro de `@stockcentral.com` — limpiado en sesión previa.                                                                                                                |
| 0.3 | Fuentes self-hosted     | ✅ @fontsource en package.json, importadas en `main.jsx`, `node_modules/@fontsource` presente.                                                                                                |
| 0.4 | Contraste AA            | ✅ `--adm-muted` oscurecido en los 3 temas claros: terracota #6a645a, vino #6c6360, fénix #6e655b (~5.2:1 sobre crema; antes ~4.1, fallaba AA).                                               |

**Advisors (24-jul):** RPCs `SECURITY DEFINER` (decrementar_stock, canjear_puntos,
registrar_visita_cliente) verificadas — validan tenant internamente y rechazan anon:
WARN aceptado por diseño. `login_intentos` RLS sin políticas = deny-all intencional
(solo la EF con service role escribe). **Pendiente manual (dashboard):** activar
Leaked Password Protection en Auth → Settings (no accesible vía SQL/MCP).

---

## Fase 1 — Monetización · 74% → 84% ★ bloqueante de venta · ✅ COMPLETADA (25-jul)

Sin esto no hay producto, solo una app. Es la fase de mayor valor por hora invertida.

**Entregado (25-jul):** catálogo `planes`/`addons` + `suscripciones` extendida
(migración 20260725170733) · `usePlan`/`derivarPlan` + gates (SuscripcionRoute,
ModuloRoute, sidebar, alta de empleados client+EF) · Stripe test mode: 5 prices,
EFs `create-checkout`, `stripe-webhook` (firma verificada, candado Fundador≤10),
`customer-portal` · Billing/Paywall editoriales conectados · onboarding
self-service: EF `registrar-restaurante` (tenant completo + trial 14d, throttle
3/IP/día, rollback) + `RegistroScreen` (/registro, código corto con copiar).
**Prueba en caliente:** checkout Empresarial completado end-to-end; webhook
escribió la fila real. **Pendientes menores:** activar Customer Portal en el
dashboard de Stripe (Settings → Billing → Customer portal) · Stripe Tax para IVA
automático · repetir alta de products/prices + webhook + secrets en LIVE mode al
lanzar.

**Cerrado el 29-jul: recuperación de contraseña.** Era el último pendiente de
esta fase y el único que rompía la promesa del self-service — un dueño que
olvidaba su contraseña no tenía a quién llamar, porque la premisa es que no
tiene que llamar a nadie. El link "¿Olvidaste tu contraseña?" se había quitado
del login precisamente porque el flujo no existía; ya está de vuelta.

`lib/Recuperacion.js` (puro, **34 aserciones**) + `/recuperar` y
`/nueva-contrasena`, públicas y fuera de todo guard: quien llega no tiene sesión
—es el problema— y un guard cortaría el único camino de vuelta.

Tres decisiones que el flujo obliga a tomar y que no avisan cuando se toman mal:

1. **No se filtra si la cuenta existe.** El mensaje es idéntico exista el correo
   o no ("si X tiene una cuenta, le llegará…"), y sólo se muestran como error
   los fallos que el usuario puede resolver: sin conexión y límite de envíos. Un
   "ese correo no existe" convierte la pantalla en una herramienta para
   averiguar qué correos están dados de alta. Hay una aserción que compara los
   dos mensajes carácter por carácter.
2. **El token llega en el FRAGMENTO** (`#access_token=…`), que `searchParams` no
   ve, y un enlace caducado llega como `#error=…` en la propia URL y no como
   fallo de red. Sin detectar lo segundo, la pantalla esperaría para siempre una
   sesión que no va a existir. `leerEnlace` cubre implícito, PKCE y error.
3. **Salir a medias cierra la sesión.** El enlace ABRE sesión al procesarse; si
   alguien abandona sin cambiar la contraseña, en la caja compartida de un
   restaurante quedaría una cuenta abierta. Peor que el problema original.

**Bug real que salió de las pruebas:** en `mensajeDeError`, la rama genérica de
`password` atrapaba el caso "misma contraseña que la anterior" —cuyo mensaje de
Supabase contiene la palabra "password"—, así que quien reteclaba su contraseña
vieja leía "prueba con otra más larga", que no era el problema. Corregido el
orden y fijado con una prueba.

**Pendiente manual (S.1 y S.2):** las Redirect URLs de `/nueva-contrasena` y la
plantilla del correo. Anotados en `docs/PENDIENTES_MANUALES.md`; **por decisión
de Chris (5-ago) todos los pendientes de dashboard se despachan juntos en una
sola sesión antes de lanzar**, no sobre la marcha. Consecuencia asumida: este
flujo no se puede probar en caliente hasta entonces.

| #   | Ítem                    | Detalle                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Diseño de tiers         | 3 planes ~399/549/699 MXN/mes. Ejes de límite: dispositivos activos, empleados, y módulos premium (CRM/lealtad, reportes avanzados, multi-sucursal; CFDI se lista como "próximamente").                                                                                                                                                                                           |
| 1.2 | Modelo de datos         | Tablas `planes` (catálogo, límites en JSONB) y `suscripciones` (tenant, plan, estado, trial_hasta, periodo). Migración + RLS. Estado calculado: `trial / activa / morosa / suspendida`.                                                                                                                                                                                           |
| 1.3 | Enforcement             | Fuente única: hook `usePlan()` sobre configuración+suscripción cacheada en Dexie (offline no puede apagar el POS: gracia de N días sin validar). Gates: alta de empleado/dispositivo bloquea al llegar al límite; módulos premium ocultan ruta + candado en sidebar. Server-side: checks en EF de alta de staff y registro de dispositivo (el cliente nunca es la única barrera). |
| 1.4 | Pasarela de pago        | Decisión: Stripe (soporta MXN, suscripciones nativas, webhooks) vs Mercado Pago (más familiar al mercado local). Webhook → EF actualiza `suscripciones.estado`.                                                                                                                                                                                                                   |
| 1.5 | Billing/Paywall reales  | Rediseño con tokens `adm-*`: BillingScreen (plan actual, uso vs límites, historial, cambio de plan) y PaywallScreen (upgrade contextual: "llegaste al límite de X").                                                                                                                                                                                                              |
| 1.6 | Onboarding self-service | Alta de restaurante → genera código corto (`AZUL-C172` pattern) → trial 14 días → wizard mínimo (nombre, logo, primer admin, primera mesa/producto).                                                                                                                                                                                                                              |

**Salida:** un desconocido paga y opera sin tocarte la puerta.

---

## Fase 2 — Proyecto D: rediseño completo · 84% → 92% · ✅ COMPLETADA (27-jul)

Continúa el plan de tandas ya aprobado (login ✅, tanda 1 ✅, tanda 2 parcial).

| #   | Ítem                                                      | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Tanda 2 restante                                          | ✅ 25-jul. Sidebar colapsable 208↔56 (`Ctrl+B`, persistido), Topbar con búsqueda global (motor puro `lib/BuscadorGlobal`, offline, filtrado por permisos + plan) y primitivas `adm-*` (`components/ui`). Pilotos: Auditoría y Proveedores. El re-skin del resto del interior se hace en 2.4 con el patrón ya probado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2.2 | Tanda 3: atajos                                           | ✅ 25-jul. `lib/Atajos.js` (registro central, precedencia por montaje, guard de inputs) + `useAtajos` + `HintsAtajos`. **El teclado es para la operación, no para navegar** (decisión de Chris): fuera los `Ctrl+1..9`; globales solo `Ctrl+K` (palette con búsqueda y acciones, filtradas por rol y plan), `Ctrl+B`, `Ctrl+Shift+L`, `F1` (ayuda del registro vivo). Scopes operativos: **POS** `F9`/`F2`/`F4`/`+−`/`Esc` · **KDS** `1..9` + `←/→` · **Mesas** flechas + `Enter`/`R`/`T`/`J`/`E` (con selección de teclado nueva). Falta: tablas admin en 2.4.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.3 | Tanda 4: pilotos                                          | ✅ 25-jul. Dashboard editorial (`lib/Metricas.js` + `lib/Alertas.js`, puros y testeados: periodos con comparativa a la misma altura, P&L con costo real por receta y respaldo %, alertas accionables con gate de rol) + Mesas con `InspectorMesa` industrial. **Se reparó un bug que venía de origen**: el Dashboard leía `ordenes`, colección inexistente → todas las métricas en cero. Híbrido validado en ambas superficies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.4 | Tanda 5: resto por grupos                                 | **✅ 25-jul — COMPLETA.** Color, forma y estructura en toda la app. Operación con `Ops.jsx` + tokens `--ops-*` por tema; admin con `adm-*` y las primitivas (`PageShell`/`PageHeader`/`DataTable` con atajos de tabla). **19 pantallas con primitivas**, 3 con layout propio justificado (POS/KDS/Mesas) y 7 de fase 1 que no lo necesitan. Radio unificado en 773 sitios; 252 pares de contraste ≥ AA (incluidos **10 que ya fallaban** de antes); cero colores literales salvo 3 excepciones documentadas. **Bugs reales corregidos de paso**: inputs de CFDI que perdían el foco al escribir, superficie mezclada en checador/login de empleados, y el `ordenes` inexistente del Dashboard (tanda 4). ESLint 60 → 35 errores, todos preexistentes.                                                                                                                                                                                                                                       |
| 2.5 | Tanda 6: pulido                                           | ✅ 27-jul. **Estados vacíos**: la auditoría encontró que casi todas las pantallas ya los tenían; el hueco real era **Mesas**, que con la lista vacía no pintaba nada. Se añadieron **dos** vacíos distintos —"aún no hay mesas" (con acción para crear la primera) y "sin mesas en esta área" (con acción para quitar el filtro)—, porque "no hay nada" y "tu filtro no encontró nada" son problemas distintos y un mensaje único obliga a adivinar cuál es. **Transiciones**: escala de tres velocidades con intención (`--dur-rapida` 120ms para hover y focus · `--dur-media` 250ms para cambios de layout · `--dur-lenta` 400ms para cambio de tema), 70 duraciones sueltas migradas y `--default-transition-duration` anclado, lo que mete dentro de la escala las ~470 transiciones sin duración explícita. **AA**: el verificador dejó de ser ad-hoc y vive en `scripts/verificar-contraste.mjs` (`npm run contraste`) — 234 pares en 6 combinaciones de tema × modo, todos cumplen. |
| 2.6 | **Reorganizar los tabs de Configuración** (Chris, 25-jul) | ✅ 27-jul. El tab **Tickets** cargaba tres dominios: el ticket, la **jornada laboral** (RH) y **puntos + recompensas** (CRM), este último cortándose porque un formulario de cuatro controles en línea no cabe en media columna al lado de la vista previa. Ahora son tres tabs, y el criterio no es cuánto ocupa cada uno sino **qué pregunta responde**: _Tickets_ → cómo se ve lo que imprimo · _Personal_ → qué reglas rigen a mi equipo (jornada + roles sin propina) · _Lealtad_ → cómo premio a mis clientes. Lealtad se gatea con `tieneModulo('lealtad')`, igual que `/clientes` en el menú: es el add-on que se vende aparte, así que se comporta como módulo y no como ajuste. La visibilidad se **deriva** del plan (no se guarda en estado), así que al contratarlo el tab aparece sin recargar.                                                                                                                                                                               |

**Salida:** las 24 pantallas en el sistema híbrido; cero paleta vieja en admin.

**FASE 2 CERRADA · 27-jul.** Verificación de cierre: 191 aserciones de librería en verde,
ESLint en **35 errores / 2 warnings** (todos preexistentes; la línea base al empezar era 60)
y `npm run contraste` sin fallos. La `title bar` nativa de Tauri, que figuraba aquí, se
mueve a la **fase 3**: es shell de escritorio, no rediseño.

**Las dos decisiones que quedaban se resolvieron (Chris las delegó, 27-jul):**

1. **Borde de los controles → token aparte, no subir el existente.** `--adm-border` hacía
   dos trabajos con un solo valor: separar tarjetas —decoración, que WCAG 1.4.11 no exige—
   y dibujar el contorno de inputs, que sí es un componente de interfaz y pide 3:1. Estaba
   en ~1.3:1. Ahora existen **`--adm-field` y `--ops-field`**, calculados por tema para
   quedar en ~3.3:1 contra el fondo más desfavorable de cada bloque, y aplicados a los
   **100 controles** de la app (`<input>`, `<select>`, `<textarea>` y la clase compartida
   de las primitivas). El separador se queda como estaba: subirlo habría convertido la
   interfaz en una rejilla de líneas pesadas. El verificador comprueba los dos por
   separado — el de control es obligatorio, el separador es un aviso informado.
2. **Prettier → se adopta, con configuración explícita.** El estado intermedio era el
   peor: sin `.prettierrc`, la herramienta usaba comillas dobles y el repo usa simples,
   así que cada pasada generaba ruido. Hay `.prettierrc.json` (`singleQuote: true`, que es
   el estilo real del código), `.prettierignore` —que **excluye `EscritorioTest.jsx` y
   `AppLayout.jsx`**, reservadas por Chris— y los scripts `format` / `format:check`. El
   `src` completo quedó formateado de una vez: a partir de aquí los diffs son de contenido,
   no de estilo.

**Verificación de las dos:** `npm run contraste` con 264 pares y cero fallos (antes 234:
los 30 nuevos son los de control), `npm run format:check` limpio, ESLint sin moverse de
35/2 y las 191 aserciones en verde.

---

## Descuento por producto ✅ (Chris, 25-jul)

Faltaba el tercer modo de descuento: además del de TICKET (% y $), ahora existe
el de **producto**, sobre una línea del carrito, con tres modos: porcentaje,
monto fijo y **cortesía**.

- `lib/Fiscal.js` — `importeDeLinea()` nuevo y `calcularVenta()` extendido.
  **Cascada**: la línea se descuenta primero y su resultado es el importe real;
  el descuento de ticket se aplica después, sobre lo que quedó. Al revés, el %
  de ticket se calcularía sobre dinero que el cliente nunca iba a pagar.
  Un descuento **nunca** deja la línea en negativo. 23 aserciones.
- `lib/Descuentos.js` — regla ÚNICA de autorización para los dos descuentos
  (misma capacidad `autoriza_descuentos`, mismo pinpad). Vive fuera de los
  componentes porque duplicarla es la forma más fácil de que una de las dos
  puertas quede más floja, y las dos dan al mismo cajón. 14 aserciones, entre
  ellas: **un PIN vacío en la ficha de un empleado no autoriza a nadie**.
- **Cortesía es un modo aparte, no un "100%"**: en auditoría un 100% parece un
  error de dedo; "Cortesía" es una decisión.
- Propagado a comanda, ticket impreso (muestra neto + descuento concedido),
  venta y **P&L** — sin esto último el margen se inflaría justo en los platillos
  regalados: el costo se paga igual, el ingreso no entra.
- Cada descuento queda en auditoría con producto, importe y quién autorizó.
- **Limitación conocida**: el descuento aplica a la LÍNEA completa. Para
  regalar 1 de 3 unidades hay que separar la línea o usar el monto equivalente.

---

## Fase 2.5 — Gastos y costos fijos ★ ENTRA ANTES DEL LANZAMIENTO (Chris, 25-jul)

Detectado por Chris (25-jul): **falta la pantalla de gastos** — luz, agua, internet, renta,
sueldos, mantenimiento. Hoy el sistema solo conoce el costo de los INSUMOS.

**Por qué no es solo una pantalla más:** `lib/Metricas.calcularPyL` calcula hoy el
**margen bruto** (ventas − costo de insumos) y el Dashboard lo rotula así, correctamente.
Con gastos capturados, ese mismo motor puede dar **utilidad neta**, que es la cifra por la
que un dueño de restaurante decide si abre mañana. Es la diferencia entre "cuánto me deja
cada platillo" y "gané o perdí este mes".

| #   | Ítem                   | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G.1 | Modelo de datos        | ✅ 26-jul. Migración `20260726235337`: `gastos`, `categorias_gasto` (fijo/variable, semilla de 7) y `gastos_recurrentes`, con RLS por tenant. Índice único `gastos_origen_unico (restaurante_id, origen, origen_ref) where origen <> 'manual'` — la BD, no la UI, es la que impide el duplicado. `dia_del_mes` topado en **28**: un recurrente el día 30 se saltaría febrero.                                                                                                                                                                       |
| G.2 | Recurrencia            | ✅ 26-jul. `generarRecurrentes()` es **idempotente** por `ultima_generacion` + `origen_ref = ${id}:${YYYY-MM}`. El generado nace **pendiente**: el recibo de luz varía cada mes, así que la plantilla propone el monto y el dueño confirma el real. Un pendiente **no** entra en la utilidad. Panel de plantillas con alta, edición, **pausa/reanudación** y borrado. La generación se dispara al entrar y al cerrar el panel —nunca en un intervalo de fondo—, porque un gasto que aparece solo es un gasto que el dueño no recuerda haber creado. |
| G.3 | Pantalla               | ✅ 26-jul. `features/gastos/GastosScreen.jsx`, superficie admin, gate `gestion`, ruta `/gastos` en "Compras y Almacén". Los tres orígenes se tratan distinto: `manual` editable, `recurrente` a confirmar, **`nomina` de solo lectura** (candado; se corrige en Nóminas, que es su fuente).                                                                                                                                                                                                                                                         |
| G.4 | Enganche con el P&L    | ✅ 26-jul. `calcularPyL` devuelve `utilidadNeta`, `gastosFijos`/`gastosVariables`, `gastosPendientes`, `gastosPorCategoria` y la bandera **`hayGastos`**: sin gastos capturados la utilidad sería idéntica al margen bruto —justo la confusión que esta fase venía a arreglar—, así que el Dashboard sigue rotulando "Margen bruto" y ofrece el enlace a `/gastos`. La utilidad neta **puede ser negativa y se muestra tal cual**; acotarla a cero sería maquillar un mes malo.                                                                     |
| G.5 | Nómina: ¿doble conteo? | ✅ 26-jul. Resuelto con **tres capas**: (1) `gastosDeNomina()` deriva de `nominas` usando **`total_sueldos`, nunca `gran_total`** —éste incluye propinas, que no son dinero del negocio—; (2) `gastosConsolidados()` descarta cualquier fila manual con `origen === 'nomina'`; (3) el índice único de G.1. La nómina no se captura a mano: se refleja.                                                                                                                                                                                              |

**Cerrado el 26-jul.** Suite completa de `lib/` en verde: **146 aserciones** (Gastos 25,
Métricas 27, Fiscal 23, Descuentos 14, Atajos 21, BuscadorGlobal 13, Alertas 14,
Acciones 9). `npm test` y `npm run build` verificados por Chris. ESLint sobre `src` sigue
en **35 errores / 2 warnings**, todos preexistentes: la fase no metió deuda.

Tres reglas del panel de plantillas quedaron **fijadas con pruebas**, porque son las que
al fallar duplican dinero sin avisar: pausar y reanudar dentro del mismo mes no regenera
el gasto; el día 28 sí cae en febrero (de ahí el tope); y una plantilla dada de alta a
mitad de mes con el día ya vencido genera de inmediato en vez de esperar al siguiente.

### Prueba en caliente (Chris, 26-jul) — dos fallos reales

**1. Los gastos se guardaban bien pero no se veían.** Causa: `new Date().toISOString()`
devuelve la fecha en **UTC**. En México (UTC-6), a partir de las 18:00 locales el reloj UTC
ya está en el día siguiente, así que un gasto capturado a las 23:20 del 26 se sellaba con
fecha del **27** — mañana. El filtro del periodo compara contra `ahora`, y mañana todavía
no ha llegado: el gasto entraba a Supabase y desaparecía de la pantalla.

No era un fallo de Gastos sino un patrón repetido en **9 sitios**. Los tres que dolían de
verdad son de operación nocturna, que es cuando trabaja un restaurante:

- **Propinero** abría por defecto en el día de mañana → el bote de la noche salía vacío.
- **Reloj checador** registraba las entradas del turno de noche en el día siguiente, así
  que entrada y salida no se emparejaban.
- **Auditoría** con el filtro "Hoy" salía en blanco toda la tarde.

Se corrige con `lib/Fechas.js` (17 aserciones): una fecha de calendario —a qué día de
trabajo pertenece algo— no tiene zona horaria y no puede depender del huso de Greenwich.
De paso se arregló `lib/Nominas.diasTrabajados`, cuyo comentario decía "fecha local" y
cuyo código usaba UTC: **esto cambia días trabajados en nóminas, conviene revisarlo.**

**2. El contador de errores de sincronización no llevaba a ningún lado.** La alerta crítica
del Dashboard decía "N cambios sin sincronizar · Diagnosticar" y abría Auditoría, que no
mostraba nada. El store ya exponía `listarDeadLetter` / `reencolar` / `descartar` desde
hacía tiempo, pero no existía la pantalla. Un número que informa de una pérdida sin decir
cuál ni permitir arreglarla es peor que no mostrarlo. Ahora `PanelDeadLetter` lista cada
tarea muerta con su tabla, motivo, error y payload, y ofrece **reintentar** (para fallos ya
corregidos) o **descartar** (que reconoce la pérdida, no la repara — y lo dice).

**3. Lo que el panel destapó en cuanto existió.** Las dos tareas muertas no eran de gastos:
eran **recetas**, con `Could not find the '_costo' column of 'recetas'` (PGRST204). La tabla
de Recetas decora cada fila con `_costo`, `_precio` y `_margen` para poder ordenar por
rentabilidad, y al ocultar un platillo se hacía `{ ...fila, activo: false }`: los campos
calculados viajaban al upsert y PostgREST rechazaba la fila entera. La pantalla decía
"ocultado", el cambio quedaba en el equipo, y solo faltaba en la nube.

La regla no se puso en la pantalla sino en `enqueueAction`, que es la **única puerta a la
base**: `lib/Payload.sinCamposDerivados()` quita las claves `_algo` del nivel superior
(9 aserciones). Cualquier vista puede decorar una fila para mostrarla; ninguna debería
tener que acordarse de desnudarla al guardar. Dos detalles deliberados:

- **Solo el nivel superior.** Dentro de un `jsonb` —los insumos de una receta— un `_` es
  contenido del usuario. Bajar recursivamente borraría datos buenos.
- **`enqueueRpc` queda fuera.** Los parámetros de una función de Postgres sí suelen
  llamarse `_algo`; sanearlos rompería la llamada.
- **`reencolarDeadLetter` también sanea.** Las tareas muertas se guardaron antes de que
  existiera el filtro: sin esto, "Reintentar" fallaría igual y el botón no serviría.

Verificado contra el esquema: **ninguna** columna de `public` empieza por `_`, así que el
filtro no puede borrar un dato real.

### Cierre de la prueba en caliente (28-jul) — lado servidor verificado, dos hallazgos más

**Lo verificado contra la BD real (siempre con transacciones que revierten, cero basura):**
el índice único `gastos_origen_unico` bloquea el duplicado en la práctica (23505, nada
persistió); los CHECKs están todos vivos (estado, origen, montos ≥ 0, `dia_del_mes` 1–28);
RLS activa en las tres tablas con políticas por tenant; el esquema coincide 1:1 con el
payload que arma la pantalla; y las nóminas reales de julio traen el caso que importa —
`total_sueldos` 300 vs `gran_total` 326.24 (propinas): el P&L debe reflejar 300, y ésa es
exactamente la regla 1 de `lib/Gastos.js`.

**Hallazgo 1 (bug real): editar un gasto recurrente lo reclasificaba como `manual`.**
`guardar()` fijaba `origen: 'manual'` y `estado: 'pagado'` sin mirar la fila original y
omitía `origen_ref`. Tres consecuencias, todas de la clase que esta fase persigue: (a) la
fila salía de la protección del índice único —que es parcial, solo cubre
`origen <> 'manual'`—, así que una plantilla que perdiera `ultima_generacion` regeneraría
y **las dos capas anti-duplicado quedaban desactivadas por una edición**; (b) el estado
local perdía `origen_ref` mientras la nube lo conservaba (el upsert parcial no toca
columnas ausentes) — local y nube divergiendo, la clase de fallo del caso `_costo`; (c) un
PENDIENTE editado se volvía `pagado` sin pasar por "Confirmar importe": entraba a la
utilidad por la puerta de atrás. Corregido con el patrón que ya usaba `guardarPlantilla`:
spread de la fila anterior + formulario encima, preservando `origen`/`origen_ref`/`estado`.
Editar corrige datos; no confirma ni reclasifica.

**Hallazgo 2 (menor): ids por `Date.now() + azar` podían chocar.** Dos plantillas
generando en el mismo milisegundo podían recibir el mismo id, y con la PK igual el segundo
upsert PISA al primero en silencio — un gasto desaparecido, no un error. Ahora es base +
índice del bucle.

**Datos corregidos (con OK de Chris):** los dos gastos capturados la noche del 26 antes
del fix de UTC ("Pago de luz" $350 y "mercado" $20) quedaron sellados con fecha del 27;
se movieron al 26 con UPDATE directo. Si el equipo local aún los muestra en el 27, es la
copia de Dexie pre-corrección: se alinea al siguiente resync.

**Pendiente que se queda anotado, no bloquea:** `generarPendientes()` corre al montar la
pantalla; si Dexie aún no terminó de arrancar ve la lista vacía y no genera — se
autocorrige en la siguiente visita. Y la suite completa (`npm test`, `npm run build`)
debe correrse en Windows: los `node_modules` del repo son de esa plataforma. ESLint y
Prettier sobre lo tocado: limpios.

**Decisión (Chris, 25-jul): ENTRA ANTES DEL LANZAMIENTO.** Razón textual: _"no quiero
lanzar algo que falle más de lo que ayude"_. El criterio es de producto, no de alcance —
un dueño que ve "margen bruto" y cree estar viendo su utilidad toma decisiones con una
cifra incompleta, y eso es peor que no darle la cifra. Consecuencias:

- El camino crítico pasa a ser **0 → 1 → 2.5 → 3 → 4**.
- Mientras G.4 no exista, el Dashboard debe seguir rotulando **"Margen bruto"** y nunca
  "utilidad": la etiqueta actual es correcta y no se toca hasta que haya gastos.
  _(Resuelto: hoy lo decide la bandera `hayGastos`, no un supuesto.)_
- G.5 (doble conteo con Nóminas) deja de ser un "cuidado" y pasa a ser **bloqueante**: si
  la nómina se cuenta dos veces, la utilidad neta miente, y una cifra que miente es
  exactamente lo que Chris quiere evitar al lanzar.

**Nota de diseño que sobrevive a la fase:** los gastos, como los descuentos, se defienden
en **tres capas** — la UI, el motor puro y una restricción en la BD. Una sola capa parece
suficiente hasta que alguien escribe por API, importa un CSV o corre una migración.

---

## Fase 3 — Tauri caja-hub + impresión + multi-dispositivo · 92% → 98% ★ bloqueante operativo

Un POS de restaurante sin comandas impresas no se vende. Tauri-first ya es decisión.
**Arquitectura aprobada (19-jul): la caja Tauri es el HUB de la LAN** — servidor local
embebido que imprime, sirve la app a los dispositivos móviles y encola hacia Supabase.

### 3A · Servidor local en la caja (hub LAN)

| #   | Ítem                                     | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Spike servidor embebido                  | **✅ Decidido y montado (28-jul): axum en el propio proceso.** No hubo fricción que justificara el sidecar: el servidor son ~200 líneas y vive en un hilo con su propio runtime de tokio, así que un fallo del hub no tumba la ventana. Se evitan ~80 MB de runtime Node y, sobre todo, el proceso huérfano que sobrevive a un cierre sucio de la app. Compilado y con 29 aserciones en verde el 29-jul.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3.2 | La caja SIRVE la app                     | ✅ 28-jul (compilado y probado, 29-jul). `ServeDir` con fallback a `index.html` —sin eso, el mesero que refresca en `/mesas` se lleva un 404 de react-router—, escuchando en `0.0.0.0` y con `dist` empaquetado como recurso de Tauri. Resuelve (a) **mixed content**: un PWA en HTTPS no puede hacer fetch a IP local HTTP, y (b) el arranque sin internet. La caja es el origen, no el fallback: el cliente usa su propio origen como URL del hub, así que no hay IP que teclear en el teléfono.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.3 | Descubrimiento y pairing                 | **✅ 5-ago (falta mDNS).** El QR ya está: `/hub` lo pinta con la IP vigente y el token dentro, y **un solo escaneo abre la app y empareja** — no hay que teclear una dirección ni copiar un código. Es una URL http normal y no un esquema propio (`invventa://`), porque el teléfono no tiene app que abrir: la app ES la web que sirve la caja. El token se guarda y **se borra de la barra de direcciones**, para que no acabe en el historial ni en una captura. `lib/QR.js` es un codificador propio, sin dependencias, verificado módulo a módulo contra la librería `qrcode` en 14 vectores (versiones 1–10). **Fallo corregido al escribir el guion de prueba (5-ago):** la primera versión guardaba el token del QR y lo usaba tal cual. Salía el papel, sí — pero nadie llamaba a `/hub/emparejar`, así que la lista de dispositivos quedaba vacía, no había nada que revocar, y cada teléfono acababa con el token de la **caja**, el de administración. Ahora se canjea por uno propio, y **si el canje falla no se guarda nada**: mejor que el teléfono no imprima y haya que volver a escanear, a que se quede con permisos que no le tocan. Guion: `docs/PRUEBA_PAIRING.md`. **Pendiente: mDNS.** Hoy, si el router rota la IP por DHCP, hay que volver a escanear el QR — molesto pero no bloqueante. Conviene fijar la IP de la caja en el router mientras tanto. |
| 3.4 | Interceptor con fallback                 | **📐 DISEÑADO 10-ago, sin escribir → `docs/DISENO_3.4_3.5_RESPALDO_HUB.md`.** Decisión de arquitectura tomada: el hub SÓLO respalda, la caja drena (el hub sincronizando él mismo exigiría custodiar JWT de empleados o darle `service_role`). Prerrequisito ya resuelto: `lib/IdVenta.js` — el `id` de venta y el de comanda venían de `Date.now()`, compartido entre teléfonos, y un respaldo que deduplica por clave habría descartado cobros en silencio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3.4 | Interceptor con fallback (nota original) | **⬜ NO IMPLEMENTADO (verificado 6-ago).** El hub sólo expone `/imprimir`, `/previsualizar`, `/cola*`, `/pairing`, `/emparejar` y `/dispositivos`: no hay endpoint de encolado. Hoy cada dispositivo guarda en su propio Dexie y sincroniza directo a Supabase cuando ÉL recupera internet — lo cual funciona y está validado (3.13), pero deja las ventas de un teléfono a merced de ese teléfono. Hay que decidir si sigue haciendo falta. Diseño original: en el cliente, `insert()` a Supabase → `catch` de error de red → POST del JSON al hub. Pedidos con **UUID generado en cliente** para que el replay a Supabase sea idempotente (reusar patrón outbox/dead-letter existente, no inventar otro).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3.5 | Worker de drenado                        | **⬜ NO IMPLEMENTADO (verificado 6-ago).** `cola.rs` es la cola de IMPRESIÓN y no toca Supabase. Depende de 3.4. Diseño original: el hub persiste la cola (SQLite local) y un worker la empuja a Supabase al volver la red, con la misma clasificación 4xx→dead-letter ya implementada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3.6 | Modo isla v2 (post-v1)                   | El hub retransmite por WebSocket local a KDS/mesas/otros dispositivos para que **cocina vea comandas sin internet** — sin esto el KDS queda ciego offline aunque el ticket se imprima. v1 = imprimir + encolar; v2 = relay realtime LAN. Se declara v2 para no inflar el alcance del lanzamiento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 3B · Impresión térmica

| #   | Ítem              | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.7 | Motor ESC/POS     | ✅ 28-jul (compilado y probado, 29-jul). `escpos.rs`: 32 columnas, CP850 con plegado de acentos —lo que no está en la tabla se imprime sin tilde en vez de como jeroglífico—, corte parcial y pulso de cajón. La separación Cocina/Barra la hace `lib/Comanda.js` reusando el `destino` que ya resolvía `construirItemsComanda`: duplicar el enrutamiento sería tener dos verdades sobre a dónde va un platillo. QZ Tray descartado. |
| 3.8 | Cola de impresión | ✅ 28-jul (compilado y probado, 29-jul). `cola.rs`: hilo único —la impresora es un recurso físico, dos hilos entrelazan bytes de dos tickets—, persistencia en disco para sobrevivir un reinicio, espera creciente acotada a 5 intentos y descarte por `id`. Los reintentos vuelven **al frente** de la cola: al final, el segundo platillo saldría antes que el primero. Los móviles imprimen ENVIANDO al hub.                      |

### 3C · Multi-dispositivo (teléfono, tablet, pantalla)

| #    | Ítem                              | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.9  | Matriz de dispositivos            | **Caja:** Tauri Windows (hub). **Mesero:** teléfono/tablet vía navegador apuntando al hub (misma app React, superficie operación). **KDS/pantallas:** browser en kiosk-mode contra el hub, ruta `/kds`. Un solo codebase, la superficie se decide por ruta (ya es así).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3.10 | Auditoría responsive de operación | **🔨 EN CURSO (5-ago).** Ya no es una auditoría: Chris entregó mockups de teléfono y tablet y **el diseño parte de ahí**. Análisis y decisiones en `docs/MOCKUPS_RESPONSIVE.md`. Las dos maquetas no son dos diseños — son el mismo, y difieren en exactamente tres sitios (carrito del POS, detalle de mesa, inspector del KDS), que son el mismo problema: un panel secundario **acoplado** u **hoja**. De ahí el primitivo `PanelAcoplable` + el hook `useAcoplado`, en vez de duplicar el árbol para «la versión móvil» —dos árboles se desincronizan y el que se queda atrás es siempre el que no usas a diario—. **Decisión: el ancho decide la FIGURA, el rol decide el CONTENIDO** (umbral único 1024; el rol del hub nunca decide disposición porque la versión web no tiene hub, un rol equivocado no se corrige desde la pantalla, y el rol ya decide contenido vía `usePermisos`). **Segunda decisión: operación se diseña, ERP sólo se defiende** — para las ~29 rutas del ERP basta una lista comprobable de «no se rompe», que se cubre con tres o cuatro reglas globales y no con 29 revisiones; salvo recepción, mermas y conteo, que se hacen **de pie y con el dispositivo en la mano** y merecen algo más. **Cableado ya:** el carrito del POS, donde había un defecto real — se repartía `h-[50vh]` entre catálogo y carrito, y en un teléfono de 844 px al catálogo le quedaba sitio para **una fila y media de productos**, con el carrito ocupando media pantalla aunque estuviera vacío. 13 aserciones fijan las dos figuras. **Cableado el 6-ago:** el **detalle de mesa** en `MesasScreen`. El inspector era un `hidden xl:flex w-80`: se ponía a sí mismo su condición de existir y por debajo de 1280 px no se pintaba, así que el único que se quedaba sin él era el mesero con la tablet en la mano —justo quien no puede acercarse a la caja a mirar—. Ahora no se cae, cambia de figura: columna de 300 px con sitio, hoja sin él. Tres decisiones al cablearlo: (1) **el toque en estrecho abre la hoja** y del POS se entra desde ella — cuesta un toque más en la acción más frecuente, y aun así compensa porque un toque errado en un teléfono cambia de pantalla entera mientras que una hoja se descarta tirando hacia abajo; (2) **sin barra flotante**, a diferencia del carrito: el carrito no tiene representación ninguna en el catálogo, pero cada mesa ya enseña su total en su tarjeta y la tarjeta ES el disparador; (3) **la hoja enseña la mesa que se tocó, nunca el respaldo** — hay siempre una mesa «seleccionada» de oficio para que las flechas tengan de dónde partir, y si un realtime saca de la lista la mesa que estás mirando, la hoja se cierra en vez de cambiarla por otra debajo del dedo que ya iba hacia «Cobrar». De paso, dos arreglos en el primitivo: `h-full` en vez de `h-screen` (el POS se traga el viewport, el mapa vive dentro del layout y la columna sobresalía por abajo justo lo que mide la barra de navegación, dejando las acciones del pie fuera de pantalla) y el velo deja de anunciarse como un segundo «Cerrar». 16 aserciones nuevas. **Cerrado también el 6-ago, a partir de capturas de Chris en un teléfono:** (a) **modal de cobro** — «Total Final» y la cifra se MONTABAN por una fila de ~300 px sin `gap` ni `min-w-0`, dos regiones de scroll dentro de un `max-h-[90vh]`, y sobre todo el pie (saldo + botón de cobrar) atrapado dentro de la mitad derecha, o sea visible sólo tras recorrer todas las opciones de pago; `sticky` no valía —el pie está en una mitad que puede quedar bajo el pliegue— así que se extrajo a una constante que las dos figuras colocan en sitios distintos del árbol, con una prueba que cuenta los botones de cobrar; se tomó de la maqueta el banner de total anclado, que es la corrección de fondo (el total estaba donde pertenece semánticamente y no donde hace falta mirarlo). (b) **Mapa de mesas** — el arreglo que más rindió no era de esa pantalla: `OpsHeader` tenía `items-start` en columna, y con `align-items:flex-start` cada hijo mide su contenido, así que el `truncate` del título no tenía ancho contra el que recortar y la página se iba a desplazamiento horizontal (síntoma reconocible: **cortado sin puntos suspensivos**); además `leading-none` recortaba los glifos de Syne en los contadores, las acciones por tarjeta vivían en `opacity-0 group-hover` —inalcanzables con el dedo, tres funciones desaparecidas del producto en teléfono— y la jerarquía estaba invertida (a igualdad de tamaño gana el que tiene color, así que se leía «$488» antes que el número de mesa). (c) **El chasis** — el mobiliario se llevaba ~104 px de ancho y ~426 de alto de un 390×844, o sea la mitad de la pantalla: riel fuera y **barra de pestañas abajo** (`BarraPestanas.jsx`, destinos desde `gruposVisibles` y regla «los 4 primeros visibles», no una segunda lista), el Topbar pasa a decir siempre dónde estás y es la pantalla la que calla, buscador en icono, StatusBar sustituida por las pestañas y el aviso de offline subido para no quedar detrás de ellas. Se recuperan ~56 px de ancho y ~150 de alto. **Lección anotada: la densidad no se calcula contra el ancho de la pantalla sino contra el que deja el chasis** — el `minmax(160px)` del mismo día no llegó a dar dos columnas por no contar el riel. **440 pruebas pasan.** **Falta:** métricas (rejilla de 12 columnas en tablet) y las reglas globales del ERP. |
| 3.11 | Registro de dispositivo           | **✅ 5-ago · CORREGIDO (29-jul): sin gate de plan.** La versión del 19-jul decía "cuenta contra el límite del plan (enlaza con 1.3)", pero eso contradice la decisión de precios ya tomada: `docs/PRECIOS_InvVenta.md` dice literalmente _"los dispositivos son ilimitados. No hay gates ni add-ons por dispositivo"_ y _"el único enforcement real es empleados"_ — y `usePlan` está implementado así. Contar dispositivos habría sido construir un contador para no usarlo, y peor: un límite que la letra chica del plan promete no aplicar. Lo que **sí** queda, y ya está hecho: `dispositivos.rs` da a **cada dispositivo su propio token**. Esa es la decisión que hace útil la revocación: con un token compartido, echar al teléfono que se quedó en un taxi obligaría a re-emparejar la tablet, el KDS y la caja, en plena hora de comida. El QR lleva el token de EMPAREJAMIENTO, que no da acceso por sí mismo —solo sirve para canjearlo por uno propio—, así que puede quedarse pegado en la pared de la cocina. Y se distinguen dos niveles: un teléfono emparejado **imprime**, pero no puede revocar a los demás ni reconfigurar la impresora; eso exige el token de la caja.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3.12 | Shell desktop                     | **🔨 PARCIAL.** ✅ El instalador NSIS se genera y se probó el 11-ago. ⬜ Falta el **auto-updater** (`plugins` vacío, sin `tauri-plugin-updater` ni endpoint de versiones). ❌ **La firma de código se descarta (decisión de Chris, 11-ago).** El razonamiento, para que no se reabra cada tres meses: el certificado cuesta y el producto se instala a mano en cada local, así que el aviso de SmartScreen lo consume Chris al instalar, no el cliente. **Lo que se acepta a cambio:** sin firma, la reputación de SmartScreen se acumula **por hash de archivo y no por publicador** —la documentación de Microsoft dice que una app sin firmar que se actualiza «aparecerá como múltiples programas distintos, que tendrán que construir reputación individualmente»—, así que **cada versión nueva vuelve a cero** y el aviso saldrá en la máquina del cliente en cada actualización. Es asumible porque la política de actualizaciones es **sólo seguridad**: raras, y cuando pasen se avisa. Se valoró Azure Trusted Signing ($9.99/mes, abierto a individuales, pero con lista de países elegibles) y se descartó por no añadir una cuota mensual al proyecto. **Consecuencia de diseño para el updater:** no puede actualizar en silencio. Tiene que avisar antes —«va a salir un aviso de Windows, es normal»— o la primera actualización de seguridad se convierte en una llamada de soporte en el peor momento. Y eso debe estar en la guía de instalación, junto al requisito de red.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Medio** |
| 3.13 | Paridad offline                   | **✅ VALIDADO en caliente (5-ago).** Prueba real con hotspot: caja + teléfono en la misma LAN, datos móviles apagados → red local viva, sin nube. La caja arranca, el teléfono carga la app servida por la caja, empareja, e imprime; el cobro no se bloquea. Es la primera vez que se comprueba la premisa central de la fase —_la caja no necesita internet, necesita la LAN_— en vez de darla por buena. **Dos fallos reales encontrados y corregidos antes de que pasara.** (1) **La caja se quedaba en «Cargando contenido…» sin internet.** Las tres consultas de identidad de `_loadUserContext` no tenían timeout; en el WebView de Tauri una petición sin ruta a internet no falla rápido, se cuelga, y el arranque nunca llegaba a apagar la pantalla de carga — y como los dispositivos cargan la app DESDE la caja, se caía todo el local a la vez. Arreglado con dos capas: atajo por `navigator.onLine` (contexto desde caché sin tocar la red) y **timeout de 8 s**, que es el que de verdad salva el caso, porque con el WAN desenchufado el wifi sigue arriba y `navigator.onLine` responde `true`. (2) **El reloj checador no dejaba registrar la salida.** Comparaba la fecha de calendario LOCAL contra el prefijo de un timestamp UTC (`fecha_hora.startsWith(hoyLocal)`). En México eso significa que, a partir de las 18:00, la entrada se archiva con la fecha de mañana: el trabajador del turno de noche no podía cerrar su turno («no tienes entrada activa»), y a la mañana siguiente esa entrada fantasma sí aparecía y le decía «ya tienes entrada registrada» a quien acababa de llegar. De día funcionaba y de noche no — que es cuando trabaja un restaurante. El arreglo del 27-jul había cambiado solo el lado izquierdo de la comparación. Ahora la regla vive en `lib/Asistencias.js` con **15 aserciones** que fijan el caso en las dos direcciones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Salida:** instalador Windows que levanta el hub; teléfonos y pantallas de la LAN
operan contra la caja; comandas se imprimen y el cobro nunca se bloquea, con o sin internet.

**Estado al 6-ago.** El 5-ago se escribió aquí que faltaba «únicamente enchufar
la impresora». Era optimista, y conviene dejar constancia de por qué: al mirar el
papel de verdad —comparándolo con un ticket impreso real de Soft Restaurant que
trajo Chris— aparecieron cosas que ninguna prueba daba por rotas.

- **La pre-cuenta no existía.** «Pedir Cuenta» (F4) cambiaba el estado de la mesa
  y avisaba a caja, pero **no imprimía nada**: el mesero no tenía qué dejar en la
  mesa. Es el documento más impreso de un restaurante. Hecho el 6-ago, con el
  importe en letra (`lib/Letras.js`).
- **El folio colisionaba.** Era `POS-${Date.now().slice(-5)}`, un reloj que da la
  vuelta cada 100 s: ~18 % de probabilidad de duplicado en un servicio de 200
  tickets, sin `UNIQUE` en la columna que lo detectara, y sin ordenar. Rehecho
  como `AZUL7K-V-000123` (`lib/Folio.js`).
- **El emisor decía «InvVenta».** `Comanda.js` leía `nombre_restaurante`, un
  campo **que no existe en el sistema** — la columna es `nombre_empresa`—, así
  que caía al respaldo. Todos los tickets impresos llevaban el nombre del
  proveedor del software en el sitio del emisor. Corregido, y los datos fiscales
  subidos del pie a la cabecera con `razon_social` nueva.
- Y aparecieron **tres sitios** donde `Date.now()` hacía de identificador único.

Ninguno daba error. Se encontraron comparando papeles, y por eso se montó
`scripts/ver-papel.sh` —que junta los constructores reales con el renderizador
real de Rust— y `scripts/pruebas-rust.sh`, que hace que las 30 pruebas del
renderizador corran fuera de Windows.

**Lo que falta ahora**, ordenado en la tabla de «DÓNDE ESTAMOS» del principio:
la impresora física (con el ancho a 48 columnas para la TM-T20II), el shell de
escritorio (3.12), el encolado por el hub (3.4/3.5), mDNS (3.3), métricas y ERP
de 3.10, y el relay del KDS (3.6, v2).

**Lección de método de esta tanda.** Tres de los cuatro fallos que aparecieron
—el `dist` viejo servido a la LAN, el `?token=` que nunca se canjeaba, y el
arranque colgado sin internet— **no daban error**. La app abría, respondía y
parecía correcta; lo que fallaba solo se veía a dos metros, en otro aparato. Por
eso cada arreglo vino acompañado de hacerlo VISIBLE: la fecha del build en
`/hub`, la lista de dispositivos emparejados, y el timeout que convierte un
cuelgue indefinido en un error con nombre.

### Tanda 3.1 — rebanada vertical montada, pendiente de hardware (28-jul)

Chris no tiene todavía impresora ni teléfono para probar, así que la tanda se
montó entera **para que el día de la prueba sea una prueba y no una sesión de
desarrollo**. Guion completo en `docs/PRUEBA_HARDWARE_FASE3.md`.

**Cubierto:** 3.1 (decisión + servidor), 3.2 (la caja sirve la app), 3.7 (motor
ESC/POS), 3.8 (cola con reintentos) y la mitad de 3.4 — el interceptor con
fallback existe para la impresión, no todavía para los datos.

**El reparto de responsabilidades es la decisión estructural de la tanda.** La
app decide **qué** se imprime (`lib/Comanda.js`, puro, 35 aserciones) y el hub
decide **cómo** se pinta (`escpos.rs`). Entre los dos hay un _documento
semántico_ en JSON. Tres consecuencias buscadas:

1. **El hub no hace aritmética.** Los importes viajan como texto ya formateado
   por `lib/Fiscal.js`. Si el hub redondeara habría dos motores de dinero y el
   papel podría discrepar de la pantalla en un centavo sin forma de saber cuál
   miente.
2. **Un cambio de reglas de negocio no obliga a recompilar el binario** de la
   caja, que es la pieza que hay que ir a instalar a mano en cada local.
3. **El teléfono nunca habla ESC/POS.** Produce el mismo documento que la caja y
   lo manda por HTTP; ningún móvil toca la impresora directo (3.8).

**Reglas fijadas con pruebas**, porque son las que al fallar cuestan comida o
dinero y no dan error: la comanda **no puede llevar precios por construcción**
(no existe el campo, no es una bandera que se pueda encender por error) · una
**reimpresión sí sale** —el descarte por `id` protege del POST duplicado de una
red que parpadea, no de una reimpresión deliberada— y **va marcada con
`NO PREPARAR DE NUEVO`**, sin lo cual cocina hace el platillo dos veces · el
**cajón se abre después del corte y solo con efectivo**; abrirlo antes deja
dinero expuesto si el papel se atasca · la **fecha del ticket va por
`aISOLocal`**, que es el bug de UTC del 27-jul pero impreso en un papel que ya
se llevó el cliente.

**Verificado (89 aserciones nuevas en verde):** 60 de JS —`lib/Comanda.js` 35 y
`lib/Hub.js` 25— y **29 de Rust**.

**Regresión corregida el 29-jul, encontrada al correr `npm test` en Windows.**
`lib/Hub.js` hacía `await import('@tauri-apps/api/core')`, y Vite resuelve los
imports dinámicos de cadena literal en tiempo de transformación: con el paquete
sin instalar, fallaba **toda** prueba que tocara ese archivo, incluida
`PosScreen.integration.test.jsx`, que no tiene nada que ver con imprimir. El
arreglo no fue instalar el paquete sino quitarlo: la llamada IPC va por el puente
que Tauri ya inyecta en la ventana —`window.__TAURI_INTERNALS__.invoke`, que es
justo lo que ese paquete envuelve—, así que hay una dependencia menos y un chunk
menos en el bundle del teléfono. La lección, anotada: **una función que solo corre
dentro de Tauri no debe poder romperle las pruebas al resto de la app.** Cuatro
aserciones nuevas lo fijan, entre ellas que una ventana de Tauri sin puente
degrada en vez de lanzar. ESLint y Prettier limpios sobre lo tocado.

El Rust **sí se compiló** (29-jul, segunda pasada). No hay `rustup` disponible
—bloqueado por allowlist— pero con el `rustc` de apt y un crate suelto que
contiene solo los módulos del hub —que no dependen de Tauri, y por tanto no
necesitan las librerías de sistema que Tauri exige— salieron `cargo test` con 29
aserciones y `cargo check` con axum, ambos sin warnings. El bloque `cfg(windows)`
no puede compilarse para ese target sin `rustup`, así que se levantó un crate
espejo con las firmas **copiadas del fuente de `windows` 0.58** y se
type-checkeó contra ellas.

**Tercer fallo, al compilar en Windows (5-ago): faltaban features del crate
`windows`.** `OpenPrinterW` y `PRINTER_DEFAULTSW` están detrás de
`Win32_Graphics_Gdi`, y `PRINTER_INFO_2W` además detrás de `Win32_Security`; con
solo `Win32_Graphics_Printing` el compilador dice "no existe `OpenPrinterW`" y
sugiere otra función, sin mencionar la feature. Esto marca el **límite de la
técnica del crate espejo**: reproduce firmas, no puertas de compilación. Lo que
sí sirvió fue tener el fuente del crate a mano para comprobar item por item cuál
estaba gateado y cuál no.

**Compilar valió la pena: dos fallos reales antes de ese.** (1) `EnumPrintersW` recibía `None`
en el nombre del servidor; ese argumento es genérico sobre `Param<PCWSTR>` y
`None` a secas no permite inferir el tipo — **no compilaba**. Ahora es
`PCWSTR::null()`, que además dice lo que significa. (2) Una aserción del plegado
de acentos estaba mal escrita: esperaba que `Crème` acabara en `é`. El código
estaba bien; la prueba, no.

**Lo que queda sin verificar:** `src-tauri/src/lib.rs` —los siete comandos de
Tauri y el `setup`— porque compilar Tauri en Linux pide webkit2gtk y no hay
permisos para instalarlo · la versión exacta de axum (se probó 0.8.1; la 0.8.9
pide rustc 1.80 y apt solo tiene 1.75) · el layout de `PRINTER_INFO_2W` y el
enlazado contra el spooler real · y `npm test` / `npm run build` completos en
Windows, ya que los `node_modules` del repo son binarios de esa plataforma.

**Fuera de esta tanda, a propósito:** mDNS (3.3) —hoy la IP se lee de `/hub` y se
teclea—, el QR de pairing (el enlace ya se genera, falta pintarlo), el registro
de dispositivos contra el límite del plan (3.11), el relay WebSocket LAN (3.6) y
el drenado del hub a Supabase (3.5): hoy cada dispositivo encola por su cuenta
con el outbox que ya existía, y el hub solo imprime.

---

## Fase 4 — Hardening y lanzamiento · 98% → 100%

| #   | Ítem                 | Detalle                                                                                                                             |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | QA multi-tenant real | Segundo tenant de staging completo: onboarding → operación → límites de plan → suspensión por impago. Nada de probar solo con AZUL. |
| 4.2 | E2E ampliado         | Sumar a los 9 specs: flujo de suscripción/paywall, impresión (mock del puerto), atajos críticos (Ctrl+K, F9 cobrar).                |
| 4.3 | Operabilidad         | Telemetría mínima de errores (Sentry o equivalente), estrategia de backup/restore por tenant documentada, runbook de soporte.       |
| 4.4 | Distribución         | Landing con pricing, descarga del instalador, docs de arranque (5 min al primer cobro).                                             |

**Salida:** lanzamiento.

---

## Orden crítico y dependencias

```
Fase 0 ──► Fase 1 (monetización) ──► Fase 4
              │
              ├─► Fase 2 (rediseño)  — paralelizable con F1 después de 1.2
              └─► Fase 3 (caja-hub/impresión/multi-device) — 3.11 depende de 1.3
```

- **Camino crítico de venta:** 0 → 1 → 3 → 4. La fase 2 suma percepción de valor pero no bloquea; puede intercalarse.
- **Decisiones abiertas que hay que tomar pronto:** ~~pasarela (1.4)~~ resuelta (Stripe) · ~~spike del hub (3.1 axum vs sidecar)~~ resuelto el 28-jul: **axum embebido**.
- **Regla vigente:** debugging-first; ninguna fase se cierra sin su "prueba en caliente".
- **Pendientes de dashboard (Supabase, Stripe) y de datos:** viven en
  `docs/PENDIENTES_MANUALES.md` y **no se hacen sobre la marcha**. Se acumulan
  ahí y se revisan todos juntos justo antes del lanzamiento (decisión de Chris,
  5-ago). Cuando aparezca uno nuevo, se anota ahí y se sigue trabajando.
- **Deuda de verificación (actualizada 6-ago):** las **30 aserciones** del
  renderizador ESC/POS ya corren **fuera de Windows** con
  `scripts/pruebas-rust.sh`, que arma un crate desechable con los dos módulos
  del hub que no dependen de la crate `windows`. Eso desbloquea el CI de Linux
  para toda la lógica de formato. **Sigue abierto:** `src-tauri/src/lib.rs` (los
  comandos de Tauri) nunca se ha compilado, falta correr la suite completa en
  Windows, y la fase 3 no se cierra hasta la prueba con hardware — guion en
  `docs/PRUEBA_HARDWARE_FASE3.md`.

_Actualizado: 6-ago-2026. CFDI/Facturama: post-100%, entra como módulo premium ya vendible._
