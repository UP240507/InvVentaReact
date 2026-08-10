# Proyecto D — Rediseño de interfaz y experiencia (Tauri-first)

Decisión (Chris, 19-jul): **HÍBRIDO POR CONTEXTO**, un solo sistema de tokens con dos superficies.

- **ADMIN** (dashboard, reportes, catálogos, compras, RH, CRM, facturas, config): lenguaje EDITORIAL del mock de Figma Make — crema/terracota/marino claro + variante dark navy ("noche"), Fraunces para display, Figtree para UI, esquinas casi rectas (`--radius-adm`), denso, teclado-first.
- **OPERACIÓN** (POS, KDS, mesas, espera, checador, propinero): carácter INDUSTRIAL — targets táctiles ≥44px, cifras grandes legibles a un metro — y la ESTRUCTURA del mock: inspector contextual derecho, tabs de sección, atajos a la vista.
  - **CORRECCIÓN 1 (Chris, 25-jul)**: la regla original decía "operación NO cambia de paleta" (obsidiana/cesped/arrecife quemados). Estaba mal: el tenant elegía tema y no se notaba **justo en las pantallas que más se usan**. Ahora operación tiene sus propias variables por tema, `--ops-*`, con la misma mecánica que las `adm-*` (un bloque por tema × claro/oscuro).
  - **CORRECCIÓN 2 (Chris, 25-jul)**: el radio TAMPOCO distingue a las superficies. Convivían nueve radios (2.5rem en operación, 2px en admin, xl/2xl/3xl sueltos) y el salto entre pantallas se leía como dos productos distintos. Ahora hay **una escala única en toda la app**:
    - `--radius-ui` **2px** — controles y tarjetas (botones, chips, inputs, filas, pestañas).
    - `--radius-ui-lg` **4px** — superficies grandes (modales, paneles a ancho completo).
    - `rounded-full` queda fuera de la escala: ahí el círculo es la forma (avatares, puntos de estado), no una esquina.
    - **Por qué dos pasos y no uno**, con el multi-dispositivo en mente: el radio es un valor ABSOLUTO en px y no escala con el viewport, así que un mismo 2px se percibe redondo en un chip de 24px y desaparece en un modal de 600px — en el teléfono, a 30 cm, la diferencia se ve. Subir el radio solo en las superficies grandes mantiene la redondez PERCIBIDA constante de un chip a un modal.
    - Migrados 773 radios en 45 archivos. `--radius-adm` y `--radius-brand` se **eliminaron**: dejarlos vivos invitaba a reintroducir un radio fuera de la escala sin darse cuenta. Verificado por script que no queda ni uno suelto.
  - Conclusión: lo único que distingue admin de operación es el **carácter** —densidad, tamaño de los targets, escala tipográfica—, no el color ni la forma.
- Compartido: espaciado, iconografía (lucide), números tabulares, patrones de modal.

Referencia visual: zip de Figma Make (App.tsx con los 22 módulos mockeados + `design-system-spec.md` del industrial). Los tokens `adm-*` ya viven en `src/index.css` junto a los `ui-*`/`brand-*`.

## Temas de color (aprobados por Chris, 19-jul)

