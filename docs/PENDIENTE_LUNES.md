# Lo del lunes — después de la prueba del sábado

Se escribió el 13-ago por la noche con la regla de no tocar nada antes de la
verificación en AZUL. **La verificación ya se hizo, el 15-ago**, así que esa
puerta está abierta — pero delante de todo lo demás va lo que salió del local.

---

## 0 · Lo que salió de la verificación del 15-ago

**Ocho fallos. Seis arreglados el 17-ago, uno mitigado y uno que resultó no ser
fallo.** El detalle está en `docs/VERIFICADO_15-AGO.md`; aquí el orden en que se
atacaron y lo que queda vivo de cada uno.

**El orden fue por dependencia, no por gravedad.** Mientras una venta moría en el
trigger, lo que iba detrás en la cola se retrasaba y parecía otra cosa: eso
produjo un falso fallo que costó dos pruebas descartar.

> **LO QUE SIGUE ABIERTO, y es lo único que hay que leer con prisa:**
>
> - ~~**La exclusión por token del 5.**~~ **CERRADO el 18-ago.** La caja se
>   firmaba con el token de emparejamiento, que se regenera en cada arranque a
>   propósito; el archivo de respaldo no. Al reiniciar dejaba de reconocer lo
>   suyo. Ahora se marca con `respaldo::CAJA` y la exclusión vive dentro de
>   `pendientes()`, no en el cierre de cada llamador. Dos pruebas nuevas, una de
>   ellas reabriendo el archivo — que es la única que veía el fallo.
> - **La reserva del folio del 7.** Falta decidir si `mesas` entra en el
>   respaldo, con el riesgo de resucitar mesas cerradas.
> - **Ver en papel el 2 y el 3.** Los arreglos están y la suite pasa; falta la
>   tira.

1. ~~**El trigger que castea `it->>'id'` a `bigint`.**~~ **HECHO el 17-ago.**
   Migración `20260817090000_verificar_total_venta_id_de_linea_no_numerico.sql`,
   aplicada a la base de AZUL y comprobada en `pg_proc`. La venta
   `AZULJ3-V-000006` (total 209) está en la nube, entera. Ya no hay restricción
   sobre usar notas ni modificadores en ventas reales.

2. ~~**La reimpresión tras reabrir una cuenta no imprime, y no avisa.**~~
   **HECHO** (`655916e`), **falta verlo en papel.** Era el mismo mecanismo que
   describe §1 de este documento: §1 lo había previsto en abstracto sin saber
   que ya estaba ocurriendo en el flujo de la cuenta. Se arreglaron los dos a la
   vez, y por eso §1 tiene ahora dos de sus tres cambios hechos.

   > Y salió un tercero por el camino: **«A Producción» borraba el folio
   > reservado**, porque reconstruía `orden_actual` desde cero. Explicación del
   > hueco `AZULHN-V-000004` mucho más mundana que la del teléfono muerto.

3. ~~**El centavo de más.**~~ **HECHO** (`7a9268d`), **falta verlo en papel.**
   Con `precios_incluyen_iva` el precio de menú **es** el total y el IVA es el
   resto. Se repasaron los casos con descuento de línea, de ticket, propina,
   cortesía, IVA en cero y precios sin IVA: los nueve cuadran.

   > **Efecto que no se buscaba:** `verificar_total_venta` calcula sin redondear
   > en medio, así que el front y Postgres discrepaban **por construcción** y
   > sólo la tolerancia de `0.02` impedía que cada venta saliera marcada como
   > divergente. Ahora coinciden exacto — o sea que `total_divergente` pasa de
   > ser un detector al borde de gritar por todo a uno que se puede leer.

4. ~~**«Recuperar ahora» falla y dice «No había nada que recuperar».**~~
   **HECHO** (`f5fea58`). Devuelve un recuento y la pantalla distingue los tres
   casos; el motivo del fallo va en el aviso y no sólo a una consola que en
   release no se abre. De paso, el store dejó de pintar toasts: sacaba el suyo
   además del de `HubScreen`.

5. **La exclusión por token, y el `23505` que se marca como fallo.** De las dos
   mitades, **una hecha y otra abierta**:

   - ~~Un `23505` sobre una fila que ya existe no es un fallo.~~ **HECHO**
     (`140415d`). Se da por subida en `ventas`, `comandas`, `movimientos` y
     `auditoria` — sólo ahí, porque su id lleva carril de dispositivo y un
     duplicado significa «la misma fila». La decisión vive en
     `esFilaYaExistente`, con seis pruebas incluidos los bordes.
   - ~~**Por qué la caja no se reconoce a sí misma.**~~ **HECHO el 18-ago.**
     Se decidió leyendo los dos lados, y **la hipótesis descartada era la
     buena**: los dos usan el mismo campo y el mismo camino —`hub_respaldar` y
     `respaldar` escriben `dispositivo` desde el emisor, nunca del cuerpo—, y lo
     que fallaba es que el valor no sobrevive. La caja se firmaba con
     `estado.token`, el token de EMPAREJAMIENTO, que `servidor.rs` regenera en
     cada arranque para que una foto vieja del QR deje de servir (hay una prueba
     que lo fija). `respaldo-ventas.ndjson` sí sobrevive. Resultado: al
     reiniciar, la caja no reconocía ninguna anotación suya y se ofrecía a
     adoptar su propio trabajo.

     El arreglo no persiste el token —eso cambiaría una propiedad de seguridad
     para resolver un problema de identidad— sino que deja de deducir el autor
     después: se marca en el momento de escribir, con `respaldo::CAJA`. Y la
     exclusión se movió DENTRO de `pendientes()`, porque los llamadores son dos
     y olvidarla en uno no da ningún error.

     > **Lo que hay que saber al instalar:** las anotaciones que ya están en el
     > disco de AZUL llevan tokens de arranques muertos y no hay forma de
     > distinguirlas de las de un teléfono revocado, así que se seguirán
     > ofreciendo una vez. Drenar («Recuperar ahora») después de instalar y
     > listo — adoptar de más es inofensivo, `upsert` sobre una clave ya única.

   > **No era cosa de la caja consigo misma.** Esa noche el teléfono de pruebas
   > acabó con tres errores permanentes por trabajo que la caja ya había
   > adoptado. Es general, y por eso el arreglo desbloqueó §10.

6. ~~**La auditoría no se respalda.**~~ **HECHO** (`7021425`), y el diagnóstico
   era más hondo que la lista de tablas: `registrarAuditoria` **no pasaba por la
   cola**. Añadirla a `TABLAS_RESPALDADAS` no habría servido de nada.

7. **El folio reservado vive sólo en el aparato.** **MITIGADO** (`655916e`,
   `cfbc428`): la causa frecuente arreglada, y el hueco queda explicado con
   `CUENTA_IMPRESA`. **Falta decidir** si `mesas` entra en el respaldo — ver §8.

