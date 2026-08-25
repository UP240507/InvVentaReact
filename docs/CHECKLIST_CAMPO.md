# Checklist de campo — 0.2.8

Sólo los puntos. El porqué de cada uno está en `docs/CHECKLIST_VERIFICACION.md`;
si los dos discrepan, manda aquél.

Si un paso falla: **para y anótalo**. No sigas con el bloque.

---

## 0 · En la máquina, antes de salir

- [ ] `npm run test:rapido` → 6 fallos en `useConectividad`, ni uno más
- [ ] `npm run test:run` en verde
- [ ] `npm run version` → 0.2.8 en los cinco archivos
- [ ] `cargo test` en `src-tauri`
- [ ] `bash scripts/pruebas-rust.sh` en verde
- [ ] La nota del release dice sólo lo que la 0.2.8 trae

## 1 · Paso cero en el local

- [ ] `Zonas de Producción` → «La cuenta de la mesa» dice «Un solo papel»
- [ ] Confirmado en Supabase: `configuracion.flujo_cuenta` = `ticket_final`

## 9c · CSP (build instalado)

- [ ] La app abre y se ve maquetada, con sus tipografías
- [ ] Inicia sesión contra Supabase
- [ ] Imprime un ticket de prueba desde `Ajustes → Hub`
- [ ] La pantalla del hub enseña la cola y el ancho de papel
- [ ] El KDS recibe una comanda mandada desde otro aparato
- [ ] `Ajustes → Configuración`: se ve la imagen del logo
- [ ] `Ajustes → Hub`: no aparece la tarjeta roja «Bloqueos de seguridad»

## 10 · Updater

- [ ] Con la 0.2.7 instalada, «Buscar actualización» ofrece la 0.2.8
- [ ] El aviso enseña la nota de la versión
- [ ] La nota dice cosas que esta versión trae
- [ ] «Versión instalada» dice 0.2.7, no un guion
- [ ] Instalar: aviso azul de Windows, la caja se cierra y vuelve sola
- [ ] Al volver, «Versión instalada» dice 0.2.8

## 9j · Logo en papel

- [ ] Elegir imagen en Configuración: la vista previa es blanco y negro puro
- [ ] Prueba desde el hub: el logo sale arriba del nombre, centrado y sin escalones
- [ ] Un PNG con fondo transparente sale como marca, no como rectángulo negro
- [ ] El ticket lo lleva
- [ ] La cuenta lo lleva
- [ ] La comanda NO lo lleva
- [ ] El corte Z y el vale NO lo llevan
- [ ] Diez documentos seguidos con logo: la impresora no se queda muda
- [ ] Al quitar el logo, los papeles salen con el nombre del local

## 2 · La cuenta, la reapertura y el folio

- [ ] Mesa con productos → Pedir Cuenta → sale un papel
- [ ] «Imprimir copia» → sale otro papel, idéntico salvo la hora
- [ ] Reabrir, agregar algo, A Producción, Pedir Cuenta → total nuevo, mismo folio
- [ ] Cobrar → la venta lleva ese folio (`public.ventas`)
- [ ] Dos jugos de $40 → `TOTAL $80.00`, `SUBTOTAL:$68.97 IVA:$11.03`
- [ ] «Imprimir copia» no abre el cajón
- [ ] «Imprimir copia» no desbloquea la cuenta: «A Producción» sigue apagado
- [ ] Auditoría: un `CUENTA_IMPRESA` por papel, numerados
- [ ] El cajón NO se abre al pedir la cuenta

## 9l · Cuentas parciales

