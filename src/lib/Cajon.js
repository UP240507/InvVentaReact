// src/lib/Cajon.js — abrir el cajón dejando nombre
//
// ── LA TESIS, DE `docs/DISENO_ARQUEO_Y_CAJON.md` ─────────────────────────────
//
// **El control es el registro, no el candado.**
//
// No se puede cerrar con llave un cajón que un cajero necesita durante seis
// horas: ya se abre solo en cada venta en efectivo, y tiene que hacerlo, porque
// sin eso no hay cambio que dar. Lo que hace peligrosa a la llave no es que
// abra el cajón; es que **lo abre sin dejar un nombre**.
//
// Y hasta el 04-sep tampoco lo dejaba el software: `abrirCajon()` no escribía
// NADA en Auditoría — ni al cobrar, ni nunca. El parámetro `origen` existía en
// la firma y la aplicación lo llamaba sin argumentos. **Ninguna apertura dejaba
// nombre**, ni con llave ni sin ella. Mientras eso fuera cierto, quitar la
// llave no era una decisión que se pudiera tomar.
//
// ── LAS DOS PIEZAS VAN EN DIRECCIONES OPUESTAS ───────────────────────────────
//
// Es lo más fácil de equivocar de todo esto:
//
//   * **El pulso NO se encola.** Está escrito en `lib/Hub.js`: un pulso
//     reintentado abriría el cajón cuando la impresora vuelva —veinte minutos
//     después, o al día siguiente— con dinero dentro y nadie delante.
//
//   * **El registro SÍ.** Es dato, no acción física. Va por la cola de siempre
//     y no se pierde nunca. Si viajara pegado al pulso, un hub caído dejaría la
//     apertura sin nombre, que es justo lo que esto viene a evitar.
//
// Por eso el registro se escribe **pase lo que pase con el pulso**, y dice si
// abrió. Una apertura que falló también es información: significa que alguien
// tuvo que usar la llave.

/**
 * Las cuatro razones por las que ese cajón se abre. No hay una quinta.
 *
 * `venta` es automática y sin PIN —pedir autorización para dar cambio pararía
 * el servicio—; las otras tres las dispara una persona.
 */
export const MOTIVOS = Object.freeze({
  VENTA: 'venta',
  MANUAL: 'manual',
  APERTURA_TURNO: 'apertura_turno',
  CIERRE_TURNO: 'cierre_turno',
});

const MOTIVOS_VALIDOS = Object.values(MOTIVOS);

/** ¿Es uno de los cuatro? */
export const motivoValido = (m) => MOTIVOS_VALIDOS.includes(m);

/** La frase que se guarda en Auditoría. Se arma aparte para poder probarla. */
export function detallesDeApertura({ motivo, folio = null, abrio }) {
  const porQue =
    {
      [MOTIVOS.VENTA]: 'Venta en efectivo',
      [MOTIVOS.MANUAL]: 'Apertura manual desde el botón',
      [MOTIVOS.APERTURA_TURNO]: 'Apertura de turno',
      [MOTIVOS.CIERRE_TURNO]: 'Cierre de turno',
    }[motivo] || `Motivo no previsto (${motivo})`;

  const conFolio = folio ? ` (folio ${folio})` : '';
  // Se dice SIEMPRE si abrió o no. Un fallo del cajón significa que alguien
  // tuvo que usar la llave, y eso es exactamente lo que hay que poder ver.
  const resultado = abrio
    ? 'El cajón se abrió.'
    : 'EL CAJÓN NO SE ABRIÓ: se habrá usado la llave.';

  return `${porQue}${conFolio}. ${resultado}`;
}

/**
 * Abre el cajón y lo registra.
 *
 * Nunca lanza: esto se llama en mitad de un cobro y de un cierre de turno, y
 * ninguno de los dos puede pararse porque el hub esté apagado.
 *
 * @param {object} p
 * @param {string} p.motivo     uno de `MOTIVOS`.
 * @param {string} p.usuario    quién lo pidió. Es el dato entero del registro.
 * @param {string|null} p.folio folio de la venta, cuando el motivo es `venta`.
 * @param {Function} p.abrir    `abrirCajon` de `lib/Hub`. Inyectable para probar.
 * @param {Function} p.registrar `registrarAuditoria` del store.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function abrirCajonConRegistro({
  motivo,
  usuario,
  folio = null,
  abrir,
  registrar,
}) {
  let resultado = { ok: false, error: 'sin implementación de apertura' };

  if (typeof abrir === 'function') {
    try {
      resultado = (await abrir({ origen: motivo })) || { ok: false };
    } catch (e) {
      // `abrirCajon` ya devuelve `{ok:false}` en vez de lanzar, pero esto se
      // llama con una función inyectada: si algún día lanza, el cobro sigue.
      resultado = { ok: false, error: String(e) };
    }
  }

  // El registro va DESPUÉS y SIEMPRE, incluso si el pulso falló.
  if (typeof registrar === 'function') {
    registrar({
      fecha: new Date().toISOString(),
      usuario: usuario || 'Sistema',
      accion: 'CAJON_ABIERTO',
      modulo: 'CAJA',
      // Que no abra no es un error del sistema, pero tampoco es rutina: es el
      // caso en que el dinero se saca por otra vía.
      nivel: resultado.ok ? 'info' : 'warning',
      detalles: detallesDeApertura({ motivo, folio, abrio: !!resultado.ok }),
    });
  }

  return resultado;
}
