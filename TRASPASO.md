# InvVentaReact — Documento de traspaso

Fecha: 18 de julio de 2026 · Tenant activo: AZUL (`restaurante_id: 15e2e574-6222-445c-afcd-c04925001aae`, proyecto Supabase `aorrfmxduefqwlrhfzzf`)

## 1. Propósito y contexto

ERP/POS offline-first multi-tenant para restaurantes mexicanos. Stack: React 19 + Vite + Zustand 5 + Dexie 4 + Supabase (Postgres + RLS + Edge Functions + Realtime) + Tailwind v4 + vite-plugin-pwa. Meta: SaaS ~399–699 MXN/mes. Repo: `github.com/UP240507/InvVentaReact`.

Estado del repo al cierre: HEAD local `4646c5d`; Chris pusheó hasta la tanda de reserva/lealtad/paquetes — verificar `git status -sb` y pushear lo pendiente antes de asumir sincronía (última vez quedaban `ddca200`, `2873694`, `d87757a`, `4646c5d`).

Convenciones estrictas: español técnico senior-a-senior; verificación de sintaxis (eslint del repo vía `node node_modules/eslint/bin/eslint.js` — esbuild del repo es binario Windows y no corre en el contenedor Linux) + balance de llaves antes de entregar; checklist de "prueba en caliente" antes de cerrar; debugging-first; Supabase MCP en vivo (`execute_sql` para hot-tests CON REVERSIÓN, `apply_migration` para todo cambio de esquema + espejar el archivo en `supabase/migrations/` con la VERSIÓN REMOTA exacta de `list_migrations`, `get_advisors` tras cada tanda); `window.confirm` VETADO (modales propios siempre); commits con autor `Christo <up240507@alumnos.upa.edu.mx>`.

⚠️ **BUG DEL ENTORNO (crítico operativo)**: el mount del contenedor (`/sessions/<id>/mnt/InvVenta`) sirve LECTURAS TRUNCADAS al tamaño viejo después de que el editor (lado Windows) escribe un archivo — git incluido (commitearía blobs corruptos). Fix barato y obligatorio: **rename round-trip antes de cada `git add`**: `mv archivo archivo.tmp && mv archivo.tmp archivo`. Alternativa: escribir write-through desde bash (heredoc). Verificar SIEMPRE `wc -l` + tail del blob commiteado (`git show HEAD:ruta | wc -l`).

## 2. Estado actual (todo verificado)

### CRM / Lealtad (módulo terminado y probado en caliente por Chris)

* `ventas.cliente_id` (FK nullable + índice parcial). ModalCobro: sección "Cliente (opcional)" colapsada — buscador nombre/teléfono + alta exprés; cero fricción de mostrador.
* Acumulación por RPC `registrar_visita_cliente`: atómica (FOR UPDATE, hardening multi-tenant patrón `decrementar_stock`) e IDEMPOTENTE vía ledger `crm_visitas` PK `(restaurante_id, venta_id)` — reintentos de la cola no recuentan. Puntos calculados SERVER-SIDE con `configuracion.pesos_por_punto` (0 = apagado, solo Admin edita). Optimista local en `useSyncStore.registrarVisitaCliente`.
* Lealtad LIBRE: `configuracion.recompensas` jsonb `[{id, nombre, costo_puntos, tipo, valor, activo}]`. `tipo`: `cortesia` (no descuenta) | `descuento_pct` | `descuento_monto`. Editor en Configuración (solo Admin). **Los descuentos SÍ aplican al total** en ModalCobro: total cobrable baja, propina sobre lo canjeado, % efectivo combinado (descuento autorizado + canje) viaja al motor fiscal para IVA sobre base neta. El canje ES la autorización (sin pinpad). Recompensas legadas sin `tipo` = cortesía.
* Canje por RPC `canjear_puntos`: atómica + idempotente (ledger `crm_canjes` PK `(restaurante_id, canje_id)`, `canje_id` = id de la venta); puntos insuficientes = excepción → error permanente → dead-letter. Auditoría `CANJE_RECOMPENSA` con monto.
* `clientes` en publicación realtime (REPLICA IDENTITY FULL) + handler en `kds-channel` (upsert por id).
* ClientesScreen: panel de detalle (stats en vivo, historial de consumo desde ventas locales, datos de facturación), badge "Cumple este mes", RFC/razón social (siembra CFDI). **ANTI-CLOBBER**: la edición NO manda contadores (upsert parcial de PostgREST) y lo local fusiona con el registro vivo — jamás revertir esto.
* Cliente de prueba: Mariana Rios (id `1784239590261`), puntos inflados a 150 a mano para pruebas de canje.

### Paquetes (combos, caso real AZUL funcionando)