- [ ] Aparece «Cuenta aparte para unos cuantos»
- [ ] Con flujo `precuenta_y_ticket` NO aparece
- [ ] Se eligen unidades: de 4 cervezas se llevan 2
- [ ] Sale un papel con su propio folio y sólo lo de ese grupo
- [ ] Subtotal + IVA del papel cuadran con las líneas impresas
- [ ] La mesa sigue abierta
- [ ] Pedir otra cerveza crea un renglón NUEVO
- [ ] Cambiar la cantidad de la línea facturada: la pantalla lo frena y dice en qué cuenta salió
- [ ] Al cobrar esa cuenta no hay división por platillos
- [ ] Sí hay división por personas y pago en partes
- [ ] La venta lleva el folio del papel (`public.ventas`)
- [ ] No aparece en «Cuentas impresas sin cobrar»
- [ ] Segunda cuenta de la misma mesa: folio distinto, las dos conviven
- [ ] Cobrar una no toca la otra
- [ ] «Deshacer» devuelve las líneas al carrito y deja `CUENTA_PARCIAL_DESHECHA` en Auditoría
- [ ] Cobrar la última cuenta libera la mesa
- [ ] Con 2 de 4 ya en cocina: ninguna de las dos líneas deja quitar lo que está en la barra

## 9d · Folio reservado

- [ ] Migración `20260822120000_folios_reservados.sql` aplicada
- [ ] Pedir cuenta → fila en `folios_reservados` con el folio como `id`, mesa, usuario y total
- [ ] Reimprimir esa cuenta NO crea una segunda fila
- [ ] Cobrarla → no aparece en «Cuentas impresas sin cobrar»
- [ ] Pedir cuenta de otra mesa y NO cobrarla → aparece en la lista, con folio e importe
- [ ] Con `precuenta_y_ticket` no se reserva nada
- [ ] `Ajustes → Hub`: el contador de respaldo sube al pedir una cuenta
- [ ] Borrar una fila de `folios_reservados` desde el cliente falla

## 5 · Reimprimir ticket

- [ ] `Reportes → Corte Z → Tickets del turno`, botón de impresora → sale un papel
- [ ] Pulsarlo otra vez → sale otro papel
- [ ] Los papeles son idénticos al original: sin «REIMPRESIÓN» ni «copia 2»
- [ ] El cajón NO se abre con ninguna copia
- [ ] La copia de una venta de mesa dice el nombre de la mesa
- [ ] Auditoría: un `REIMPRESION_TICKET` por copia, con folio y número
- [ ] `ventas.copias_impresas` subió

## 7 · Corte Z y vale de propina

- [ ] «Imprimir Z» → sale por la térmica, no un diálogo de Windows
- [ ] Las cifras del papel cuadran con las de la pantalla
- [ ] `TOTAL EN CAJA` = fondo inicial + efectivo
- [ ] Contarlo una vez contra el dinero real del cajón
- [ ] Pulsarlo dos veces → salen DOS papeles
- [ ] El cajón NO se abre al imprimir el corte
- [ ] Con un turno sin cerrar, el papel dice «En curso»
- [ ] Con la impresora apagada: sale el aviso rojo, no un «listo» falso
- [ ] `Reportes → Propinas por mesero` → sale el vale, con importe en letra y línea de firma
- [ ] Auditoría: `VALE_PROPINA_IMPRESO` con mesero, importe y periodo
- [ ] POS: cobrar y pulsar «Imprimir» en el ticket → sale papel térmico
- [ ] Pulsarlo dos veces saca dos papeles y sube `copias_impresas`

## 3 · Respaldo, adopción y drenaje

- [ ] Al instalar la 0.2.8, drenar una vez con «Recuperar ahora»
- [ ] Quitar internet a la caja (con su LAN), cobrar una venta desde la caja
- [ ] La venta queda pendiente de subir
- [ ] Cerrar la aplicación y volver a abrirla
- [ ] «Por adoptar» sigue en 0
- [ ] En `respaldo-ventas.ndjson`, las líneas nuevas dicen `"dispositivo":"::caja::"`
- [ ] Cobrar desde un teléfono sin red y revocar ese dispositivo
- [ ] «Recuperar ahora» → esa venta sí aparece y sube (`public.ventas`)
- [ ] Teléfono sin red: cobrar SEIS ventas, alguna con modificador y alguna con nota
- [ ] Reconectar sin tocar nada y cronometrar cuánto tarda en vaciarse: ____
- [ ] Mirar el KDS en otro aparato mientras drena
- [ ] Las seis están en `public.ventas`
- [ ] El panel de errores del teléfono está vacío
- [ ] En `stock_salidas`, una fila por venta: ni cero ni dos
- [ ] Si algo cae en dead-letter: reencolarlo y anotar el motivo

