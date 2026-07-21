# Roadmap al 100% — InvVenta (sin CFDI/facturación)

> **Definición de 100%:** producto SaaS vendible e instalable — un restaurante ajeno a AZUL
> puede darse de alta, pagar un plan, operar offline en Tauri e imprimir comandas,
> sin intervención manual de Chris. El timbrado CFDI queda explícitamente fuera
> de este roadmap (Facturama se integra después; `Fiscal.js` no se toca).
>
> Punto de partida: **~70%** (19-jul-2026). Cada fase indica el avance que aporta.

---

## Fase 0 — Seguridad y deuda pendiente · 70% → 74%

Cierra lo que ya está diagnosticado antes de construir encima.

| # | Ítem | Detalle |
|---|------|---------|
| 0.1 | Rate-limit `login-pin` | Tabla `login_intentos` (código+IP, ventana deslizante), backoff exponencial en la EF, lockout tras N fallos. El PIN de 6 dígitos es mitigación interina, no solución. |
| 0.2 | Limpieza auth huérfanos | Borrar los 3 `@stockcentral.com` de `auth.users` vía SQL (no dashboard). |
| 0.3 | `npm install` fuentes | @fontsource/fraunces + figtree ya importadas en `main.jsx`; sin esto el próximo dev truena. |
| 0.4 | Contraste AA | `--adm-muted` #7a746a → ~#6a645a donde el texto sea <14px (tanda 6 adelantada, es un cambio de token). |

**Salida:** advisors de Supabase limpios, login-pin no brute-forceable, dev arranca.

---

## Fase 1 — Monetización · 74% → 84% ★ bloqueante de venta

Sin esto no hay producto, solo una app. Es la fase de mayor valor por hora invertida.

| # | Ítem | Detalle |
|---|------|---------|
| 1.1 | Diseño de tiers | 3 planes ~399/549/699 MXN/mes. Ejes de límite: dispositivos activos, empleados, y módulos premium (CRM/lealtad, reportes avanzados, multi-sucursal; CFDI se lista como "próximamente"). |
| 1.2 | Modelo de datos | Tablas `planes` (catálogo, límites en JSONB) y `suscripciones` (tenant, plan, estado, trial_hasta, periodo). Migración + RLS. Estado calculado: `trial / activa / morosa / suspendida`. |
| 1.3 | Enforcement | Fuente única: hook `usePlan()` sobre configuración+suscripción cacheada en Dexie (offline no puede apagar el POS: gracia de N días sin validar). Gates: alta de empleado/dispositivo bloquea al llegar al límite; módulos premium ocultan ruta + candado en sidebar. Server-side: checks en EF de alta de staff y registro de dispositivo (el cliente nunca es la única barrera). |
| 1.4 | Pasarela de pago | Decisión: Stripe (soporta MXN, suscripciones nativas, webhooks) vs Mercado Pago (más familiar al mercado local). Webhook → EF actualiza `suscripciones.estado`. |
| 1.5 | Billing/Paywall reales | Rediseño con tokens `adm-*`: BillingScreen (plan actual, uso vs límites, historial, cambio de plan) y PaywallScreen (upgrade contextual: "llegaste al límite de X"). |
| 1.6 | Onboarding self-service | Alta de restaurante → genera código corto (`AZUL-C172` pattern) → trial 14 días → wizard mínimo (nombre, logo, primer admin, primera mesa/producto). |

**Salida:** un desconocido paga y opera sin tocarte la puerta.

---

## Fase 2 — Proyecto D: rediseño completo · 84% → 92%

Continúa el plan de tandas ya aprobado (login ✅, tanda 1 ✅, tanda 2 parcial).

| # | Ítem | Detalle |
|---|------|---------|
| 2.1 | Tanda 2 restante | Sidebar colapsable 208↔56 (`Ctrl+B`), topbar con búsqueda global, re-skin del interior de pantallas al shell editorial. |
| 2.2 | Tanda 3: atajos | Hook `useAtajos(scope, mapa)` sin libs + registro central. `Ctrl+K` palette (filtrada por usePermisos), `Ctrl+1..9`, `F1` ayuda, atajos por módulo (Mesas/POS/KDS/tablas) con hints en el footer del inspector. |
| 2.3 | Tanda 4: pilotos | Dashboard (editorial: métricas por periodo, P&L, alertas de AUDITORIA_SISTEMA) + Mesas (industrial con inspector contextual derecho). Validar el híbrido en caliente antes de escalar. |
| 2.4 | Tanda 5: resto por grupos | Catálogos/tablas (DataTable densa, zebra, selección) → compras/almacén → RH/CRM → config. Operación (POS/KDS/espera/checador/propinero) solo adopta estructura, no paleta. |
| 2.5 | Tanda 6: pulido | Estados vacíos, transiciones 250ms, revisión final AA. |

**Salida:** las 24 pantallas en el sistema híbrido; cero paleta vieja en admin.

---

## Fase 3 — Tauri caja-hub + impresión + multi-dispositivo · 92% → 98% ★ bloqueante operativo

Un POS de restaurante sin comandas impresas no se vende. Tauri-first ya es decisión.
**Arquitectura aprobada (19-jul): la caja Tauri es el HUB de la LAN** — servidor local
embebido que imprime, sirve la app a los dispositivos móviles y encola hacia Supabase.

