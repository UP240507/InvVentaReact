# Auditoría de lógica del sistema — 19 julio 2026

Barrido de principio a fin: cola offline (useSyncStore), hidratación/realtime (useAppStore), motor puro (Inventario/Fiscal), flujo de venta (PosScreen/ModalCobro), guards (Proyecto L). Veredicto general: la arquitectura es sólida — cola con dead-letter clasificada, optimista + eco realtime, motor fiscal único, idempotencia por ledger en CRM. Lo que sigue son los huecos reales encontrados.

## Corregido durante el barrido

- **Casing de imports** (13 archivos): `lib/inventario|fiscal|arqueo` en minúscula vs archivos `Inventario.js|Fiscal.js|Arqueo.js`. En Windows funciona; en cualquier build case-sensitive (CI Linux, contenedores) truena. Todos los imports quedaron capitalizados. Relevante para Tauri/CI.

## Mejoras anotadas — ALTA prioridad (tocar antes del SaaS)

1. **Ids de cliente con `Date.now()`** en ventas, comandas (`CMD-`), clientes, asistencias, movimientos y auditoría. Dos terminales cobrando en el mismo milisegundo colisionan; y si la PK de esas tablas no es compuesta con tenant, hay riesgo cruzado entre tenants. `turnos` ya usa `crypto.randomUUID()` — replicar el patrón. Exige revisar tipos de columna (bigint→text/uuid) tabla por tabla: proyecto pequeño pero transversal.
2. **`decrementar_stock` NO es idempotente**: sin ledger. Un timeout post-commit → reintento de la cola → DOBLE descuento de stock. Las RPCs de CRM ya tienen el patrón (ledger con PK `(restaurante_id, id_natural)`): añadir `p_referencia` (id de venta/ronda) + ledger `stock_aplicado`.
3. **`ventas` se encola como `insert`**: reintento post-commit → duplicate key → dead-letter con la venta YA guardada en el server (falsa alarma que además asusta en diagnóstico). Cambiar a `upsert` (la cola ya lo trata igual).
4. **`registrarAuditoria` y `updateConfiguracion` esquivan la cola**: hacen `supabase.insert/upsert` directo gateado por `navigator.onLine` (que miente). Si el request falla, el dato remoto se pierde EN SILENCIO (queda solo local). Pasarlos por `enqueueAction` como todo lo demás.

## Mejoras anotadas — MEDIA

5. **Realtime no cubre `staff`, `roles_permisos` ni `configuracion`**: por eso renombrar un rol no refresca el staff local hasta el próximo fetch (la cascada server-side SÍ corre — verificada). Añadir las 3 tablas a la publicación + handlers en `kds-channel` (patrón `clientes`, 30 min).
6. **`asistencias` sin `.limit()`** en fetchInitialData: crece sin tope con los meses. Limitar a ~90 días.
7. **Dead-letter sin UI**: los hooks (`listarDeadLetter`/`reencolar`/`descartar`) existen en useSyncStore y el badge cuenta — falta la pantalla de diagnóstico para el Admin.
8. **Realtime no escribe Dexie** (solo RAM): un refresh en ventana de datos frescos pierde ecos hasta el próximo fetch (mitigado por TTL 30s). Ya estaba anotado en el traspaso.

## Mejoras anotadas — BAJA

9. Módulos "operativos" legacy de PermisosScreen son redundantes con las rutas de capacidades — candidatos a morir.
10. `staff.puesto` espejo cosmético sin constraint — matarlo toca EF + payloads + fallbacks `|| puesto`.
11. `roles_sin_propina` (configuracion) podría unificarse como flag `sin_propina` del rol.
12. Warning `exhaustive-deps` en RelojChecador (patrón legado, línea base conocida).
13. `registrarAuditoria` con `id: Date.now()` también aplica al punto 1.

## Estado del Proyecto L (cerrado)

Roles 100% data-driven: capacidades en `roles_permisos` (guards + EFs + UI), FK con cascade/restrict verificada en caliente, CRUD completo en PermisosScreen con candado `es_sistema`, select dinámico en EmpleadosScreen. Pendiente solo el punto 5 (realtime) para que los cambios de rol se propaguen en vivo.

## Siguiente frente: Dashboard + Tauri (rediseño de interfaz)

**Tauri — viabilidad y puntos duros identificados:**
- Stack compatible (Vite + React 19). El casing ya quedó corregido (build case-sensitive).
- `vite-plugin-pwa`/service worker: DESACTIVAR en build Tauri (el SW compite con el file protocol y no aporta; Dexie sigue dando el offline).
- Impresión térmica 58mm: aquí Tauri gana la decisión abierta vs QZ Tray — plugin nativo o comando Rust a ESC/POS directo a USB/red, sin depender de un tray de terceros con licencia. Cocina/Barra separadas por `configuracion.enrutamiento`.
- Persistencia: IndexedDB/localStorage viven en el WebView (WebView2 en Windows) — sobreviven updates; empaquetar con el updater de Tauri para distribución a tablets/PCs.
- `window.confirm` vetado ya cumplido en toda la app (los diálogos nativos de Tauri serían inconsistentes con la UI).
- e2e Playwright sigue corriendo contra el dev server web — Tauri no lo rompe.

**Dashboard — rediseño:** los widgets actuales leen RAM del día; el rediseño debe traer métricas por periodo (hoy/semana/mes vs anterior), P&L rápido desde ventas+movimientos, alertas accionables (desabasto, dead-letter, mesas estancadas, jornada), y layout por capacidades del rol (gestion ve finanzas; operación ve su turno).