## 4 · Dirección por nombre

- [ ] En la pantalla del hub aparece `http://invventa-caja.local:3000`
- [ ] Se abre desde un teléfono
- [ ] Se abre desde otra PC del local
- [ ] Con la caja en el wifi de AZUL, no en un hotspot

## 6 · Interfaz

- [ ] Mesas: la mesa de la esquina superior izquierda enseña el anillo entero
- [ ] POS: la etiqueta `Enviado: n` en una sola línea (tablet o ~1080 px)

## 8 · KDS por rol

- [ ] Sin tocar ningún ajuste, el KDS se marca exactamente como ayer
- [ ] Con «sólo lectura»: banda arriba, items atenuados, y al tocar uno se abre el PIN
- [ ] Con el PIN de encargado se desbloquea y se puede marcar
- [ ] Auditoría: `KDS_DESBLOQUEADO` con quién autorizó
- [ ] Con «estación fija»: sus platillos sí, los de barra no
- [ ] Deshacer también está bloqueado, no sólo marcar
- [ ] Empleado sin estación y ajuste activado: se le deja marcar y la pantalla avisa

## 9 · Modificadores sin atar

- [ ] Cada grupo enseña «En N platillos» o «Todavía sin usar», y el número coincide
- [ ] Atar un grupo en Recetas y volver: el chip cambia solo
- [ ] El grupo sin usar dice dónde se ata

## 9b · Notas y comensales

- [ ] Mandar 1 pizza a cocina; tocar Pizza otra vez y abrir la nota: se abre y avisa
- [ ] Al aceptar quedan dos líneas: una de 1 enviada sin nota y otra de 1 con nota
- [ ] Las cantidades suman lo mismo que antes
- [ ] Mandar la nueva a cocina: sale su propia comanda con la nota
- [ ] Con todo enviado, el icono de nota avisa de que hay que agregar otra unidad
- [ ] Abrir la nota y aceptar sin cambiar nada deja el carrito igual
- [ ] Mesa nueva: el contador de comensales enseña «—», no 1
- [ ] «Pedir Cuenta» sin comensales abre el cuadro; cancelar no imprime ni marca la mesa
- [ ] Teclear el número imprime, y el papel dice «Personas: N»
- [ ] Reimprimir la cuenta: sale el mismo número
- [ ] En mostrador no se pide, y mandar a cocina nunca lo pide

## 9e · Gastos en dos escalas

- [ ] Migración `20260822130000_gastos_escala.sql` aplicada
- [ ] Gastos abre en «Del turno»
- [ ] El formulario viene en «del turno» y dice que no lleva saldo ni reposiciones
- [ ] Un gasto «fuerte» aparece sólo en su pestaña
- [ ] Los gastos de antes de hoy salen en las DOS pestañas, con «Sin clasificar»
- [ ] Arriba dice cuántos quedan sin clasificar
- [ ] Clasificar uno: desaparece del aviso y queda en una sola pestaña
- [ ] El total del periodo NO cambia al cambiar de pestaña
- [ ] Editar un gasto viejo sin tocar la escala lo deja sin clasificar

## 9f · Duplicar receta

- [ ] Icono de copiar en una receta con insumos y modificadores: se abre todo relleno
- [ ] El nombre dice «(copia)» y el código POS está vacío
- [ ] Cerrar sin guardar no deja nada
- [ ] Guardar crea una receta nueva y la original sigue igual
- [ ] Duplicar dos veces da «(copia)» y «(copia 2)»
- [ ] Duplicar una copia da «(copia 2)», no «(copia) (copia)»
- [ ] Cambiar una cantidad en la copia no toca la original