8. **El updater no avisa solo.** **NO ES FALLO**: decisión escrita, revisada y
   mantenida (`143cd15`). Ver §11.

### 7 · El KDS, sólo lectura fuera de tu estación — **HECHO el 18-ago**

**Lo que pidió Chris:** que un barista no pueda marcar listo un platillo de
cocina por error, ni al revés. Y que los demás roles —dueño, gerente, admin—
entren al KDS **en sólo lectura**: se meten a ver cuánto lleva una mesa
esperando, no a cocinar un viernes por la noche.

Es la continuación natural de §8, donde ya se decidió que a Gerente y Admin no
les suena nada porque entran a supervisar. Aquí es lo mismo un paso más allá: si
entran a mirar, no deberían poder tocar.

**Dónde va.** `lib/Permisos.js` ya tiene `CAPACIDADES_BASE` por rol y
`tieneFlag()` con lectura estricta —capacidades corruptas o ausentes cuentan como
`false`—, así que esto es una capacidad más, no una pantalla nueva. La regla vive
ahí y el KDS la consulta; no un `if` por rol repartido por los botones.

**Cómo se ve, y esto importa más que la regla.** Un botón que está y no hace nada
es exactamente el fallo del «Salir» del barista que se arregló el 12-ago. Las dos
salidas honestas son: **no pintar el botón**, o pintarlo apagado **diciendo por
qué**. Lo que no vale es dejarlo con su aspecto de siempre y que no responda.

**Tres decisiones, tomadas el 17-ago:**

1. **No se codifica la regla: se configura.** Las estaciones entran en la
   pantalla de **Roles y Permisos**, como una capacidad más por rol, y cada local
   activa lo que necesite. Así se resuelve solo el caso del Chef que lleva
   también la barra a las tres de la tarde: en AZUL se desactiva, en un local que
   trabaje de otra forma se activa. `roles_permisos.capacidades` ya es `jsonb`
   editable por tenant, así que el sitio existe.

2. **Con escotilla, y por PIN.** «Sólo lectura» sin salida deja la pantalla
   bloqueada la noche que el KDS se atasca y el único en el local es el dueño.
   Se usa `lib/Autorizacion.js` y el PIN de encargado, el mismo patrón que
   reabrir una cuenta. Es la diferencia entre una regla y una trampa — y de paso
   queda auditado quién tocó qué, que es más de lo que hay hoy.

3. **Una sola guarda para las dos direcciones.** Marcar listo y deshacer son el
   mismo botón: `estado: listo ? 'pendiente' : 'listo'`. Bloquear la acción
   bloquea las dos, y eso es lo que se quiere: «no tocas esta estación» se
   explica a un cocinero; «puedes desmarcar pero no marcar», no.

   **Sin confirmación de doble toque**, que se valoró y se descartó. Marcar por
   error cuesta un toque deshacerlo; una confirmación por platillo, con las manos
   ocupadas y veinte comandas, es fricción constante contra un error barato. Las
   confirmaciones se ganan cuando el error es caro o irreversible.

#### Cómo quedó, y la trampa que dictó el diseño

`permisoDeMarcadoKds(cap, {estacionUsuario, estacionItem})` en `lib/Permisos.js`
devuelve `{puede, motivo}`, y `KdsScreen` la consulta una sola vez por item.
Dos flags nuevos: `kds_solo_lectura` y `kds_estacion_fija`.

**Los dos son RESTRICCIONES, no permisos, y eso no es una preferencia de
estilo.** `getCapacidades(rol, filas)` **REEMPLAZA** la base cuando el rol tiene
fila propia — no mezcla. Un flag nuevo redactado en positivo (`kds_puede_marcar`)
llegaría `undefined` a todo tenant que ya esté en producción, y **la cocina de
todos los locales se quedaría mirando una pantalla que no responde** el día que
se publique la versión. Redactado como restricción, ausente = como ayer.
`Permisos.test.js` fija las dos mitades de esto, incluida la de que
`getCapacidades` no mezcla: si algún día alguien lo cambia por una fusión, esa
prueba falla y le obliga a mirar qué permisos heredaría de vuelta una fila
incompleta.

**El caso incómodo:** restricción activada y empleado sin estación asignada. No
hay con qué comparar. Se deja pasar y se devuelve `motivo: 'sin_estacion'`, y la
pantalla avisa de que el ajuste no está haciendo nada — un ajuste que promete y
no cumple es peor que uno apagado.

**Y lo visible:** los items ajenos se pintan atenuados con `cursor-not-allowed`,
hay una banda arriba diciendo en qué modo estás, y el toque bloqueado **abre el
modal de PIN** en vez de no hacer nada. Desbloquear queda en auditoría como
`KDS_DESBLOQUEADO`.

### 10 · Revocar todos los dispositivos al cerrar turno (Chris, 17-ago) — **HECHO el 18-ago**

> **Entró en cuanto se cerró el fallo 5**, que era lo que lo bloqueaba. Botón
> «Revocar todos» en la tarjeta de dispositivos de la pantalla del hub, con
> confirmación que dice **números y no “¿seguro?”**: a cuántos afecta y cuántas
> ventas sin subir hay colgando de ellos.
>
> **El drenaje se hace solo, justo después.** El documento decía «que ofrezca
> drenar después» y al construirlo se vio que ofrecerlo era peor: quien
> confirmó ya leyó cuántas ventas había, y pedirle una segunda pulsación para
> la mitad de la operación es exactamente cómo se queda a medias. El orden
> —revocar → drenar → cerrar— se respeta entero sin depender de que nadie se
> acuerde.
>
> **Los números salen sin que un token salga de Rust.** `respaldo` sabe qué
> tokens tienen trabajo pendiente y `dispositivos` cuenta cuántos de los suyos
> están en esa lista; la pantalla recibe cifras. Es la misma razón por la que
> `Publico` no lleva tokens.
>
> **Probado donde se puede:** `dispositivos.rs` entra al cajón de pruebas de
> Linux (`scripts/pruebas-rust.sh`), 63 en verde, con una que fija la garantía
> que sostiene todo el botón — **la caja no está en el registro, así que
> vaciarlo no puede dejarla sin administrar su propio hub**. Lo que no tiene
> suite es la pantalla.

**Lo que pidió Chris:** una opción para revocar todos los dispositivos del hub al
terminar el turno. Hoy se acumulan: cada teléfono que alguna vez escaneó el QR
sigue emparejado para siempre, incluido el del mesero que se fue en marzo.

**No hay riesgo de dejar la caja fuera.** `autorizado_admin` (`hub/servidor.rs`)
compara contra `estado.token`, el token propio del hub, que **no** está en el
registro de dispositivos emparejados. Revocar todos no puede revocar la caja.

