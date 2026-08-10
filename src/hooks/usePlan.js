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
    };
  }

  const limites = suscripcion.planes?.limites ??
    LIMITES_FALLBACK[suscripcion.plan] ?? { empleados: 10, modulos: [] };

  // Módulos = los del plan + addons contratados (ej. basico + addon lealtad).
  const addons = Array.isArray(suscripcion.addons) ? suscripcion.addons : [];
  const modulos = [...new Set([...(limites.modulos ?? []), ...addons])];

  // Vigencia: trial corre contra trial_hasta; activo/moroso contra
  // fecha_vencimiento + dias_gracia. suspendido/cancelado nunca es vigente.
  // +1 día porque las fechas son DATE (inclusivas hasta el fin del día).
  const hoy = Date.now();
  let limiteTs = null;
  if (suscripcion.estado === 'trial' && suscripcion.trial_hasta) {
    limiteTs = new Date(suscripcion.trial_hasta).getTime() + DIA_MS;
  } else if (
    (suscripcion.estado === 'activo' || suscripcion.estado === 'moroso') &&
    suscripcion.fecha_vencimiento
  ) {
    const gracia = (suscripcion.dias_gracia ?? 3) * DIA_MS;
    limiteTs =
      new Date(suscripcion.fecha_vencimiento).getTime() + gracia + DIA_MS;
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
  };
}

export function usePlan() {
  const suscripcion = useAuthStore((s) => s.suscripcion);
  return derivarPlan(suscripcion);
}

export default usePlan;
