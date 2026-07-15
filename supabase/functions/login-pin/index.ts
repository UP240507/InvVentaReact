import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const ELEVADOS = ['Admin', 'Administrador', 'Gerente'];

// ── Rate-limit / lockout ───────────────────────────────────────────────────────
// login-pin es PÚBLICA: no hay identidad para limitar, así que limitamos por IP.
// PIN de 6 dígitos = 10^6 combos → sin freno es fuerza-bruteable. Un escáner desde
// una IP dispara cientos/miles de fallos → lo cortamos; los tropiezos legítimos del
// staff (que comparten la IP del restaurante) rara vez pasan el umbral, y la ventana
// deslizante se auto-sana con el tiempo.
const VENTANA_MIN = 15; // ventana deslizante
const MAX_FALLOS = 10; // fallos por IP en la ventana antes de bloquear

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    const { codigo, pin } = await req.json();
    if (!codigo || !pin) return json({ error: 'Faltan código de restaurante o PIN.' }, 400);

    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // IP del cliente (detrás del proxy de Supabase).
    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'desconocida';

    const desdeISO = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();

    // Registra un intento y poda de esta IP lo más viejo que la ventana (mantiene
    // la tabla acotada sin depender de un cron).
    const registrarIntento = async (restauranteId: string | null, exito: boolean) => {
      try {
        await admin
          .from('login_intentos')
          .insert({ restaurante_id: restauranteId, ip, exito });
        await admin.from('login_intentos').delete().eq('ip', ip).lt('created_at', desdeISO);
      } catch {
        /* el rate-limit no debe tumbar el login si la tabla falla */
      }
    };

    // 0. Throttle por IP ANTES de tocar nada. NO registramos el intento bloqueado
    //    (así la ventana puede vencer en lugar de renovarse en cada golpe).
    const { count } = await admin
      .from('login_intentos')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('exito', false)
      .gte('created_at', desdeISO);
    if ((count ?? 0) >= MAX_FALLOS) {
      return json(
        { error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' },
        429,
      );
    }

    // 1. Resolver tenant por código (case-insensitive).
    const codigoNorm = String(codigo).trim().toUpperCase();
    const { data: rest } = await admin
      .from('restaurantes')
      .select('id, nombre')
      .ilike('codigo', codigoNorm)
      .maybeSingle();
    if (!rest) {
      await registrarIntento(null, false);
      return json({ error: 'Código de restaurante inválido.' }, 404);
    }

    // 2. Buscar staff por (restaurante_id, pin) — único por índice 026.
    const { data: staff } = await admin
      .from('staff')
      .select('id, nombre, rol, auth_id, activo')
      .eq('restaurante_id', rest.id)
      .eq('pin', String(pin))
      .maybeSingle();
    if (!staff) {
      await registrarIntento(rest.id, false);
      return json({ error: 'PIN incorrecto.' }, 401);
    }
    if (staff.activo === false) {
      await registrarIntento(rest.id, false);
      return json({ error: 'Empleado inactivo.' }, 403);
    }

    // 3. Admin/Gerente entran con contraseña, no por PIN.
    if (ELEVADOS.includes(staff.rol)) {
      await registrarIntento(rest.id, false);
      return json({ error: 'Admin y Gerente inician sesión con su contraseña, no con PIN.' }, 403);
    }

    // 4. La cuenta debe estar activada (el alta ya corrió).
    if (!staff.auth_id) {
      await registrarIntento(rest.id, false);
      return json({ error: 'La cuenta del empleado no está activada. Pide al administrador darlo de alta.' }, 409);
    }

    // 5. Autenticar con la credencial derivada del PIN (coincide con la del alta).
    const email = `emp.${staff.id}@staff.invventa.app`;
    const password = `pin.${pin}.${staff.id}`;
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: signIn, error: errSign } = await anon.auth.signInWithPassword({ email, password });
    if (errSign || !signIn.session) {
      await registrarIntento(rest.id, false);
      return json({ error: 'No se pudo iniciar sesión. Verifica con el administrador.' }, 401);
    }

    // 6. Éxito: limpiar los fallos recientes de esta IP (resetea el contador para
    //    quien tropezó y luego acertó) y registrar el éxito.
    try {
      await admin
        .from('login_intentos')
        .delete()
        .eq('ip', ip)
        .eq('exito', false)
        .gte('created_at', desdeISO);
    } catch {
      /* noop */
    }
    await registrarIntento(rest.id, true);

    return json({
      ok: true,
      empleado: { id: staff.id, nombre: staff.nombre, rol: staff.rol },
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
