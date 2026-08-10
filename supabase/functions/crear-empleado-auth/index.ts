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

// (Proyecto L, tanda 3) Los flags 'gestion' (quién administra staff) y
// 'elevado' (contraseña vs PIN) viven en roles_permisos.capacidades; esta
// lista queda como FALLBACK para roles base sin fila todavía.
const ELEVADOS_BASE = ['Admin', 'Gerente'];
// Validación pragmática de correo (suficiente para bloquear vacíos y basura).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Validar que QUIEN llama está autenticado (su propio JWT). Esta función
    //    conserva verify-jwt POR DEFECTO (no es pública): solo gestión.
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

    // 3. Confirmar rol y tenant del caller.
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

    // Flags data-driven del tenant con fallback a la base histórica.
    const capacidadesDe = async (rol: string) => {
      const { data } = await admin
        .from('roles_permisos')
        .select('capacidades')
        .eq('restaurante_id', tenantCaller)
        .eq('rol', rol)
        .maybeSingle();
      return (data?.capacidades ?? null) as Record<string, unknown> | null;
    };
    const flagConFallback = (
      cap: Record<string, unknown> | null,
      flag: string,
      rol: string,
    ) => {
      const v = cap?.[flag];
      return typeof v === 'boolean' ? v : ELEVADOS_BASE.includes(rol);
    };

    const capCaller = await capacidadesDe(rolCaller ?? '');
    if (!flagConFallback(capCaller, 'gestion', rolCaller ?? ''))
      return json(
        { error: 'Tu rol no puede dar de alta empleados.' },
        403,
      );

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

    // 4.5 Fase 1 (enforcement): límite de EMPLEADOS ACTIVOS del plan. El
    //     cliente ya avisa en UX; ESTA es la barrera real (service role).
    //     Se excluye el propio staffId (re-alta del mismo empleado no debe
    //     contar doble) y solo cuenta activos (desactivar libera cupo).
    const { data: sus } = await admin
      .from('suscripciones')
      .select('plan, estado, planes(limites)')
      .eq('restaurante_id', tenantCaller)
      .maybeSingle();
    // Espejo del seed 20260725170733 por si la suscripción no embebe el plan.
    const LIMITE_FALLBACK: Record<string, number> = {
      fundador: 10, basico: 10, pro: 25, empresarial: 60,
    };
    const limiteEmpleados =
      (sus?.planes as { limites?: { empleados?: number } } | null)?.limites
        ?.empleados ?? LIMITE_FALLBACK[sus?.plan ?? ''] ?? 10;
    const { count: activos } = await admin
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('restaurante_id', tenantCaller)
      .neq('id', staffId)
      .not('activo', 'is', false);
    if ((activos ?? 0) >= limiteEmpleados)
      return json(
        {
          error: `Tu plan permite hasta ${limiteEmpleados} empleados activos. Desactiva uno o mejora tu plan.`,
        },
        403,
      );

    // 5. Credencial de la cuenta según el FLAG 'elevado' del rol.
    //    ELEVADOS: entran por CORREO REAL + contraseña en /login.
    //    v3: su cuenta de Auth se crea con staff.email (obligatorio y válido);
    //    antes se creaba con el correo sintético → nadie podía iniciar sesión.
    //    OPERATIVOS: correo sintético estable + password derivado del PIN.
    const esElevado = flagConFallback(await capacidadesDe(rol), 'elevado', rol);
    let authPassword: string;
    let email: string;
    if (esElevado) {
      if (!password || String(password).length < 8)
        return json(
          { error: 'Los roles elevados requieren contraseña de al menos 8 caracteres.' },
          400,
        );
      authPassword = String(password);
      const emailReal = String(staff.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(emailReal))
        return json(
          {
            error:
              'Los roles elevados requieren un correo válido: con él iniciarán sesión.',
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
