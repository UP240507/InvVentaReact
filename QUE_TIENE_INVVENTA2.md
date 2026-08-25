# Qué tiene InvVenta2 que el proyecto oficial no tiene

Comparación de `DEV/InvVenta2` (Stock Centralizado — JS vanilla + Vite + Supabase)
contra `DEV/InvVenta` (oficial — React 19 + Zustand + Tauri + PWA, v0.2.6).

Fecha: 22 de agosto de 2026.

---

## Resumen honesto

El oficial va **muy** por delante. Es multi-tenant con RLS, Stripe y Edge Functions,
tiene KDS, CRM con lealtad, nóminas, reloj checador, modificadores, folios fiscales,
suscripciones, cola offline con dead-letter clasificada, hub de impresión en Rust,
~60 archivos de test (vitest) y e2e con Playwright. InvVenta2 no compite con eso.

Lo que sí encontré son **7 huecos concretos** en el oficial que InvVenta2 sí cubre.
Dos de ellos valen la pena de verdad; el resto son de bajo esfuerzo. Uno lo incluyo
para decirte explícitamente que **no** lo portes.

Método: barrido por `grep` sobre los 157 archivos de `InvVenta/src` buscando cada
capacidad de InvVenta2. Cada hallazgo de abajo está verificado como ausente, no
inferido.

---

## 1. Exportación de reportes a CSV/Excel y PDF — ALTA

**El oficial no exporta nada.** Cero coincidencias de `csv`, `xlsx`, `excel`,
`html2pdf`, `jspdf` o `exportar` en todo `src`. La única descarga que existe es el
XML del CFDI en `features/analisis/FacturasScreen.jsx:213`.

InvVenta2 tiene las dos vías:

- `src/utils/helpers.js:101` — `exportarAExcel(filename, tableSelector)`: recorre el
  `<table>` del DOM, escapa comillas y descarga un CSV por `Blob`. Sin dependencias.
- `src/utils/helpers.js:128` — `exportarAPDF(nombreReporte)`: `html2pdf` sobre
  `#printArea`, con encabezados `.print-only` que se muestran solo al exportar.

**Por qué importa:** el contador pide el corte en Excel, no en pantalla. Un POS que
no exporta obliga a capturar a mano. Es la carencia más visible del oficial para un
usuario de negocio.

**Recomendación:** portar el CSV tal cual (son 20 líneas y no mete dependencia). Para
el PDF, en el oficial conviene generarlo desde los datos —ya tienes `lib/Fiscal.js`
como motor único de dinero— en vez de fotografiar el DOM con html2canvas, que rompe
en modo oscuro y con `recharts`.

---

## 2. Lector de código de barras — ALTA

**El oficial no tiene escáner.** Cero coincidencias de `scanner`, `escaner`,
`barcode`, `codigo_barras` o `codigoBarras`.

InvVenta2 (`src/main.js:445-489`) implementa un *keyboard wedge* global: captura
teclas a nivel `document`, arma un buffer, lo cierra con `Enter` y lo descarta si
pasan más de 150 ms sin tecla (así distingue al lector de un humano tecleando).
Ignora el evento si el foco está en `INPUT`/`TEXTAREA`/`SELECT`/contenteditable.

Lo interesante es que **el mismo código se comporta distinto según la pantalla**
(`window.procesarCodigoEscaneado`):

| Pantalla | Qué hace al escanear |
|---|---|
| `mesas` | delega en `window.mesaScanner(codigo)` |
| `pos` | busca por `receta.codigo_pos` y agrega al carrito |
| `compras_crear` | suma +1 unidad del insumo a la orden de compra |
| `productos` | filtra la tabla por ese código |
| otra | notifica el producto identificado |

**Por qué importa:** el oficial ya está pensado para caja con Tauri e impresora
térmica; un lector USB es el otro periférico obvio de ese mostrador, y sobre todo
para **recepción de mercancía**, donde escanear es 10x más rápido que buscar.