* `recetas.componentes` jsonb — mezcla componentes FIJOS `{recetaId, cantidad, nombre}` y GRUPOS DE ELECCIÓN `{grupo, cantidad, opciones: [{recetaId, nombre}]}`. Sin paquetes anidados. `nombre` desnormalizado SOLO cosmético.
* Insumos NUNCA desnormalizados: `expandirInsumosPaquete` (Inventario.js) los expande AL VUELO desde las recetas vivas al agregar al carrito. `resolverComponentesPaquete` aplica elecciones. Motor de stock/gate/kardex sin cambios.
* POS: paquete con grupos abre modal "Arma el paquete" (1 elección por grupo, confirmar bloqueado hasta completar). Cada combinación = línea de carrito propia (id compuesto `paqueteId:grupo=recetaId|...`).
* Comandas: `construirItemsComanda` (Inventario.js) EXPANDE el paquete en un item por componente, cada uno enrutado por la categoría de SU receta (`configuracion.enrutamiento`) → café a Barra, chilaquiles a Cocina, nota "Paquete: X". Compartido por mesa y mostrador.
* Recetas: toggle "Es paquete", builder de fijos + grupos (≥2 opciones), costo = fijos + opción MÁS CARA por grupo, badge en grid. Ticket imprime desglose.
* Caso de referencia: "Desayuno AZUL" $160 = chilaquiles natural + pan (fijos) + Bebida caliente (olla|americano) + Bebida fría (naranja|toronja|zanahoria|fruta).

### Operación (fixes de esta sesión)

* **Venta directa → KDS**: la comanda nace al cobrar en mostrador (folio de la venta, mesa "Mostrador", `mesa_id: null` → no toca cierre de comandas por mesa ni mapa). Stock se descuenta al cobrar como siempre (sin doble conteo).
* Mesa reservada CON NOMBRE: `mesas.reserva` jsonb `{nombre, cliente_id, hora}` — modal de reserva con buscador CRM o texto libre + hora opcional; visible en tarjeta y en "¿Llegó el cliente?"; se limpia al ocupar/liberar; viaja por realtime.
* Aviso "comida sin entregar" al cobrar: modal propio (era `window.confirm`).
* Cancelar ronda NO repone stock (decisión: va por Mermas/Ajustes).

### Catálogos / Almacén

* IngredientesScreen: editar stock a mano registra movimiento `'Ajuste'` en kardex (shape de Recepción/Mermas). Recepción escribe `'Entrada'` con costo promedio ✓. Mermas ✓.

### Análisis

* ReportesScreen: tabs financiero / Z-cut / rentabilidad ABC / meseros-propinas / almacén. Almacén ahora incluye **Kardex del periodo completo** (Entrada, Salida POS, Merma, Ajuste; badge por tipo, stock anterior→nuevo, usuario, referencia; tope 200 filas).
* FacturasScreen: mock CFDI listo para PAC (`facturama_id` previsto, validación RFC, usos/formas). **Receptor precargado desde el CRM** al elegir venta con `cliente_id` (RFC/razón social/email, sobreescribible).

### Sistema / Perfil

* PerfilScreen reescrito (era 100% mock): identidad real de sesión, métricas del día (ventas cobradas, propinas, hora de entrada del checador), teléfono espejado a `staff` por la cola, contraseña vía `supabase.auth.updateUser` SOLO elevados (operativos: aviso "tu PIN lo gestiona el Admin"), logout con el MISMO candado de jornada del sidebar (regs de asistencias, `tipo === 'entrada'` minúscula).
* Auditoría y Zonas de impresión: leen datos reales, sin cambios. Billing: paywall estático hasta activar SaaS.

### Núcleo previo (sin cambios, sigue verificado)

* Realtime: canal global único `kds-channel` (comandas, turnos, mesas, clientes) montado en `fetchInitialData` con singleton; teardown solo en logout. Guard de estampida (`_fetchEnCurso` + TTL 30s + no marcar offline con socket joined).
* Flujo empleados: `/loginempleados` (PIN 6, `AZUL-C172`) → `/checador` → ruta por rol. Candado `configuracion.horas_jornada`; salida anticipada con PIN Admin de staff. e2e helpers.js maneja `/checador` con el escape "Ya registré mi entrada" (NO registra Entrada real).
* Sync: dead-letter clasificada (`esErrorPermanente`); RPCs por cola: `decrementar_stock`, `registrar_visita_cliente`, `canjear_puntos`.
* EFs vivas (fuentes espejadas en repo): `login-pin` v2 (rate-limit IP 15min/10), `crear-empleado-auth` v3, `actualizar-credencial-empleado` v2. Deploy MCP: `import_map_path: 'deno.json'` explícito.
* Credenciales dev: Beto (Admin staff) `admin2@invventa.com` · Sairi (Gerente) `admin3@invventa.com` (REPARADA) · Diego Perez (Mesero) PIN `331213` · Cajero PIN `131415`.
* PIN del dueño: decisión de Chris — queda como está (solo Admins de staff autorizan descuentos/salidas).