**Y hay una sinergia que conviene aprovechar.** Revocar un dispositivo lo saca de
la ventana de «vivo», así que sus ventas sin confirmar pasan a **«Por adoptar»
de inmediato** —sin esperar los 15 minutos—. O sea que cerrar turno es
exactamente el momento en que la caja debería recoger lo que quedó suelto en los
teléfonos.

**El orden importa, y al revés destruye trabajo:**

1. **Revocar todos.**
2. **Drenar el respaldo** («Recuperar ahora»), que ahora sí ve todo lo huérfano.
3. Sólo entonces dar el turno por cerrado.

Si se revoca y no se drena, esas ventas se quedan en el disco de la caja
esperando a un dispositivo que ya no va a volver. No se pierden —el respaldo las
tiene— pero nadie las va a ir a buscar.

**Y por eso no lo haría automático al cerrar turno.** Un turno se cierra mientras
alguien puede seguir cobrando una última mesa, y un mesero al que le revocan el
teléfono a media cuenta no entiende qué pasó: la app deja de imprimir sin decir
por qué. Un botón explícito en la pantalla del hub, que diga cuántos va a
revocar y cuántas ventas pendientes hay, y que ofrezca drenar después.

**Con confirmación** (decidido con Chris, 17-ago). Tiene que decir **cuántos
dispositivos** va a revocar y **si alguno tiene ventas sin confirmar** antes de
ejecutar. Revocar a ciegas es barato de deshacer —se vuelve a escanear el QR—
pero a media comida cuesta un servicio.

> **DESBLOQUEADO el 18-ago** — se cerró el fallo 5. Lo de abajo se conserva
> porque explica por qué este botón no podía salir antes, y porque el riesgo
> vuelve en cuanto alguien toque la exclusión: si un teléfono revocado reinserta
> lo que la caja ya adoptó, se queda con rojos permanentes. Eso lo sostiene
> `esFilaYaExistente` (`140415d`), no el arreglo de hoy.
>
> **LO QUE ESTABA BLOQUEADO, y por qué.** Revocar es exactamente lo que
> provoca que la caja adopte el trabajo del dispositivo. Y cuando ese
> dispositivo vuelve, su cola reinserta lo mismo y se queda con errores rojos
> permanentes: pasó esa misma noche en el teléfono de pruebas, con tres.
>
> Sacar este botón antes de arreglar el 5 multiplica ese problema por el número
> de teléfonos y por el número de cierres de turno. Cada mesero se encontraría
> su pantalla llena de rojo por ventas que sí llegaron — y lo que se aprende de
> eso es a no mirar ese panel nunca más.

### 11 · El updater no avisa solo — y eso está decidido, no roto

Revisado el 17-ago y **se mantiene como está**. Se anota porque casi se
«arregla» por error: mirando quién llama a `buscarActualizacion` parece un
descuido —sólo el botón de `HubScreen`— pero la cabecera de `Actualizacion.js`
lo explica: nada al arrancar, porque el arranque de la caja es a las once
abriendo el local, y la política es «sólo actualizaciones de seguridad, raras y
avisadas».

**De qué depende, que es lo que hay que vigilar:** «avisadas» significa que Chris
avisa al cliente. Eso funciona con UN restaurante. Con tres, el local que se
quede sin su llamada no se entera nunca — la caja no comprueba por su cuenta, y
una versión con un arreglo urgente puede no llegar jamás sin que nada falle a la
vista.

**Disparador para reconsiderarlo: el segundo cliente.** Y la forma que respetaría
el motivo original es un sondeo diario **fuera de horas de servicio**, con aviso
discreto. Nunca al arrancar, nunca instalando solo — eso último es intocable
mientras no haya certificado de firma.

Queda escrito en el propio módulo para que el siguiente que mire no repita la
confusión.

### 9 · La URL por nombre funciona y nadie puede descubrirla — **HECHO el 18-ago**

> `EstadoHub` gana `url_nombre`, un `OnceLock` que se rellena **sólo si el
> anuncio mDNS llegó a salir** —`Anuncio::url()` sabe construir la cadena
> siempre, y ésa era la trampa: enseñar una dirección bien formada que la red no
> resuelve manda al usuario a teclear algo que no funciona y a concluir que el
> hub está roto—. Sale por `hub_estado` y por `/salud`, y `HubScreen` la pinta
> junto a la IP con una frase que dice para qué sirve, sin decir «mDNS».
>
> `OnceLock` y no un campo normal porque el anuncio se levanta DESPUÉS del
> servidor, que es después de construir el estado. El orden es deliberado y no
> se tocó.
>
> **Sin probar en pantalla:** `HubScreen.jsx` no tiene suite. Se ve en la caja.

Lo que decía antes:

`http://invventa-caja.local:3000` abre la app — comprobado el 17-ago desde
teléfono y desde otra PC. Pero **no aparece en ninguna pantalla**.

`Anuncio::url()` existe en `hub/anuncio.rs`, tiene su prueba, y su comentario
dice literalmente «para enseñarla junto a la de IP en la pantalla del hub». Nadie
la llama salvo un `println!` que en release no ve nadie: el servidor no la expone
y `HubScreen` pinta sólo la IP.

Es media hora, y convierte una función que funciona en una que sirve. Hoy el
mDNS resuelve el problema para el que se escribió —que un cambio de IP deje a
todos los teléfonos sin hub a la vez— **y ningún usuario tiene forma de
enterarse**.

Va con la misma familia: la reimpresión que existe y nadie llama, la pestaña
Impresoras que guardaba una lista que nadie lee, `total_divergente` que calcula
un trigger y nada en el front consulta.

### 8 · Lo que el respaldo NO cubre (fallos 6 y 7, del 17-ago)

Salieron al probar el respaldo con un teléfono muerto de verdad. El respaldo
funcionó; lo que falló es lo que quedó fuera de él. Detalle completo en
`docs/VERIFICADO_15-AGO.md`.

**La auditoría no se respalda.** `lib/Respaldo.js:33` lista `['ventas',
'comandas', 'movimientos']`. Resultado medido: la venta `AZULHN-V-000005` está
en los libros a las 20:09 y la auditoría se corta a las 19:40. Un cobro sin
rastro, en la pantalla que se llama «Registro inmutable».

Al arreglarlo, la pregunta no es sólo «añadir `auditoria`»: es **qué más se
pierde cuando muere un dispositivo**, y si esa lista se escribió mirando el
dinero y olvidando el rastro.

**Y el folio reservado vive sólo en el aparato.** `handlePedirCuenta` acuña el
folio antes de cobrar —tiene que hacerlo, el papel lleva número— y lo guarda en
`mesa.orden_actual`, en el almacenamiento local. Si el aparato muere, la reserva
muere con él: el cliente se queda con un papel citando `V-000004` y el cobro
posterior emite `V-000005`. Hueco en la serie de ventas, que es exactamente la
señal que `Folio.js` dice querer evitar.