**Recomendación:** portarlo como hook (`hooks/useEscaner.js`) que despache al store
según la ruta activa de `react-router`. Encaja limpio con `lib/Atajos.js`, que ya
resuelve el problema de "no capturar teclas cuando hay foco en un campo".

---

## 3. Impresión térmica directa desde el navegador (WebSerial) — MEDIA

`src/services/printerService.js` habla ESC/POS por `navigator.serial`: abre puerto a
9600-8N1, mantiene una cola con un solo `writer` y —el detalle bueno— trae un
`encodeLatin1()` propio con mapa CP1252, porque las térmicas no entienden UTF-8 y los
acentos salen como basura si mandas el string crudo.

El oficial resolvió esto **mejor** en arquitectura: `lib/Comanda.js` produce un
documento semántico en JSON y un hub en Rust lo convierte a ESC/POS
(`lib/Hub.js`), con idempotencia por `id` y aviso impreso en reimpresiones. Es
claramente superior y no propongo cambiarlo.

**El hueco real:** ese camino exige Tauri o emparejamiento con el hub. `lib/Hub.js`
está lleno de `if (enTauri())`. Un negocio que solo abre la PWA en un navegador no
tiene ruta a la impresora.

**Recomendación:** no portar la arquitectura, sí guardar el `encodeLatin1` como
referencia y evaluar WebSerial únicamente como plan B para la PWA sin caja. Ojo:
WebSerial no existe en Safari ni en iOS, así que como estrategia principal no sirve.

---

## 4. Subir el logotipo como archivo — MEDIA

Oficial (`features/ajustes/ConfiguracionScreen.jsx:611`): un `<input>` de texto donde
el usuario pega una `logo_url`. Es decir, tiene que hostear la imagen él mismo.

InvVenta2 (`src/components/Configuracion.js:399-414`): botón de subir → valida ≤2MB
y tipo (PNG/JPG/SVG/WebP) → sube a Supabase Storage (bucket `logos`) con `upsert` →
guarda la `publicUrl`. Incluye preview, `onerror` con placeholder y botón de quitar.

**Por qué importa:** en un SaaS con onboarding autoservicio, "pega la URL de tu logo"
es un muro. La mitad de los dueños de restaurante no saben qué es eso.

**Recomendación:** portar. Es una tarde de trabajo y hay que crear el bucket con
policy por `restaurante_id`.

---

## 5. Valorización de inventario línea por línea — MEDIA-BAJA

Los dos tienen el KPI del capital congelado en almacén (oficial:
`features/analisis/ReportesScreen.jsx:1234`).

La diferencia es el detalle: InvVenta2 (`src/components/Reportes.js:37-57`) imprime la
tabla completa —Código, Producto, Categoría, Stock, Costo Unitario, Total— que suma
al gran total. El oficial muestra el número grande y pasa directo al detalle de
mermas y al kardex.

**Por qué importa:** esa tabla es literalmente la hoja de conteo físico. Sin ella el
total es un número que nadie puede auditar.

**Recomendación:** agregar la tabla en "Control de Almacén". Los datos ya están
calculados en `ReportesScreen.jsx:247`; es solo pintarlos. Y con el punto 1, sale en
CSV para el conteo.

---

## 6. Paginación de tablas — BAJA

El oficial no pagina en ninguna pantalla: `DataTable.jsx` solo usa `pageup`/`pagedown`
para mover la selección con el teclado, y Reportes corta con `.slice(0, 200)`
(`ReportesScreen.jsx:276`). Catálogos y listados se pintan enteros.

InvVenta2 tiene `renderPaginacion()` en `src/utils/helpers.js:49` con
`ITEMS_PER_PAGE = 8`, aunque solo lo usa en `Products.js:53`.

**Por qué importa:** hoy no duele, con 200 insumos. Con 2,000 productos y un año de
movimientos, sí. Es deuda latente, no un bug.

**Recomendación:** más que copiar la paginación de InvVenta2 (8 items es poquísimo
para una caja), meterle virtualización o paginado a `DataTable` cuando el volumen
lo pida.

