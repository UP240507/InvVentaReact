# Mockups de teléfono y tablet — lectura y decisiones pendientes

Origen: `Análisis y mejora de Azul POS.zip` (Claude Design, 5-ago-2026). Tres
piezas: `Azul POS Mobile` (marco 390×844), `Azul POS Tablet` (1024×768) y
`Azul POS ERP`.

Son maquetas visuales con estilos en línea y plantillas `{{ }}`: **no son código
que se pueda pegar**. Lo que traen y sirve son decisiones de disposición.

---

## AVISO — hay TRES sistemas visuales en circulación

Al 6-ago han llegado dos entregas de Figma con paletas y tipografías
**distintas entre sí**, y ninguna coincide del todo con lo que hay en el código.
Antes de tomar nada de una maqueta conviene saber de cuál viene.

|                  | Proyecto (`index.css`)  | Zip 5-ago (`design-system-spec.md`) | Maqueta 6-ago (CheckoutScreen) |
| ---------------- | ----------------------- | ----------------------------------- | ------------------------------ |
| Fondo            | `--ops-bg`, por tema    | `#050A07`                           | `#111318`                      |
| Superficie       | `--ops-panel`, por tema | `#101A13`                           | `#1C1F26`                      |
| Éxito / cobro    | `--ops-ok`, por tema    | `#00E5A0`                           | `#22C55E`                      |
| Peligro / acento | `--ops-danger`          | `#FF5F40`                           | `#C8442A`                      |
| Títulos y cifras | Syne                    | Syne                                | Fraunces                       |
| Texto UI         | DM Sans                 | DM Sans                             | Figtree                        |
| Monoespaciada    | —                       | —                                   | DM Mono                        |
| Radio            | 2 px / 4 px             | **2.5rem (40 px)**                  | 0 (sin radio)                  |

Tres cosas que se deducen de la tabla y conviene no olvidar:

1. **El zip del 5-ago es ANTERIOR a una decisión ya tomada.** Pide radio de
   40 px, y el 25-jul se decidió lo contrario —dos pasos, 2 px y 4 px— con
   `--radius-brand: 2.5rem` eliminado a propósito y un comentario en
   `index.css` explicando que dejarlo vivo invitaba a reintroducirlo. Aplicar
   esa parte de la spec sería deshacer trabajo, no adoptar diseño.
2. **La maqueta del 6-ago es un sistema visual nuevo entero**, no una variante.
   Cambian los tres colores principales y las tres tipografías.
3. **El código no usa colores literales: usa tokens por tenant.** Hay tres temas
   (`base`, `vino-cesped`, `fenix`) × claro/oscuro. Clavar un `#22C55E` en el
   modal de cobro lo dejaría fuera del tematizado y distinto del resto de la app
   en cinco de las seis combinaciones.

**DECISIÓN (Chris, 6-ago): de las maquetas se toma la ESTRUCTURA; el color y la
tipografía salen de los tokens.** Es la misma regla que ya regía —el ancho
decide la figura, el rol decide el contenido— con un tercer eje: la maqueta
decide la disposición, el tenant decide el aspecto.

**Queda por decidir, aparte:** si la identidad se mueve a Fraunces/Figtree y a
la paleta del 6-ago. Es una decisión de marca para TODA la app, no del modal de
cobro, y tomarla pantalla a pantalla es como acaban los sistemas con nueve
radios distintos —que es exactamente de donde se venía en julio—.

---

## Lo que ya está resuelto y no hay que volver a discutir

**La paleta de la maqueta es la del proyecto con otros nombres.** Las variables
que usa (`--accent`, `--bg`, `--fg`, `--fgMuted`, `--border`, `--sb`, `--sbFg`,
`--ok`, `--warn`, `--danger`, `--info`, y sus variantes `*Soft`) mapean casi 1:1
sobre los tokens `ops-*` / `adm-*` que ya existen. No hace falta un sistema de
color nuevo; hace falta una tabla de equivalencias.

