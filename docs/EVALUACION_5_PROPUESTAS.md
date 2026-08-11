# Evaluación — cinco propuestas de sala

10-ago-2026. Evaluadas contra el esquema y el código reales, no contra la idea.

---

## Lo primero, que no es sobre las cinco

El producto está al ~96 % y lo que falta para lanzar son cuatro cosas: la
impresora física, el instalador, el certificado de firma (con plazo ajeno, sin
arrancar desde hace tres traspasos) y el respaldo de ventas 3.4/3.5. A eso se
suma un hallazgo abierto de la auditoría de hoy: **el total de la venta lo
calcula el cliente**, así que hoy se puede insertar una venta de $0.

Las cinco propuestas son buenas y ninguna es de lanzamiento. Si entran antes,
el 4 % restante se convierte en 15 % y la fecha se mueve. Todo lo que sigue está
escrito asumiendo que van DESPUÉS.

---

## El hallazgo que cambia el orden: `mesero_id` está muerto

`mesas.mesero_id` existe en el esquema. **Nadie lo escribe.** Cero referencias en
todo `src/`, cero filas poblada de tres mesas.

Lo que hay hoy para saber de quién es una mesa:

| Campo | Tipo | Qué es realmente |
|---|---|---|
| `mesas.mesero_id` | `text` | columna muerta |
| `mesas.usuario` | `text` | nombre, texto libre |
| `comandas.mesero` | `text` | `user?.nombre ?? 'Sistema'` |

O sea: **el sistema no sabe qué mesero atiende qué mesa.** Sabe un nombre
escrito en una comanda.

Las propuestas 1, 3 y 4 dan eso por supuesto. Las tres dependen del mismo
prerrequisito, y no es grande —poblar `mesero_id` al abrir mesa, con el
`staff.id` de la sesión, y usarlo como dueño— pero hasta que exista, «reasignar
las mesas al entrante» no tiene qué reasignar y «las mesas que atiendes» no se
puede consultar.

El segundo prerrequisito compartido, sólo de 3 y 4: **sellos de tiempo por
ítem**. Hoy `comandas.entregada_en` existe pero es de la comanda entera, y los
ítems dentro del `jsonb` llevan `estado: 'pendiente'|'listo'` **sin hora**.
`KdsScreen` marca listo con `{ ...resto, estado: 'listo' }` y no anota cuándo.

---

## 1 · Turno (Relevo Digital) — listo a medias, con un defecto de diseño

**Lo que ya existe:** `CierreTurnoModal` ya detecta mesas abiertas y avisa
(líneas 30, 90-98). Falta convertir el aviso en bloqueo, que es una línea y una
decisión, no un módulo. `turnos` ya tiene el patrón entero de conciliación de
efectivo: `efectivo_esperado`, `efectivo_declarado`, `diferencia`. Y
`propinas_total`.

**El defecto, y es el que hay que resolver antes de escribir nada:** comparar la
propina declarada contra «lo calculado por ventas» sólo funciona para tarjeta.
`ventas.propina` registra lo que pasó por el sistema; **la propina en efectivo
que el cliente deja en la mesa no entra por ningún lado**. Así que una diferencia
no es indicio de nada: es lo esperado, todos los días, en todos los turnos.

Si cada diferencia cae en auditoría, auditoría deja de servir en una semana. La
señal se ahoga en el ruido y nadie vuelve a mirarla — que es la forma habitual en
que muere un log de auditoría.

Las salidas razonables, y hay que elegir una:

- Conciliar **sólo tarjeta y transferencia**, donde la cifra sí es exacta, y
  tratar el efectivo como declaración sin contraparte.
- Conciliar todo pero con **tolerancia configurable por tenant**, y auditar sólo
  lo que la pase.
- No conciliar: registrar ambas cifras y dejar que el encargado mire.

La primera es la única que produce una alerta que significa algo.

**Costo:** bajo-medio, después del prerrequisito de `mesero_id`.
**Valor:** alto. Un mesero que se va con mesas abiertas es un problema real y
frecuente.

---

## 2 · Caja Chica / Caja Grande — la más barata y la que primero rinde