TRES temas por tenant (`configuracion.tema_color`, migración `20260720020019`, CHECK en DB) × claro/oscuro por dispositivo: **Terracota** (default, editorial del mock), **Vino × Cesped** (identidad vino + verde de marca como acción; en oscuro usa el cesped #00E5A0 puro) y **Fénix** (la paleta del logo: coral acción, esmeralda éxito, vino cobro, magenta detalles). Implementación: variables semánticas `--adm-*` por `[data-tema] × .dark` en `index.css` + `@theme inline` (utilidades `bg-adm-*` vivas); `aplicarTemaColor` en useAppStore (boot desde localStorage sin parpadeo, fuente de verdad el fetch/Dexie de configuracion); selector con swatches en Configuración → Restaurante, candado `admin_config`. Roles fijos de color: accent=acción, ok=éxito, danger=alerta, cobro=CTA dinero, chip=badge. Tema nuevo = un bloque CSS, cero JSX.

## Tandas

1. **Fundación** ✅ tokens semánticos + 3 temas + selector (hecho). PENDIENTE: fuentes self-hosted para offline/Tauri — `npm i @fontsource/fraunces @fontsource/figtree` e importarlas en `main.jsx` (Google Fonts no sirve offline sin el SW, y Tauri corre sin SW).
2. **Shell admin** ✅ (25-jul) — StatusBar inferior, sidebar editorial **colapsable 208↔56 con `Ctrl+B`** (persistido por dispositivo en localStorage; en modo icono los microtítulos de grupo se sustituyen por reglas y cada ítem lleva `title`), **Topbar** nueva (colapso, ubicación grupo+título, **buscador global**, centro de alertas) y **primitivas `adm-*` reutilizables**. Piezas nuevas:
   - `lib/Navegacion.js` — catálogo único del menú (antes embebido en SidebarLayout). Lo consumen sidebar, buscador y —tanda 3— `Ctrl+K`/`Ctrl+1..9`. Incluye `esRutaOperacion()`: **la superficie la decide la ruta aquí**, no cada pantalla (operación conserva fondo industrial, admin va sobre crema `adm-bg`).
   - `lib/BuscadorGlobal.js` — motor PURO (sin React/store/red). Indexa solo lo que el store ya tiene en memoria → funciona offline. Recursos: mesas, ingredientes, recetas, modificadores, proveedores, clientes, staff, órdenes de compra + navegación. **Doble candado de seguridad**: un recurso se indexa solo si su ruta está en el menú visible Y pasa `puedeVerRuta` (un mesero sin CRM no puede sacar la cartera de clientes por el buscador). 13 aserciones en `BuscadorGlobal.test.js`.
   - `components/Topbar.jsx` — el centro de alertas se MUDÓ aquí desde el sidebar (a 56px no cabía la campana, y una alerta de cobro no puede depender de que la barra esté expandida). `Ctrl+K` hoy enfoca el buscador: es el puente hacia la palette de la tanda 3.
   - `components/ui/Adm.jsx` + barril `ui/index.js` — PageShell, PageHeader, Button/IconButton, Card, Chip, EmptyState, SearchField, SegmentedControl, Field/Input/Textarea/Select, tabla densa (TableWrap/Table/THead/TBody/Th/Tr/Td/TdNum, zebra por CSS `even:`) y Modal/ConfirmModal. Cero colores literales: solo roles `adm-*`. **No importar en operación.**
   - `store/useShellStore.js` — preferencias de chasis (colapso, buscador), por dispositivo, fuera de useAppStore.
   - Pilotos migrados: **AuditoriaScreen** (patrón de tabla densa) y **ProveedoresScreen** (CRUD completo: grid, modal de alta/edición, confirmación destructiva). Proveedores estrena el contrato del buscador global: el término llega en `location.state.busquedaGlobal` y precarga el filtro de la pantalla — eso replica el resto en la tanda 5.
3. **Atajos de teclado** — capa global ✅ (25-jul); los scopes por módulo quedan para las tandas 4-5.
   - `lib/Atajos.js` — registro central puro, sin libs. UN listener en `window` despacha a los scopes registrados. Tres razones para el registro (y no `useEffect` sueltos, que es lo que había en la tanda 2): (a) F1 necesita poder LISTAR lo vigente, (b) **precedencia** — el scope montado más tarde gana sobre el global, así un módulo sobrescribe un atajo sin desregistrarlo, (c) un solo guard de "estoy escribiendo en un campo". Normaliza combos (`Shift+Ctrl+L` ≡ `ctrl+shift+l`) y usa la tecla FÍSICA (`e.code`) porque con Shift `e.key` llega transformado.
   - `hooks/useAtajos.js` — `useAtajos(scope, mapa, { titulo })`: alta/baja con el ciclo de vida del componente. Los handlers se resuelven contra un ref, así el mapa no re-registra el scope en cada tecleo. `useRegistroAtajos()` (useSyncExternalStore) alimenta la ayuda.
   - `components/AyudaAtajos.jsx` (**F1**) — se pinta desde el registro vivo, nunca de una lista escrita a mano: la ayuda no puede mentir. Un atajo sin `descripcion` no se documenta (incentivo a ponerla).
   - `components/CommandPalette.jsx` (**Ctrl+K**) — reusa `lib/BuscadorGlobal` tal cual y le suma `lib/Acciones`. **La palette es otra puerta de entrada, no un atajo visual**: pasa por los mismos filtros de capacidades y de plan que el sidebar. Se monta al abrir (estado limpio por ciclo de vida, sin efecto que resetee).
   - `lib/Acciones.js` — catálogo de acciones rápidas, puro y testeado: tema, colapsar menú, ver atajos, abrir/cerrar turno (gated por `abre_caja` + estado de caja), perfil, mi plan (`gestion`), cerrar sesión. Una acción sin callback no se muestra.
   - **Decisión de Chris (25-jul): el teclado es para la OPERACIÓN del día, no para navegar.** Se retiraron los `Ctrl+1..9`: un atajo que el cajero no usa cinco veces por turno no se memoriza y solo engorda la ayuda. Navegar se hace con `Ctrl+K`, que además busca. Globales, solo chasis: `Ctrl+K`, `Ctrl+B`, `Ctrl+Shift+L`, `F1`.
   - **Scopes operativos** (llaman a los MISMOS handlers que los botones, así que heredan sus gates — un atajo que esquive una validación es un bug de caja, no una comodidad; y se apagan con un modal encima):
     - **POS** — teclas de función, la convención de los POS de restaurante (Aloha/Micros/SoftRestaurant): `F9` cobrar · `F2` a producción · `F4` pedir la cuenta · `+/−` cantidad de la última línea agregada · `Esc` salir. Con un cuadro abierto, un scope `pos-modal` de mayor precedencia hace que `Esc` cierre el cuadro en vez de sacarte del POS.
     - **KDS** — `1..9` marcan lista la comanda N de la estación (badge numerado en cada tarjeta; solo hasta 9, más allá el operador ya no cuenta de un vistazo) · `←/→` cambian de estación · `Esc` sale. La cocina no usa ratón: hay grasa, prisa y a veces guantes.
     - **Mesas** — `flechas` mueven la selección (las verticales saltan una fila real: se leen las columnas del grid con `getComputedStyle`, que es responsive 1→5) · `Enter` abre —o **cobra**, y la etiqueta del hint lo dice, si la mesa está `por_cobrar`— · `R` reservar/liberar · `T` traspasar · `J` juntar · `E` editar.
   - **Mesas estrena selección de teclado**: no existía (el clic mandaba directo al POS). Es DERIVADA, no un espejo en estado — si la mesa se filtra o desaparece, el cursor cae solo en la primera; un `useEffect` que "corrigiera" el id sería render en cascada y un bug en cuanto llegue un realtime. El clic también mueve el cursor, para que ratón y teclado no se peleen. Es la base del inspector contextual de la tanda 4.
   - `components/HintsAtajos.jsx` — tira de teclas del scope activo, del registro vivo. Existe porque un atajo que solo vive en F1 no se aprende: en turno nadie abre la ayuda, la ve de reojo mientras cobra.
   - **El buscador inline del topbar se retiró**: ahora ese control abre la palette. Dos buscadores con dos comportamientos de teclado para la misma intención era duplicidad; el motor siempre fue el mismo.
   - Precedencia **por montaje, no por último registro** (`siguienteOrden()` + `orden` reservado en el hook). Varias etiquetas son dinámicas → el scope se re-registra a menudo; sin orden reservado, el global iría adelantando al módulo y le robaría las teclas. La firma del hook incluye las descripciones, si no el hint se congelaría en su primer valor y la ayuda mentiría.
   - De paso: el claro/oscuro tenía TRES copias (SidebarLayout y KdsScreen con `useState` propio + `temaGlobal` en useAppStore). Alternar en el sidebar no movía el switch de PerfilScreen. Unificado en el store, y `temaInicial()` ahora respeta la preferencia del sistema igual que el boot de App.jsx.
   - PENDIENTE: tablas admin (`flechas`/`Enter`/`N`) en la tanda 5, con el patrón de DataTable.
4. **Módulos piloto** ✅ (25-jul) — Dashboard editorial + Mesas industrial con inspector. El híbrido queda validado en las dos superficies.
   - **BUG GORDO ENCONTRADO**: el Dashboard leía `useAppStore().ordenes`, una colección que **no existe** (las ventas viven en `ventas`, las comandas en `comandas_activas`). Ingresos, tickets y comandas mostraban **cero desde siempre**, sin fallar ni avisar. De ahí la decisión de mover los cálculos a `lib/`: dentro de un JSX de 280 líneas ese error era invisible.
   - `lib/Metricas.js` (puro, 22 aserciones) — rangos hoy/semana/mes, agregados, serie y P&L. Dos decisiones que conviene no revertir: **(a)** el periodo anterior se corta a la MISMA ALTURA (a las 13:00 se compara contra ayer hasta las 13:00; si no, cada mañana parecería que el negocio se hunde) y **(b)** la propina NO entra en ingresos — es del personal, sumarla inflaría el margen.
   - **P&L**: costo REAL por receta (`receta.costo`, que RecetasScreen ya calcula desde los insumos), con el costo **congelado en el ticket** por encima del actual —usar el de hoy reescribiría la historia cada vez que sube un insumo— y respaldo de food cost % para lo no costeado. La tarjeta declara `pctEstimado`, medido en **dinero y no en número de líneas**: un platillo caro sin costear pesa más que tres baratos.
   - `lib/Alertas.js` (puro, 14 aserciones) — sustituye la tarjeta "Sin Alertas · Módulo de Alertas" al 60% de opacidad que llevaba meses mintiendo. Desabasto (agotado = crítica, bajo mínimo = aviso), dead-letter, mesas estancadas en cobro (>15 min) y jornadas sin cerrar. **Una alerta que no se puede accionar es ruido**: cada una trae ruta, CTA y gate de capacidad.
   - **Dashboard**: selector de periodo, KPIs con comparativa, gráfico de barras en **SVG a mano** (meter recharts para pintar barras engorda el bundle de una app que arranca en una caja modesta y offline), P&L y top de platillos — finanzas solo para `gestion`. Borrados los 6 `Widget*.jsx` muertos (no los usaba nadie y además leían `v.granTotal`, campo que tampoco existe).
   - **Mesas · InspectorMesa**: panel derecho industrial (se cae por debajo de `xl`) con cuenta viva, tiempo abierta, mesero, estado de rondas y acciones con sus teclas. El tiempo se cuenta desde la **primera comanda activa** porque la mesa no guarda hora de apertura — y si no hay comandas, no se inventa. Los callbacks son los mismos que usan las tarjetas y los atajos: una implementación por acción, tres formas de invocarla.
5. **Resto de módulos** por grupos. **Operación ✅ (25-jul)** — Chris decidió empezar por aquí en vez de por catálogos.
   - `components/ui/Ops.jsx` — el gemelo industrial de `Adm.jsx`: OpsShell, OpsHeader (con la tira de atajos integrada), OpsTabs, OpsCard, OpsButton, EstadoChip, OpsEmpty, AvisoOffline, OpsModal. **Dos juegos de primitivas y no uno con variantes**, porque las reglas son opuestas: admin es denso, esquinas rectas y se lee sentado a 50 cm; operación es táctil, `rounded-[2rem]` y se lee de pie a un metro. Todos los tamaños de `OpsButton` respetan el mínimo táctil de **44px** — un botón de 32px con las manos ocupadas es un error de cobro.
   - **Aplicado a las 4**: Mesas (cabecera + pestañas de zona, que ahora muestran quién atiende), KDS (cabecera + pestañas de estación + estado vacío + modal de purga), POS (modal de rondas + los tres botones del carrito) y Propinero (shell, cabecera, aviso offline, pestañas de periodo y botones de registro).
   - **Las teclas viajan impresas en los botones** (`tecla` en OpsButton): F2/F4/F9 en el carrito del POS, F9/Esc/Enter en el Propinero, J en Juntar. El atajo se aprende usando el ratón.
   - Propinero estrena su scope de atajos: `←/→` periodo, `1·2·3` método, `F9` registrar, y un segundo scope que con la confirmación abierta reduce el teclado a `Esc`/`Enter` — nada de cambiar el periodo con el reparto a medio confirmar.
   - **Decisiones de Chris (25-jul)**: la barra de estado NO vuelve a POS/KDS (se quedan a pantalla completa; el aviso flotante de offline ya cubre el caso) y el KDS **no lleva inspector** — 320px menos de rejilla es una tarjeta menos por fila, y la comanda ya es la unidad de trabajo completa.
   - **Tokens `--ops-*` (25-jul, a raíz de que Chris notara que el tema no llegaba a operación)**: 16 roles × 6 bloques (3 temas × claro/oscuro). Roles: `bg/panel/panel-2`, `ink/muted/border`, `accent(+fg)`, `cobro(+fg)`, `ok(+fg)`, `danger(+fg)`, `warn`, `info`. Los **estados de mesa mapean a roles, no a colores** (libre→ok, ocupada→danger, por_cobrar→warn, reservada→info): por eso el mapa se lee igual en los tres temas.
     - Migradas a `ops-*`: `Ops.jsx`, `InspectorMesa`, Mesas, KDS, POS, Propinero, `ModalCobro`, `PanelRondas`, `TurnoWidget`, `EsperaScreen`, `ConfirmacionStockModal`. **Cero colores literales en operación** (verificado por script).
     - `TicketImpresion` es la excepción deliberada: solo se tematiza el chrome del modal. El cuerpo del ticket se queda en negro sobre blanco porque **se imprime en papel térmico**, donde el tema del tenant no existe.
     - **90 pares de contraste verificados** (texto/fondo y fg-sobre-color en los 6 bloques): todos ≥ 4.5:1 (AA). El script vive en el historial de la sesión; conviene reejecutarlo al tocar un color.
     - Verificado también que no queda ninguna utilidad `-ops-*` usada pero no registrada en `@theme inline` — una utilidad con typo renderiza sin color y no falla en ningún sitio.
   - **Admin ✅ (25-jul)** — las 16 pantallas restantes migradas a `adm-*` (catálogos, compras/almacén, RH/CRM, análisis, Configuración, Perfil, login de empleados) más el shell: `SidebarLayout` (toasts, popup de cobro, indicador offline y sus dos modales, que se veían en TODA la app), `App.jsx` (chasis y pantalla de carga) y los modales de turno.
     - **Roles nuevos en `adm-*`**: faltaban `warn` e `info` —las pantallas usaban ámbar e índigo a mano— y los `-fg` de `ok`, `danger`, `warn` e `info` para los fondos sólidos. De 17 a 23 tokens.
     - **10 pares AA que ya fallaban** aparecieron al verificar y se corrigieron: `sidebar-muted` sobre el menú en los 4 bloques oscuros (son los microtítulos de grupo, texto pequeño), `accent` sobre panel en oscuro, `chip-fg` en vino y fénix, `ok` sobre panel, y `muted` sobre panel en los oscuros. La tanda 0 solo había arreglado `muted` en los claros.
     - Al aclarar `--adm-accent` en oscuro para que se viera sobre el panel, el blanco encima dejó de contrastar: `--adm-accent-fg` pasa a ser el fondo oscuro. Es el tipo de efecto en cadena que solo sale con el chequeo completo.
     - **252 pares verificados** en los 12 bloques (3 temas × claro/oscuro × 2 superficies): todos ≥ 4.5:1.
     - **Excepciones documentadas** (las únicas tres con color literal): el cuerpo del ticket en `TicketImpresion` (se imprime en papel térmico), el verde `#25D366` del botón de WhatsApp en Compras (marca ajena: debe reconocerse en cualquier tema) y el papel crema del propio ticket.
     - Al mapear aparecieron degradados `from-X to-X` —antes iban de índigo a violeta, que ahora son el MISMO rol— colapsados a fondo sólido.
   - **`components/ui/DataTable.jsx` (25-jul)** — la tabla densa del mock CON selección por teclado; cierra el pendiente "tablas admin flechas/Enter/N" que venía de la tanda 3. `↑↓` mueven el cursor, `PageUp/PageDown` saltan de diez en diez (en un catálogo de 300 insumos, bajar de uno en uno no es navegación, es paciencia), `Enter` abre, `N` crea, `Supr` elimina. Se registra en el sistema central, así que sale solo en F1 y en la tira de hints.
     - **No decide nada**: si `onEditar` u `onNuevo` no llegan, el atajo no se registra. Los permisos los aplica la pantalla, igual que en operación.
     - La selección es DERIVADA (mismo criterio que el mapa de Mesas): si la fila se filtra, el cursor cae en la primera en vez de apuntar a un id fantasma.
     - El cursor se marca con un **filete a la izquierda**, no con relleno: sobre la zebra un fondo se confunde con "fila par" y deja de leerse como selección.
     - Los atajos se apagan con un modal encima — `Supr` no puede borrar la fila de detrás mientras editas otra cosa.
   - **Catálogos ✅ (3/3)**: Ingredientes y Recetas en DataTable; Modificadores en rejilla de tarjetas.
     - **La estructura la elige el DATO, no la uniformidad.** Modificadores **no** usa tabla porque un grupo contiene una LISTA de opciones: aplanarla o esconderla tras un clic sería peor: la tarjeta enseña las tres primeras, que es como se revisa un menú. **Recetas sí** la usa, y por el motivo inverso: "ingeniería de menú" es comparar costo, precio y margen ENTRE platillos, y en una rejilla eso obliga a recorrer la pantalla en zigzag; en tabla la columna de rentabilidad se lee de arriba abajo. Se perdió el agrupado por categoría (ahora es una columna) a cambio de poder comparar.
   - **Mermas ✅** — historial en DataTable **sin** `onEditar`/`onEliminar`: es un LIBRO, no un catálogo. Un ajuste de inventario no se deshace, se compensa con otro; como los callbacks no llegan, esos atajos ni se registran, así que `Supr` no existe en esa pantalla.
   - `PageHeader` gana `scopeAtajos`, en paridad con `OpsHeader`.
   - **Compras y almacén ✅** — Mermas, Recepción y Compras. Se consolida un criterio sobre CUÁNDO la tabla no lleva acciones:
     - **Mermas y Recepción (historial)**: sin `onEditar`/`onEliminar`. Son libros — el ajuste ya movió stock y costos; corregirlo es otra operación, no "editar una fila".
     - **Compras**: sin `onEditar` (una orden emitida no se corrige, se cancela y se emite otra: el proveedor ya tiene la primera) y **sin `onEliminar` a propósito** — cancelar NO es borrar, y sale por su icono con la regla de "solo si está pendiente". Un `Supr` que cancelara órdenes sería peligroso. Sí tiene `onNuevo`: `N` salta a la pestaña del asistente.
     - **Recepción (pendientes) no es tabla**: cada orden es una decisión con un botón grande, no un registro que se compara con el de al lado.
   - **RH y CRM (parcial ✅)** — Empleados y Clientes a DataTable.
     - **Empleados**: la plantilla es una lista que se compara (quién está activo, con qué rol); en tarjetas, "¿cuántos meseros tengo?" obliga a contar a ojo. Sin `onEliminar`: aquí no se borra, se da de BAJA — y la baja libera cupo del plan, así que un `Supr` sin confirmar sería un accidente esperando a pasar.
     - **Clientes**: el CRM se usa para PREGUNTAR (quién gasta más, quién no vuelve), y eso es ordenar y comparar. `Enter` abre el **panel de detalle**, no el formulario: en CRM lo primero que se quiere ver es el historial, no editar el teléfono. Se recuperó el bloquear/desbloquear que la rejilla tenía y la tabla se había comido.
   - **BUG DE SUPERFICIE corregido (introducido en esta misma tanda)**: `/checador` y `/loginempleados` están en `RUTAS_OPERACION`, así que el chasis les daba fondo `ops-bg`, pero por dentro habían quedado con tokens `adm-*` en el barrido de color — dos superficies mezcladas en la misma pantalla. Son **kioscos** (se usan de pie, con prisa, tocando), así que se migraron a `ops-*` (156 usos). Verificado por script que ninguna pantalla mezcla las dos superficies, salvo `SidebarLayout`, que lo hace a propósito por ser el chasis de ambas.
   - **RH ✅**: Nóminas (pestañas generar/historial en la cabecera) y Permisos (matriz de capacidades, con su editor de dos paneles intacto).
   - **Análisis ✅**: Reportes (cabecera + rango de fechas + pestañas) y Facturas (CFDI en DataTable; **sin `Enter` ni `Supr`**: un CFDI timbrado no se edita ni se borra, se cancela ante el SAT).
     - **BUG REAL corregido en Facturas**: `TextField` y `SelectField` estaban definidos DENTRO del render. Cada pulsación creaba un componente nuevo → React remontaba el input → **se perdía el foco al escribir el RFC**. Es exactamente el fallo que documenta el comentario de `LabelInput` en ProveedoresScreen, repetido aquí. Sustituidos por `Field`/`Input`/`Select` a nivel de módulo.
   - **Sistema ✅**: Zonas de Producción, Perfil (la cabecera es una FICHA de identidad —avatar, rol, antigüedad—, no un título: se conserva tal cual y solo se envuelve) y Configuración.

### Estado final de la tanda 5

| | Pantallas |
|---|---|
| **19 con primitivas** | Auditoría, Configuración, Zonas, Facturas, Reportes, Perfil, Ingredientes, Modificadores, Recetas, Compras, Recepción, Clientes, Dashboard, Mermas, Proveedores, Propinero, Empleados, Nóminas, Permisos |
| **3 con layout propio justificado** | POS y KDS (pantalla completa, sin shell), Mesas (mapa + inspector). Usan las primitivas `Ops*` donde aplica. |
| **7 de fase 1** | Login, LoginEmpleados, Registro, Espera, Checador, Billing, Paywall. Usan tokens correctos y radio unificado; no pasan por `PageShell` porque son pantallas de una sola pieza (kiosco o formulario). Migrarlas sería cosmético. |

**Verificado por script al cierre:** cero colores literales (salvo las 3 excepciones documentadas), cero radios fuera de escala, ninguna pantalla mezcla superficies, 252 pares de contraste ≥ AA, 79 aserciones de librería pasando. **ESLint: 35 errores, todos preexistentes — la línea base era 60.**
   - **Deuda detectada**: `components/AppLayout.jsx` y `views/EscritorioTest.jsx` (188 usos de la paleta vieja entre las dos) son una maqueta de exploración temprana con su propia ruta `/escritorio-test`. **Chris pidió conservarlas** (25-jul) para pruebas posteriores: no se tocan ni se borran, y quedan fuera de las auditorías de paleta por eso.

### Pantalla 20 · Gastos (fase 2.5, 26-jul)

Entra después de cerrar la tanda 5, con el patrón ya probado: `PageShell` + `PageHeader`
+ `DataTable`, superficie admin, gate `gestion`. Lo único que la distingue de las otras
19 es que **el origen de la fila cambia lo que se puede hacer con ella**:

| Origen | En la tabla |
|---|---|
| `manual` | Editable y borrable: lo capturó una persona, una persona lo corrige. |
| `recurrente` | Nace **pendiente**. El recibo varía cada mes: la plantilla propone, el dueño confirma el monto real. |
| `nomina` | **Solo lectura, con candado.** No es un gasto capturado sino el reflejo de una nómina; editarlo aquí abriría dos verdades para la misma cifra. Se corrige en Nóminas. |

Es la misma idea que ya gobernaba Mermas, Compras y Facturas —un libro no se edita, se
compensa— aplicada a nivel de fila en vez de a nivel de pantalla.

Las **plantillas recurrentes** no viven en la tabla sino en un panel aparte, y es una
distinción de fondo, no de espacio: una plantilla no es un gasto, es la regla que propone
uno cada mes. Mezclarlas en la misma lista obligaría a inventar una fila que no tiene
fecha ni importe real. Por eso el panel también es el único sitio de la app donde **sí**
hay borrado real: una regla a futuro se elimina sin alterar ninguna cifra pasada, mientras
que un gasto se da de baja lógica. **Pausar** existe aparte de borrar porque un negocio
que cierra dos meses en temporada baja quiere detener la renta sin perder la plantilla.
6. **Pulido ✅ 27-jul.** El muted sobre crema ya se corrigió en la tanda 5 (#7a746a → #6a645a).

   **Movimiento — tres velocidades, no un número.** El plan decía "transiciones 250ms",
   pero una duración única es incorrecta: depende de cuánta superficie se mueve y de si el
   usuario está esperando. Un hover a 250ms se siente desconectado de la mano; un cambio
   de tema instantáneo se lee como un parpadeo. La escala quedó en `--dur-rapida` (120ms,
   hover/focus), `--dur-media` (250ms, layout y modales) y `--dur-lenta` (400ms, superficie
   completa). Importa más en operación: el POS se usa con prisa y medio segundo en un botón
   de cobro es tiempo real perdido.

   **Estados vacíos — el hueco estaba en Mesas.** Casi todas las pantallas ya los tenían.
   Mesas no: con la lista vacía no pintaba nada. Se añadieron **dos**, no uno: "aún no hay
   mesas" (con acción para crear la primera) y "sin mesas en esta área" (con acción para
   quitar el filtro). Un mensaje genérico obligaría al usuario a averiguar cuál de los dos
   problemas tiene.

   **AA — el verificador es ahora parte del repo** (`npm run contraste`): 234 pares en 6
   combinaciones de tema × modo. Deja de depender de que alguien se acuerde de revisarlo. A
   ojo solo se revisa el tema por defecto en claro, que es el que uno tiene abierto, y los
   otros cinco bloques se rompen sin que nadie lo note — así aparecieron los 10 fallos de
   la tanda 5.

   **Borde: dos tokens porque hacen dos trabajos.** Un separador de tarjeta y el contorno
   de un input se veían iguales en el código (`--adm-border`) y no son lo mismo: el primero
   es decoración y el segundo es la única señal de dónde se puede escribir. Se separó en
   `--adm-field` / `--ops-field` (~3.3:1, calculado por tema) para los controles, dejando
   el separador tal cual. Lo incómodo del fallo original es que **no se ve**: un input con
   el token de separador parece "limpio" y es inaccesible. Por eso el verificador trata al
   token de control como obligatorio y al separador como aviso.

8. **Title bar nativa de Tauri**: se mueve a la fase 3. Es shell de escritorio, no rediseño.

## Encargos añadidos (Chris, 19-jul)

- **Reparar la pantalla de login**: hay algo roto en LoginScreen (pedir a Chris el síntoma exacto al arrancar la tarea). Aprovechar para rediseñarla con los temas `adm-*` — es la primera cara del producto.
- **Diseñar los planes de suscripción**: tiers y precios (~399–699 MXN/mes según traspaso), límites por plan (dispositivos, empleados, módulos premium: CFDI, CRM/lealtad, reportes avanzados), modelo de datos + enforcement, y rediseño de BillingScreen/PaywallScreen (hoy paywall estático).

## Notas del análisis del mock

- El mock es maqueta estática (tokens JS inline, un archivo): se TRADUCE a los componentes reales, no se importa.
- Sus atajos son solo hints visuales — la implementación es nuestra (tanda 3).
- El dark navy del mock reemplaza al obsidiana SOLO en superficie admin; operación no cambia de paleta.
- Touch targets del mock (12px/filas densas) son correctos en admin desktop, prohibidos en operación.
