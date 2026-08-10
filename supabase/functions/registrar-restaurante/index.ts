import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Fase 1.6: alta self-service de restaurante (onboarding) ─────────────────
// PÚBLICA (verify_jwt OFF): el prospecto aún no tiene cuenta. Crea en cadena:
//   auth.users (admin) → restaurantes (+código corto) → usuarios → configuracion
//   → suscripciones en TRIAL de 14 días (fundador si sigue activo, si no básico).
// Rollback best-effort en orden inverso si algo truena.
// Throttle: máx 3 registros por IP por día (marca: login_intentos con
// restaurante_id NULL y exito=true — los logins usan otras combinaciones).

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRIAL_DIAS = 14;
const MAX_REGISTROS_IP_DIA = 3;

// "La Cabaña" → "LACA"; corto/no-alfabético → "REST"
const prefijoCodigo = (nombre: string) => {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar diacríticos combinantes
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  return limpio.length >= 2 ? limpio.slice(0, 4) : 'REST';
};
const sufijoCodigo = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
  let s = '';
  for (let i = 0; i < 4; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Payload ──
    const body = await req.json();
    const nombreRestaurante = String(body?.restaurante ?? '').trim();
    const nombreAdmin = String(body?.nombre ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    if (nombreRestaurante.length < 3)
      return json({ error: 'El nombre del restaurante es muy corto.' }, 400);
    if (!nombreAdmin)
      return json({ error: 'Falta tu nombre.' }, 400);
    if (!EMAIL_RE.test(email))
      return json({ error: 'Correo inválido.' }, 400);
    if (password.length < 8)
      return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);

    // ── Throttle por IP ──
    const ip =
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'desconocida';
    const hace24h = new Date(Date.now() - 86_400_000).toISOString();
    const { count: registrosHoy } = await admin
      .from('login_intentos')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('exito', true)
      .is('restaurante_id', null)
      .gte('created_at', hace24h);
    if ((registrosHoy ?? 0) >= MAX_REGISTROS_IP_DIA)
      return json(
        { error: 'Demasiados registros desde esta conexión. Intenta mañana.' },
        429,
      );

    // ── 1. Cuenta de Auth del admin ──
    //
    // `email_confirm` NO se pasa a propósito (5-ago). Con `true`, la cuenta
    // nacía marcada como confirmada y eso **pisa el ajuste del dashboard**:
    // `email_confirmed_at` quedaba lleno sin que nadie hubiera abierto un
    // correo, y el candado de `create-checkout` no servía para nada.
    //
    // Sin la bandera, la cuenta nace SIN confirmar y `email_confirmed_at`
    // queda vacío hasta que la persona pulse el enlace — que es justo lo que
    // el candado necesita para distinguir un buzón real de uno inventado.
    //
    // OJO, dos consecuencias que van atadas a esto:
    //
    //  1. `admin.createUser` es API de administración: **no manda ningún
    //     correo**. El de confirmación lo dispara el front con
    //     `auth.resend({ type: 'signup' })` justo después del alta.
    //  2. El proyecto debe tener *Confirm email* **DESACTIVADO**. Con esa
    //     opción activa, Supabase impide iniciar sesión a una cuenta sin
    //     confirmar, y el trial de 14 días sin fricción —que es la promesa
    //     del onboarding self-service— se rompe. Queremos poder entrar sin
    //     confirmar, pero no poder PAGAR sin confirmar.
    //
    // Ver `docs/IDENTIDAD_Y_CORREOS.md` y S.4 en `docs/PENDIENTES_MANUALES.md`.
    const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
      email,
      password,
      user_metadata: { nombre: nombreAdmin, rol: 'Admin' },
    });
    if (errAuth) {
      const dup = /already.*(registered|exists)|duplicate/i.test(errAuth.message);
      return json(
        { error: dup ? 'Ese correo ya tiene una cuenta.' : errAuth.message },
        400,
      );
    }
    const authId = creado.user.id;

    // Rollback best-effort en orden inverso. VERIFICAMOS {error} de cada paso:
    // supabase-js no lanza en fallo, y un delete silenciosamente fallido deja
    // tenants huérfanos (pasó con el NOT NULL de fecha_vencimiento, 25-jul).
    const deshacer: (() => Promise<unknown>)[] = [
      () => admin.auth.admin.deleteUser(authId),
    ];
    const fallar = async (msg: string, status = 500) => {
      console.error('[registrar-restaurante] fallo:', msg);
      for (const fn of [...deshacer].reverse()) {
        try {
          const r = (await fn()) as { error?: { message?: string } } | undefined;
          if (r?.error)
            console.error('[registrar-restaurante] rollback:', r.error.message);
        } catch (e) {
          console.error('[registrar-restaurante] rollback:', e);
        }
      }
      return json({ error: msg }, status);
    };

    try {
      // ── 2. Restaurante con código corto único (reintenta sufijo) ──
      const prefijo = prefijoCodigo(nombreRestaurante);
      let restauranteId: string | null = null;
      let codigo = '';
      for (let intento = 0; intento < 5 && !restauranteId; intento++) {
        codigo = `${prefijo}-${sufijoCodigo()}`;
        const { data: rest, error: errRest } = await admin
          .from('restaurantes')
          .insert({ nombre: nombreRestaurante, codigo, activo: true })
          .select('id')
          .single();
        if (!errRest) restauranteId = rest.id;
        else if (!/duplicate|23505/i.test(errRest.message))
          return await fallar(`No se pudo crear el restaurante: ${errRest.message}`);
      }
      if (!restauranteId)
        return await fallar('No se pudo generar un código único. Reintenta.');
      deshacer.push(() =>
        admin.from('restaurantes').delete().eq('id', restauranteId),
      );

      // ── 3. Usuario admin (tabla usuarios; id sin default → epoch ms) ──
      const { error: errUsuario } = await admin.from('usuarios').insert({
        id: Date.now(),
        username: email.split('@')[0],
        nombre: nombreAdmin,
        rol: 'Admin',
        auth_id: authId,
        restaurante_id: restauranteId,
      });
      if (errUsuario)
        return await fallar(`No se pudo crear el usuario: ${errUsuario.message}`);
      deshacer.push(() =>
        admin.from('usuarios').delete().eq('auth_id', authId),
      );

      // ── 4. Configuración inicial (defaults de la tabla hacen el resto) ──
      const { error: errConf } = await admin.from('configuracion').insert({
        id: Date.now() + 1,
        restaurante_id: restauranteId,
        nombre_empresa: nombreRestaurante,
        iva: 16,
      });
      if (errConf)
        return await fallar(`No se pudo crear la configuración: ${errConf.message}`);
      deshacer.push(() =>
        admin.from('configuracion').delete().eq('restaurante_id', restauranteId),
      );

      // ── 5. Suscripción TRIAL 14 días (fundador mientras siga activo) ──
      const { data: fundador } = await admin
        .from('planes')
        .select('id, activo')
        .eq('id', 'fundador')
        .maybeSingle();
      const planInicial = fundador?.activo ? 'fundador' : 'basico';
      const hoy = new Date().toISOString().slice(0, 10);
      const trialHasta = new Date(Date.now() + TRIAL_DIAS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const { error: errSus } = await admin.from('suscripciones').insert({
        restaurante_id: restauranteId,
        plan: planInicial,
        estado: 'trial',
        fecha_inicio: hoy,
        trial_hasta: trialHasta,
      });
      if (errSus)
        return await fallar(`No se pudo crear la suscripción: ${errSus.message}`);

      // ── 6. Marca de throttle (no debe tumbar el registro si falla) ──
      try {
        await admin
          .from('login_intentos')
          .insert({ restaurante_id: null, ip, exito: true });
      } catch {
        /* noop */
      }

      return json({
        ok: true,
        restaurante_id: restauranteId,
        codigo,
        plan: planInicial,
        trial_hasta: trialHasta,
      });
    } catch (e) {
      return await fallar(String((e as Error)?.message ?? e));
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
