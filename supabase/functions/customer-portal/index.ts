import Stripe from 'npm:stripe@17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Fase 1.7: Customer Portal de Stripe ─────────────────────────────────────
// verify_jwt ON. Abre el portal del customer del tenant: cambiar tarjeta,
// descargar facturas, cancelar/renovar — con prorrateos manejados por Stripe.
// Requiere activar el portal en el dashboard (Settings → Billing → Customer portal).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const ELEVADOS_BASE = ['Admin', 'Gerente'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_KEY)
      return json({ error: 'Stripe no está configurado.' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: quienLlama },
      error: errCaller,
    } = await caller.auth.getUser();
    if (errCaller || !quienLlama) return json({ error: 'No autenticado.' }, 401);

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Tenant + flag gestion (mismo patrón que create-checkout)
    let rolCaller: string | undefined;
    let tenantCaller: string | undefined;
    const { data: u } = await admin
      .from('usuarios')
      .select('rol, restaurante_id')
      .eq('auth_id', quienLlama.id)
      .maybeSingle();
    if (u) {
      rolCaller = u.rol;
      tenantCaller = u.restaurante_id;
    } else {
      const { data: s } = await admin
        .from('staff')
        .select('rol, restaurante_id')
        .eq('auth_id', quienLlama.id)
        .maybeSingle();
      rolCaller = s?.rol;
      tenantCaller = s?.restaurante_id;
    }
    if (!tenantCaller)
      return json({ error: 'No se pudo resolver tu restaurante.' }, 403);

    const { data: filaRol } = await admin
      .from('roles_permisos')
      .select('capacidades')
      .eq('restaurante_id', tenantCaller)
      .eq('rol', rolCaller ?? '')
      .maybeSingle();
    const flagGestion = filaRol?.capacidades?.gestion;
    const esGestion =
      typeof flagGestion === 'boolean'
        ? flagGestion
        : ELEVADOS_BASE.includes(rolCaller ?? '');
    if (!esGestion)
      return json({ error: 'Tu rol no puede gestionar la suscripción.' }, 403);

    const { data: sus } = await admin
      .from('suscripciones')
      .select('stripe_customer_id')
      .eq('restaurante_id', tenantCaller)
      .maybeSingle();
    if (!sus?.stripe_customer_id)
      return json(
        { error: 'Aún no hay pagos registrados: contrata un plan primero.' },
        404,
      );

    const { return_url } = await req.json().catch(() => ({}));
    const stripe = new Stripe(STRIPE_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const session = await stripe.billingPortal.sessions.create({
      customer: sus.stripe_customer_id,
      return_url: return_url || undefined,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