| Maqueta                                         | Proyecto                                     |
| ----------------------------------------------- | -------------------------------------------- |
| `--accent` / `--accentFg`                       | `--ops-accent` / `--ops-accent-fg`           |
| `--bg` / `--bg2` / `--bgMuted`                  | `--ops-bg` / `--ops-panel` / `--ops-panel-2` |
| `--fg` / `--fgMuted` / `--fgSubtle`             | `--ops-ink` / `--ops-muted` / (falta)        |
| `--sb` / `--sbFg` / `--sbMuted` / `--sbActive`  | `--adm-sidebar*`                             |
| `--ok` `--warn` `--danger` `--info` (+ `*Soft`) | idénticos en `ops-*`                         |

Sólo falta un nivel: `--fgSubtle`, un tercer gris por debajo de `muted`. Es el
que usan las maquetas para las etiquetas de dos puntos y los pies de tarjeta.

---

## Las dos disposiciones

Lo importante no es que "se adapte": es que **la misma pantalla cambia de figura
según el dispositivo**, y en tres sitios concretos.

|                 | Teléfono (390)                                                   | Tablet (1024)                       |
| --------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Navegación      | barra de pestañas **abajo**                                      | **riel de iconos** a la izquierda   |
| Detalle de mesa | _bottom sheet_ que sube (`sheetUp`)                              | **inspector fijo** a la derecha     |
| Carrito del POS | hoja a pantalla completa + barra flotante «Ver carrito · $total» | **columna permanente** a la derecha |

La lógica detrás: en el teléfono sólo cabe una cosa a la vez, así que lo
secundario entra y sale; en la tablet caben dos, así que lo secundario se queda
puesto y no hay que abrirlo y cerrarlo cien veces por turno.

**Cabecera** (igual en ambos): mosaico de acento con la inicial + título en Syne
800 + subtítulo en 10 px con `letter-spacing: .14em` en mayúsculas.

---

## Cobertura: las maquetas cubren la operación, no el ERP

Secciones dibujadas: **Mesas, Cocina (KDS), POS, Métricas, Más, Perfil**, más los
_overlays_ de sistema: turno de caja cerrado / espera, paywall de suscripción
suspendida y gestión de plan.

Son ~8 de las 37 rutas de `App.jsx`. Todo lo demás —recetas, ingredientes,
compras, recepción, mermas, proveedores, gastos, empleados, nóminas, permisos,
clientes, reportes, facturas, auditoría, configuración— **no está dibujado**.

### DECISIÓN — dos varas distintas (Chris, 5-ago)

**Operación se diseña. ERP sólo se defiende.**

- **Operación** (POS, Mesas, KDS, Espera, Checador, Propinero, Perfil, Más):
  responsiva de verdad, con la figura propia de cada ancho según las maquetas.
- **ERP** (las ~29 rutas restantes): basta con que **no se rompa**. Sin
  rediseño, sin figura propia, sin retrabajo.

Pero «que se vea bien» no es comprobable, y a los tres meses nadie lo mira. El
mínimo del ERP debería ser esta lista, que sí se puede verificar de un vistazo:

1. **Sin desplazamiento horizontal de la página.** Las tablas anchas se
   desplazan dentro de su propio contenedor, no arrastrando la pantalla entera.
2. **Nada recortado ni inalcanzable.** En particular, **el botón de guardar de
   cada modal tiene que seguir siendo tocable con el teclado abierto** — es el
   fallo clásico: el formulario cabe, el botón queda debajo del teclado.
3. **Nada de texto solapado** al estrecharse: `min-w-0` en los contenedores
   flex, que es de donde sale casi siempre.
4. **Objetivos táctiles decentes** en lo que se toque, aunque no se rediseñe.

Lo bueno: casi todo eso se arregla **una vez y global** —envoltorio de tablas
con desbordamiento propio, `min-w-0`, altura máxima en modales— y no pantalla
por pantalla. Las 29 rutas se cubren en su mayoría con tres o cuatro reglas, no
con 29 revisiones.

