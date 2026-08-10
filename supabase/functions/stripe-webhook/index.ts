import Stripe from 'npm:stripe@17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Fase 1: webhook de Stripe → estado de suscripciones ─────────────────────
// verify_jwt OFF (Stripe no manda JWT): la autenticación es la FIRMA del
// webhook (STRIPE_WEBHOOK_SECRET). Única pieza que ESCRIBE suscripciones.
//
// Eventos → estado:
//   checkout.session.completed        → alta/renovación: plan, addons, 'activo'
//   customer.subscription.updated     → vigencia, cancelar_al_final, activo/moroso
//   invoice.payment_failed            → 'moroso'
//   customer.subscription.deleted     → 'cancelado'

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Estado Stripe → estado nuestro (suscripciones_estado_chk)
const ESTADO_MAP: Record<string, string> = {
  active: 'activo',
  trialing: 'trial',
  past_due: 'moroso',
  unpaid: 'moroso',
  canceled: 'cancelado',
  incomplete_expired: 'cancelado',
  paused: 'suspendido',
};

const fecha = (unix?: number | null) =>
  unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null;

Deno.serve(async (req) => {
  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!STRIPE_KEY || !WEBHOOK_SECRET)
    return json({ error: 'Stripe no está configurado.' }, 500);

  const stripe = new Stripe(STRIPE_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // 1. Verificar la FIRMA — sin esto cualquiera podría "activarse" el plan.
  const firma = req.headers.get('stripe-signature');
  if (!firma) return json({ error: 'Falta stripe-signature.' }, 400);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      firma,
      WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    return json({ error: `Firma inválida: ${(e as Error).message}` }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    switch (event.type) {
      // ── Alta o renovación completada ────────────────────────────────────
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const restauranteId = s.metadata?.restaurante_id;
        const planId = s.metadata?.plan_id;
        if (!restauranteId || !planId) break; // sesión ajena a este flujo

        let addons: string[] = [];
        try {
          addons = JSON.parse(s.metadata?.addons ?? '[]');
        } catch {
          /* noop */
        }

        // Vigencia real desde la suscripción de Stripe (no calculada a mano).
        const subId = String(s.subscription ?? '');
        const sub = subId
          ? await stripe.subscriptions.retrieve(subId)
          : null;

        const { error } = await admin.from('suscripciones').upsert(
          {
            restaurante_id: restauranteId,
            plan: planId,
            estado: 'activo',
            fecha_inicio: fecha(sub?.current_period_start) ?? fecha(Date.now() / 1000),
            fecha_vencimiento: fecha(sub?.current_period_end),
            addons, // array → jsonb (supabase-js serializa; un string sería jsonb-string)
            trial_hasta: null,
            cancelar_al_final: false,
            stripe_customer_id: String(s.customer ?? '') || null,
            stripe_subscription_id: subId || null,
          },
          { onConflict: 'restaurante_id' },
        );
        if (error) throw error;

        // Candado Fundador: al llegar a 10 activos, se apaga en el catálogo.
        if (planId === 'fundador') {
          const { count } = await admin
            .from('suscripciones')
            .select('id', { count: 'exact', head: true })
            .eq('plan', 'fundador')
            .in('estado', ['activo', 'trial']);
          if ((count ?? 0) >= 10)
            await admin.from('planes').update({ activo: false }).eq('id', 'fundador');
        }
        break;
      }

      // ── Cambios de la suscripción (renovación, cancelación programada) ──
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const patch: Record<string, unknown> = {
          estado: ESTADO_MAP[sub.status] ?? 'moroso',
          fecha_vencimiento: fecha(sub.current_period_end),
          cancelar_al_final: sub.cancel_at_period_end === true,
        };
        const { error } = await admin
          .from('suscripciones')
          .update(patch)
          .eq('stripe_subscription_id', sub.id);
        if (error) throw error;
        break;
      }

      // ── Pago fallido → moroso (la gracia la administra el cliente) ──────
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = String(inv.subscription ?? '');
        if (!subId) break;
        const { error } = await admin
          .from('suscripciones')
          .update({ estado: 'moroso' })
          .eq('stripe_subscription_id', subId);
        if (error) throw error;
        break;
      }

      // ── Suscripción terminada ───────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { error } = await admin
          .from('suscripciones')
          .update({ estado: 'cancelado', cancelar_al_final: false })
          .eq('stripe_subscription_id', sub.id);
        if (error) throw error;
        break;
      }

      default:
        break; // evento no manejado: 200 igual para que Stripe no reintente
    }

    return json({ received: true });
  } catch (e) {
    // 500 → Stripe reintenta con backoff (comportamiento deseado si la BD falló)
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
