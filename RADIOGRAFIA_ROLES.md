# Radiografía de roles — Proyecto L

Fecha: 18 de julio de 2026 · Tenant AZUL (`aorrfmxduefqwlrhfzzf`) · Solo lectura, cero cambios aplicados.

> **Avance**: tanda 1 CERRADA (migración `20260718231143`, front purgado, EFs v4/v5/v3) — probada en caliente.
> Tanda 2 CERRADA: `roles_permisos.capacidades` jsonb (migración `20260719014225`, seed espejo; `autoriza_salidas` SOLO Admin, fiel al pinpad del checador) + `lib/Permisos.js` (`CAPACIDADES_BASE` fallback) + `hooks/usePermisos.js`; guards migrados a flags: useSessionStore, App.jsx, SidebarLayout, ModalCobro, RelojChecador, PerfilScreen, EsperaScreen, Configuración (con `ROLES_STAFF` vivo desde roles_permisos), Dashboard. `RUTAS_POR_ROL`/`RUTA_INICIAL_POR_ROL` eliminados.
> Tanda 3 CERRADA: EFs data-driven — `login-pin` v6 (bloqueo PIN por flag `elevado`), `crear-empleado-auth` v7 y `actualizar-credencial` v4 (caller por `gestion`, credencial por `elevado`; fallback `ELEVADOS_BASE`); EmpleadosScreen decide contraseña/correo por el mismo flag. > Tanda 4 CERRADA — PROYECTO L COMPLETO: migración `20260719024028` (drop CHECKs de staff; FK compuesta `staff(restaurante_id, rol)` → `roles_permisos` con ON UPDATE CASCADE / ON DELETE RESTRICT, hot-test con reversión: cascade ✓, rol fantasma rechazado ✓, borrar rol en uso rechazado ✓). PermisosScreen v2: CRUD de roles libres (crear/duplicar/renombrar/eliminar con candados `es_sistema` y rol-en-uso) + editor de capacidades (flags, rutas, ruta inicial) + módulos legacy. EmpleadosScreen con select de rol dinámico. `staff.puesto` sigue como espejo cosmético SIN constraint (decisión: matarlo es tanda aparte, opcional).

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
5. **Roles LIBRES (decisión de Chris 18-jul)**: no habrá roles quemados — el tenant crea los suyos. "Capitán de meseros" deja de ser feature: es duplicar Mesero y apagar propinas. Consecuencias: muere el CHECK de `staff.rol` (lo reemplaza FK compuesta `(restaurante_id, rol)` → `roles_permisos` con `ON UPDATE CASCADE`; `rol` sigue siendo texto para no tocar payloads); los guards NO pueden comparar nombres — todo migra a flags de capacidad en `permisos` jsonb; se requiere rol `es_sistema` no-borrable (Admin) por tenant + seed de roles base al crear restaurante.
6. **`restaurante_id` nullable en `roles_permisos`**: endurecer a NOT NULL al formalizar (multi-tenant).

## 5. Plan propuesto (tandas) — actualizado a roles LIBRES

Esquema destino de `permisos` jsonb por rol: `{ rutas: [], ruta_inicial, elevado, autoriza_descuentos, abre_caja, exento_jornada, exento_turno, sin_propina, admin_config, es_sistema }`. Los guards leen FLAGS, jamás nombres de rol.

1. **Normalizar datos + purgar letra muerta**: migrar `roles_permisos` vivos C→A (`Cocinero`→`Chef`, `Administrador`→`Admin`, sembrar `Chef`/`Barista` reales, purgar `Hostess`/`Limpieza`/`Corte_Caja`), sembrar el jsonb de flags equivalente al comportamiento quemado actual, marcar Admin `es_sistema`. Purgar `'Administrador'` de listas quemadas del front y EFs (redeploy ×3) — letra muerta, riesgo mínimo. `restaurante_id` NOT NULL.
2. **Helper `getRolEfectivo()` + hook `usePermisos()`**: lectura de `roles_permisos` (Dexie) con fallback quemado solo para sesión virgen. Migrar guards uno por uno (sidebar → rutas → candados de jornada/turno) con prueba en caliente por guard.
3. **Flags de capacidad en EFs y modales**: `ELEVADOS`, `ROLES_AUTORIZAN_DESCUENTO`, `ROLES_ABRIR_CAJA`, `esAdminSesion` → flags; `login-pin` decide password/PIN por `elevado` (join a roles_permisos). Redeploy ×3 en la misma tanda.
4. **Roles libres**: drop CHECK de `staff.rol`/`puesto` → FK compuesta `(restaurante_id, rol)` con `ON UPDATE CASCADE`; PermisosScreen gana crear/renombrar/duplicar/borrar rol (borrar bloqueado si hay staff con ese rol o `es_sistema`); el select de EmpleadosScreen se vuelve dinámico desde `roles_permisos`. Decidir destino de `staff.puesto` aquí (candidato a morir: EF `crear-empleado-auth:159` + payload EmpleadosScreen juntos).