### Salvedad: tres pantallas del ERP no se usan sentado

Dije «son pantallas de escritorio, se usan sentado» y no es del todo cierto.
Hay unas cuantas que se hacen **de pie y con el dispositivo en la mano**:

- **Recepción de mercancía** — en la puerta, con el repartidor delante.
- **Mermas** — frente al refrigerador.
- **Conteo de inventario** — recorriendo la bodega.

Ésas merecen algo más que «no se rompe»: objetivos táctiles reales y no obligar
a teclear cantidades dentro de una tabla pensada para ratón. No el rediseño
completo de operación, pero tampoco el mismo saco que nóminas o proveedores.

**Queda por decidir** (Chris, aplazado): si alguna otra pantalla del ERP sale
también a esta vista intermedia. Se revisa al llegar al bloque de ERP.

---

## Ya aplicado

**Scrollbars por tipo de puntero.** Las maquetas ocultan la barra por completo
(`::-webkit-scrollbar { display: none }`). Tenían razón para _touch_ y no para
escritorio, así que se separó por `@media (pointer: coarse)`:

- puntero grueso (teléfono, tablet): sin barra. Con el dedo no es un control —
  no se arrastra con precisión— y sólo roba 10 px de ancho a listas que ya van
  justas.
- puntero fino (la caja en Windows, el escritorio del dueño): la barra
  tematizada de 10 px que ya estaba. Ahí sí es un control.

---

## Tipografías — cerrado

Chris: las de las maquetas **son las que ya usa el proyecto**. Del zip sólo
interesa la disposición. No hay nada que decidir ni que migrar.

---

## DECISIÓN — qué es un «dispositivo»

**El ancho decide la FIGURA. El rol decide el CONTENIDO.**

Un solo umbral, un solo sitio: `ANCHO_ACOPLADO = 1024` en `hooks/useAcoplado.js`.
El rol del dispositivo emparejado **nunca** decide la disposición.

Era tentador usar el rol —el hub ya lo guarda— pero pierde por cuatro razones:

1. **La versión web no tiene hub.** Habría que inventar un respaldo, y el
   respaldo sería el ancho: o sea, el ancho acabaría siendo el mecanismo real
   igualmente, con un segundo mecanismo encima que mantener.
2. **Un rol equivocado no se puede corregir desde la pantalla.** La tablet que
   era KDS y ahora carga un mesero se ve mal y no hay giro ni redimensión que
   lo arregle. Con el ancho, lo que se ve siempre corresponde al cristal que se
   tiene delante.
3. **Probar el ancho es cambiar un número.** Probar el rol pide un hub
   emparejado, un token y un dispositivo dado de alta: dos ejes en vez de uno,
   y el segundo no se recorre en una prueba unitaria.
4. **El rol ya decide lo que le toca** —qué entradas de menú se ven, a qué
   pantalla llega cada quien— vía `usePermisos`. Que además decidiera la figura
   sería un tercer mecanismo junto a permisos y ancho.

El contraargumento evidente —«una tablet de mesero y una de caja son distintas»—
es cierto pero no toca la figura: las dos quieren riel + columna acoplada. Lo
que cambia entre ellas es qué hay dentro, y de eso ya se encarga el rol.

Es la respuesta más barata de mantener, que es exactamente el criterio que
pediste.

---

## Cómo se construye: un primitivo, no dos diseños

Los tres sitios donde las maquetas difieren son **el mismo problema**: un panel
secundario que está acoplado o entra como hoja. Resolverlo tres veces daría tres
comportamientos parecidos, y a los seis meses uno cerraría con Escape y los
otros no.

- `hooks/useAcoplado.js` — la pregunta, en un solo sitio. Va con
  `useSyncExternalStore` sobre `matchMedia`: con `useState` + `useEffect`
  habría que escribir estado dentro de un efecto —lo que prohíbe la regla
  `set-state-in-effect` del compilador de React— y además el primer render
  saldría con el valor equivocado (medio frame de columna acoplada en un
  teléfono).
