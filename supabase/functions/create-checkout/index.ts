import Stripe from 'npm:stripe@17';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Fase 1: crea la Checkout Session de Stripe para contratar/renovar ───────
// verify_jwt ON: solo usuarios autenticados. El tenant y los precios los
// resuelve el SERVIDOR (catálogo planes/addons) — el cliente solo dice QUÉ
// quiere (plan_id + addons[]), nunca cuánto cuesta.

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
      return json({ error: 'Stripe no está configurado (STRIPE_SECRET_KEY).' }, 500);

    // 1. Caller autenticado
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

    // 2. Tenant + flag gestion del caller (mismo patrón que crear-empleado-auth)
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

    // 2.b CORREO VERIFICADO — candado antes de COBRAR, no antes de probar.
    //
    // Política (5-ago): el trial de 14 días arranca sin fricción, pero no se le
    // cobra a nadie cuyo correo no esté confirmado. El motivo es concreto: ese
    // correo es la ÚNICA forma que tiene el dueño de recuperar su contraseña.
    // Si se registró con algo inventado —`admin@suempresa.com` que no existe—
    // y además paga, acabamos con un cliente que paga y no puede entrar, y sin
    // buzón al que mandarle nada.
    //
    // Se pone aquí, en el servidor, y no solo en la pantalla: el cliente nunca
    // es la única barrera (mismo criterio que el resto de los gates de plan).
    //
    // Los correos SINTÉTICOS del staff operativo (`@staff.invventa.app`) nunca
    // llegan a este punto —no tienen el flag de gestión—, pero se rechazan
    // explícitamente por si algún día un rol elevado se creara con uno.
    const correoCaller = String(quienLlama.email ?? '').toLowerCase();
    if (correoCaller.endsWith('@staff.invventa.app'))
      return json(
        {
          error:
            'Esta cuenta es de uso interno y no puede contratar. Entra con el correo del administrador del restaurante.',
        },
        403,
      );

    if (!quienLlama.email_confirmed_at)
      return json(
        {
          error:
            'Antes de contratar tienes que confirmar tu correo. Te sirve para recuperar tu cuenta si olvidas la contraseña: sin eso, nadie puede devolverte el acceso.',
          codigo: 'correo_sin_confirmar',
          correo: correoCaller,
        },
        403,
      );

    // 3. Payload: qué plan y qué addons. Los precios salen del CATÁLOGO.
    const { plan_id, addons = [], success_url, cancel_url } = await req.json();
    if (!plan_id || !success_url || !cancel_url)
      return json({ error: 'Faltan plan_id, success_url o cancel_url.' }, 400);

    const { data: plan } = await admin
      .from('planes')
      .select('id, stripe_price_id, activo')
      .eq('id', plan_id)
      .maybeSingle();
    if (!plan?.activo)
      return json({ error: 'Ese plan no está disponible.' }, 400);
    if (!plan.stripe_price_id)
      return json({ error: 'El plan no tiene precio configurado en Stripe.' }, 500);

    const line_items = [{ price: plan.stripe_price_id, quantity: 1 }];
    const addonsValidos: string[] = [];
    for (const a of Array.isArray(addons) ? addons : []) {
      const { data: addon } = await admin
        .from('addons')
        .select('id, stripe_price_id, disponible')
        .eq('id', a)
        .maybeSingle();
      if (addon?.disponible && addon.stripe_price_id) {
        line_items.push({ price: addon.stripe_price_id, quantity: 1 });
        addonsValidos.push(addon.id);
      }
    }

    // 4. Customer de Stripe: reusar el del tenant si ya existe.
    const { data: sus } = await admin
      .from('suscripciones')
      .select('stripe_customer_id')
      .eq('restaurante_id', tenantCaller)
      .maybeSingle();

    const stripe = new Stripe(STRIPE_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let customerId = sus?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: quienLlama.email ?? undefined,
        metadata: { restaurante_id: tenantCaller },
      });
      customerId = customer.id;
    }

    // 5. Checkout Session (suscripción anual con renovación automática).
    //    El webhook hará la escritura en BD con los metadata de aquí.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items,
      success_url,
      cancel_url,
      // automatic_tax: { enabled: true }, // ← activar cuando Stripe Tax esté configurado (IVA 16% MX)
      subscription_data: {
        metadata: { restaurante_id: tenantCaller, plan_id: plan.id },
      },
      metadata: {
        restaurante_id: tenantCaller,
        plan_id: plan.id,
        addons: JSON.stringify(addonsValidos),
      },
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