**Lo que ya existe en `gastos`:** `comprobante_url`, `estado`, `usuario`,
`categoria_id`, `proveedor`, `nota`, `activo`. Y nueve categorías de sistema
sembradas (`es_sistema = true`), con `fijo` booleano.

**La trampa:** `gastos.origen` **ya existe y ya significa otra cosa** — sus
valores hoy son `manual` y `recurrente`, o sea la procedencia del registro, no
de qué caja salió el dinero. Reutilizarlo para chica/grande sería meter dos
significados en una columna, y el día que alguien filtre por `origen` obtendrá
una mezcla. Va un eje nuevo: `caja: 'chica' | 'grande'`.

**Lo que la propuesta subestima:** una etiqueta no es una caja. Para responder
«¿cuánto queda en la caja chica?» hace falta modelar **fondo, retiros y
reposiciones**, no sólo marcar gastos. Sin eso, «caja chica» es un filtro de
reporte con nombre ambicioso. Con eso, es un arqueo pequeño — y el arqueo grande
ya está escrito en `lib/Arqueo.js`, así que hay patrón que copiar.

**La firma de quién pidió y quién autorizó** encaja sin inventar nada: la
autorización por PIN ya está implementada y probada en `ModalCobro` para
descuentos, con rastro en auditoría. Es el mismo gesto.

**Costo:** bajo. Es la única de las cinco sin prerrequisitos.
**Valor:** alto e inmediato, y no depende de nada de sala.

---

## 3 · Huella (timer) — buena idea, sitio equivocado

**La corrección de fondo: el timer no va en el Hub.**

La propuesta dice «cuando el KDS marca listo, el Hub inicia un timer». El hub es
un proceso de impresión y LAN; un temporizador de negocio ahí tiene tres
problemas: muere cuando se reinicia la caja, no existe si el teléfono está fuera
de la LAN, y no deja rastro que se pueda auditar después.

Lo que hay que guardar no es un temporizador sino **dos sellos de tiempo por
ítem**: `listo_en` y `entregado_en`. Con eso, los cinco minutos no son un reloj
corriendo en ninguna parte: son una resta que cualquiera puede hacer, en
cualquier momento, incluso tres semanas después cuando el cliente reclama. Y
sobrevive a reinicios y a estar sin red, que es el requisito de todo este
producto.

El «alerta al encargado» se deriva de los sellos, no los reemplaza.

**El otro ajuste:** cinco minutos fijos no sirven. Un refresco frío no existe y
un corte de cinco minutos en la barra es normal; en cocina no. El umbral tiene
que ser **por tenant y por zona de impresión** —las zonas ya están modeladas—, o
la alerta se vuelve ruido y el encargado la apaga.

**Lo que ya existe:** el estado por ítem (`pendiente`/`listo`),
`comandas.entregada_en` a nivel comanda, el estado `entregada` en el ciclo, y
`REPLICA IDENTITY FULL` en comandas para que el realtime propague bien.

**Costo:** medio. El grueso es la migración del `jsonb` y tocar KDS + la vista de
mesa.
**Valor:** alto, y hay un valor secundario que importa más de lo que parece:
**es la propuesta que GENERA LOS DATOS que la número 4 necesita.**

---

## 4 · Sincronía (coreografía) — la más ambiciosa y la que debe ir última

Es la que más ilusión da y la que hoy no se puede construir bien.

Para decir «en 2 minutos coinciden todos los platos de la mesa 8» hace falta
**predecir** cuándo va a estar cada plato. Eso requiere tiempos de preparación
por platillo, y **`recetas` no tiene ninguna columna de tiempo**. No hay dato, ni
medido ni estimado.

Sin dato hay dos caminos y los dos son malos: pedirle al dueño que teclee un
tiempo por platillo (inventará números, y el sistema hablará con la seguridad de
un dato que es una corazonada), o estimar por promedio global (dirá que el postre
y el arrachera tardan lo mismo).

Y el modo de fallo es peor que inútil. Un asistente que da tres instrucciones
equivocadas —«ve a barra» y no hay nada— pierde la confianza del mesero para
siempre, y a partir de ahí la pantalla es adorno. Un sistema que sugiere se
juzga por sus peores consejos, no por sus mejores.