- `components/PanelAcoplable.jsx` — la figura. Columna fija arriba del umbral;
  abajo, barra flotante + hoja. `children` se pasa una vez y se pinta una vez:
  **nada de duplicar el árbol para «la versión móvil»**, porque dos árboles se
  desincronizan y el que se queda atrás es siempre el que no usas a diario.

Detalle que importa: cerrada, la hoja **se desmonta** en vez de esconderse con
CSS. El carrito y la comanda de una mesa no son decorativos — montados detrás de
una hoja cerrada siguen suscritos, siguen recalculando y siguen siendo
alcanzables con el tabulador desde el catálogo.

### Ya cableado: el carrito del POS

Se estrenó ahí y no en el vacío, porque ahí había un defecto real: el POS repartía
`h-[50vh]` entre catálogo y carrito. En un teléfono de 844 px, descontando
cabecera y categorías, al catálogo le quedaba **sitio para una fila y media de
productos** — el mesero se pasaba el turno desplazando, con el carrito vacío
ocupando media pantalla. Ahora el catálogo se lleva toda la altura y el carrito
se llama con una barra que ya enseña cuántas líneas van y por cuánto.

13 pruebas fijan las dos figuras. La integración del cobro sigue pasando.

### Cableado: el detalle de mesa (6-ago)

El inspector de mesa existía desde la tanda 4 del Proyecto D, pero era un
`<aside className="hidden xl:flex w-80 …">`: se ponía a sí mismo el ancho, el
borde y —lo que importa— **su propia condición de existir**. Por debajo de
1280 px no se pintaba.

El razonamiento original («en tablet el mapa necesita todo el ancho») es cierto
para la COLUMNA y falso para el inspector. Lo que desaparece al estrechar la
pantalla es el sitio donde ponerlo al lado, no la necesidad de ver qué lleva la
mesa. Y quien más la tiene es el mesero con la tablet en la mano, que no puede
acercarse a la caja a mirarlo. Ahora no se cae: cambia de figura.

Tres decisiones que no salen de la maqueta y hay que dejar escritas:

**1 · En estrecho, el toque abre la hoja; al POS se entra desde ella.**
Con la columna puesta el clic puede permitirse llevar al POS de un paso, porque
la mesa ya se está viendo al lado. Sin columna no se ve nada, así que un toque
que cambia de pantalla entera es un salto a ciegas. Cuesta un toque más en la
acción más frecuente y aun así compensa: en una tarjeta de 190 px que el pulgar
tapa a medias, los toques errados no son el caso raro, y deshacer un toque
errado es tirar de la hoja hacia abajo en vez de navegar de vuelta.

**2 · Sin barra flotante, y ahí se separa del carrito.**
El carrito del POS no tiene representación ninguna en el catálogo: la barra es
su única forma de decir «llevas 4 líneas, $380». Aquí cada mesa ya enseña su
total en su propia tarjeta y **la tarjeta es el disparador**. Una barra
repetiría un dato que está a la vista y taparía la última fila del mapa a cambio
de nada. El primitivo ya lo contemplaba con `disparador={false}`.

**3 · La hoja enseña la mesa que se tocó, nunca el respaldo.**
`mesaSeleccionada` cae en la primera de la lista cuando no hay nada elegido —lo
necesitan las flechas, que si no no tienen de dónde partir, y la columna, que si
no arranca vacía—. Ese respaldo no puede decidir nada que el usuario no haya
pedido:

- si abriera la hoja, el mapa arrancaría en el teléfono con una mesa encima que
  nadie pidió;
- peor: con la hoja arriba sobre la mesa 12, un realtime que la saque de la
  lista —traspaso, unión, otro dispositivo— la cambiaría por la primera **sin
  decir nada**, y el dedo que ya iba camino de «Cobrar» cobraría otra cuenta.

