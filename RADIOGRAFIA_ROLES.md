# Radiografía de roles — Proyecto L

Fecha: 18 de julio de 2026 · Tenant AZUL (`aorrfmxduefqwlrhfzzf`) · Solo lectura, cero cambios aplicados.

## 1. Los 3 vocabularios (verificados en código y DB viva)

### A. Canónico operativo — `staff.rol` / `staff.puesto` (CHECK en DB)
`Admin · Gerente · Cajero · Mesero · Chef · Barista`

- `staff_rol_check` y `staff_puesto_check` son idénticos (mismo array).
- Datos vivos AZUL: `Admin(1) · Gerente(1) · Cajero(1) · Mesero(1)`, con `rol ≡ puesto` en las 4 filas (el espejo de la EF funciona).
- `usuarios.rol` (dueño): `Admin(1)`. Mismo vocabulario A.
- EmpleadosScreen escribe este vocabulario: el `<select>` usa `value="Admin"` / `value="Chef"` / `value="Barista"` aunque la ETIQUETA visible diga "Administrador"/"Cocinero" — la etiqueta engaña, el valor es canónico.

### B. Guards del frontend — listas quemadas
`Admin · Administrador · Gerente · Cajero · Mesero · Chef · Barista`

Igual que A **más `'Administrador'`**, que hoy es **letra muerta**: no puede existir en `staff` (el CHECK lo rechaza) y no existe en `usuarios`. Aparece en TODAS las listas quemadas como defensa legada.

### C. PermisosScreen / `roles_permisos` — vocabulario huérfano
`Administrador · Gerente · Cajero · Mesero · Cocinero · Hostess · Limpieza`

- 3 roles fantasma que NO existen en staff ni pueden existir: `Cocinero` (≠ `Chef`), `Hostess`, `Limpieza`. Y le FALTAN `Admin`, `Chef`, `Barista`.
- Módulos jsonb: `TODO · POS · Mesas · Comandas · Inventario · Menu · Staff · Nominas · Reportes · Configuracion` + `Corte_Caja` (legacy solo en datos vivos, ya no está en `MODULOS_SISTEMA`).
- Datos vivos AZUL: `Administrador:[TODO] · Gerente:[POS,Mesas,Corte_Caja,Inventario,Staff] · Cajero:[POS,Mesas,Corte_Caja] · Mesero:[Mesas] · Cocinero:[Comandas]`.

## 2. Hallazgo central

**`roles_permisos` es write-only.** Ningún guard la lee. Los únicos consumidores son PermisosScreen (UI de edición) y la hidratación de useAppStore/Dexie. La fuente REAL de los guards es `RUTAS_POR_ROL` + `RUTA_INICIAL_POR_ROL` quemadas en `useSessionStore.js`. El Proyecto L consiste en invertir esto: `roles_permisos` como única fuente, las constantes quemadas como fallback offline.

## 3. Matriz de consumidores (todo lo que compara roles)