### 3A · Servidor local en la caja (hub LAN)

| # | Ítem | Detalle |
|---|------|---------|
| 3.1 | Spike servidor embebido | Decisión en el spike: **HTTP server en el propio proceso Rust (axum)** vs sidecar Node/Go. Mismo flujo, pero axum = un solo binario sin runtime extra (~80 MB menos que empaquetar Node). Sidecar solo si el spike revela fricción en Rust. 1-2 días con hardware real. |
| 3.2 | La caja SIRVE la app | El hub expone el build de React en `http://caja:3000` para la LAN. Resuelve dos cosas: (a) **mixed content** — un PWA en HTTPS no puede hacer fetch a IP local HTTP, y (b) sin internet el teléfono ni siquiera carga la app si el SW no la tiene cacheada. La caja es el origen, no el fallback. |
| 3.3 | Descubrimiento y pairing | Nada de IP hardcodeada (DHCP la rota). mDNS (`invventa-caja.local`) + pantalla de pairing en la caja con QR (IP vigente + token de dispositivo). El token sustituye al JWT de Supabase para autenticar contra el hub cuando no hay internet. |
| 3.4 | Interceptor con fallback | En el cliente: `insert()` a Supabase → `catch` de error de red → POST del JSON al hub. Pedidos con **UUID generado en cliente** para que el replay a Supabase sea idempotente (reusar patrón outbox/dead-letter existente, no inventar otro). |
| 3.5 | Worker de drenado | El hub persiste la cola (SQLite local) y un worker la empuja a Supabase al volver la red, con la misma clasificación 4xx→dead-letter ya implementada. |
| 3.6 | Modo isla v2 (post-v1) | El hub retransmite por WebSocket local a KDS/mesas/otros dispositivos para que **cocina vea comandas sin internet** — sin esto el KDS queda ciego offline aunque el ticket se imprima. v1 = imprimir + encolar; v2 = relay realtime LAN. Se declara v2 para no inflar el alcance del lanzamiento. |

### 3B · Impresión térmica

| # | Ítem | Detalle |
|---|------|---------|
| 3.7 | Motor ESC/POS | En el hub (Rust): 58mm, comanda Cocina/Barra separadas por `ZonasImpresionScreen` (ya existe), sin precios en cocina; ticket de cobro con precios; corte y cajón. QZ Tray descartado: daemon Java extra sin sentido siendo la caja el hub. |
| 3.8 | Cola de impresión | Si la impresora no responde: encolar y reintentar, nunca bloquear el cobro. Los móviles imprimen ENVIANDO al hub — un teléfono jamás habla con la impresora directo. |

### 3C · Multi-dispositivo (teléfono, tablet, pantalla)

| # | Ítem | Detalle |
|---|------|---------|
| 3.9 | Matriz de dispositivos | **Caja:** Tauri Windows (hub). **Mesero:** teléfono/tablet vía navegador apuntando al hub (misma app React, superficie operación). **KDS/pantallas:** browser en kiosk-mode contra el hub, ruta `/kds`. Un solo codebase, la superficie se decide por ruta (ya es así). |
| 3.10 | Auditoría responsive de operación | POS, Mesas, KDS, Espera, Checador, Propinero en 360px (teléfono), 768px (tablet) y 1080p+ (pantalla). Touch targets ya son correctos por el industrial; falta verificar layouts extremos. |
| 3.11 | Registro de dispositivo | El pairing (3.3) da de alta el dispositivo con rol (caja/mesero/kds/pantalla) y cuenta contra el límite del plan (enlaza con 1.3). Revocación desde Configuración. |
| 3.12 | Shell desktop | Title bar nativa (overlay custom vs estándar — tanda 6), auto-updater de Tauri, instalador firmado Windows. |
| 3.13 | Paridad offline | Todo lo que hoy depende del SW de la PWA debe funcionar en Tauri sin SW (fuentes ✅ fase 0, assets, boot de Dexie) y en móviles servidos desde el hub. |

**Salida:** instalador Windows que levanta el hub; teléfonos y pantallas de la LAN
operan contra la caja; comandas se imprimen y el cobro nunca se bloquea, con o sin internet.

---

## Fase 4 — Hardening y lanzamiento · 98% → 100%

| # | Ítem | Detalle |
|---|------|---------|
| 4.1 | QA multi-tenant real | Segundo tenant de staging completo: onboarding → operación → límites de plan → suspensión por impago. Nada de probar solo con AZUL. |
| 4.2 | E2E ampliado | Sumar a los 9 specs: flujo de suscripción/paywall, impresión (mock del puerto), atajos críticos (Ctrl+K, F9 cobrar). |
| 4.3 | Operabilidad | Telemetría mínima de errores (Sentry o equivalente), estrategia de backup/restore por tenant documentada, runbook de soporte. |
| 4.4 | Distribución | Landing con pricing, descarga del instalador, docs de arranque (5 min al primer cobro). |

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
- **Decisiones abiertas que hay que tomar pronto:** pasarela (1.4) y spike del hub/impresión (3.1 axum vs sidecar) — ambas condicionan arquitectura.
- **Regla vigente:** debugging-first; ninguna fase se cierra sin su "prueba en caliente".

*Actualizado: 19-jul-2026. CFDI/Facturama: post-100%, entra como módulo premium ya vendible.*