Al tocarlo, **no romper lo que ya está bien**: acuñar pronto es correcto, y que
el folio no cambie al reabrir también — comprobado en producción el mismo día.
Lo que hay que mover es dónde vive la reserva.

### 6 · Dos recortes de la interfaz (Chris, 17-ago) — **HECHOS el 18-ago**

Ninguno toca lógica. Los dos son lo mismo de fondo: **algo se pinta fuera de la
caja que lo contiene, y nadie le dejó sitio.**

> **Lo que entró, y una corrección al diagnóstico.** En `MesasScreen` no vale un
> `p-2` parejo ni el `pt-2 pl-2` que decía este documento: arriba hacen falta
> **10 px**, no 8. El anillo se pinta 6 px por fuera (2 de `ring-offset-2` + 4 de
> `ring-4`) **y** la tarjeta sube otros 4 con `-translate-y-1`. Quedó
> `pt-3 pl-2 pr-2 pb-10`. Con `pt-2` seguiría recortando dos píxeles, que es
> justo el tipo de casi-arreglo que hace pensar que el diagnóstico estaba mal.
> En `PosScreen`, `whitespace-nowrap` al `Enviado: n`, tal cual.
>
> **Sin probar:** ninguna de las dos pantallas tiene suite que mire el layout.
> Se ven a ojo, y la de Mesas se ve seleccionando la mesa de la esquina superior
> izquierda, que es donde se notaba.

**La tarjeta de mesa seleccionada se corta.** No es el `gap` del grid —ya tiene
`gap-3 lg:gap-5`, 12 a 20 px, de sobra entre tarjetas—. Es el contenedor con
scroll, `features/operacion/MesasScreen.jsx:846`:

```
flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10
```

Tiene margen a la derecha y abajo, y **nada arriba ni a la izquierda**. La
tarjeta seleccionada (línea 957) lleva `ring-4 ring-offset-2` y `-translate-y-1`:
el anillo se pinta **6 px por fuera de la caja** en los cuatro lados y la tarjeta
sube 4. Como `overflow-y-auto` recorta lo que sobresale, la primera columna y la
primera fila pierden el anillo. A la derecha se salva por 2 px.

Arreglo: **padding en el contenedor** (`p-2`, o `pt-2 pl-2` conservando lo que
ya hay). Subir el `gap` no sirve — el `gap` separa tarjetas entre sí, y el
recorte ocurre contra el borde del contenedor, donde no hay `gap` que valga.

**La etiqueta `Enviado: n` parte en dos renglones.** `features/pos/PosScreen.jsx:1544`:

```
text-[10px] ... px-2 py-1 rounded-ui mt-2 inline-block uppercase tracking-widest
```

No es que el texto sea pequeño: **le falta `whitespace-nowrap`**. Con `uppercase`
y `tracking-widest` ocupa mucho más de lo que aparenta, la caja no da, y rompe
por el espacio — «Enviado:» arriba y el número debajo.

Importa más que la estética: ese número dice que esas unidades **ya están en
cocina**, o sea que no se pueden quitar sin autorización de gerente — hay código
en `PosScreen` dedicado a impedirlo. Partido en dos y en 10 px, un mesero con
prisa no lo lee, y se pelea con un botón que no responde sin saber por qué.

Si con `nowrap` sigue sin caber, entonces sí toca mirar el ancho de la columna o
aflojar el `tracking`. Pero primero lo simple.

### Y una cosa que el checklist pedía y el binario no permite

El paso de §2 —y el de mDNS— piden la consola de la ventana, pero
`src-tauri/Cargo.toml` declara `tauri` sin la feature `devtools`: en un build de
release no hay nada que abrir. Comprobado en la caja. Cualquier diagnóstico que
hoy dependa de la consola es, en producción, un diagnóstico que no existe. O se
compila con devtools, o esos datos salen a una pantalla.

---

## 1 · Reimpresión del ticket — **CERRADO el 18-ago**

**Lo que pidió Chris:** un botón para cuando un cliente quiere una copia. **La
copia es un duplicado EXACTO del original — sin texto extra de ningún tipo.**

> **HECHO.** Entró el tercer cambio —el botón— y con él la columna
> `ventas.copias_impresas` (migración `20260818200000`), la auditoría
> `REIMPRESION_TICKET` y dos decisiones de Chris. Lo de abajo se conserva porque
> explica el porqué de cada pieza; aquí lo que cambió al construirlo:
>
> - **El contador NO puede nacer en 0**, y esto no se había visto.
>   `sufijoCopia(1)` devuelve cadena vacía, así que la primera reimpresión de
>   una venta que arrancara en 0 pediría el id **pelado** —el mismo del ticket
>   original— y `cola.rs` lo descartaría en silencio. Es la trampa de §1
>   esperando en la puerta, un escalón más abajo de donde estaba escrita. La
>   columna cuenta **impresiones totales del documento** y su DEFAULT es 1, que
>   es lo cierto para toda venta anterior a la migración. La excepción la
>   escribe la app: en `ticket_final` con mesa no se imprime nada al cobrar, así
>   que esa venta nace en 0.
>
> - **El contador NO arrastra las impresiones de la cuenta** (decisión de Chris,
>   18-ago). La cuenta y el ticket no son el mismo papel, y `CUENTA_IMPRESA` ya
>   registra las de la cuenta una por una. El agregado se reconstruye desde
>   auditoría si algún día hace falta.
>
> - **En `ticket_final` la copia NO es exacta, y se acepta** (decisión de Chris,
>   18-ago). El papel que se llevó el cliente es la _cuenta_ —`ticket::<folio>`,
>   sin bloque de pago— y la reimpresión se construye desde la fila de `ventas`
>   —`ticket::<venta.id>`, con «Pago: EFECTIVO»—. Sale el ticket completo, que
>   es más informativo. **Queda dicho aquí porque contradice el requisito
>   literal de arriba en ese flujo concreto.**
>
> - **Y un hallazgo del camino:** `cambio_entregado` **no se guarda en la base**.
>   Se calcula en el modal de cobro y muere con él. Sin tocarlo, la reimpresión
>   habría impreso «Cambio: $0.00» —una cifra falsa en un papel que se lleva el
>   cliente, no un hueco—. `construirTicket` ahora exige que el campo **venga**,
>   no que valga algo: un cambio de cero de verdad sí se imprime; uno que no
>   sabemos, no. Dos pruebas nuevas en `Comanda.test.js`.
>
> **Sin probar en pantalla:** `ReportesScreen.jsx` no tiene suite. El botón se
> verifica en la caja, con papel.

### Lo que ya está hecho, y nadie llama

