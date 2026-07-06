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

    // 1. Resolver tenant por código (case-insensitive).
    const codigoNorm = String(codigo).trim().toUpperCase();
    const { data: rest } = await admin
      .from('restaurantes')
      .select('id, nombre')
      .ilike('codigo', codigoNorm)
      .maybeSingle();
    if (!rest) return json({ error: 'Código de restaurante inválido.' }, 404);

    // 2. Buscar staff por (restaurante_id, pin) — único por índice 026.
    const { data: staff } = await admin
      .from('staff')
      .select('id, nombre, rol, auth_id, activo')
      .eq('restaurante_id', rest.id)
      .eq('pin', String(pin))
      .maybeSingle();
    if (!staff) return json({ error: 'PIN incorrecto.' }, 401);
    if (staff.activo === false) return json({ error: 'Empleado inactivo.' }, 403);

    // 3. Admin/Gerente entran con contraseña, no por PIN.
    if (ELEVADOS.includes(staff.rol))
      return json({ error: 'Admin y Gerente inician sesión con su contraseña, no con PIN.' }, 403);

    // 4. La cuenta debe estar activada (el alta ya corrió).
    if (!staff.auth_id)
      return json({ error: 'La cuenta del empleado no está activada. Pide al administrador darlo de alta.' }, 409);

    // 5. Autenticar con la credencial derivada del PIN (coincide con la del alta).
    const email = `emp.${staff.id}@staff.invventa.app`;
    const password = `pin.${pin}.${staff.id}`;
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: signIn, error: errSign } = await anon.auth.signInWithPassword({ email, password });
    if (errSign || !signIn.session)
      return json({ error: 'No se pudo iniciar sesión. Verifica con el administrador.' }, 401);

    // 6. Devolver la sesión real del empleado para que el cliente la fije.
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