## 3. Migraciones (historial remoto = archivos locales, 1:1)

`20260706224308_nominas_tipo_sueldo_y_roles_sin_propina` · `20260714224056_config_horas_jornada` · `20260715224806_realtime_mesas` · `20260715231058_crm_cliente_en_ventas_y_visitas` · `20260718153753_mesas_reserva_con_nombre` · `20260718153950_lealtad_recompensas_y_canje` · `20260718154508_recetas_paquetes_componentes`.

PENDIENTE de registrar: `p2_limpieza_funciones_storage_search_path` (aplicada en vivo vía execute_sql, sin archivo; reconstruir contra estado vivo si se quiere formalizar).

## 4. Advisors — hallazgos INTENCIONALES (no "arreglar")

`login_intentos` sin policies (solo service-role) · `get_restaurante_id` ejecutable por anon (devuelve null) · `decrementar_stock`, `registrar_visita_cliente`, `canjear_puntos` ejecutables por authenticated (SECURITY DEFINER con tenant validado interno) · Leaked password protection: TOGGLE MANUAL PENDIENTE en Dashboard → Authentication → Passwords.

## 5. SIGUIENTE PASO: Proyecto L de roles (arrancar con radiografía dedicada)

Objetivo: `roles_permisos` como ÚNICA fuente de verdad de los guards. Problemas conocidos:

1. **3 vocabularios de rol distintos** conviven (PermisosScreen escribe sobre ellos; ya no crashea pero el desorden sigue). Mapear TODOS los consumidores antes de tocar: guards de rutas (`App.jsx`, `TurnoRoute`, `EmpleadoRoute`), `getRutaInicial`/`RUTA_INICIAL_POR_ROL`, `ROLES_AUTORIZAN_DESCUENTO` (ModalCobro), `ROLES_ELEVADOS` (EFs ×3, PerfilScreen), `roles_sin_propina`, `esAdminSesion` (Configuración), candados del checador/sidebar/perfil.
2. "Capitán de meseros": check constraint en staff + toggle propinas + vocabulario.
3. Cuidado: los roles están QUEMADOS en las 3 EFs (`ELEVADOS = ['Admin','Administrador','Gerente']`) — cambiar el vocabulario exige redesplegar EFs en la misma tanda.
4. `staff.rol` vs `staff.puesto` espejados (puesto≡rol en el upsert de la EF) — decidir si `puesto` muere.

## 6. Horizonte (después de roles)

* Impresión térmica 58mm (Cocina/Barra separadas, sin precios, fallback offline) — QZ Tray vs Tauri ABIERTA.
* CFDI 4.0 con Facturama (FacturasScreen ya precarga receptor del CRM; falta el PAC real).
* Recepción/compras avanzado, importación CSV (reconstruir contra firma nueva si revive `procesar_inventario_masivo`).
* Tenant TEST dedicado para e2e (cada corrida escribe datos reales en AZUL).
* Dexie pierde momentáneamente contadores de cliente editado hasta el próximo fetch (mitigado con merge local; realtime no escribe Dexie — mejora posible).

## 7. Aprendizajes clave (nuevos de esta sesión)

* Mount del contenedor trunca lecturas al tamaño viejo tras escrituras del editor → **rename round-trip antes de git add, SIEMPRE** (3 incidentes; git commitearía blobs corruptos).
* Upsert de PostgREST solo escribe columnas presentes → payloads de EDICIÓN omiten campos acumulados por el server (anti-clobber de contadores CRM). Patrón replicable.
* Idempotencia de RPCs encoladas = ledger con PK compuesta `(restaurante_id, id_natural)` + `on conflict` → los reintentos post-timeout no duplican. Ya hay 2 casos (visitas, canjes).
* Ítems de comanda ≠ ítems de venta: la comanda expande paquetes por componente para enrutar por estación; la venta conserva la línea del combo con su precio.
* El costo de un paquete con elecciones se calcula con la opción MÁS CARA por grupo (no subestimar rentabilidad).
* eslint del repo corre en el contenedor (JS puro); esbuild/vitest NO (binarios Windows). `node --check` sirve para módulos sin JSX.
* Los line numbers de eslint/react-hooks señalan patrones legados (`Date.now()` en render de PosScreen, unused vars) — 15-23 errores conocidos que NO son regresiones; comparar contra la línea base antes de asustarse.