`construirTicket(venta, { configuracion, copia, abrirCajon })` **ya acepta
`copia`** desde el 11-ago. Es la «reimpresión que existe y nadie usa» del
backlog. Falta el botón y dos ajustes.

### La trampa, que es la importante

`sufijoCopia()` le pone `::c2` al id de la copia 2. **Eso hay que conservarlo**,
aunque el papel salga idéntico, porque `cola.rs` **descarta por id ya impreso**.
Si el botón mandara siempre el mismo id:

- primera reimpresión: sale;
- **segunda: la cola la descarta como duplicada, no sale papel y no hay error.**

El cajero le diría al cliente «ya salió» mientras la impresora no hace nada. El
fallo silencioso de siempre.

**Regla, entonces: el id cambia en cada copia; el papel no cambia nunca.**

> **AL DÍA EL 17-AGO — dos de los tres cambios ya están hechos.** No se hicieron
> por esta sección, sino arreglando el fallo 2 (que resultó ser este mismo
> mecanismo ocurriendo ya en el flujo de la cuenta). Lee lo de abajo sabiendo
> que **1 y 2 están en el código y sólo queda el 3**.

### Los tres cambios

1. **`avisosDeCopia()` deja de aplicarse a los TICKETS.** Hoy imprime
   `REIMPRESIÓN (copia N) — NO PREPARAR DE NUEVO`, que está escrito para
   comandas de cocina y en un ticket de cliente no significa nada. **Se
   conserva para las comandas**, donde sí evita que cocina prepare dos veces.

   > **HECHO el 17-ago** (`655916e`). `construirTicket` devuelve `avisos: []`
   > siempre; `avisosDeCopia` sigue viva y aplicándose sólo a las comandas.

2. **Contador persistido en la venta** (`copias_impresas`). En estado local se
   perdería al recargar y volvería el descarte por duplicado. Además es un dato
   que el dueño quiere: «este ticket se reimprimió tres veces» es una señal.

   > **HECHO a medias el 17-ago** (`655916e`), y conviene saber dónde vive: el
   > contador está en **`mesa.orden_actual.impresiones`**, no en la venta. Sirve
   > para la cuenta antes de cobrar, que es lo que había roto. Para reimprimir
   > una venta **ya cobrada** desde Reportes hace falta el equivalente en
   > `ventas.copias_impresas`, porque a esas alturas la mesa ya se limpió.
   >
   > Y ojo con el arrastre: `orden_actual` se pierde al cobrar, así que el
   > número de impresiones de la cuenta **no** llega a la venta. Si se quiere el
   > recuento completo —«este documento salió cinco veces»— hay que pasarlo al
   > cobrar.

3. **Botón en Reportes → «Tickets del turno»**, que ya lista cada venta con
   folio, hora y total. Esa pantalla ya está gateada por `gestion`, así que
   reimprimir queda en Admin/Gerente sin añadir permisos nuevos.
   **`abrirCajon: false`**, obviamente: una copia no mueve dinero.

   > **HECHO el 18-ago.** Un icono de impresora por fila, apagado mientras esa
   > copia está en vuelo. El contador sube **después** de que el papel salga: al
   > revés, una impresora apagada gastaría números de copia y el siguiente
   > intento saltaría a `::c3` sin que hubiera existido nunca una `::c2`.
   >
   > Y como la fila de `ventas` guarda el **id** de la mesa y el ticket enseña
   > el **nombre**, se resuelve contra `mesas` antes de imprimir. Sin eso, la
   > copia de una mesa saldría como «Mostrador».

### Auditoría — decisión de Chris: SÍ

Acción `REIMPRESION_TICKET`, con folio, número de copia y quién la pidió. Mismo
patrón que `REAPERTURA_CUENTA`.

> **Precedente del 17-ago:** `CUENTA_IMPRESA` ya registra cada impresión de la
> cuenta con folio, mesa, total y número de impresión (`cfbc428`). La de
> reimpresión desde Reportes es la hermana de ésa y conviene que digan lo mismo.
>
> Y desde hoy **la auditoría se respalda** (`7021425`), así que ese rastro
> sobrevive al aparato que lo escribió. Antes no: era el fallo 6.

**Y aquí está el porqué, que conviene no perder:** al ser la copia un duplicado
exacto, **desde el papel es imposible distinguir un original de una copia**. Es
lo que Chris quiere y es lo que el cliente espera — pero significa que el único
rastro de que hubo un duplicado es la auditoría. Sin ella, dos tickets idénticos
circulando no dejan huella en ninguna parte.

---

## 2 · Gastos en dos pestañas: caja chica y caja grande

**Lo que pidió Chris:** dividir la pantalla de gastos en dos tabs.

- **Caja chica** — donde se queda la pantalla «a la hora de la chinga». Es la
  vista por defecto: los gastos pequeños del turno.
- **Caja grande** — los gastos fuertes.

Que caja chica sea la pestaña por defecto no es un detalle de UI: es la que se
usa con prisa y con gente esperando, así que es la que no debe costar un clic.

### Ya estaba evaluada, y salió la nº 1 de las cinco

`docs/EVALUACION_5_PROPUESTAS.md` §2. Sin prerrequisitos, valor inmediato, y con
el patrón de arqueo ya escrito en `lib/Arqueo.js` que se puede copiar.

### La trampa que ya está documentada

**`gastos.origen` YA EXISTE y significa otra cosa**: sus valores son `manual` y
`recurrente`, o sea la procedencia del registro, no de qué caja salió el dinero.
Reutilizarla metería dos significados en una columna y el día que alguien filtre
por `origen` obtendrá una mezcla.

**Va un eje nuevo: `caja: 'chica' | 'grande'`.**

### Lo que hay que decidir antes de escribir

La evaluación levantó algo que sigue abierto, y conviene resolverlo con Chris el
lunes en vez de descubrirlo a media implementación:

> **Una etiqueta no es una caja.** Con dos tabs y una columna `caja`, la
> pregunta «¿cuánto queda en la caja chica?» **no se puede responder**. Para eso
> hacen falta **fondo, retiros y reposiciones** — o sea, un arqueo pequeño.

Dos alcances posibles:

|                                  | Qué da                                                                          | Qué cuesta                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A · Sólo las pestañas**        | Separa y filtra los gastos. La pantalla queda como Chris la describió.          | Muy poco. Pero «caja chica» sigue siendo un filtro con nombre ambicioso: no dice cuánto queda. |
| **B · Pestañas + fondo y saldo** | Responde «cuánto queda» y «cuánto hay que reponer». Es la caja chica de verdad. | Más: modelar fondo, retiros y reposiciones. Hay patrón en `lib/Arqueo.js`.                     |

**Mi lectura:** empezar por A, pero **sabiendo que es A**. Ponerle «caja chica» a
un filtro y llamarlo terminado es lo que hace que dentro de dos meses alguien
pregunte cuánto queda y la respuesta sea «eso no lo hace». Si el nombre promete
un saldo, hay que llegar a B.

