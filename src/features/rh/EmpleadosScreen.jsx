import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { supabase } from '../../api/supabase';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Shield,
  Mail,
  Smartphone,
  Key,
  Lock,
  DollarSign,
  X,
  CheckCircle,
  Loader2,
} from 'lucide-react';

export default function EmpleadosScreen() {
  const { staff, upsertStaff, showToast, registrarAuditoria } = useAppStore();
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

  // Admin/Gerente = "elevados": entran por contraseña real, no por PIN.
  const esElevado = formData.rol === 'Admin' || formData.rol === 'Gerente';

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
        id: Date.now(),
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

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full animate-in fade-in duration-500 flex flex-col transition-colors">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-brand-nacar tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" /> Plantilla de Personal
          </h1>
          <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mt-1 uppercase tracking-widest">
            Gestiona accesos, roles y pines operativos
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-600/30"
        >
          <Plus className="w-5 h-5" /> Nuevo Empleado
        </button>
      </div>

      {/* ─── BUSCADOR ─── */}
      <div className="bg-white dark:bg-ui-humo p-4 rounded-2xl border-2 border-slate-100 dark:border-ui-border shadow-sm mb-6 flex items-center gap-3 transition-colors">
        <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted" />
        <input
          type="text"
          placeholder="Buscar por nombre o rol..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-bold text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted"
        />
      </div>

      {/* ─── GRID DE EMPLEADOS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 overflow-y-auto custom-scrollbar pb-10">
        {empleadosFiltrados.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center text-slate-400 dark:text-ui-muted py-20">
            <Users className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-bold text-lg">No se encontraron empleados</p>
          </div>
        ) : (
          empleadosFiltrados.map((emp) => (
            <div
              key={emp.id}
              className={`bg-white dark:bg-ui-humo rounded-3xl p-6 border-2 border-slate-100 dark:border-ui-border shadow-sm hover:border-indigo-300 dark:hover:border-brand-amatista transition-colors group ${emp.activo === false ? 'opacity-75' : ''}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-inner ${emp.activo !== false ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-ui-obsidiana'}`}
                  >
                    {(emp.nombre || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-brand-nacar text-lg leading-tight line-clamp-1">
                      {emp.nombre}
                    </h3>
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-500 dark:text-brand-amatista flex items-center gap-1 mt-1">
                      <Shield className="w-3 h-3" /> {emp.rol}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6 bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border transition-colors">
                <div className="flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-brand-nacar">
                  <Key className="w-4 h-4 text-slate-400 dark:text-ui-muted" />{' '}
                  PIN:{' '}
                  <span className="text-slate-900 dark:text-brand-nacar tracking-widest bg-white dark:bg-ui-humo px-2 py-0.5 rounded-md border border-slate-200 dark:border-ui-border">
                    ••••
                  </span>
                </div>
                {emp.telefono && (
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-brand-nacar">
                    <Smartphone className="w-4 h-4 text-slate-400 dark:text-ui-muted" />{' '}
                    {emp.telefono}
                  </div>
                )}
                {emp.email && (
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-600 dark:text-brand-nacar line-clamp-1">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-ui-muted" />{' '}
                    {emp.email}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(emp)}
                  className="flex-1 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-700 dark:text-brand-nacar font-black py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Edit2 className="w-4 h-4" /> Editar
                </button>
                <button
                  onClick={() => handleToggleEstado(emp)}
                  className={`flex-1 font-black py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors border-2 ${
                    emp.activo !== false
                      ? 'border-rose-100 dark:border-brand-arrecife/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-brand-arrecife/10'
                      : 'border-emerald-100 dark:border-brand-cesped/30 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-brand-cesped/10'
                  }`}
                >
                  {emp.activo !== false ? (
                    <Trash2 className="w-4 h-4" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {emp.activo !== false ? 'Baja' : 'Reactivar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── MODAL ALTA/EDICIÓN ─── */}
      {showModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
            <div className="p-6 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana transition-colors">
              <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                {isEditing ? (
                  <Edit2 className="w-5 h-5 text-indigo-500" />
                ) : (
                  <Plus className="w-5 h-5 text-indigo-500" />
                )}
                {isEditing ? 'Editar Empleado' : 'Nuevo Empleado'}
              </h2>
              <button
                onClick={handleCloseModal}
                disabled={saving}
                className="p-2 bg-white dark:bg-ui-humo rounded-full hover:bg-rose-50 dark:hover:bg-ui-border text-slate-400 dark:text-ui-muted transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                    placeholder="Ej. Carlos Muñoz"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
                    Rol Operativo *
                  </label>
                  <select
                    value={formData.rol}
                    onChange={(e) =>
                      setFormData({ ...formData, rol: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    <option value="Admin">Administrador</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Cajero">Cajero</option>
                    <option value="Chef">Cocinero</option>
                    <option value="Barista">Barista</option>
                    <option value="Mesero">Mesero</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2 flex justify-between">
                    <span>PIN Acceso (Caja/Reloj) *</span>
                    <span className="text-indigo-500 dark:text-brand-amatista">
                      {isEditing ? '4 a 6 dígitos' : '6 dígitos'}
                    </span>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-ui-muted" />
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
                      className="w-full pl-12 pr-4 py-3.5 bg-indigo-50/50 dark:bg-brand-amatista/10 border-2 border-indigo-100 dark:border-brand-amatista/30 rounded-2xl font-black text-indigo-700 dark:text-brand-amatista outline-none focus:border-indigo-500 transition-colors tracking-widest"
                      placeholder={isEditing ? 'Ej. 1234' : 'Ej. 123456'}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
                    Sueldo Base * (
                    {formData.tipo_sueldo === 'hora'
                      ? 'por hora'
                      : formData.tipo_sueldo === 'turno'
                        ? 'por turno'
                        : 'por día'}
                    )
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-ui-muted" />
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
                      className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
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
                        className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${
                          formData.tipo_sueldo === val
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-brand-amatista/10 dark:border-brand-amatista dark:text-brand-amatista'
                            : 'border-slate-100 bg-slate-50 text-slate-400 dark:border-ui-border dark:bg-ui-obsidiana dark:text-ui-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) =>
                      setFormData({ ...formData, telefono: e.target.value })
                    }
                    className="w-full px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                    placeholder="10 dígitos"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">
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
                    className="w-full px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                {/* ─── CONTRASEÑA DE ACCESO (Admin/Gerente) ─── */}
                {/* Operativos no la ven: su password se deriva del PIN server-side. */}
                {/* Alta: obligatoria. Edición: opcional (vacío = no cambiar); si se */}
                {/* llena, se re-sincroniza la cuenta de Auth vía EF. */}
                {esElevado && (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2 flex justify-between">
                      <span>
                        {isEditing
                          ? 'Nueva Contraseña (Admin/Gerente)'
                          : 'Contraseña de Acceso (Admin/Gerente) *'}
                      </span>
                      <span className="text-indigo-500 dark:text-brand-amatista">
                        {isEditing ? 'vacío = no cambiar' : 'mín. 8 caracteres'}
                      </span>
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-ui-muted" />
                      <input
                        type="password"
                        required={!isEditing}
                        minLength={8}
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                        placeholder={
                          isEditing
                            ? 'Deja vacío para conservar la actual'
                            : 'Contraseña para iniciar sesión'
                        }
                      />
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 dark:text-ui-muted px-2 leading-relaxed">
                      Admin y Gerente inician sesión con esta contraseña (no por
                      PIN). El PIN lo usan para operar dentro de la sesión ya
                      iniciada.
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-ui-border flex gap-3 transition-colors">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="flex-1 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-700 dark:text-brand-nacar font-black py-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl active:scale-95 transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
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
    </div>
  );
}