Se separan en dos: `mesaElegida` (lo que se tocó) y `mesaSeleccionada` (con
respaldo). La hoja se ve si `hojaMesa && mesaElegida`, así que cuando la mesa
desaparece la hoja **se cae sola** — derivado, sin un `useEffect` que corrija
estado, que es justo lo que prohíbe `set-state-in-effect`.

Dos arreglos que salieron al cablearlo, ambos en el primitivo:

- `PanelAcoplable` acoplado usaba `h-screen`. Vale para el POS, que se traga el
  viewport entero, y no para el mapa de mesas, que vive dentro del layout: la
  columna sobresalía por abajo exactamente lo que mide la barra de navegación,
  y lo que quedaba fuera de pantalla eran las acciones del pie —Cobrar,
  Traspasar—. Ahora pide la altura al padre con `h-full`, que sale bien en los
  dos porque en el POS el padre YA es `h-screen`. Con `shrink-0`, además: el
  hermano es `flex-1` y sin él un contenido ancho empuja y estrecha el panel por
  debajo del ancho que se le pidió.
- El velo y el aspa compartían `aria-label="Cerrar"`, o sea dos salidas
  distintas dentro del mismo diálogo para un lector de pantalla. Una prueba ya
  lo rodeaba con un `[0]`, que es la señal de que el problema estaba en el
  componente y no en la prueba. El velo pasa a ser un atajo del dedo:
  `aria-hidden`, fuera del tabulador. Quien no usa el dedo tiene el aspa y tiene
  Escape.

Y una consecuencia de rejilla: el inspector ahora entra a 1024 y no a 1280, así
que el mapa pierde ~300 px antes. Las columnas bajan un tramo desde `lg`
(3/4/5 en vez de 4/5): a 1024 con el panel puesto, cuatro columnas dejaban
tarjetas de 160 px, y ahí «$1,240» y el nombre de la mesa dejan de caber en la
misma línea.

16 aserciones nuevas, entre `MesasScreen.figuras.test.jsx` y el primitivo.

### Cableado: el modal de cobro (6-ago)

No es un `PanelAcoplable` —es un modal, no un panel secundario— pero comparte el
umbral y el mismo criterio. Salió de una captura de Chris en la que el modal se
veía roto en un teléfono.

**Cuatro defectos visibles, todos de la figura apilada:**

1. «Total Final» y «$40.00» **se montaban**. Una fila de ~300 px con una
   etiqueta de 20 px y una cifra de 48 en Syne 800, sin `gap` ni `min-w-0`. No
   se truncaban: se pisaban, y la cifra que el cliente comprueba quedaba
   ilegible.
2. El aspa `absolute top-4 right-4` vive en la esquina de la columna derecha.
   Apilada, esa columna es la segunda mitad y el aspa aterrizaba sobre
   «Desglose de la cuenta».
3. **Dos regiones de scroll** dentro de un `max-h-[90vh]`. La cabecera de una se
   cortaba mientras leías la otra.
4. El botón de confirmar se recortaba: `text-xl` + `gap-3` en ~276 px.

**Y el estructural, que es el que importaba:** el pie —saldo pendiente y botón
de cobrar— vivía dentro de la mitad derecha, así que apilado sólo aparecía
después de recorrer descuento, cliente, propina, división y método de pago. Las
dos cosas que se miran sin parar mientras se cobra eran las últimas en verse.

`sticky bottom-0` no sirve: el pie está dentro de la mitad derecha, y mientras
esa mitad esté por debajo del pliegue no hay nada a lo que pegarse. Se extrajo a
una constante `pieDeCobro` que **las dos figuras colocan en sitios distintos del
árbol** —dentro de la columna con sitio, como pie del modal sin él—. Definida
una vez, colocada una vez. Hay una prueba que cuenta los botones de cobrar,
porque el riesgo de esa forma es evidente: si las dos ramas se cumplieran a la
vez habría dos botones que cobran, y el segundo cobraría igual de bien.

