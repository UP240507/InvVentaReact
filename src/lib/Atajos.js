// ─── REGISTRO CENTRAL DE ATAJOS (Proyecto D · tanda 3) ───────────────────────
// Núcleo PURO del sistema de teclado. Sin React y sin librerías: un solo
// listener en window despacha a los scopes registrados.
//
// Por qué un registro y no `useEffect` sueltos por pantalla (que es lo que
// había en la tanda 2 para Ctrl+B y Ctrl+K):
//   1. F1 tiene que poder LISTAR los atajos vigentes. Si cada pantalla se ata
//      su propio listener, no hay forma de saber qué está activo.
//   2. Precedencia: el scope montado más recientemente (el módulo abierto) gana
//      sobre el global. Con listeners sueltos el orden lo decide el azar del
//      montaje.
//   3. Un solo guard de "el foco está en un input" en vez de repetirlo n veces.
//
// Tauri es desktop: el teclado es superficie de primera clase, no un adorno.

// ── Normalización de combos ──────────────────────────────────────────────────
// Canónico: modificadores en orden fijo ctrl+alt+shift+meta, tecla en minúscula.
// "Ctrl+Shift+L", "shift+ctrl+L" y "CTRL + SHIFT + l" son el MISMO atajo.
const ORDEN_MODIFICADORES = ['ctrl', 'alt', 'shift', 'meta'];

const ALIAS_TECLA = {
  esc: 'escape',
  intro: 'enter',
  return: 'enter',
  espacio: ' ',
  space: ' ',
  arriba: 'arrowup',
  abajo: 'arrowdown',
  izquierda: 'arrowleft',
  derecha: 'arrowright',
  supr: 'delete',
  cmd: 'meta',
};

export function normalizarCombo(combo) {
  const partes = String(combo || '')
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const mods = new Set();
  let tecla = '';

  for (const parte of partes) {
    const p = ALIAS_TECLA[parte] ?? parte;
    // 'cmd' mapea a meta y ahí sí es modificador.
    if (ORDEN_MODIFICADORES.includes(p)) mods.add(p);
    else tecla = p;
  }

  const prefijo = ORDEN_MODIFICADORES.filter((m) => mods.has(m));
  return [...prefijo, tecla].filter(Boolean).join('+');
}

/** Combo canónico de un KeyboardEvent. */
export function comboDeEvento(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  if (e.metaKey) mods.push('meta');

  let tecla = String(e.key || '').toLowerCase();
  // Con Shift, e.key ya viene transformado ('L', '?'). Para las letras nos
  // interesa la tecla física, si no "ctrl+shift+l" jamás coincidiría.
  if (/^key[a-z]$/i.test(e.code) && tecla.length === 1) {
    tecla = e.code.slice(3).toLowerCase();
  }
  if (/^digit[0-9]$/i.test(e.code) && e.shiftKey) {
    tecla = e.code.slice(5);
  }

  return [...mods, tecla].filter(Boolean).join('+');
}

/** Etiqueta legible para pintar el atajo en pantalla: "Ctrl + Shift + L". */
export function formatearCombo(combo) {
  const NOMBRES = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    meta: '⌘',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    enter: 'Enter',
    escape: 'Esc',
    ' ': 'Espacio',
    delete: 'Supr',
  };
  return normalizarCombo(combo)
    .split('+')
    .map(
      (p) => NOMBRES[p] ?? (p.length === 1 ? p.toUpperCase() : p.toUpperCase()),
    )
    .join(' + ');
}

// ── Registro ─────────────────────────────────────────────────────────────────
// Cada entrada de `mapa`:
//   'ctrl+k': fn
//   'ctrl+k': { descripcion, accion, permitirEnInput?, prevenir? }
// `descripcion` es lo que ve el usuario en la ayuda de F1. Un atajo sin
// descripción funciona, pero no se documenta solo — ponla siempre.

const registros = new Map(); // id -> { id, scope, orden, titulo, mapa }
const oyentes = new Set();
let secuencia = 0;
let instalado = false;