## 9g · Buscador de insumos

- [ ] Escribir «que» deja «Queso fresco» arriba
- [ ] Escribir «limon» sin acento encuentra «Limón»
- [ ] ↓ y ↑ mueven la selección; Enter la toma y el foco salta a la cantidad
- [ ] Con una sola coincidencia, Enter la toma sin bajar
- [ ] Con dos o más y ninguna resaltada, Enter no elige nada
- [ ] Enter en la cantidad agrega y el foco vuelve al buscador
- [ ] Cargar tres ingredientes seguidos sin tocar el ratón
- [ ] Un insumo archivado no aparece
- [ ] Buscar algo que no existe dice que no hay coincidencias
- [ ] Abrir otra receta: el buscador está vacío

## 9h · Merma y vista previa del modificador

- [ ] Donde estaba la merma hay «+ Merma», y la fila se teclea sin pasar por él
- [ ] Un ingrediente con merma puesta enseña el campo sin desplegarlo
- [ ] En un grupo de modificadores hay «Pruébalo» con las opciones tocables
- [ ] Con «Selección única», tocar dos deja una marcada
- [ ] Con «múltiple», deja las dos
- [ ] Con obligatorio y nada elegido, aparece el aviso; al elegir desaparece
- [ ] Abrir otro grupo: la prueba está en blanco

## 9i · Código POS único

- [ ] Alta con un código que ya existe: la pantalla lo frena y dice qué platillo lo usa
- [ ] «p01 » contra «P01»: también lo frena
- [ ] Contra una receta archivada: lo frena y dice que está archivada
- [ ] Dos recetas SIN código se pueden guardar las dos
- [ ] Editar una receta sin cambiar el código no da error

## 9k · Franjas

- [ ] Sin tocar ningún ajuste, todo se comporta como ayer: ni una palabra nueva
- [ ] Encender las franjas en `Ajustes → Configuración → Turnos`
- [ ] Cobrar antes y después del corte: cada venta en su franja (`ventas.franja`)
- [ ] Mesa abierta antes del corte y cobrada después → vespertino
- [ ] Mover la hora de corte no cambia ninguna venta ya cobrada
- [ ] Una merma cae en su franja y el stock total no se parte
- [ ] Un gasto capturado se estampa; uno de antes queda sin clasificar
- [ ] Reportes: aparece Todo el día / Matutino / Vespertino
- [ ] Al elegir uno, las cifras cambian y dice cuántas quedaron sin clasificar
- [ ] Matutino + vespertino ≤ el día entero
- [ ] Apagar las franjas: la pantalla vuelve a la de antes y los datos se quedan

## 11 · Al cerrar — NO OLVIDAR

- [ ] La caja al wifi de AZUL, no en un hotspot
- [ ] El transporte, de vuelta a la impresora de Windows

---

## Después: antes de la sombra

- [ ] El menú de AZUL cargado (hoy hay 6 recetas de ejemplo)
- [ ] Los insumos, con su unidad de consumo y su costo
- [ ] Las mesas reales (hoy hay 3)
- [ ] Los empleados con su rol y su PIN

## La sombra

- [ ] Decidido quién teclea en InvVenta durante el servicio
- [ ] Cada día: tickets, total, efectivo contra corte Z, y los tres más vendidos
- [ ] Las diferencias se investigan el mismo día y se anota qué pasó
- [ ] Cinco días de servicio seguidos cuadrando, uno de ellos de carga alta
- [ ] Ningún fallo de impresión sin explicar
- [ ] El inventario contra un conteo físico
- [ ] Escrita la vuelta atrás, y Soft Restaurant vivo el primer mes
- [ ] Decidido quién llama a quién si la caja no imprime en hora de comida
