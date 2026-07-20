# Proyecto D — Rediseño de interfaz y experiencia (Tauri-first)

Decisión (Chris, 19-jul): **HÍBRIDO POR CONTEXTO**, un solo sistema de tokens con dos superficies.

- **ADMIN** (dashboard, reportes, catálogos, compras, RH, CRM, facturas, config): lenguaje EDITORIAL del mock de Figma Make — crema/terracota/marino claro + variante dark navy ("noche"), Fraunces para display, Figtree para UI, esquinas casi rectas (`--radius-adm`), denso, teclado-first.
- **OPERACIÓN** (POS, KDS, mesas, espera, checador, propinero): conserva el INDUSTRIAL dark actual (obsidiana/cesped/arrecife, radius 2.5rem) — targets touch grandes, legible a distancia — pero adopta la ESTRUCTURA del mock: inspector contextual derecho, status bar inferior, tabs de sección.
- Compartido: espaciado, iconografía (lucide), números tabulares, patrones de modal.

Referencia visual: zip de Figma Make (App.tsx con los 22 módulos mockeados + `design-system-spec.md` del industrial). Los tokens `adm-*` ya viven en `src/index.css` junto a los `ui-*`/`brand-*`.

## Tandas

1. **Fundación** ✅ tokens `adm-*` en `@theme` (hecho). PENDIENTE: fuentes self-hosted para offline/Tauri — `npm i @fontsource/fraunces @fontsource/figtree` e importarlas en `main.jsx` (Google Fonts no sirve offline sin el SW, y Tauri corre sin SW).
2. **Shell admin**: SidebarLayout v2 editorial — sidebar marino colapsable (208px ↔ 56px, grupos con microtítulos tracking ancho), topbar con búsqueda global, **status bar inferior** (online/offline real del sync store, turno activo, ventas del turno, badge de cola/dead-letter — diagnóstico siempre visible). La superficie se decide por ruta: rutas de operación mantienen su shell.
3. **Atajos de teclado** (Tauri es desktop: teclado es primera clase):
   - `Ctrl+K` command palette global (navegar a módulo, buscar cliente/receta/mesa, acciones rápidas) — filtrada por capacidades del rol (usePermisos).
   - Globales: `Ctrl+1..9` módulos del sidebar en orden, `F1` ayuda de atajos del módulo, `Ctrl+B` colapsar sidebar, `Ctrl+Shift+L` tema.
   - Por módulo (scope local, hints visibles en el footer del inspector como en el mock): Mesas `flechas` navegar grid, `Enter` abrir, `C` cobrar, `R` reservar; POS `/` buscar producto, `F9` cobrar, `+/-` cantidad; KDS `1..n` marcar comanda lista; tablas admin `flechas` fila, `Enter` editar, `N` nuevo.
   - Implementación: hook `useAtajos(scope, mapa)` propio (sin libs), registro central para que F1 pinte la lambda de ayuda, respeta inputs enfocados.
4. **Módulos piloto**: Dashboard (admin editorial, con el rediseño de métricas por periodo/P&L/alertas de AUDITORIA_SISTEMA) + Mesas (operación industrial con inspector del mock). Validar el híbrido en caliente antes de escalar.
5. **Resto de módulos** por grupos: catálogos/tablas (patrón DataTable densa del mock con zebra + selección) → compras/almacén → RH/CRM → config.
6. **Pulido**: contraste AA del texto muted sobre crema (#7a746a está al límite en letra chica — subir a ~#6a645a donde sea <14px), estados vacíos, transiciones 250ms, title bar nativa de Tauri (decidir si custom con controles overlay o estándar).

## Notas del análisis del mock

- El mock es maqueta estática (tokens JS inline, un archivo): se TRADUCE a los componentes reales, no se importa.
- Sus atajos son solo hints visuales — la implementación es nuestra (tanda 3).
- El dark navy del mock reemplaza al obsidiana SOLO en superficie admin; operación no cambia de paleta.
- Touch targets del mock (12px/filas densas) son correctos en admin desktop, prohibidos en operación.