**Umbral:** el modal cambiaba de figura en `md` (768) y el resto de la app en 1024. Entre ambos, el modal se ponía a dos columnas sobre un mapa que seguía en
una. Ahora usa `useAcoplado` como todo lo demás.

#### De la maqueta del 6-ago se tomaron tres cosas

- **Banner de total anclado**, fuera del scroll, entre cabecera y cuerpo. Es la
  corrección de fondo: el total estaba puesto donde PERTENECE —cerrando el
  desglose— y no donde hace falta mirarlo. Cambia cada vez que se toca la
  propina o el descuento, o sea justo mientras estás desplazado por las opciones
  y el desglose queda debajo del pliegue.
- **El total aparece dos veces a propósito**: arriba la cifra viva, abajo el
  cierre de la suma. Por eso la de abajo baja a `text-lg` en estrecho — no
  compite, y de paso deja de poder solaparse. Con sitio no hay banner y la de
  abajo se queda a `text-5xl`.
- **Descuento y cliente como filas compactas** (`p-3`, sin margen bajo el
  encabezado). Son las dos opciones que menos se usan y estaban primeras,
  gastando ~80 px antes de llegar a propina y método, que se tocan en cada
  cobro.

#### Y dos que NO se tomaron

- **La cabecera de la maqueta tiene dos salidas** —flecha atrás y aspa, las dos
  llamando a `handleClose`—. Es el mismo defecto que se quitó del velo de
  `PanelAcoplable` el día anterior: dos «Cerrar» en un diálogo se anuncian como
  dos salidas distintas.
- **El botón de confirmar en gris neutro** (`#2A2D35`) con el saldo en rojo
  dominando. Es una jerarquía deliberada y defendible, pero es lo contrario de
  la actual (verde `ops-ok` con sombra de color) y es una decisión de producto,
  no un arreglo de figura. Sin decidir.

17 aserciones fijan las dos figuras del modal.

### Densidad y jerarquía del mapa de mesas (6-ago)

De otra captura de Chris, ésta del mapa a ~390 px. Cuatro cosas, y la primera no
era de esta pantalla.

**1 · `OpsHeader` tenía `items-start` en columna.** Con `align-items: flex-start`
cada hijo mide SU CONTENIDO en el eje horizontal, así que el `truncate` del
título no tenía ancho contra el que recortar: el bloque crecía lo que pedía el
texto y arrastraba la página a un desplazamiento horizontal. Arreglado en el
componente, o sea en todas las pantallas de operación a la vez. También en
`PerfilScreen`, que tenía el mismo patrón.

El síntoma vale la pena saber leerlo: **el título salía cortado sin puntos
suspensivos**. Con `truncate` funcionando se ve «Mapa Operat…»; sin ancho que
recortar se ve «Mapa Oper» y ya. Si vuelve a aparecer un corte sin puntos, el
sitio donde mirar es el contenedor, no el `truncate`.

**2 · `leading-none` recortaba las cifras.** Syne 800 tiene glifos más altos que
su caja em, y con `line-height: 1` los contadores de Libres y Ocupadas salían
cortados por arriba y por abajo. Es de esos fallos que se leen como «la fuente
se ve rara» sin llegar a la causa. El `leading-none` se queda en la etiqueta de
10 px, que es donde hacía falta y donde no recorta.

**3 · Las acciones por tarjeta no existían con el dedo.** Editar, reservar y
traspasar vivían en `opacity-0 group-hover:opacity-100`. Con el dedo no hay
«pasar por encima», así que eran superficie invisible e inalcanzable: tres
funciones desaparecidas del producto en teléfono sin que nadie lo notara.

