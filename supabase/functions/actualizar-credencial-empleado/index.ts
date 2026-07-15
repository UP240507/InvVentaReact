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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Caller autenticado (verify-jwt por defecto: solo Admin/Gerente).
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: quienLlama },
      error: errCaller,
    } = await caller.auth.getUser();
    if (errCaller || !quienLlama) return json({ error: 'No autenticado.' }, 401);

    // 2. Service role.
    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Rol + tenant del caller.
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
        { error: 'Solo Admin o Gerente pueden actualizar credenciales.' },
        403,
      );
    if (!tenantCaller)
      return json({ error: 'No se pudo resolver tu restaurante.' }, 403);

    // 4. Datos. rol opcional (si no llega, se usa el de la fila staff).
    //    v2: email opcional — SOLO aplica a elevados (los operativos conservan
    //    su correo sintetico estable, es su ancla de login por PIN).
    const { staffId, rol, pin, password, email } = await req.json();
    if (!staffId) return json({ error: 'Falta staffId.' }, 400);

    // 5. Localizar al empleado EN EL TENANT del caller y traer su auth_id.
    const { data: emp } = await admin
      .from('staff')
      .select('id, rol, auth_id, email')
      .eq('id', staffId)
      .eq('restaurante_id', tenantCaller)
      .maybeSingle();
    if (!emp)
      return json({ error: 'Empleado no encontrado en tu restaurante.' }, 404);
    if (!emp.auth_id)
      return json(
        {
          error:
            'El empleado no tiene cuenta de acceso. Vuelve a darlo de alta para crearla.',
        },
        409,
      );

    // 6. Construir la actualizacion segun el rol efectivo.
    const rolEfectivo = (rol ?? emp.rol) as string;
    const esElevado = ELEVADOS.includes(rolEfectivo);

    const cambios: Record<string, unknown> = {
      user_metadata: { rol: rolEfectivo, staff_id: emp.id },
    };
    let emailNuevo: string | null = null;

    if (esElevado) {
      // v2: email y password son INDEPENDIENTES. Cambiar solo el correo no
      // obliga a resetear la contrasena (caso: altas pre-v3 sin correo real).
      if (email != null && String(email).trim() !== '') {
        const e = String(email).trim().toLowerCase();
        if (!EMAIL_RE.test(e))
          return json({ error: 'El correo no es valido.' }, 400);
        emailNuevo = e;
        cambios.email = e;
        cambios.email_confirm = true;
      }
      if (password != null && String(password) !== '') {
        if (String(password).length < 8)
          return json(
            {
              error:
                'Admin/Gerente requieren contrasena de al menos 8 caracteres.',
            },
            400,
          );
        cambios.password = String(password);
      }
      if (!cambios.email && !cambios.password)
        return json(
          { error: 'Nada que actualizar: manda correo y/o contrasena.' },
          400,
        );
    } else {
      if (!pin)
        return json({ error: 'Falta el PIN para derivar la credencial.' }, 400);
      // DEBE coincidir con login-pin: usa el id REAL de la fila (emp.id).
      cambios.password = `pin.${pin}.${emp.id}`;
    }

    // 7. Actualizar la cuenta de Auth.
    const { error: errUpd } = await admin.auth.admin.updateUserById(
      emp.auth_id,
      cambios,
    );
    if (errUpd) {
      const dupEmail = /already.*(registered|exists)|duplicate/i.test(
        errUpd.message,
      );
      return json(
        {
          error: dupEmail
            ? `El correo ${emailNuevo} ya tiene una cuenta. Usa otro.`
            : `No se pudo actualizar la credencial: ${errUpd.message}`,
        },
        400,
      );
    }

    // 8. Espejar el correo efectivo en staff (consistencia servidor-side; el
    //    cliente tambien lo escribe, pero esto garantiza que nunca diverjan).
    if (emailNuevo) {
      await admin
        .from('staff')
        .update({ email: emailNuevo })
        .eq('id', emp.id)
        .eq('restaurante_id', tenantCaller);
    }

    return json({
      ok: true,
      auth_id: emp.auth_id,
      email: emailNuevo ?? emp.email,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