Lo que sí encaja sin inventar nada desde el principio: **la firma de quién pidió
y quién autorizó**, con el mismo PIN que ya funciona para los descuentos en
`ModalCobro`, y con rastro en auditoría.

---

## 3 · Los dos fallos de las E2E (13-ago)

Se corrieron por primera vez en semanas: **7 pasaron, 2 fallaron.** Los dos
fallos son de naturaleza opuesta y conviene no confundirlos.

### 3.1 · El folio — **la prueba está desactualizada, el código está bien** — HECHO el 18-ago

> Actualizada a `/[A-Z0-9]{2,6}-V-\d{6}/`, y los comentarios del archivo con
> ella. El prefijo va con cuantificador y no clavado en seis: `letrasDelLocal()`
> recorta a cuatro pero **no rellena**, así que un local de nombre corto deja un
> prefijo más corto y un `{6}` haría fallar la prueba por algo que no tiene que
> ver con el folio. Sin correr: las E2E necesitan tenant y navegador.

`e2e/flujo-pos.spec.js:123` busca `/POS-\d{5}/`. Ése es el formato **viejo**.
Los folios cambiaron al escribir `lib/Folio.js`: ahora son `AZUL7K-V-000123`
—prefijo del local, serie, consecutivo—.

Comprobado de punta a punta: `construirTicket` mete `{ etiqueta: 'Folio' }` en
`meta`, y `TicketImpresion` pinta `doc.meta` completo. **El ticket sí muestra el
folio.** Sólo hay que actualizar la expresión de la prueba, y de paso los tres
comentarios del archivo que siguen hablando de `POS-xxxxx`.

### 3.2 · El render en tablet — **NO SE REPRODUCE (18-ago). Ojo antes de tocar nada.**

El snapshot de `render.spec.js` da 27 % de píxeles distintos. Al mirar la imagen
**actual** (no el diff, que superpone y engaña) se ve el problema:

- **«CONTROL DE PISO Y CUENTAS» se parte palabra por palabra en vertical.**
- La tira de atajos —«Mover la selección», «Abrir la mesa», «Reservar»…— se
  rompe en columnas de dos centímetros.
- Y se **encima** con la fila de contadores y con los botones.

Es un contenedor que perdió su ancho: cada palabra cae en su propia línea.

**La hipótesis, para empezar por ahí:** en `OpsHeader`, el bloque de acciones
lleva **`shrink-0`** y el de identidad `min-w-0`. En escritorio sobra sitio. En
una tablet de 1080 px, con el riel comiéndose ~208, quedan ~870 para una fila
de Mesas con cinco botones: **las acciones se quedan con todo el ancho y el
título con nada.** Es el mismo síntoma que ya está documentado en ese archivo
—«cortado sin puntos suspensivos»—, sólo que llevado al extremo.

**No se sabe desde cuándo está roto, y no hay que afirmar que fue lo del 13-ago:**
los cambios de ese día tocan alturas (`dvh`) y el viewport, no anchos. Lo más
probable es que lleve semanas ahí sin que nadie lo viera, **porque las E2E no se
corrían**. Ésa es la lección, más que el bug.

**Al regenerar el snapshot: sólo DESPUÉS de arreglar el layout.** Regenerarlo
antes convierte el fallo en la nueva referencia y lo entierra para siempre.

#### Lo que pasó al ir a arreglarlo (18-ago)

**La hipótesis de arriba está sin confirmar, y el intento de medirla salió
limpio.** Se montó un banco en Chromium contra el CSS ya compilado, con
`OpsHeader` real, y se midió el bloque del subtítulo a 1024, 1100 y 1280 px,
con y sin el arreglo propuesto:

```
subtituloAncho: 333, subtituloLineas: 1     ← idéntico en los seis casos
```

Una línea, mismo ancho, con `shrink-0` y sin él. **Por debajo de 1024 px el
bloque entero es `hidden`**, así que ahí tampoco hay nada que partir.

**Decisión: no se toca el header.** Es un componente compartido por todas las
pantallas de operación, y cambiarlo por una hipótesis que no se reproduce es
cómo se rompen tres pantallas para arreglar cero. Lo que hay que hacer antes es
**volver a correr la E2E y mirar la captura actual**: o el fallo se arregló de
paso en alguna de las tandas de estas dos semanas, o el snapshot es de un
viewport o un estado que el banco no reprodujo —una fila de Mesas con cinco
botones y contadores, que es lo que el texto original describe y el banco no
montó—. Hasta entonces el 27 % de píxeles sigue sin explicación, y eso es
distinto de estar arreglado.

### NO hace falta una tablet para arreglar esto

Conviene dejarlo claro porque el 13-ago casi se aparca por eso. **El fallo no
depende del hardware, depende del ANCHO de la ventana.** La propia prueba de
Playwright es la tablet —corre en un viewport `ipad-landscape`, y por eso lo
cazó— y para verlo a ojo basta con **estirar una ventana de Chrome a ~1080 px**
y abrir el mapa de mesas.

Lo que sí necesita una tablet de verdad es **otra pregunta**: si se _siente_
bien usarlo —que los botones se toquen sin errar, que se lea a un brazo de
distancia—. Eso ningún viewport lo contesta. Pero es un juicio distinto de
«esto está roto», y eso último ya está demostrado y se puede corregir sin
esperar a conseguir nada.

### 3.3 · Y lo que hay que decidir

Unas E2E que nadie corre no son una red de seguridad: son una foto vieja que da
sensación de cobertura. O entran en el ritual —junto a `cargo test` y
`test:rapido`— o hay que asumir en voz alta que no cuentan.

---

## 4 · Lo fiscal de los gastos — notas, NO decidido

Chris trajo investigación el 13-ago. **No se programa todavía**; esto es para que
el día que se retome no se empiece de cero ni se repitan las verificaciones.

### Las reglas duras, verificadas (no de memoria)

- **El límite de $2,000 en efectivo sigue vigente** (art. 27 fr. III LISR). Un
  gasto por encima **pierde la deducibilidad aunque tengas factura**.
- **Los $2,000 INCLUYEN el IVA.** El SAT aclaró que se refiere al **total del
  CFDI**, no al subtotal. Un gasto de $1,900 + IVA ya se pasó. **Si la alerta se
  programa sobre el subtotal, avisaría tarde justo en los casos frontera** —que
  son los únicos donde el aviso sirve.
- **El combustible es excepción**: siempre por medio electrónico, **sin importar
  el monto**. Aunque sean $300 de gasolina.

### La pieza que las dos vías señalaron

La investigación llegó, desde el lado operativo, a lo mismo que el §2 de este
documento desde el lado del modelo: **el vale de caja / dinero en tránsito**.
Sale dinero a la tiendita → vale digital → al volver se captura lo gastado, si
hubo factura, y el cambio. Eso ES el «fondo, retiros y reposiciones» sin el cual
caja chica no puede responder cuánto queda.

