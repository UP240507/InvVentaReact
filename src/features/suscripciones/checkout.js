import { supabase } from '../../api/supabase';

// ─── Fase 1: puente al checkout de Stripe ────────────────────────────────────
// El cliente solo dice QUÉ quiere (plan + addons); los precios y el tenant los
// resuelve la EF create-checkout. Redirige al Checkout hospedado de Stripe.

export async function iniciarCheckout(planId, addons = []) {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      plan_id: planId,
      addons,
      success_url: `${window.location.origin}/mi-plan?pago=exito`,
      cancel_url: `${window.location.origin}/mi-plan?pago=cancelado`,
    },
  });

  if (error) {
    // supabase-js envuelve el HTTP error; el mensaje útil viene en el body
    let msg = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch {
      /* noop */
    }
    throw new Error(msg || 'No se pudo iniciar el pago.');
  }
  if (!data?.url) throw new Error(data?.error || 'No se pudo iniciar el pago.');

  window.location.href = data.url;
}

// Customer Portal: tarjeta, facturas, cancelación — con prorrateos de Stripe.
export async function abrirPortal() {
  const { data, error } = await supabase.functions.invoke('customer-portal', {
    body: { return_url: `${window.location.origin}/mi-plan` },
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch {
      /* noop */
    }
    throw new Error(msg || 'No se pudo abrir el portal.');
  }
  if (!data?.url) throw new Error(data?.error || 'No se pudo abrir el portal.');
  window.location.href = data.url;
}

// Catálogo para las pantallas de venta (RLS: legible por authenticated).
export async function cargarCatalogo() {
  const [{ data: planes }, { data: addons }] = await Promise.all([
    supabase.from('planes').select('*').order('orden'),
    supabase.from('addons').select('*'),
  ]);
  return { planes: planes ?? [], addons: addons ?? [] };
}

export const precioMXN = (centavos) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format((centavos ?? 0) / 100);
