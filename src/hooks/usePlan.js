import { useAuthStore } from '../features/auth/useAuthStore';

// ─── Fase 1 (monetización): fuente ÚNICA de verdad del plan en el cliente ────
// Deriva TODO de useAuthStore.suscripcion (que ya viaja en el cache offline
// invventa-auth-ctx): vigencia, límite de empleados y módulos premium.
// Regla de negocio (PRECIOS_InvVenta.md): dispositivos ilimitados; el único
// enforcement duro es EMPLEADOS; los módulos premium se ocultan por plan/addon.

// Fallback local del catálogo: si el cache offline es viejo y no trae el embed
// de `planes`, los límites no pueden quedar ni en "todo bloqueado" ni en
// "todo abierto". Debe ser espejo del seed de la migración 20260725170733.
const LIMITES_FALLBACK = {
  fundador: { empleados: 10, modulos: [] },
  basico: { empleados: 10, modulos: [] },
  pro: { empleados: 25, modulos: ['lealtad'] },
  empresarial: { empleados: 60, modulos: ['lealtad', 'multisucursal'] },
};

const DIA_MS = 86_400_000;

// Una cuenta de cobro (activo/moroso) SIN `fecha_vencimiento` no debería
// existir: esa fecha la escribe el webhook de Stripe. Queda nula sólo si el
// webhook falló, o si `current_period_end` cambió de lugar en la API (en las
// versiones nuevas vive en los items, no en la raíz de la suscripción) y
// nuestro código guardó null encima de la fecha buena.
//
// Eso no es motivo para dejar fuera a quien pagó —sería a media comida— ni
// para regalar el servicio para siempre. Se le da una VENTANA contada desde la
// última vez que alguien tocó la fila, y la pantalla de plan avisa que falta la
// fecha (`sinFechaVencimiento`), para que el fallo del webhook se vea en vez de
// quedarse callado.
const VENTANA_SIN_FECHA_DIAS = 7;

// Ancla de la ventana: `updated_at` —un trigger en Postgres
// (`trg_touch_suscripciones`) lo pone en CADA update, así que es «la última vez
// que el webhook dijo algo»—; si no viene, `fecha_inicio` o `created_at`.
// Que el ancla sea `updated_at` es lo que hace que la ventana empiece a contar
// en el instante del fallo y no en el alta del cliente.
// Sin ninguna de las tres —imposible en una fila nuestra: las tres son NOT
// NULL— no hay desde dónde contar, y una ventana sin ancla sería vigencia
// infinita. Se devuelve null: no vigente.
function ventanaSinFecha(suscripcion) {
  const anclas = [
    suscripcion.updated_at,
    suscripcion.fecha_inicio,
    suscripcion.created_at,
  ];
  for (const ancla of anclas) {
    const ts = ancla ? new Date(ancla).getTime() : NaN;
    if (Number.isFinite(ts)) return ts + VENTANA_SIN_FECHA_DIAS * DIA_MS;
  }
  return null;
}

// Pura y exportada: App.jsx (guards) la usa sin hook; usePlan la envuelve.
export function derivarPlan(suscripcion) {
  if (!suscripcion) {
    return {
      suscripcion: null,
      planNombre: null,
      estado: null,
      vigente: false,
      limiteEmpleados: 0,
      modulos: [],
      tieneModulo: () => false,
      diasRestantes: 0,
      sinFechaVencimiento: false,
    };
  }

  const limites = suscripcion.planes?.limites ??
    LIMITES_FALLBACK[suscripcion.plan] ?? { empleados: 10, modulos: [] };

  // Módulos = los del plan + addons contratados (ej. basico + addon lealtad).
  const addons = Array.isArray(suscripcion.addons) ? suscripcion.addons : [];
  const modulos = [...new Set([...(limites.modulos ?? []), ...addons])];

  // Vigencia: trial corre contra trial_hasta; activo/moroso contra
  // fecha_vencimiento + dias_gracia, o contra la ventana de cortesía si esa
  // fecha falta. suspendido/cancelado nunca es vigente.
  // +1 día porque las fechas son DATE (inclusivas hasta el fin del día).
  const hoy = Date.now();
  const esCuentaDeCobro =
    suscripcion.estado === 'activo' || suscripcion.estado === 'moroso';
  let limiteTs = null;
  let sinFechaVencimiento = false;
  if (suscripcion.estado === 'trial' && suscripcion.trial_hasta) {
    limiteTs = new Date(suscripcion.trial_hasta).getTime() + DIA_MS;
  } else if (esCuentaDeCobro && suscripcion.fecha_vencimiento) {
    const gracia = (suscripcion.dias_gracia ?? 3) * DIA_MS;
    limiteTs =
      new Date(suscripcion.fecha_vencimiento).getTime() + gracia + DIA_MS;
  } else if (esCuentaDeCobro) {
    // Pagó, pero no sabemos hasta cuándo: ventana de cortesía + aviso.
    sinFechaVencimiento = true;
    limiteTs = ventanaSinFecha(suscripcion);
  }
  const vigente = limiteTs !== null && hoy <= limiteTs;
  const diasRestantes = limiteTs
    ? Math.max(0, Math.ceil((limiteTs - hoy) / DIA_MS))
    : 0;

  return {
    suscripcion,
    planNombre: suscripcion.planes?.nombre ?? suscripcion.plan,
    estado: suscripcion.estado,
    vigente,
    limiteEmpleados: limites.empleados ?? Infinity,
    modulos,
    tieneModulo: (id) => modulos.includes(id),
    diasRestantes,
    sinFechaVencimiento,
  };
}

export function usePlan() {
  const suscripcion = useAuthStore((s) => s.suscripcion);
  return derivarPlan(suscripcion);
}

export default usePlan;