Que dos caminos distintos apunten a la misma pieza es la mejor señal de que hay
que construirla.

### Idea de producto que vale la pena

**Reporte de merma fiscal:** «este mes se fueron $X en gastos sin factura».
No es un dato contable, es un argumento comercial — es la frase que hace que un
dueño cambie de proveedor de pan.

### Tres reglas de diseño, y las tres importan

1. **El umbral va en CONFIGURACIÓN, no quemado.** Los $2,000 llevan años
   iguales, pero el día que cambien, un número dentro del binario significa
   recompilar y republicar en cada restaurante.

2. **La app INFORMA, no decide.** Avisar «esto en efectivo pierde deducibilidad»
   está bien. Marcar un gasto como «no deducible» por su cuenta, no: la
   deducibilidad depende de cosas que el sistema no sabe —si el pan acabó en el
   menú o en la casa del dueño—. Ni nosotros ni el software somos su contador.

3. **El RÉGIMEN va por restaurante, no supuesto.** AZUL es **probablemente**
   Persona Moral —Chris dijo «lo más seguro»; **falta confirmarlo con la
   Constancia de Situación Fiscal**—. Y da igual lo que sea AZUL: InvVenta es
   multi-inquilino, así que si el código asume un régimen, el siguiente cliente
   recibe una pantalla que le miente.

   Importa porque cambia el DISCURSO de la función:

   | Régimen       | Qué gana el dueño al facturar                  |
   | ------------- | ---------------------------------------------- |
   | Persona Moral | Baja ISR **e** IVA acreditable                 |
   | RESICO        | **Sólo IVA** — las deducciones no bajan el ISR |

---

## 5 · Impresión de reportes — Corte Z y vale de propina — **HECHO el 18-ago**

**No era código muerto: era código vivo que no podía funcionar dentro de la
caja.** `ReportesScreen.jsx` imprimía los dos documentos así:

```js
const win = window.open('', '_blank', 'width=340,height=700');
win.document.write(`<html>…`);
setTimeout(() => {
  win.print();
  win.close();
}, 500);
```

Eso es un patrón de navegador. En la caja —Tauri sobre WebView2— `window.open`
no devuelve una ventana manipulable, así que `win.document` revienta y el botón
**no hacía absolutamente nada visible**. Ni imprimía, ni avisaba, ni dejaba
rastro salvo un error en una consola que en release no existe. Y aunque hubiera
funcionado, habría salido por el diálogo de Windows a una hoja A4, no por la
térmica que es donde se quiere.

### Lo que se hizo

Los dos documentos pasan ya por la cola del hub como ESC/POS, por el MISMO
camino que el ticket y la comanda:

- **`construirCorteZ(corte, {configuracion})`** y
  **`construirValePropina(vale, {configuracion})`** en `lib/Comanda.js`.
- **`enviarCorteZ` / `enviarValePropina`** en `lib/Hub.js`, hermanos de
  `enviarTicket` y `enviarPreCuenta`.
- Los dos botones de `ReportesScreen` comprueban con **`salioPapel(r)`**, no
  con `r.ok`, y se apagan mientras el papel está en la cola.
- El vale queda en auditoría como **`VALE_PROPINA_IMPRESO`**. El corte no: es
  un resumen de datos que ya están en la base y se puede volver a sacar igual.
  El vale es dinero que sale del cajón contra una firma, y el papel es el único
  sitio donde consta.

### Las dos decisiones de forma que no son obvias

- **`cuerpo: []` en los dos.** `escpos.rs` pinta la cabecera
  «CANT DESCRIPCION IMPORTE» encima de cualquier `cuerpo` no vacío, y un corte
  no tiene artículos: tiene conceptos y cifras, que es exactamente la forma de
  `totales`. Usar el sitio equivocado imprimiría «1x Efectivo» bajo un título
  de columna que no significa nada.
- **El id lleva reloj y contador**, como la pre-cuenta y por lo mismo: este
  papel DEBE salir siempre que se pida —uno para la libreta, otro para el
  dueño— y `hub/cola.rs` descarta por id repetido **sin dar error**. La comanda
  hace lo contrario, y también por buenas razones.

`TOTAL EN CAJA` sigue siendo `fondo + efectivo`, la misma cuenta que hacía el
HTML viejo. Cambiarla de paso habría descuadrado el arqueo sin que nadie lo
pidiera.

### `TicketImpresion.jsx` — el `window.print()` a secas

Mismo origen, y arreglado en la misma tanda. El botón «Imprimir» del ticket que
se enseña recién cobrada la venta recibe ahora `onImprimir` desde `PosScreen`,
que manda una copia por la térmica **contando `copias_impresas`** — porque el
original ya salió al cobrar, así que ése es por definición el `::c2` y sin
contador `cola.rs` lo descartaría en silencio. Sin `onImprimir` (pruebas, y una
eventual vista fuera del POS) cae a `window.print()`, que es el único sitio
donde imprimir la pantalla es lo que se pretende.

**Pruebas:** 13 nuevas en `Comanda.test.js` (forma del documento, «En curso» en
un turno sin cerrar, ids distintos entre dos impresiones, el cajón que no se
abre). Suite en 814.

## 6 · El logo del restaurante — el campo existe, el ticket no lo usa

`ConfiguracionScreen` guarda `logo_url` y **lo único que lo lee es su propia
vista previa**. No llega al ticket ni en pantalla ni en papel.

Son dos trabajos de tamaño muy distinto y conviene no meterlos en el mismo saco:

- **En pantalla / PDF** — trivial, un `<img>`. Media hora.
- **En la térmica** — `hub/escpos.rs` **no sabe imprimir imágenes hoy**: no hay
  una sola línea de raster. Sí es posible (`GS v 0`), pero es trabajo de verdad:
  bajar la imagen, escalarla al ancho exacto en puntos (384 para 58 mm, 576 para
  80 mm), convertirla a 1 bit con tramado y empaquetarla en bytes. Medio día
  largo en Rust y quisquilloso de afinar en una impresora concreta.

**Y hay un problema de diseño antes que el técnico:** `logo_url` es una URL. Una
caja sin internet no puede descargarla. Si el logo va a imprimirse, tiene que
guardarse **local y ya convertido** —el hub lo cachea la primera vez, o se sube
como archivo en vez de como enlace—. Decidir eso antes de escribir el ESC/POS;
si no, sale una función que falla justo el día que se cae la red, que es el día
en que este programa presume de seguir funcionando.

## 7 · Barrido de jerga de programador en pantalla (hecho el 13-ago, mantener)