No se hacen visibles en táctil —son tres botones de 40 px sobre una tarjeta de
160, justo donde cae el pulgar, compitiendo con el toque principal—. Las tres ya
están en el inspector, con sus mismas reglas, y en estrecho el inspector se abre
tocando la tarjeta. Se ocultan del todo con `.solo-raton`, que vive en
`index.css` **al lado de la regla de las barras de desplazamiento**: la pregunta
«¿hay ratón?» se contesta en un sitio, igual que el ancho se contesta en
`useAcoplado`.

Detalle de la regla: va en negativo —oculta en `pointer: coarse`— y no al revés.
Escondiendo por defecto y mostrando en `pointer: fine` habría que devolver un
`display` concreto, y el correcto lo sabe el consumidor: uno es `flex`, el
siguiente podría ser `grid`. Un `revert` devolvería `block` y rompería la
disposición sin decir nada.

**4 · Densidad y jerarquía.** A 390 px la rejilla daba UNA columna con tarjetas
de ~200 px: dos mesas por pantalla. Un mapa de piso que no enseña el piso es una
lista, y con veinte mesas son diez pantallazos para ver quién pidió la cuenta.

Se sustituyen los **cinco** puntos de corte (`sm`/`md`/`lg`/`xl`/`2xl`) por
`auto-fill` + `minmax(160px, 1fr)`. No hay tramos que mantener: se declara el
ancho mínimo legible y el navegador mete las que quepan — sale solo en teléfono,
en tablet, con el inspector acoplado quitando 300 px y en el monitor del dueño.
160 px es el mínimo real y no un número redondo: por debajo, la píldora de zona
(«SALON 1») deja de caber en una línea. La navegación por flechas sigue
funcionando porque `columnasDelGrid` lee `gridTemplateColumns` ya resuelto, que
con `auto-fill` devuelve las pistas reales en píxeles.

Y la jerarquía se invierte. Antes el importe iba arriba, grande y en el color
del estado, y el nombre debajo al mismo cuerpo pero en tinta normal — **a
igualdad de tamaño gana el que tiene color**, así que lo primero que se leía de
cada tarjeta era «$488». En un mapa de piso la primera pregunta es qué mesa es:
el mesero busca la 11, no busca los $488. Ahora el identificador va a `text-3xl`
y el importe a `text-base` debajo, que es además lo que pedía la spec del zip.
De paso resuelve el ancho: en filas separadas, ninguna cifra compite por sitio
en una tarjeta de 160 px.

### El chasis: navegación y mobiliario (6-ago)

Chris, sobre unas capturas: «las pantallas ya cumplen y se adaptan, pero no
parece una app pensada para teléfonos». Tenía razón y el diagnóstico es
concreto: **las pantallas se adaptaban, el chasis no.**

#### Lo que se estaba comiendo el chasis, medido

En horizontal, sobre 390 px:

|                                      | px      |
| ------------------------------------ | ------- |
| Riel colapsado (`ANCHO_SIDEBAR_MIN`) | 56      |
| Padding del contenido (`p-6`)        | 48      |
| **Útil**                             | **286** |

En vertical, sobre 844 px:

|                                        | px                                |
| -------------------------------------- | --------------------------------- |
| Topbar (`h-14`)                        | 56                                |
| StatusBar (`h-8`)                      | 32                                |
| `OpsHeader` — icono, título, subtítulo | ~90                               |
| Contadores, acciones y filtros         | ~200                              |
| Padding                                | 48                                |
| **Mobiliario**                         | **~426, la mitad de la pantalla** |

Ese 286 explica por qué el `minmax(160px, 1fr)` del mismo día **no llegó a dar
dos columnas**: se calculó contra ~342 px útiles suponiendo sólo el padding, y
los reales eran 286 porque no se contó el riel. Dos tarjetas pedían 332 y
faltaban 46. La lección: **la densidad de una rejilla no se calcula contra el
ancho de la pantalla sino contra el que deja el chasis.**

#### Los cinco cambios

**1 · Riel → barra de pestañas abajo** (`components/BarraPestanas.jsx`). El riel
gasta el 14 % del ancho de un teléfono, permanentemente, en algo que se toca dos
o tres veces por turno — y en la esquina más lejana del pulgar. Abajo no roba
ancho a nadie.