// La lista se cachea porque la consume useSyncExternalStore: si getSnapshot
// devolviera un array nuevo en cada llamada, React entraría en bucle de render.
let cacheLista = null;

const notificar = () => {
  cacheLista = null;
  oyentes.forEach((fn) => fn());
};

const esCampoDeTexto = (el) =>
  !!el &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function alPulsar(e) {
  const combo = comboDeEvento(e);
  if (!combo) return;

  const enCampo = esCampoDeTexto(e.target);

  // Precedencia: lo último registrado manda. El módulo abierto puede así
  // sobrescribir un atajo global sin desregistrarlo.
  const activos = [...registros.values()].sort((a, b) => b.orden - a.orden);

  for (const registro of activos) {
    const entrada = registro.mapa[combo];
    if (!entrada) continue;

    if (enCampo && !entrada.permitirEnInput) {
      // Escribiendo: el atajo NO dispara, pero tampoco deja pasar la búsqueda
      // a otro scope — así "Ctrl+B" dentro de un textarea sigue siendo negrita.
      return;
    }

    if (entrada.prevenir !== false) e.preventDefault();
    entrada.accion(e);
    return;
  }
}

function instalar() {
  if (instalado || typeof window === 'undefined') return;
  window.addEventListener('keydown', alPulsar);
  instalado = true;
}

function desinstalarSiVacio() {
  if (registros.size === 0 && instalado) {
    window.removeEventListener('keydown', alPulsar);
    instalado = false;
  }
}

/**
 * Reserva un número de precedencia. Lo usa useAtajos UNA vez por montaje para
 * que el scope conserve su sitio aunque se vuelva a registrar (las etiquetas de
 * varios atajos son dinámicas y provocan re-registros constantes). Sin esto, un
 * scope que se refresca mucho iría adelantando a los que se montaron después.
 */
export function siguienteOrden() {
  return ++secuencia;
}

/**
 * Registra un scope de atajos. Devuelve la función para darlo de baja.
 * Uso normal: vía el hook useAtajos, no directo.
 */
export function registrarAtajos({ scope, titulo, mapa, orden }) {
  const id = `${scope}#${++secuencia}`;
  const normalizado = {};

  for (const [combo, valor] of Object.entries(mapa || {})) {
    if (!valor) continue;
    const entrada =
      typeof valor === 'function' ? { accion: valor } : { ...valor };
    if (typeof entrada.accion !== 'function') continue;
    normalizado[normalizarCombo(combo)] = entrada;
  }

  registros.set(id, {
    id,
    scope,
    titulo: titulo || scope,
    orden: orden ?? secuencia,
    mapa: normalizado,
  });
  instalar();
  notificar();

  return () => {
    registros.delete(id);
    desinstalarSiVacio();
    notificar();
  };
}

/**
 * Fotografía del registro vivo, agrupada por scope y lista para pintar.
 * Es lo que consume la ayuda de F1: la ayuda NO mantiene su propia lista, así
 * nunca miente sobre lo que realmente está activo.
 */
export function listarAtajos() {
  if (cacheLista) return cacheLista;
  cacheLista = [...registros.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((r) => ({
      scope: r.scope,
      titulo: r.titulo,
      atajos: Object.entries(r.mapa)
        .filter(([, e]) => e.descripcion)
        .map(([combo, e]) => ({
          combo,
          etiqueta: formatearCombo(combo),
          descripcion: e.descripcion,
        })),
    }))
    .filter((r) => r.atajos.length > 0);
  return cacheLista;
}

/** Suscripción para que la ayuda se repinte cuando cambian los scopes montados. */
export function suscribirAtajos(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

// Solo para tests: despacha un evento sintético sin necesitar un DOM real.
// Se expone para poder cubrir lo delicado (precedencia entre scopes y el guard
// de "estoy escribiendo en un campo") en frío, sin montar jsdom.
export function _despachar(evento) {
  alPulsar(evento);
}

// Solo para tests: deja el registro en blanco entre casos.
export function _reiniciarRegistro() {
  registros.clear();
  desinstalarSiVacio();
  notificar();
}