Se quitaron los dos `npm run build` de `HubScreen` — se le estaban diciendo al
dueño del restaurante, que no tiene consola. El dato útil (la fecha de la
compilación) se queda; cambia el destinatario de la instrucción: «avisa a
soporte con esta fecha».

**La regla:** en un texto que ve el cliente no aparece Supabase, ni npm, ni
`dist/`, ni nombres de archivo, ni «endpoint». Si el diagnóstico es para
nosotros, el texto tiene que decirle al cliente **a quién avisar**, no qué
teclear. Conviene un barrido periódico; lo que hay hoy está limpio salvo
comentarios de código, que no se ven.

## 8 · Modificadores: precio y descuento de inventario

El 13-ago se conectó «¿cómo lo quiere?» de punta a punta —modal en el POS,
comanda, KDS, ticket— **deliberadamente sin precio ni stock**. Falta eso.

**Precio.** Las opciones ya traen `precio` y viaja hasta `opcionesElegidas()`
en `lib/Modificadores.js`. Sumarlo es aritmética sobre la línea del carrito.
Lo que hay que decidir antes de escribirlo:

- ¿El precio de la opción es **por unidad del platillo** o por línea? Dos
  hamburguesas con extra queso, ¿son $15 o $30? (Casi seguro $30, pero
  escribirlo mal no da error, da una cuenta mal cobrada.)
- El ticket y la comanda tienen que empezar a imprimir el `+$15` **el mismo día
  que se empieza a cobrar**, ni antes ni después. Hoy `Comanda.js` lo omite a
  propósito: un papel que enseñe «+$15» junto a un total que no lo incluye es
  una discusión con el cliente en la mesa.

**Inventario — es el trozo delicado, y no hay hueco donde meterlo.**
`descontarStockVenta(items, sustituciones, origen)`: ese segundo argumento son
_sustituciones_, que es otra cosa. Un «extra tocino» que baja tocino son deltas
**adicionales**. Hay que abrir un tercer camino en `construirDeltasStock`.

Y antes hay una pregunta de diseño que los datos de AZUL dejan a la vista: el
grupo **«Tipo de leche»** tiene tres opciones —Entera, Deslactosada, Almendra—
y **las tres apuntan al mismo producto** (`Leche Entera`). Puede ser un error de
captura, pero también apunta a que ese grupo no es una _suma_ sino una
_sustitución_: si el cliente pide almendra, no hay que descontar leche entera
además, hay que descontar almendra **en vez de**. Son dos mecanismos distintos
y el formulario de hoy no distingue entre ellos.

**Preguntarle al restaurante qué querían decir con ese grupo antes de escribir
código.** Si la respuesta es «sustitución», la pantalla de modificadores
necesita una casilla más («esta opción sustituye a un insumo de la receta»), y
eso cambia el modelo de datos.

## 9 · La curva de aprendizaje de los modificadores (parcialmente atacada)

Chris (13-ago): es la parte del sistema que más cuesta configurar. De las cuatro
causas que salieron al mirarla, **dos ya están arregladas**:

- ✅ El formulario se contradecía: «puede elegir varios **o ninguno**» junto a
  una casilla «El cajero DEBE seleccionar». Ahora hay un recuadro **«En la caja
  se verá así»** que lo dice en una frase, generada por `textoDeReglas()` — la
  MISMA función que usa el modal del POS, así que lo prometido al configurar es
  literalmente el texto que se lee al vender.
- ✅ La combinación «múltiple + obligatorio» = «al menos una» no estaba escrita
  en ningún sitio. Ahora sí.

**Sigue pendiente:**

- ✅ **HECHO el 18-ago — la trampa gorda.** El grupo no hacía nada hasta
  atarse en Recetas y eso no se anunciaba en ninguna parte: hacías todo bien y
  concluías que el sistema estaba roto. `recetasQueUsan(grupoId, recetas)` en
  `lib/Modificadores.js` cuenta los platillos que lo usan —comparando ids como
  texto, porque vienen de dos sitios y uno los guarda numéricos— y
  `ModificadoresScreen` pinta un chip: «En N platillos» o **«Todavía sin
  usar»**, con una línea que dice dónde se ata. Dato que ya estaba en memoria;
  lo único que faltaba era enseñarlo.
- **Vista previa de cómo se verá en el POS**, para el concepto grupo vs opción.
  Enseñar en vez de explicar.
- **El panel de ayuda** que pidió Chris, para el recorrido de tres pantallas.
  Va el tercero a propósito: si los dos de arriba están hechos, el panel tiene
  mucho menos que explicar.
- **El vínculo con inventario viene apagado por defecto** («No afecta
  inventario»). Alguien da de alta «Extra tocino» y el tocino nunca se
  descuenta, sin error ni aviso. Cuando se implemente §8, avisar al guardar un
  grupo cuyas opciones no descuentan nada.

## 10 · Consumos de personal (Chris, 14-ago) — diseño en documento aparte

Ver **`docs/DISENO_CONSUMOS_PERSONAL.md`**, actualizado con la regla real de
AZUL. **Depende del §8 (precio en los modificadores): sin él calcula cero y
parece que funciona.** Resumen de por qué no es trivial:

**La regla no es «base gratis, extras al 75 %», es por ingrediente.** Van
gratis tortilla, huevo, crema, queso fresco, verdura simple, tés, aguas de
fruta y cafés; lo demás al 75 %. Los chilaquiles salen gratis porque están
hechos de cosas gratis. Bandera `cobrable_personal` en `productos`, con valor
por defecto por categoría y excepción por ingrediente — y filtro «sin decidir»,
porque un ingrediente que caiga en sí o en no sin que nadie lo elija es o
cobrarle de más a alguien o regalar comida sin enterarse.

Son **tres cosas independientes** y una venta las ata a la vez, que es por lo
que no sirve una comanda al 100 % de descuento:

1. el inventario se descuenta **siempre**;
2. el precio admite descuento variable, de 0 % a cortesía;
3. lo que quede a cargo se descuenta **del sueldo**.

Tres cosas que hay que tocar y que hoy no existen:

- Tabla `consumos` con `staff_id` de verdad (`movimientos.usuario` es texto
  libre y no sirve para descontar de una nómina).
- **`nominas` no tiene deducciones**: `gran_total = sueldos + propinas`, no hay
  un solo concepto que reste.
- **El dueño no tiene nómina.** Si no se resuelve, su consumo queda con importe
  a cargo y `nomina_id` nulo para siempre — una deuda que engorda cada mes y
  que nadie va a cobrar. Va a un cubo de _retiros del propietario_, o a
  cortesía, pero elegido en pantalla, nunca en silencio.

Y el candado: **`nomina_id` en cada consumo**. Reprocesar una nómina —que pasa,
se corrige un turno y se vuelve a generar— cobraría la comida dos veces sin dar
ningún error. Mismo patrón que `stock_salidas` y `crm_canjes`; van tres.