Los destinos **no se declaran en la barra**: salen de `gruposVisibles`, la misma
lista ya filtrada por capacidades y por plan que alimenta el riel y el buscador.

Caben 4 de 24, así que hay que elegir, y la elección es **una regla y no una
lista**: los cuatro primeros que el usuario puede ver, en el orden de
`MENU_GRUPOS`. Funciona porque ese orden ya pone Principal y Operación delante,
que es lo que se usa de pie; a un mesero le quedan exactamente sus cuatro sin
configurar nada. Lo que se gana es que no hay nada que mantener cuando se añada
un destino o cambie un permiso.

Descartado que la barra **aprenda del uso**: esta pantalla se usa de memoria y
con prisa, y ahí lo que importa no es que el destino esté cerca sino que esté
siempre en el mismo sitio.

**2 · El título deja de ir dos veces.** El Topbar lo tenía en `hidden md:block`
—o sea que en teléfono no decía dónde estabas— y cada pantalla lo repetía por su
cuenta con icono, título y subtítulo. Ahora el Topbar lo dice **siempre** y es
`OpsHeader` quien calla sin ancho. Se calla la pantalla y no el chasis a
propósito: el Topbar sale de `tituloDeRuta` y existe para las 24 rutas por
igual; callar el chasis obligaría a que las otras 23 pantallas se acordaran de
decir quiénes son, y alguna no se acordaría.

**3 · El buscador se queda en icono.** Ya era un botón que abre la palette (no
un input, decisión anterior y correcta), pero su rótulo —«Buscar mesa,
ingrediente, receta, proveedor…»— nunca cupo: salía cortado a media palabra y
empujaba al título fuera de la barra. Un campo que no puede enseñar su propio
texto no informa, sólo ocupa.

**4 · La StatusBar no convive con las pestañas.** Serían 32 px de mobiliario más
56 de navegación en la pantalla donde el mobiliario ya se llevaba la mitad del
alto. Lo que dice —«En línea · Turno abierto · Sesión»— es contexto de la caja,
no algo que se consulte de pie. Lo único urgente de ahí, **estar sin red**, ya
tiene su propio aviso flotante, que no depende de esa barra.

Al hacerlo apareció una colisión: ese aviso vive en `bottom-12` (48 px) y las
pestañas miden ~56 más la franja del gesto, así que quedaba **detrás justo de lo
que se toca**. Sube a `bottom-24` sin ancho.

**5 · Padding y densidad recalculados.** `p-6` → `p-3` en estrecho, y el mínimo
de la rejilla de 160 a 150 px. Con el riel fuera el mapa pasa de **286 px útiles
a ~366**, y 150 entra con holgura para que la densidad no vuelva a decidirse en
el filo.

Total: ~56 px de ancho y ~150 de alto recuperados. El mapa pasa de la mitad de
la pantalla a cerca de tres cuartos, y da dos columnas de mesas.

9 aserciones fijan la barra de pestañas.

### Lo que sigue, en este orden

1. **Navegación**: una sola lista de destinos, dos renderizadores —riel de
   iconos de 82 px arriba del umbral, barra de pestañas abajo—. Una lista, no
   dos.
2. **Densidad de rejilla**: las maquetas van a 3 columnas en tablet y 2 en
   teléfono. Conviene `auto-fill` + `minmax` antes que otro punto de corte que
   mantener — el mapa de mesas ya lleva cuatro (`sm`/`md`/`lg`/`xl`/`2xl`), y
   ése es exactamente el coste que `auto-fill` evita.
3. **Métricas**: rejilla de 12 columnas en tablet, pila en teléfono.
4. **ERP**: las tres o cuatro reglas globales de la lista de arriba.

---

_Creado el 5-ago-2026, al recibir el zip. Decisión de dispositivo y primer
cableado el mismo día._
