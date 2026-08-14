import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Button,
  Chip,
  EmptyState,
  SearchField,
  IconButton,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { getCapacidades, tieneFlag } from '../../lib/Permisos';
import { useAuthStore } from '../auth/useAuthStore';
import { derivarPlan } from '../../hooks/usePlan';
import { supabase } from '../../api/supabase';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Key,
  Lock,
  DollarSign,
  X,
  CheckCircle,
  Loader2,
} from 'lucide-react';

export default function EmpleadosScreen() {
  const { staff, upsertStaff, showToast, registrarAuditoria, roles_permisos } =
    useAppStore();
  const { enqueueAction } = useSyncStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Bloquea doble-submit y muestra spinner durante la creación de la cuenta de Auth.
  const [saving, setSaving] = useState(false);
  // Snapshot al abrir edición: para detectar si cambió el PIN/rol y re-sincronizar
  // la credencial de Auth (editar staff.pin NO actualiza la cuenta por sí solo).
  const [pinOriginal, setPinOriginal] = useState('');
  const [rolOriginal, setRolOriginal] = useState('');
  const [emailOriginal, setEmailOriginal] = useState('');

  // Campo de sueldo = salario_base (nombre real de la columna), para que el
  // valor haga round-trip correcto al editar (antes leía sueldo_base inexistente
  // y borraba el sueldo a 0).
  // password: SOLO para el alta de Admin/Gerente. Nunca se persiste en la tabla staff;
  // viaja únicamente a la Edge Function crear-empleado-auth.
  const initialState = {
    id: '',
    nombre: '',
    rol: 'Mesero',
    email: '',
    telefono: '',
    pin: '',
    salario_base: '',
    tipo_sueldo: 'dia',
    activo: true,
    password: '',
  };

  const [formData, setFormData] = useState(initialState);

  // "Elevados" por FLAG (Proyecto L): entran por contraseña real, no por PIN.
  // Mismo criterio que las EFs (capacidades.elevado con fallback base) — así
  // el form pide contraseña/correo también a roles custom marcados elevados.
  const esElevado = tieneFlag(
    getCapacidades(formData.rol, roles_permisos),
    'elevado',
  );

  // ─── FILTRO DE BÚSQUEDA ──────────────────────────────────────────────────
  const empleadosFiltrados = useMemo(() => {
    if (!searchTerm) return staff || [];
    return (staff || []).filter(
      (emp) =>
        (emp.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.rol || '').toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [staff, searchTerm]);

  // ─── MANEJADORES DEL MODAL ───────────────────────────────────────────────
  const handleOpenModal = (empleado = null) => {
    if (empleado) {
      // Al editar nunca arrastramos password (no existe en la fila staff).
      setFormData({ ...initialState, ...empleado, password: '' });
      setPinOriginal(empleado.pin || '');
      setRolOriginal(empleado.rol || '');
      setEmailOriginal(empleado.email || '');
      setIsEditing(true);
    } else {
      setFormData(initialState);
      setPinOriginal('');
      setRolOriginal('');
      setEmailOriginal('');
      setIsEditing(false);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (saving) return; // no cerrar a media creación de cuenta
    setShowModal(false);
    setFormData(initialState);
  };

  // ─── LÓGICA DE GUARDADO (CON SYNC, AUTH Y AUDITORÍA) ─────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Fase 1 (enforcement): el ALTA respeta el límite de empleados del plan.
    // Solo cuenta staff ACTIVO (desactivar libera cupo). La EF valida de nuevo
    // server-side — esto es UX, no la barrera.
    if (!isEditing) {
      const activos = (staff || []).filter((s) => s.activo !== false).length;
      const { limiteEmpleados, planNombre } = derivarPlan(
        useAuthStore.getState().suscripcion,
      );
      if (activos >= limiteEmpleados) {
        return showToast(
          `Tu plan ${planNombre ?? ''} permite hasta ${limiteEmpleados} empleados activos. Desactiva uno o mejora tu plan en Mi Plan.`,
          'error',
        );
      }
    }

    const pin = formData.pin || '';
    // PIN: el ALTA exige 6 dígitos (mitigación interina anti-fuerza-bruta, handoff).
    // La EDICIÓN tolera 4–6 para no bloquear registros legados con PIN de 4.
    if (!isEditing) {
      if (pin.length !== 6) {
        return showToast(
          'El PIN debe tener exactamente 6 dígitos numéricos',
          'error',
        );
      }
    } else if (pin.length < 4 || pin.length > 6) {
      return showToast(
        'El PIN debe tener entre 4 y 6 dígitos numéricos',
        'error',
      );
    }

    const pinDuplicado = (staff || []).find(
      (s) => s.pin === formData.pin && String(s.id) !== String(formData.id),
    );
    if (pinDuplicado) {
      return showToast(
        'Ese PIN ya está siendo usado por otro empleado',
        'error',
      );
    }

    // CRÍTICO (RLS tenant_staff estricto): sin restaurante_id el insert se rechaza.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId) {
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );
    }

    // Sueldo OBLIGATORIO (base del cálculo de Nóminas): monto > 0 y tipo definido.
    if (!(Number(formData.salario_base) > 0)) {
      return showToast(
        'El sueldo base es obligatorio y debe ser mayor a 0.',
        'error',
      );
    }
    if (!['hora', 'dia', 'turno'].includes(formData.tipo_sueldo)) {
      return showToast(
        'Especifica si el sueldo es por hora, día o turno.',
        'error',
      );
    }

    // Correo REAL obligatorio para Admin/Gerente: es su credencial de login.
    // (El cuello de botella de Beto/Sairi: altas pre-v3 sin correo válido en
    // Auth. Validar aquí evita el 400 tardío de la EF y deja el dato limpio.)
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const emailNormalizado = (formData.email || '').trim().toLowerCase();
    if (esElevado && !EMAIL_RE.test(emailNormalizado)) {
      return showToast(
        'Admin/Gerente requieren un correo válido: con él inician sesión.',
        'error',
      );
    }

    // Contraseña real obligatoria para Admin/Gerente en el ALTA (entran por contraseña).
    if (!isEditing && esElevado && (formData.password || '').length < 8) {
      return showToast(
        'La contraseña de Admin/Gerente debe tener al menos 8 caracteres',
        'error',
      );
    }

    // empleadoGuardar NUNCA debe contener password: no se persiste en la tabla staff.
    const empleadoGuardar = {
      ...formData,
      // id numérico (columna bigint). El 'EMP-...' string fallaba el insert.
      id: isEditing ? formData.id : Date.now(),
      rol: formData.rol,
      // puesto: columna duplicada de rol, ambas NOT NULL + mismo check. Mirror.
      puesto: formData.rol,
      // pin_acceso: columna duplicada de pin. Mirror por si el login operativo la lee.
      pin_acceso: formData.pin,
      email: emailNormalizado,
      salario_base: Number(formData.salario_base) || 0,
      tipo_sueldo: formData.tipo_sueldo || 'dia',
      activo: formData.activo !== false,
      restaurante_id: restauranteId,
    };
    delete empleadoGuardar.password;

    setSaving(true);
    try {
      if (!isEditing) {
        // ── ALTA: crea la cuenta de Supabase Auth del empleado.
        // Requiere conexión: no existe alta de auth offline.
        if (!navigator.onLine) {
          return showToast(
            'Dar de alta requiere conexión: se crea la cuenta de acceso del empleado.',
            'error',
          );
        }

        // 0) Sesión REAL del admin antes de escribir nada. La EF valida el JWT
        //    del caller con getUser() (server-side); si el token está muerto
        //    (espejismo: cache D1 lo disfraza de vivo) tiraría 401 DESPUÉS del
        //    upsert → fila staff huérfana sin login. getUser() pega al servidor
        //    y valida de verdad (getSession() solo lee storage y no lo detecta).
        const {
          data: { user: sesionViva },
          error: errSesion,
        } = await supabase.auth.getUser();
        if (errSesion || !sesionViva) {
          return showToast(
            'Tu sesión expiró. Vuelve a iniciar sesión para dar de alta empleados.',
            'error',
          );
        }

        // Alta vía Edge Function ATÓMICA. La EF es la ÚNICA escritora: valida al
        // caller, crea la cuenta de Auth y hace el upsert de staff con auth_id en
        // una sola operación server-side; si el upsert falla, revierte la cuenta
        // creada. Por eso el cliente NO pre-escribe la fila: o se da de alta todo,
        // o no se escribe nada (cero huérfanos, sin depender de policy de delete).
        const { data: efData, error: efError } =
          await supabase.functions.invoke('crear-empleado-auth', {
            body: {
              // objeto staff completo; la EF fuerza restaurante_id/puesto/pin_acceso/auth_id
              staff: empleadoGuardar,
              // password real solo para Admin/Gerente; operativos lo derivan del PIN
              password: esElevado ? formData.password : undefined,
            },
          });

        if (efError) {
          // supabase-js empaqueta el body de error de la EF en context (no en .message).
          let msg = efError.message;
          try {
            const body = await efError.context?.json?.();
            if (body?.error) msg = body.error;
          } catch {
            /* el body no era JSON; nos quedamos con efError.message */
          }
          // Atómico: si la EF falló, NADA quedó escrito. Reintentar es seguro.
          return showToast(`No se pudo dar de alta: ${msg}`, 'error');
        }

        // Reflejar la fila ya creada (con su auth_id) en el cache local offline-first.
        const authId =
          efData?.auth_id ?? efData?.authId ?? efData?.user?.id ?? null;
        upsertStaff({ ...empleadoGuardar, auth_id: authId });
      } else {
        // ── EDICIÓN: la fila staff se escribe offline-first como siempre. Pero si
        //    cambió la CREDENCIAL (PIN de operativo / contraseña o rol de elevado),
        //    hay que re-sincronizar la cuenta de Auth vía EF; editar staff.pin solo
        //    NO actualiza la cuenta y deja la credencial desincronizada (401 al login).
        const pinCambio = !esElevado && formData.pin !== pinOriginal;
        const rolCambio = formData.rol !== rolOriginal;
        const quiereCambiarPassword =
          esElevado && (formData.password || '').length > 0;
        // El correo es credencial de login de los elevados: cambiarlo exige
        // re-sincronizar la cuenta de Auth (EF v2), igual que PIN/contraseña.
        const emailCambio =
          esElevado &&
          emailNormalizado !== (emailOriginal || '').trim().toLowerCase();
        const credencialCambio =
          pinCambio || rolCambio || quiereCambiarPassword || emailCambio;

        // El cambio de credencial necesita conexión (updateUserById es server-side).
        // Si estamos offline, NO tocamos el PIN en BD para no desincronizar; el resto
        // de la edición sí se guarda. El usuario reintenta el cambio de PIN en línea.
        if (credencialCambio && !navigator.onLine) {
          if (pinCambio) {
            empleadoGuardar.pin = pinOriginal;
            empleadoGuardar.pin_acceso = pinOriginal;
          }
          enqueueAction('staff', 'upsert', empleadoGuardar);
          upsertStaff(empleadoGuardar);
          showToast(
            'Sin conexión: se guardaron los cambios, pero el PIN/contraseña de acceso solo se actualizan en línea. Se conservó el anterior.',
            'info',
          );
          setShowModal(false);
          setFormData(initialState);
          return;
        }

        // Persistir la fila (offline-first) y, si aplica, re-sincronizar la credencial.
        enqueueAction('staff', 'upsert', empleadoGuardar);
        upsertStaff(empleadoGuardar);

        if (credencialCambio) {
          // Validación temprana: cambiar de rol a elevado o querer nueva
          // contraseña exige >=8 chars. Un cambio SOLO de correo no obliga a
          // resetear la contraseña (EF v2 los trata como independientes).
          const exigePassword =
            esElevado && (rolCambio || quiereCambiarPassword);
          if (exigePassword && (formData.password || '').length < 8) {
            return showToast(
              'Define una contraseña de al menos 8 caracteres para el rol Admin/Gerente.',
              'error',
            );
          }
          const { error: credErr } = await supabase.functions.invoke(
            'actualizar-credencial-empleado',
            {
              body: {
                staffId: empleadoGuardar.id,
                rol: empleadoGuardar.rol,
                pin: empleadoGuardar.pin,
                password:
                  esElevado && (formData.password || '').length > 0
                    ? formData.password
                    : undefined,
                email: esElevado && emailCambio ? emailNormalizado : undefined,
              },
            },
          );
          if (credErr) {
            let msg = credErr.message;
            try {
              const b = await credErr.context?.json?.();
              if (b?.error) msg = b.error;
            } catch {
              /* body no-JSON */
            }
            // La fila ya se editó; solo falló la credencial. No cerramos el modal.
            return showToast(
              `Datos actualizados, pero el acceso no: ${msg}`,
              'error',
            );
          }
        }
      }

      registrarAuditoria({
        fecha: new Date().toISOString(),
        usuario: 'Administrador',
        accion: isEditing ? 'EDICIÓN_EMPLEADO' : 'ALTA_EMPLEADO',
        modulo: 'RRHH',
        nivel: 'warning',
        detalles: `Empleado: ${empleadoGuardar.nombre} | Rol: ${empleadoGuardar.rol}`,
      });

      showToast(
        `Empleado ${isEditing ? 'actualizado' : 'registrado'} con éxito`,
        'success',
      );

      setShowModal(false);
      setFormData(initialState);
    } catch (err) {
      showToast(`Error inesperado: ${err?.message || err}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Alternar el booleano "activo" (soft delete / reactivación)
  const handleToggleEstado = (empleado) => {
    const nuevoEstado = !empleado.activo;
    const empleadoActualizado = { ...empleado, activo: nuevoEstado };

    enqueueAction('staff', 'upsert', empleadoActualizado);
    upsertStaff(empleadoActualizado);
    showToast(
      `El empleado ahora está ${nuevoEstado ? 'activo' : 'dado de baja'}`,
      'info',
    );
  };

  // ── Plantilla en tabla ──────────────────────────────────────────────────
  // La plantilla es una LISTA que se compara: quién está activo, con qué rol y
  // con qué contacto. En rejilla de tarjetas, "¿cuántos meseros tengo?" obliga
  // a contar a ojo por toda la pantalla.
  //
  // El PIN nunca se muestra, ni enmascarado con una longitud real: la tarjeta
  // vieja pintaba "••••" fijo, que ya era correcto, pero aquí ni siquiera se
  // insinúa. Se cambia desde el modal.
  const columnas = [
    {
      id: 'empleado',
      titulo: 'Empleado',
      celda: (emp) => (
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-ui flex items-center justify-center font-bold shrink-0 ${
              emp.activo !== false
                ? 'bg-adm-info text-adm-info-fg'
                : 'bg-adm-chip text-adm-chip-fg'
            }`}
          >
            {(emp.nombre || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-adm-ink truncate">{emp.nombre}</p>
            {emp.activo === false && (
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-adm-danger">
                dado de baja
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'rol',
      titulo: 'Rol',
      ancho: '1%',
      celda: (emp) => <Chip tono="neutro">{emp.rol}</Chip>,
    },
    {
      id: 'contacto',
      titulo: 'Contacto',
      celda: (emp) => (
        <div className="text-xs text-adm-muted">
          {emp.telefono && <p>{emp.telefono}</p>}
          {emp.email && <p className="truncate">{emp.email}</p>}
          {!emp.telefono && !emp.email && <p>—</p>}
        </div>
      ),
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'der',
      ancho: '1%',
      celda: (emp) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icono={Edit2}
            titulo="Editar"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(emp);
            }}
          />
          <IconButton
            icono={emp.activo !== false ? Trash2 : CheckCircle}
            titulo={emp.activo !== false ? 'Dar de baja' : 'Reactivar'}
            className={
              emp.activo !== false
                ? 'hover:text-adm-danger'
                : 'hover:text-adm-ok'
            }
            onClick={(e) => {
              e.stopPropagation();
              handleToggleEstado(emp);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icono={Users}
        titulo="Plantilla de Personal"
        descripcion="Accesos, roles y pines operativos"
        scopeAtajos="tabla-empleados"
        acciones={
          <Button icono={Plus} onClick={() => handleOpenModal()}>
            Nuevo empleado
          </Button>
        }
      />

      <SearchField
        icono={Search}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Buscar por nombre o rol…"
        className="mb-4 max-w-md"
      />

      <DataTable
        scope="tabla-empleados"
        titulo="Plantilla"
        columnas={columnas}
        filas={empleadosFiltrados}
        onEditar={handleOpenModal}
        onNuevo={() => handleOpenModal()}
        // Sin onEliminar: aquí no se borra, se da de BAJA (y la baja libera
        // cupo del plan). Un Supr que diera de baja empleados sin confirmar
        // sería un accidente esperando a pasar.
        activo={!showModal}
        vacio={
          <EmptyState
            icono={Users}
            titulo="No se encontraron empleados"
            descripcion="Ajusta la búsqueda o da de alta al primero."
            accion={
              <Button icono={Plus} onClick={() => handleOpenModal()}>
                Nuevo empleado
              </Button>
            }
          />
        }
      />

      {/* ─── MODAL ALTA/EDICIÓN ─── */}
      {showModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel w-full max-w-2xl rounded-ui-lg shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] transition-colors">
            <div className="p-6 border-b border-adm-border flex justify-between items-center bg-adm-bg transition-colors">
              <h2 className="text-xl font-black text-adm-ink flex items-center gap-2">
                {isEditing ? (
                  <Edit2 className="w-5 h-5 text-adm-info" />
                ) : (
                  <Plus className="w-5 h-5 text-adm-info" />
                )}
                {isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}
              </h2>
              <button
                onClick={handleCloseModal}
                disabled={saving}
                className="p-2 bg-white dark:bg-adm-panel rounded-full hover:bg-adm-danger/10 dark:hover:bg-adm-border text-adm-muted transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
                    placeholder="Ej. Carlos Muñoz"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2">
                    Rol Operativo *
                  </label>
                  <select
                    value={formData.rol}
                    onChange={(e) =>
                      setFormData({ ...formData, rol: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info transition-colors cursor-pointer"
                  >
                    {(roles_permisos?.length
                      ? [...roles_permisos].sort((a, b) =>
                          String(a.rol).localeCompare(String(b.rol)),
                        )
                      : [
                          { id: 'Admin', rol: 'Admin' },
                          { id: 'Gerente', rol: 'Gerente' },
                          { id: 'Cajero', rol: 'Cajero' },
                          { id: 'Chef', rol: 'Chef' },
                          { id: 'Barista', rol: 'Barista' },
                          { id: 'Mesero', rol: 'Mesero' },
                        ]
                    ).map((r) => (
                      <option key={r.id} value={r.rol}>
                        {r.rol}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2 flex justify-between">
                    <span>PIN Acceso (Caja/Reloj) *</span>
                    <span className="text-adm-info">
                      {isEditing ? '4 a 6 dígitos' : '6 dígitos'}
                    </span>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                    <input
                      type="password"
                      required
                      maxLength={6}
                      value={formData.pin}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          pin: e.target.value.replace(/\D/g, ''),
                        })
                      }
                      className="w-full pl-12 pr-4 py-3.5 bg-adm-info/50 border-2 border-adm-info/30 rounded-ui font-black text-adm-info outline-none focus:border-adm-info transition-colors tracking-widest"
                      placeholder={isEditing ? 'Ej. 1234' : 'Ej. 123456'}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2">
                    Sueldo Base * (
                    {formData.tipo_sueldo === 'hora'
                      ? 'por hora'
                      : formData.tipo_sueldo === 'turno'
                        ? 'por turno'
                        : 'por día'}
                    )
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salario_base}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          salario_base: e.target.value,
                        })
                      }
                      className="w-full pl-12 pr-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    {[
                      ['hora', 'Por hora'],
                      ['dia', 'Por día'],
                      ['turno', 'Por turno'],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, tipo_sueldo: val })
                        }
                        className={`flex-1 py-2 rounded-ui text-xs font-black border-2 transition-all ${
                          formData.tipo_sueldo === val
                            ? 'border-adm-info bg-adm-info/10 text-adm-info'
                            : 'border-adm-border bg-adm-bg text-adm-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) =>
                      setFormData({ ...formData, telefono: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
                    placeholder="10 dígitos"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2">
                    {esElevado
                      ? 'Correo * (con él inicia sesión)'
                      : 'Correo (Opcional)'}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                {/* ─── CONTRASEÑA DE ACCESO (Admin/Gerente) ─── */}
                {/* Operativos no la ven: su password se deriva del PIN server-side. */}
                {/* Alta: obligatoria. Edición: opcional (vacío = no cambiar); si se */}
                {/* llena, se re-sincroniza la cuenta de Auth vía EF. */}
                {esElevado && (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest px-2 flex justify-between">
                      <span>
                        {isEditing
                          ? 'Nueva Contraseña (Admin/Gerente)'
                          : 'Contraseña de Acceso (Admin/Gerente) *'}
                      </span>
                      <span className="text-adm-info">
                        {isEditing ? 'vacío = no cambiar' : 'mín. 8 caracteres'}
                      </span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-adm-muted" />
                      <input
                        type="password"
                        required={!isEditing}
                        minLength={8}
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        className="w-full pl-12 pr-4 py-3.5 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
                        placeholder={
                          isEditing
                            ? 'Deja vacío para conservar la actual'
                            : 'Contraseña para iniciar sesión'
                        }
                      />
                    </div>
                    <p className="text-[11px] font-bold text-adm-muted px-2 leading-relaxed">
                      Admin y Gerente inician sesión con esta contraseña (no por
                      PIN). El PIN lo usan para operar dentro de la sesión ya
                      iniciada.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-adm-border flex gap-3 transition-colors">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="flex-1 bg-adm-chip dark:bg-adm-bg hover:bg-adm-chip dark:hover:bg-adm-border text-adm-ink font-black py-4 rounded-ui transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-adm-info hover:bg-adm-info disabled:opacity-60 disabled:cursor-not-allowed text-adm-info-fg font-black py-4 rounded-ui active:scale-95 transition-all shadow-lg shadow-adm-info/30 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {isEditing ? 'Guardando...' : 'Creando cuenta...'}
                    </>
                  ) : (
                    'Guardar Empleado'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