---

## 7. `detectarTipoTarjeta()` — NO PORTAR

`src/utils/helpers.js:158` detecta Visa/Mastercard/Amex/Discover/Diners por el BIN del
número de tarjeta.

El oficial no lo tiene, y **hace bien**. Su `ModalCobro.jsx` registra el método
(Efectivo/Tarjeta/Transferencia) y el monto, con pagos divididos y propina por
sobrepago — nunca toca el número de tarjeta. Capturar PANs en un POS te mete de lleno
en alcance PCI-DSS sin ninguna ganancia: la terminal bancaria ya sabe qué tarjeta es.

Lo dejo listado solo para que quede claro que la ausencia es una decisión correcta,
no un descuido.

---

## Nota menor: `mailto:` vs Gmail web

Los dos mandan la orden de compra al proveedor por correo. El oficial
(`ComprasScreen.jsx:262`) abre `mail.google.com/mail/?view=cm`, que asume Gmail en el
navegador. InvVenta2 (`Proveedores.js:549`) usa `mailto:`, que respeta el cliente
predeterminado del sistema (Outlook en una caja Windows, típico). Cambiar la URL por
`mailto:` es una línea y cubre más casos.

---

## Lo que parece hueco y NO lo es

Verifiqué estas y el oficial ya las tiene, casi siempre mejor resueltas. No pierdas
tiempo aquí:

| Capacidad de InvVenta2 | Dónde está en el oficial |
|---|---|
| Ajustes de inventario y mermas | `features/inventario/MermasScreen.jsx` (alta/baja + motivo) |
| Kardex global | `ReportesScreen.jsx:1323` |
| Análisis ABC / Pareto | `ReportesScreen.jsx:1062`, además con costo y margen por platillo |
| Corte Z y arqueo de turno | `lib/Arqueo.js` + `CierreTurnoModal.jsx` (con tests) |
| Importe en letra | `lib/Letras.js` (con tests) |
| Costeo de recetas y margen | `RecetasScreen.jsx:92`, y además costea paquetes por peor caso |
| Propinas | `PropineroScreen.jsx` + reparto en tabla `propinas_reparto` |
| Orden de compra por WhatsApp | `ComprasScreen.jsx:245` |
| Cola offline / Dexie | `store/useSyncStore.js`, con dead-letter y tests de carrera |
| Permisos por rol | `lib/Permisos.js`, data-driven desde `roles_permisos` |
| Verificar stock antes de vender | `lib/Inventario.js` + `ConfirmacionStockModal.jsx` |
| Transferir mesa / mapa de mesas | `MesasScreen.jsx` + `InspectorMesa.jsx` + `PanelRondas.jsx` |

---

## Orden sugerido

1. **CSV de reportes** — impacto alto, medio día, sin dependencias.
2. **Escáner como hook** — impacto alto en recepción y POS, un día.
3. **Tabla de valorización** — datos ya calculados, un par de horas.
4. **Subida de logo** — desbloquea onboarding autoservicio, una tarde.
5. `mailto:` — una línea.
6. PDF de reportes — hacerlo desde datos, no desde el DOM. Proyecto aparte.
7. Paginación/virtualización — cuando el volumen lo pida.

---

## Aparte: dos cosas que vi de paso

- **`.env` de InvVenta2** está dentro de la carpeta y `VITE_SUPABASE_KEY` se expone al
  cliente por diseño de Vite. Confirma que sea la anon key con RLS activo. El oficial
  usa `.env.local` y ya tiene commits específicos de RLS
  (`82199c1 anon se queda sin nada, salvo el catalogo publico`).
- El `AUDITORIA_SISTEMA.md` del oficial marca `decrementar_stock` como **no
  idempotente** (punto 2, prioridad alta). InvVenta2 llama a la misma RPC desde una
  cola con reintentos, así que arrastra el mismo riesgo de doble descuento. Si se
  arregla, se arregla para los dos.