| Consumidor | Archivo:línea | Lista usada | Lee de |
|---|---|---|---|
| `RUTAS_POR_ROL` (guard rutas empleado) | `useSessionStore.js:6` | A+B completo, fallback `Mesero` | quemado |
| `RUTA_INICIAL_POR_ROL` | `useSessionStore.js:39` | A+B, fallback `/mesas` | quemado |
| `puedeAcceder` (bypass admin) | `useSessionStore.js:78` | `[Admin, Administrador]` | quemado |
| `hayTurnoActivo` (exentos de turno) | `useSessionStore.js:95` | `[Admin, Administrador, Gerente]` | quemado |
| Guard dueño (rutas + redirect) | `App.jsx:82,102,112` | `[Admin, Administrador, Gerente]` sobre `user?.rol` | quemado |
| Sidebar `esGestion` / `verCobros` / rutas | `SidebarLayout.jsx:196-266` | A+B, fallback `Mesero`; candado logout exenta `[Admin, Administrador]` (:578) | quemado |
| `ROLES_AUTORIZAN_DESCUENTO` | `ModalCobro.jsx:83` | `[Admin, Administrador, Gerente]` | quemado |
| `ROLES_ELEVADOS` (contraseña/perfil) | `PerfilScreen.jsx:31`; exentos jornada `:150` | `[Admin, Administrador, Gerente]` / `[Admin, Administrador]` | quemado |
| `ROLES_EXENTOS_JORNADA` + `esGestion` + PIN autorizador | `RelojChecadorScreen.jsx:33,150,255-259` | `[Admin, Administrador]` / `+Gerente` | quemado |
| `ROLES_ABRIR_CAJA` | `EsperaScreen.jsx:17` | `[Cajero, Gerente, Admin, Administrador]` | quemado |
| `esAdminSesion` (config sensible) | `ConfiguracionScreen.jsx:113` | `[Admin, Administrador]` | quemado |
| `roles_sin_propina` (default) | `ConfiguracionScreen.jsx:92-103`, `PropineroScreen.jsx:214-216` | lista editable, default `[Admin, Administrador, Gerente]` | `configuracion` ✓ |
| `esAdminPrincipal` (dashboard) | `DashboardScreen.jsx:87` | `[Admin, Administrador]` sobre `user?.rol` | quemado |
| `esElevado` (alta empleado) | `EmpleadosScreen.jsx:59` | `rol === 'Admin' \|\| 'Gerente'` — **NO incluye 'Administrador'** (inconsistente con EFs, hoy inofensivo) | quemado |
| `ELEVADOS` ×3 EFs | `login-pin:15`, `crear-empleado-auth:16`, `actualizar-credencial-empleado:16` | `[Admin, Administrador, Gerente]` | quemado en Deno |
| PermisosScreen | `PermisosScreen.jsx:21` | vocabulario C | `roles_permisos` (write-only) |

Patrón de resolución repetido 6+ veces: `empleadoActivo.rol || empleadoActivo.puesto || 'Mesero'` (useSessionStore ×3, SidebarLayout, RelojChecador ×2). Candidato a helper único `getRolEfectivo()`.

## 4. Riesgos para la unificación

1. **EFs quemadas**: cambiar vocabulario o mover ELEVADOS a `roles_permisos` exige redesplegar las 3 EFs EN LA MISMA TANDA (deploy con `import_map_path: 'deno.json'`). `rolCaller` se resuelve `usuarios` → fallback `staff`.
2. **`crear-empleado-auth:159` espeja `puesto: rol`**: si `puesto` muere, tocar EF + check constraint + payload de EmpleadosScreen (`:175-177`) juntos.
3. **`roles_permisos` no tiene vocabulario compatible**: migrar datos vivos C→A (`Cocinero`→`Chef`, `Administrador`→`Admin`, sembrar `Barista`, decidir destino de `Hostess`/`Limpieza`) antes de que cualquier guard la lea. `Corte_Caja` legacy en datos: mapear o purgar.
4. **Offline-first**: los guards corren sin red; `roles_permisos` ya se hidrata a Dexie (PK migrada a `id` en v13), así que leerla localmente es viable, pero el fallback quemado debe quedarse para primera sesión sin fetch.
5. **"Capitán de meseros"** (pendiente de Chris): entrar al CHECK de staff + `RUTAS_POR_ROL` + `roles_sin_propina` + decisión propinas, en la misma tanda que se toque el constraint.
6. **`restaurante_id` nullable en `roles_permisos`**: endurecer a NOT NULL al formalizar (multi-tenant).

## 5. Plan propuesto (tandas)

1. **Normalizar vocabulario a A** (migración de datos en `roles_permisos` C→A + PermisosScreen usa el select canónico de EmpleadosScreen; sin tocar guards). Purgar `'Administrador'` de las listas quemadas del front y de las EFs (redeploy ×3) — hoy es letra muerta, riesgo mínimo.
2. **Helper `getRolEfectivo()` + `usePermisos()`**: lectura de `roles_permisos` (Dexie) con fallback a `RUTAS_POR_ROL`. Migrar guards uno por uno (sidebar → rutas → candados) con prueba en caliente por guard.
3. **Elevados/descuentos/caja como permisos** (`ELEVADOS`, `ROLES_AUTORIZAN_DESCUENTO`, `ROLES_ABRIR_CAJA` → flags en `permisos` jsonb) + redeploy EFs.
4. **Capitán de meseros + destino de `staff.puesto`** (constraint + EF + screen en una tanda).