**La secuencia correcta es evidente en cuanto se ve la dependencia:** implementar
la 3, dejar que corra unas semanas en producción, y **medir** los tiempos reales
por platillo y por zona. Con esa distribución encima, la 4 se construye sobre
medición y no sobre adivinanza — y de paso la línea de tiempo visual (la mitad
descriptiva, «qué está listo, qué falta») se puede entregar mucho antes que la
mitad prescriptiva («qué hacer ahora»), porque sólo necesita los sellos.

Partirla en esas dos mitades es probablemente la decisión más rentable de toda
esta lista.

**Costo:** alto, y con dependencia de datos que aún no existen.
**Valor:** potencialmente el más alto de los cinco, pero sólo con la 3 en
producción y medida.

---

## 5 · Fantasma (simulador) — más barata de lo que parece, con una puerta olvidada

**La buena noticia, y es grande:** en todo el front hay **una sola** escritura a
Supabase, en `useSyncStore.js:369`. Todo lo demás pasa por `enqueueAction`. Un
modo simulacro no es un refactor transversal: es una guarda en una puerta.

Y la guarda tiene que vivir **en la puerta**, no en las pantallas. Es la lección
de `Payload.js` y de la llave de `Puerta.js`: si cada vista tiene que acordarse
de comprobar «¿soy fantasma?», alguna se olvidará, y el síntoma será una comanda
de práctica en la cocina real durante el servicio.

**La puerta olvidada:** `enqueueAction` no es la única salida al mundo.
`enviarComanda`, `enviarTicket` y `enviarPreCuenta` de `lib/Hub.js` van directas
al hub, en paralelo y sin pasar por la cola — en `PosScreen` se ven como
`void enviarComanda(...)` justo al lado del `enqueueAction`. **Si el modo
fantasma sólo cubre `enqueueAction`, el aprendiz imprime comandas de verdad en
cocina.** Son dos puertas: la cola y el hub.

Lo demás encaja bien: las lecturas siguen siendo reales (carta real, mesas
reales), el «reporte» del encargado no es más que el registro de intenciones que
la guarda ya tuvo que capturar, y la aprobación final puede colgarse de
`roles_permisos.capacidades`, que ya es jsonb editable por tenant y ya lo lee
`lib/Permisos.js`.

Un detalle que conviene decidir antes: el fantasma **no puede** tocar
`mesas.estado`. Ve las mesas reales pero no las ocupa — si no, un aprendiz
practicando deja media sala marcada como ocupada en plena comida.

**Costo:** bajo-medio.
**Valor:** medio, y muy dependiente del momento. Vale mucho justo antes de meter
personal nuevo; poco antes de eso.

---

## Orden propuesto

| # | Qué | Por qué ahí |
|---|---|---|
| 0 | Lo del lanzamiento | Impresora, certificado, 3.4/3.5, total divergente |
| 1 | **Caja Chica / Grande** | Sin prerrequisitos, valor inmediato, patrón de arqueo ya escrito |
| 2 | **`mesero_id` vivo** | Prerrequisito compartido de 1, 3 y 4. Pequeño y desbloquea tres |
| 3 | **Huella** | Rinde por sí sola Y produce los datos que la 4 necesita |
| 4 | **Relevo** | Después de `mesero_id`; requiere decidir lo de la propina en efectivo |
| 5 | **Fantasma** | Barato, pero atar las DOS puertas. Cuando toque contratar |
| 6 | **Sincronía**, mitad descriptiva | Sólo necesita los sellos de la 3 |
| 7 | **Sincronía**, mitad prescriptiva | Sólo con semanas de tiempos reales medidos |

## Las tres correcciones, en una línea cada una

1. **Propina en efectivo:** conciliar sólo tarjeta/transferencia, o toda
   diferencia será ruido y auditoría morirá de saturación.
2. **El timer no va en el hub:** dos sellos de tiempo por ítem, y la resta la
   hace quien pregunte. Sobrevive a reinicios, a la falta de red y a tres
   semanas.
3. **El fantasma tiene dos puertas:** `enqueueAction` y `lib/Hub`. Cerrar sólo
   una imprime comandas de práctica en la cocina real.
