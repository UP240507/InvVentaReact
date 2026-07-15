import { createClient } from 'jsr:@supabase/supabase-js@2';

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

const ELEVADOS = ['Admin', 'Administrador', 'Gerente'];
// Validación pragmática de correo (suficiente para bloquear vacíos y basura).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Validar que QUIEN llama está autenticado (su propio JWT). Esta función
    //    conserva verify-jwt POR DEFECTO (no es pública): solo Admin/Gerente.
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: quienLlama },
      error: errCaller,
    } = await caller.auth.getUser();
    if (errCaller || !quienLlama) return json({ error: 'No autenticado.' }, 401);

    // 2. Cliente service role (bypassa RLS, crea cuentas de Auth, upsert staff).
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
      return json(
        { error: 'Solo Admin o Gerente pueden dar de alta empleados.' },
        403,
      );
    if (!tenantCaller)
      return json({ error: 'No se pudo resolver tu restaurante.' }, 403);

    // 4. Payload: objeto staff COMPLETO + password aparte (nunca dentro de staff).
    const body = await req.json();
    const staff = (body?.staff ?? {}) as Record<string, unknown>;
    const password = body?.password;
    const staffId = staff.id;
    const nombre = staff.nombre;
    const rol = staff.rol as string;
    const pin = staff.pin;

    if (!staffId || !rol || !pin)
      return json(
        { error: 'Faltan datos del empleado (id, rol, pin).' },
        400,
      );
    // Defensa en profundidad: el tenant lo decide el servidor, no el cliente.
    if (staff.restaurante_id && staff.restaurante_id !== tenantCaller)
      return json(
        { error: 'No puedes crear empleados en otro restaurante.' },
        403,
      );

    // 5. Credencial de la cuenta según rol.
    //    ELEVADOS (Admin/Gerente): entran por CORREO REAL + contraseña en /login.
    //    v3: su cuenta de Auth se crea con staff.email (obligatorio y válido);
    //    antes se creaba con el correo sintético → nadie podía iniciar sesión.
    //    OPERATIVOS: correo sintético estable + password derivado del PIN.
    const esElevado = ELEVADOS.includes(rol);
    let authPassword: string;
    let email: string;
    if (esElevado) {
      if (!password || String(password).length < 8)
        return json(
          { error: 'Admin/Gerente requieren contraseña de al menos 8 caracteres.' },
          400,
        );
      authPassword = String(password);
      const emailReal = String(staff.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(emailReal))
        return json(
          {
            error:
              'Admin/Gerente requieren un correo válido: con él iniciarán sesión.',
          },
          400,
        );
      email = emailReal;
    } else {
      // Derivado del PIN: determinístico y >=6 chars (mínimo de Supabase).
      authPassword = `pin.${pin}.${staffId}`;
      email = `emp.${staffId}@staff.invventa.app`;
    }

    // 6. Crear la cuenta de Auth (sin correo de confirmación).
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
      user_metadata: {
        nombre,
        rol,
        staff_id: staffId,
        restaurante_id: tenantCaller,
      },
    });
    if (errCrear) {
      const dupEmail = /already.*(registered|exists)|duplicate/i.test(
        errCrear.message,
      );
      return json(
        {
          error: dupEmail
            ? `El correo ${email} ya tiene una cuenta. Usa otro correo.`
            : `No se pudo crear la cuenta: ${errCrear.message}`,
        },
        400,
      );
    }
    const authId = creado.user.id;

    // 7. UPSERT ATÓMICO de la fila staff con auth_id ya seteado.
    //    Forzamos restaurante_id = tenant del caller, espejamos puesto≡rol y
    //    pin_acceso≡pin, persistimos el email efectivo y NUNCA el password.
    const filaStaff: Record<string, unknown> = {
      ...staff,
      email,
      restaurante_id: tenantCaller,
      puesto: rol,
      pin_acceso: pin,
      auth_id: authId,
      activo: staff.activo !== false,
    };
    delete filaStaff.password;

    const { error: errUpsert } = await admin.from('staff').upsert(filaStaff);
    if (errUpsert) {
      // ROLLBACK: borrar la cuenta recién creada para no dejar huérfano de Auth.
      await admin.auth.admin.deleteUser(authId).catch(() => {});
      const dupPin = /uq_staff_restaurante_pin|duplicate key|23505/i.test(
        errUpsert.message,
      );
      return json(
        {
          error: dupPin
            ? 'Ese PIN ya está en uso por otro empleado.'
            : `No se pudo guardar el empleado: ${errUpsert.message}`,
        },
        400,
      );
    }

    return json({ ok: true, auth_id: authId, email });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
