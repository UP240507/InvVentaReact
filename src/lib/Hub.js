/**
 * Hub.js — cliente del hub de impresión.
 *
 * El mismo código corre en tres sitios y por dos caminos distintos:
 *
 *   - Ventana de la caja (Tauri) → IPC, comandos `hub_*`. No pasa por la red,
 *     así que no puede fallar por wifi.
 *   - Teléfono / tablet / KDS    → HTTP contra el hub, que además es quien les
 *     sirvió la app. La URL base es el propio origen: si la app se cargó desde
 *     `http://192.168.1.7:3000`, el hub está ahí. No hay IP que configurar.
 *   - Navegador de escritorio en desarrollo → HTTP a localhost.
 *
 * DEGRADACIÓN. Ninguna función de este módulo lanza excepción hacia arriba.
 * Un fallo de impresión NO puede tumbar un cobro: el dinero ya entró al cajón
 * y la venta ya está en Dexie. Todas devuelven `{ ok, estado, error }` y quien
 * llama decide si avisar. La regla de la fase: la impresora nunca bloquea.
 *
 * Puro salvo por `fetch` y el puente de Tauri: sin React, sin store.
 */

/** ¿Corremos dentro de la ventana de Tauri? */
export function enTauri() {
  return (
    typeof window !== 'undefined' &&
    (typeof window.__TAURI_INTERNALS__ !== 'undefined' ||
      typeof window.__TAURI__ !== 'undefined')
  );
}

/**
 * Llama a un comando de Rust por IPC.
 *
 * NO se importa `@tauri-apps/api/core`. El primer intento fue un
 * `await import('@tauri-apps/api/core')`, y rompió la suite entera: Vite
 * resuelve los imports dinámicos de cadena literal en tiempo de transformación,
 * así que un paquete ausente tumba **cualquier** prueba que llegue a tocar este
 * archivo — incluida `PosScreen.integration.test.jsx`, que no tiene nada que ver
 * con imprimir. Una función que solo corre dentro de Tauri no debe poder
 * romperle las pruebas al resto de la app.
 *
 * En su lugar se usa el puente que Tauri **ya inyecta** en la ventana. Es lo
 * mismo que hace `invoke` del paquete por dentro: un envoltorio delgado sobre
 * `window.__TAURI_INTERNALS__.invoke`. Sin paquete que instalar, sin chunk
 * extra en el bundle del teléfono, y `enTauri()` ya comprueba justo eso.
 *
 * Se prueban los dos nombres porque conviven según la configuración:
 * `__TAURI_INTERNALS__` está siempre; `__TAURI__.core` aparece con
 * `withGlobalTauri`. Si ninguno responde, se lanza — pero solo puede pasar
 * dentro de Tauri, y todos los llamadores de este módulo capturan y degradan.
 */
export async function invocar(comando, args = {}) {
  const puente =
    (typeof window !== 'undefined' &&
      (window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke)) ||
    null;

  if (typeof puente !== 'function') {
    throw new Error('el puente de Tauri no está disponible en esta ventana');
  }
  return puente(comando, args);
}

/**
 * URL base del hub para los clientes HTTP.
 *
 * Por defecto, el propio origen: el dispositivo cargó la app DESDE el hub, así
 * que el hub es ese mismo servidor. Es lo que evita tener que teclear una IP
 * que además cambia cada vez que el router reparte DHCP.
 */
export function baseHub({ origen = null } = {}) {
  if (origen) return origen.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const { protocol, host } = window.location;
  // Si la app se abrió con `file://` o desde el esquema de Tauri, el origen no
  // sirve como URL de red: se cae a localhost, que es donde escucha el hub de
  // la propia máquina.
  if (!protocol.startsWith('http')) return 'http://localhost:3000';
  return `${protocol}//${host}`;
}

const TOKEN_KEY = 'invventa.hub.token';

export function guardarToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function leerToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Lee el emparejamiento de un QR o de un texto pegado.
 * Acepta `invventa://hub?url=...&token=...` y también la URL suelta con el
 * token en el query, porque un mesero con prisa pega lo que sea.
 */
