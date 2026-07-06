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

    // 1. Validar que QUIEN llama está autenticado (su propio JWT).
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: quienLlama },
      error: errCaller,
    } = await caller.auth.getUser();
    if (errCaller || !quienLlama) return json({ error: 'No autenticado.' }, 401);

    // 2. Cliente service role (bypassa RLS, crea cuentas de Auth).
    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Confirmar que el caller es Admin/Gerente y de qué tenant.
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
    if (!ELEVADOS.includes(rolCaller ?? ''))
      return json({ error: 'Solo Admin o Gerente pueden dar de alta empleados.' }, 403);

    // 4. Datos del empleado a crear.
    const { staffId, nombre, rol, pin, restauranteId, password } = await req.json();
    if (!staffId || !rol || !pin || !restauranteId)
      return json({ error: 'Faltan datos del empleado (staffId, rol, pin, restauranteId).' }, 400);
    if (restauranteId !== tenantCaller)
      return json({ error: 'No puedes crear empleados en otro restaurante.' }, 403);

    // 5. Password de la cuenta segun rol.
    const esElevado = ELEVADOS.includes(rol);
    let authPassword: string;
    if (esElevado) {
      if (!password || String(password).length < 8)
        return json({ error: 'Admin/Gerente requieren contraseña de al menos 8 caracteres.' }, 400);
      authPassword = String(password);
    } else {
      // Derivado del PIN: determinístico y ≥6 chars (mínimo de Supabase).
      authPassword = `pin.${pin}.${staffId}`;
    }

    const email = `emp.${staffId}@staff.invventa.app`;

    // 6. Crear la cuenta de Auth (sin correo de confirmación).
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
      user_metadata: { nombre, rol, staff_id: staffId, restaurante_id: restauranteId },
    });
    if (errCrear) return json({ error: `No se pudo crear la cuenta: ${errCrear.message}` }, 400);

    // 7. Vincular staff.auth_id.
    const { error: errLink } = await admin
      .from('staff')
      .update({ auth_id: creado.user.id })
      .eq('id', staffId);
    if (errLink)
      return json({ error: `Cuenta creada pero no se vinculó: ${errLink.message}` }, 500);

    return json({ ok: true, auth_id: creado.user.id, email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});