export function parsearPairing(texto) {
  if (!texto) return null;
  const s = String(texto).trim();
  try {
    const u = new URL(s.replace(/^invventa:\/\//, 'http://'));
    const url = u.searchParams.get('url');
    const token = u.searchParams.get('token');
    if (url && token) return { url: url.replace(/\/$/, ''), token };
    if (token) return { url: `${u.protocol}//${u.host}`, token };
    return null;
  } catch {
    return null;
  }
}

/**
 * Enlace que se codifica en el QR de la caja.
 *
 * Es una URL **http normal**, no un esquema propio, y lleva el token dentro.
 * Un solo escaneo hace las dos cosas que hacen falta: llevar el teléfono al
 * hub y emparejarlo. Con un esquema propio (`invventa://`) el teléfono no
 * sabría qué abrir —no hay app instalada, la app ES la web que sirve la caja—
 * y el mesero se quedaría mirando un error del sistema.
 */
export function enlacePairing({ url, token }) {
  if (!url || !token) return '';
  return `${String(url).replace(/\/$/, '')}/?token=${encodeURIComponent(token)}`;
}

/**
 * Avisa a la caja de que la app ya es usable, para que cierre el splash y
 * muestre la ventana principal.
 *
 * Vive aquí porque es el único módulo que sabe hablar con Tauri. No lanza:
 * si el puente fallara, Rust muestra la ventana igual a los 12 segundos.
 */
export async function avisarAppLista() {
  if (!enTauri()) return { ok: false };
  try {
    await invocar('app_lista');
    return { ok: true };
  } catch (e) {
    console.warn('⚠️ [Splash] No se pudo avisar que la app está lista:', e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Nombre por defecto del dispositivo, deducido del navegador.
 *
 * No es exacto ni pretende serlo: solo tiene que permitir distinguir cuatro
 * teléfonos sobre la barra en la pantalla de la caja. "Android · Chrome" con la
 * hora de alta al lado basta para saber cuál es cuál.
 */
export function nombreDeEsteDispositivo(ua = null) {
  const s = String(
    ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
  );
  if (!s) return 'Dispositivo';

  const so = /Android/i.test(s)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(s)
      ? 'iOS'
      : /Windows/i.test(s)
        ? 'Windows'
        : /Mac OS X/i.test(s)
          ? 'Mac'
          : /Linux/i.test(s)
            ? 'Linux'
            : '';

  // El orden importa: Edge y Chrome dicen ser Safari en su user agent.
  const nav = /Edg\//i.test(s)
    ? 'Edge'
    : /OPR\//i.test(s)
      ? 'Opera'
      : /Chrome\//i.test(s)
        ? 'Chrome'
        : /Firefox\//i.test(s)
          ? 'Firefox'
          : /Safari\//i.test(s)
            ? 'Safari'
            : '';

  const partes = [so, nav].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Dispositivo';
}

/**
 * Canjea el token de emparejamiento por uno PROPIO de este dispositivo.
 *
 * Es el paso que hace que la revocación sirva de algo. Sin él, cada teléfono
 * se quedaría con el token de la caja: no aparecería en la lista, no habría
 * nada que revocar, y —peor— todos tendrían permisos de administración.
 */
export async function emparejar({
  tokenDeEmparejamiento,
  nombre = null,
  rol = 'mesero',
  origen = null,
} = {}) {
  if (!tokenDeEmparejamiento) {
    return { ok: false, error: 'falta el código de emparejamiento' };
  }
  return pedir('/emparejar', {
    metodo: 'POST',
    cuerpo: { nombre: nombre ?? nombreDeEsteDispositivo(), rol },
    origen,
    token: tokenDeEmparejamiento,
  });
}

/**
 * Al arrancar: si la URL trae `?token=`, lo canjea por un token propio y BORRA
 * el de la URL.
 *
 * Lo de borrarlo importa tanto como lo de canjearlo. Un token en la barra de
 * direcciones acaba en el historial, en la lista de pestañas y en cualquier
 * captura de pantalla que alguien mande por WhatsApp.
 *
 * **Si el canje falla NO se guarda nada.** Guardar el token de emparejamiento
 * como plan B dejaría al teléfono con permisos de administración —podría
 * revocar a los demás y reconfigurar la impresora—, que es justo lo que este
 * paso existe para evitar. Es preferible que no imprima y se vuelva a escanear
 * el QR.
 *
 * En la ventana de la caja no hace nada: ahí se habla por IPC, sin tokens.
 *
 * @returns {Promise<{emparejado:boolean, error?:string, nombre?:string}>}
 */
export async function capturarTokenDeUrl() {
  if (typeof window === 'undefined' || !window.location) {
    return { emparejado: false };
  }

  let token;
  try {
    token = new URL(window.location.href).searchParams.get('token');
  } catch {
    // Una URL que el navegador no sabe parsear no puede traer emparejamiento.
    return { emparejado: false };
  }
  if (!token) return { emparejado: false };

  // Se limpia la URL ANTES del canje: si la petición tarda o falla, el token no
  // debe quedarse a la vista mientras tanto.
  try {
    const limpia = new URL(window.location.href);
    limpia.searchParams.delete('token');
    // replaceState y no pushState: el "atrás" del teléfono no debe devolver al
    // mesero a una URL con el token dentro.
    window.history.replaceState(
      {},
      '',
      limpia.pathname + limpia.search + limpia.hash,
    );
  } catch {
    /* si el navegador no deja reescribir la URL, se sigue igualmente */
  }

  if (enTauri()) return { emparejado: false };

  const r = await emparejar({ tokenDeEmparejamiento: token });
  if (!r.ok || !r.token) {
    return { emparejado: false, error: r.error || 'el hub rechazó el código' };
  }

  guardarToken(r.token);
  return { emparejado: true, nombre: r.nombre };
}

async function pedir(
  ruta,
  { metodo = 'GET', cuerpo = null, origen = null, token = null } = {},
) {
  const base = baseHub({ origen });
  const cabeceras = { 'Content-Type': 'application/json' };
  const t = token ?? leerToken();
  if (t) cabeceras['x-invventa-token'] = t;

  // Timeout explícito: sin él, un hub apagado en una IP que responde ARP deja
  // el fetch colgado hasta el timeout del navegador, y el cajero mirando una
  // rueda que gira mientras el cliente espera su ticket.
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 4000);

  try {
    const r = await fetch(`${base}/hub${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...datos };
  } catch (e) {
    return {
      ok: false,
      error:
        e?.name === 'AbortError'
          ? 'el hub no respondió'
          : String(e?.message || e),
    };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * ¿Hay hub y está vivo? Se usa para decidir si se ofrece imprimir.
 * Devuelve el resumen de la cola de paso, para no pedirlo dos veces.
 */
export async function estado({ origen = null } = {}) {
  if (enTauri()) {
    try {
      return { ok: true, ...(await invocar('hub_estado')) };
    } catch (e) {
      return { ok: false, activo: false, error: String(e) };
    }
  }
  const r = await pedir('/salud', { origen });
  return { ...r, activo: !!r.ok };
}

/**
 * ¿De verdad va a salir papel por esto?
 *
 * ── POR QUÉ NO BASTA CON `r.ok` ─────────────────────────────────────────────
 * `imprimir()` devuelve `{ ok: true, estado }` en los TRES desenlaces, y sólo
 * uno de ellos termina en una tira: `'encolado'`. Un `'duplicado'` significa
 * que el hub ya tenía ese id y lo tiró; un `'vacio'`, que el documento no
 * llevaba nada que pintar. En los dos casos `ok` vale `true` y no sale nada.
 *
 * Eso es correcto para el reintento por wifi —un POST repetido no es un fallo y
 * no debe enseñarse como tal, por eso `ok` es `true`— pero es exactamente lo
 * contrario de lo que necesita quien pulsó un botón esperando un papel. Ahí un
 * `'duplicado'` es la peor noticia posible: el cajero le dice al cliente «ya
 * salió» y la impresora no ha hecho nada.
 *
 * Se pone aquí, junto a la función que produce el `estado`, y no en cada
 * pantalla: la distinción es del protocolo del hub, no de quien lo llama.
 */
export function salioPapel(r) {
  return !!r?.ok && r?.estado === 'encolado';
}

/**
 * Encola un documento. Nunca lanza.
 *
 * `estado` puede ser 'encolado' | 'duplicado' | 'vacio'. Un DUPLICADO no es un
 * error: significa que este documento ya estaba, normalmente porque el wifi
 * parpadeó y el cliente reintentó. Quien llama no debe enseñarlo como fallo
 * — pero tampoco como éxito si estaba esperando papel. Ver `salioPapel`.
 */
export async function imprimir(
  documento,
  { origen = null, token = null } = {},
) {
  if (!documento) return { ok: false, error: 'documento vacío' };

  if (enTauri()) {
    try {
      const estadoImpresion = await invocar('hub_imprimir', { documento });
      return { ok: true, estado: estadoImpresion };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  const r = await pedir('/imprimir', {
    metodo: 'POST',
    cuerpo: documento,
    origen,
    token,
  });
  return r;
}

/**
 * Imprime varios documentos (las N comandas de una mesa, por ejemplo).
 * Secuencial y NO en paralelo: la impresora es un recurso único y así el
 * orden de salida es el mismo que el de la lista. Un fallo no detiene a los
 * demás — que la barra no imprima no debe dejar a cocina sin su comanda.
 */
export async function imprimirVarios(documentos = [], opciones = {}) {
  const resultados = [];
  for (const doc of documentos) {
    resultados.push({ id: doc?.id, ...(await imprimir(doc, opciones)) });
  }
  return {
    ok: resultados.every((r) => r.ok),
    enviados: resultados.filter((r) => r.ok).length,
    total: resultados.length,
    resultados,
  };
}

/** Ticket maquetado en texto plano, sin gastar papel. */
export async function previsualizar(documento, { origen = null } = {}) {
  if (enTauri()) {
    try {
      return {
        ok: true,
        texto: await invocar('hub_previsualizar', { documento }),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/previsualizar', { metodo: 'POST', cuerpo: documento, origen });
}

export async function cola({ origen = null } = {}) {
  if (enTauri()) {
    try {
      return { ok: true, ...(await invocar('hub_cola')) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/cola', { origen });
}

export async function reintentarFallidos({ origen = null, token = null } = {}) {
  if (enTauri()) {
    try {
      return { ok: true, reencolados: await invocar('hub_reintentar') };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/cola/reintentar', { metodo: 'POST', origen, token });
}

/**
 * Descarta lo fallido. Reconoce la pérdida; no la repara — igual que el
 * `descartar` del panel dead-letter, y por la misma razón: un botón que
 * pretende arreglar algo que no arregla es peor que no tenerlo.
 */
export async function descartarFallidos({ origen = null, token = null } = {}) {
  if (enTauri()) {
    try {
      return { ok: true, descartados: await invocar('hub_descartar') };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/cola/descartar', { metodo: 'POST', origen, token });
}

// ─── Atajos de alto nivel ────────────────────────────────────────────────────
// Unen el motor de documentos (`lib/Comanda.js`, puro) con el transporte (este
// módulo). Existen para que las pantallas no tengan que acordarse de construir
// el documento antes de mandarlo: un sitio que se salte `construirComandas`
// acabaría imprimiendo precios en cocina.

/**
 * Manda a imprimir las comandas de una orden, una por estación.
 * Fire-and-forget: quien llama NO debe esperar a esto para cerrar la venta.
 */
export async function enviarComanda(comanda, configuracion, opciones = {}) {
  const { construirComandas } = await import('./Comanda');
  const docs = construirComandas(comanda, { configuracion, ...opciones });
  if (docs.length === 0)
    return { ok: true, total: 0, enviados: 0, resultados: [] };
  return imprimirVarios(docs, opciones);
}

/** Manda a imprimir el ticket de cobro. */
export async function enviarTicket(venta, configuracion, opciones = {}) {
  const { construirTicket } = await import('./Comanda');
  const doc = construirTicket(venta, { configuracion, ...opciones });
  if (!doc) return { ok: false, error: 'venta vacía' };
  return imprimir(doc, opciones);
}

/**
 * La cuenta que se deja en la mesa antes de cobrar. Ver `construirPreCuenta`:
 * no lleva pago, no abre el cajón y avisa de que la propina no está incluida.
 */
export async function enviarPreCuenta(cuenta, configuracion, opciones = {}) {
  const { construirPreCuenta } = await import('./Comanda');
  const doc = construirPreCuenta(cuenta, { configuracion, ...opciones });
  if (!doc) return { ok: false, error: 'cuenta vacía' };
  return imprimir(doc, opciones);
}

// ─── Dispositivos emparejados ────────────────────────────────────────────────

/**
 * Lista de dispositivos. Nunca trae tokens: el hub sirve este listado a
 * cualquier dispositivo emparejado, y si llevara los tokens, un teléfono
 * comprometido se llevaría los de todos y revocar el suyo no serviría de nada.
 */
export async function listarDispositivos({ origen = null } = {}) {
  if (enTauri()) {
    try {
      return { ok: true, dispositivos: await invocar('hub_dispositivos') };
    } catch (e) {
      return { ok: false, error: String(e), dispositivos: [] };
    }
  }
  const r = await pedir('/dispositivos', { origen });
  return { dispositivos: [], ...r };
}

/**
 * Revoca un dispositivo por id. Solo desde la caja: un teléfono emparejado
 * puede imprimir, pero no echar del local a los demás.
 */
export async function revocarDispositivo(id) {
  if (!enTauri()) {
    return { ok: false, error: 'los dispositivos se revocan desde la caja' };
  }
  try {
    return { ok: true, revocado: await invocar('hub_revocar', { id }) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Cambia la impresora. Solo desde la caja: un teléfono no debe poder
 * reconfigurar el hardware del local.
 */
export async function configurarImpresora(transporte, anchoPapel = null) {
  if (!enTauri()) {
    return { ok: false, error: 'la impresora solo se configura desde la caja' };
  }
  try {
    return {
      ok: true,
      transporte: await invocar('hub_configurar_impresora', {
        transporte,
        // Va junto al transporte y no en su propia llamada porque son la misma
        // decisión: qué impresora hay y con qué rollo. Guardarlas por separado
        // permite el estado a medias —impresora nueva, ancho viejo— que se
        // descubre en el papel.
        anchoPapel,
      }),
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Columnas del papel: 32 para 58 mm, 48 para 80 mm.
 *
 * ── POR QUÉ NO ES UN AJUSTE DEL DOCUMENTO ───────────────────────────────────
 * El ancho describe el ROLLO que hay puesto, no el ticket. El mismo documento
 * sale de 32 o de 48 según en qué impresora caiga, así que meterlo en el JSON
 * dejaría que un teléfono pidiera un ancho que el papel de la caja no tiene.
 *
 * ── EL DEFECTO QUE ESTO CIERRA (11-ago) ─────────────────────────────────────
 * `ANCHO` estaba fijo en 32 porque el diseño se hizo contra el ticket de 58 mm
 * de referencia. Al imprimir por primera vez en una TM-T20II real —que es de
 * 80 mm— el papel salió correcto pero usando dos tercios del rollo. No se
 * arregló antes a propósito: hacerlo configurable sin ver el resultado era
 * escribir dos formatos y verificar cero.
 */
export const ANCHO_58 = 32;
export const ANCHO_80 = 48;

/**
 * Abre el cajón. Sin papel.
 *
 * ── POR QUÉ ES UNA LLAMADA PROPIA Y NO UN DOCUMENTO ─────────────────────────
 * Hasta el 11-ago el pulso viajaba dentro del ticket, y funcionaba porque al
 * cobrar siempre se imprimía uno. Con el flujo de un solo papel eso deja de ser
 * cierto: la cuenta sale al pedirla —cuando aún no se sabe si el cliente pagará
 * en efectivo— y al cobrar ya no hay segundo documento. El cajón dejaba de
 * abrirse.
 *
 * Abrir el cajón no debería exigir gastar papel, igual que imprimir no debería
 * exigir mover dinero.
 *
 * **No se encola ni se reintenta.** Un pulso reintentado abriría el cajón
 * cuando la impresora vuelva —veinte minutos después, o al día siguiente— con
 * dinero dentro y nadie delante. Si falla, el cajero tiene una llave.
 */
export async function abrirCajon({ origen = null } = {}) {
  // Bifurca igual que `imprimir`. Sin esto, en la CAJA —que es donde se cobra—
  // la llamada salía por HTTP hacia un sitio al que Tauri no llega, y el pulso
  // no se disparaba nunca. Compilaba, las pruebas pasaban, y el cajón no se
  // abría: el fallo del 12-ago.
  if (enTauri()) {
    try {
      await invocar('hub_abrir_cajon');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/cajon', { metodo: 'POST', origen });
}

// ─── RESPALDO DE VENTAS (3.4 / 3.5) ─────────────────────────────────────────
// Segunda copia de lo que este dispositivo encoló para Supabase, guardada en el
// disco de la caja. El hub NUNCA sube nada: sólo guarda bytes y los devuelve.
// El porqué de esa decisión está en `src-tauri/src/hub/respaldo.rs`.
//
// Las tres bifurcan Tauri/HTTP como el resto del módulo. Es obligatorio y no
// cosmético: la caja cobra DENTRO de Tauri, y una versión sólo-HTTP dejaría sin
// respaldo justo al equipo que más vende. Es el fallo del cajón, otra vez.

/**
 * Deja una copia. **Nunca lanza y nunca debe bloquear un cobro**: esto es la
 * SEGUNDA copia, jamás la única. Si el hub está apagado se devuelve el fallo y
 * quien llama sigue su camino — `respaldarPendientes()` lo recupera luego.
 */
export async function respaldar(anotaciones = [], { origen = null } = {}) {
  const lista = Array.isArray(anotaciones) ? anotaciones : [];
  if (lista.length === 0) return { ok: true, anotados: 0 };

  if (enTauri()) {
    try {
      return {
        ok: true,
        ...(await invocar('hub_respaldar', { anotaciones: lista })),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/respaldo', {
    metodo: 'POST',
    cuerpo: { anotaciones: lista },
    origen,
  });
}

/** «Esto ya subió a Supabase, olvídalo.» */
export async function confirmarRespaldo(claves = [], { origen = null } = {}) {
  const lista = (Array.isArray(claves) ? claves : []).filter(Boolean);
  if (lista.length === 0) return { ok: true, reconocidas: 0 };

  if (enTauri()) {
    try {
      return {
        ok: true,
        reconocidas: await invocar('hub_confirmar_respaldo', { claves: lista }),
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/respaldo/confirmar', {
    metodo: 'POST',
    cuerpo: { claves: lista },
    origen,
  });
}

/**
 * Lo que hay que adoptar: ventas de dispositivos que ya no dan señales.
 *
 * Sólo responde al token de la CAJA. Un teléfono emparejado que lo intente
 * recibe 401, y está bien: este endpoint entrega los cobros de todo el local.
 */
export async function respaldoPendiente({ origen = null } = {}) {
  if (enTauri()) {
    try {
      return { ok: true, ...(await invocar('hub_respaldo_pendientes')) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return pedir('/respaldo/pendientes', { origen });
}

export async function configurarAncho(ancho, { origen = null } = {}) {
  return pedir('/impresora/ancho', {
    metodo: 'POST',
    cuerpo: { ancho },
    origen,
  });
}
