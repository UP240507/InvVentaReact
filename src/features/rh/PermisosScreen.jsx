import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { CAPACIDADES_BASE } from '../../lib/Permisos';
import {
  ShieldCheck,
  Lock,
  MonitorPlay,
  LayoutGrid,
  ChefHat,
  Package,
  BookOpen,
  Users,
  Banknote,
  LineChart,
  Settings,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  Copy,
  X,
  Compass,
  SlidersHorizontal,
} from 'lucide-react';

// ─── PERMISOS v2 (Proyecto L, tanda 4): ROLES LIBRES ──────────────────────────
// roles_permisos es la fuente única: el tenant crea/renombra/duplica/borra
// roles y edita sus CAPACIDADES (las que leen los guards y las EFs).
// La FK staff.rol → roles_permisos hace el trabajo sucio en el server:
// renombrar propaga a staff (ON UPDATE CASCADE) y borrar un rol con empleados
// se rechaza (ON DELETE RESTRICT). El array `permisos` (módulos) se conserva.

const MODULOS_SISTEMA = [
  {
    id: 'POS',
    nombre: 'Punto de Venta',
    icono: MonitorPlay,
    desc: 'Cobro, apertura de caja y toma de pedidos',
  },
  {
    id: 'Mesas',
    nombre: 'Mapa de Mesas',
    icono: LayoutGrid,
    desc: 'Gestión de zonas y asignación de cuentas',
  },
  {
    id: 'Comandas',
    nombre: 'Monitor KDS (Cocina)',
    icono: ChefHat,
    desc: 'Ver, preparar y despachar platillos',
  },
  {
    id: 'Inventario',
    nombre: 'Inventario y Compras',
    icono: Package,
    desc: 'Stock, órdenes de compra y proveedores',
  },
  {
    id: 'Menu',
    nombre: 'Ingeniería de Menú',
    icono: BookOpen,
    desc: 'Gestión de recetas, modificadores y costos',
  },
  {
    id: 'Staff',
    nombre: 'Directorio de Staff',
    icono: Users,
    desc: 'Altas, bajas y perfiles de empleados',
  },
  {
    id: 'Nominas',
    nombre: 'Nóminas y Pagos',
    icono: Banknote,
    desc: 'Cálculo de sueldos y dispersión de propinas',
  },
  {
    id: 'Reportes',
    nombre: 'Análisis y Reportes',
    icono: LineChart,
    desc: 'Métricas de ventas, cortes y rentabilidad',
  },
  {
    id: 'Configuracion',
    nombre: 'Ajustes del Sistema',
    icono: Settings,
    desc: 'Zonas, impresoras, IVA y catálogos base',
  },
];

const RUTAS_SISTEMA = [
  { slug: 'dashboard', nombre: 'Dashboard' },
  { slug: 'mesas', nombre: 'Mapa de Mesas' },
  { slug: 'pos', nombre: 'Punto de Venta' },
  { slug: 'kds', nombre: 'Monitor KDS' },
  { slug: 'propinas', nombre: 'Propinas' },
  { slug: 'ingredientes', nombre: 'Ingredientes' },
  { slug: 'compras', nombre: 'Compras' },
  { slug: 'recepcion', nombre: 'Recepción' },
  { slug: 'mermas', nombre: 'Mermas' },
  { slug: 'proveedores', nombre: 'Proveedores' },
  { slug: 'empleados', nombre: 'Empleados' },
  { slug: 'asistencias', nombre: 'Asistencias' },
  { slug: 'nominas', nombre: 'Nóminas' },
  { slug: 'permisos', nombre: 'Permisos' },
  { slug: 'clientes', nombre: 'Clientes' },
  { slug: 'reportes', nombre: 'Reportes' },
  { slug: 'facturas', nombre: 'Facturas' },
  { slug: 'zonas-produccion', nombre: 'Zonas de Impresión' },
  { slug: 'auditoria', nombre: 'Auditoría' },
  { slug: 'configuracion', nombre: 'Configuración' },
  { slug: 'perfil', nombre: 'Perfil' },
  { slug: 'mi-plan', nombre: 'Mi Plan' },
];

const FLAGS_SISTEMA = [
  {
    id: 'elevado',
    nombre: 'Acceso elevado',
    desc: 'Inicia sesión con correo y contraseña (no con PIN)',
  },
  {
    id: 'gestion',
    nombre: 'Gestión',
    desc: 'Entra al panel de administración y da de alta empleados',
  },
  {
    id: 'autoriza_descuentos',
    nombre: 'Autoriza descuentos',
    desc: 'Su sesión o su PIN autorizan descuentos en el cobro',
  },
  {
    id: 'abre_caja',
    nombre: 'Abre y cierra caja',
    desc: 'Puede abrir el turno desde Espera y hacer el corte',
  },
  {
    id: 'autoriza_salidas',
    nombre: 'Autoriza salidas',
    desc: 'Su PIN autoriza salidas anticipadas en el checador',
  },
  {
    id: 'exento_jornada',
    nombre: 'Exento de jornada',
    desc: 'Sale sin cumplir las horas mínimas de jornada',
  },
  {
    id: 'exento_turno',
    nombre: 'Exento de turno',
    desc: 'Navega el sistema aunque la caja esté cerrada',
  },
  {
    id: 'admin_config',
    nombre: 'Configuración sensible',
    desc: 'Edita jornada, lealtad y ajustes críticos',
  },
];

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function PermisosScreen() {
  const { roles_permisos, staff, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const roles = useMemo(
    () =>
      [...(roles_permisos || [])].sort((a, b) => {
        const sa = a?.capacidades?.es_sistema ? 0 : 1;
        const sb = b?.capacidades?.es_sistema ? 0 : 1;
        return sa - sb || String(a.rol).localeCompare(String(b.rol));
      }),
    [roles_permisos],
  );

  const [rolActivoId, setRolActivoId] = useState(null);
  const fila = roles.find((r) => String(r.id) === String(rolActivoId)) || roles[0];
  const rolActivo = fila?.rol || '';
  const esSistema = fila?.capacidades?.es_sistema === true;
  const cap = useMemo(
    () =>
      fila?.capacidades && typeof fila.capacidades === 'object'
        ? fila.capacidades
        : { ...CAPACIDADES_BASE.Mesero },
    [fila],
  );
  const permisosActuales = useMemo(() => {
    try {
      if (!fila) return [];
      if (typeof fila.permisos === 'string') return JSON.parse(fila.permisos);
      return fila.permisos || [];
    } catch {
      return [];
    }
  }, [fila]);

  const empleadosConRol = useMemo(
    () =>
      (staff || []).filter((s) => (s.rol || s.puesto) === rolActivo).length,
    [staff, rolActivo],
  );

  // Modales propios (window.confirm VETADO)
  const [modalNuevo, setModalNuevo] = useState(null); // {nombre, copiarDeId}
  const [modalRenombrar, setModalRenombrar] = useState(null); // {nombre}
  const [modalEliminar, setModalEliminar] = useState(false);

  const nombreDuplicado = (nombre, exceptoId = null) =>
    (roles_permisos || []).some(
      (r) =>
        String(r.id) !== String(exceptoId) &&
        String(r.rol).trim().toLowerCase() === nombre.trim().toLowerCase(),
    );

  // ── Persistencia (patrón de la cola: optimista en RAM + enqueue) ───────────
  const guardarFila = (payload) => {
    useAppStore.setState((prev) => ({
      roles_permisos: [
        payload,
        ...(prev.roles_permisos || []).filter(
          (r) => String(r.id) !== String(payload.id),
        ),
      ],
    }));
    enqueueAction('roles_permisos', 'upsert', payload);
  };

  const actualizarActivo = (cambios) => {
    if (!fila) return;
    guardarFila({
      id: fila.id,
      rol: fila.rol,
      permisos: permisosActuales,
      capacidades: { ...cap },
      restaurante_id:
        fila.restaurante_id || useAuthStore.getState().restauranteId,
      ...cambios,
    });
  };

  const toggleFlag = (flagId) => {
    if (esSistema) return; // Admin es intocable
    actualizarActivo({ capacidades: { ...cap, [flagId]: cap[flagId] !== true } });
  };

  const toggleRuta = (slug) => {
    if (esSistema) return;
    // Comodín '*' (rol copiado de Admin): expandir a la lista completa antes
    // de tocar — si no, el asterisco seguiría forzando acceso total.
    let rutas = Array.isArray(cap.rutas) ? [...cap.rutas] : [];
    if (rutas.includes('*')) rutas = RUTAS_SISTEMA.map((r) => r.slug);
    const idx = rutas.indexOf(slug);
    if (idx >= 0) rutas.splice(idx, 1);
    else rutas.push(slug);
    const nuevas = { ...cap, rutas };
    // Si la ruta inicial quedó fuera de la lista, recolocarla.
    const inicialSlug = String(cap.ruta_inicial || '').replace(/^\//, '');
    if (!rutas.includes(inicialSlug) && !rutas.includes('*')) {
      nuevas.ruta_inicial = rutas.length ? `/${rutas[0]}` : '/perfil';
    }
    actualizarActivo({ capacidades: nuevas });
  };

  const setRutaInicial = (slug) => {
    if (esSistema) return;
    actualizarActivo({ capacidades: { ...cap, ruta_inicial: `/${slug}` } });
  };

  const togglePermiso = (moduloId) => {
    if (esSistema) return;
    // Comodín 'TODO' (rol copiado de Admin): expandir a módulos concretos
    // antes de tocar — el bug era que 'TODO' forzaba todo ON aunque el click
    // sí encolara cambios (toast sin movimiento visual).
    const base = permisosActuales.includes('TODO')
      ? MODULOS_SISTEMA.map((m) => m.id)
      : permisosActuales;
    const nuevos = base.includes(moduloId)
      ? base.filter((id) => id !== moduloId)
      : [...base, moduloId];
    actualizarActivo({ permisos: nuevos });
  };

  // ── CRUD de roles ──────────────────────────────────────────────────────────
  const crearRol = () => {
    const nombre = String(modalNuevo?.nombre || '').trim();
    if (!nombre) return showToast('Ponle nombre al rol.', 'error');
    if (nombreDuplicado(nombre))
      return showToast('Ya existe un rol con ese nombre.', 'error');
    const base = (roles_permisos || []).find(
      (r) => String(r.id) === String(modalNuevo?.copiarDeId),
    );
    const capBase =
      base?.capacidades && typeof base.capacidades === 'object'
        ? base.capacidades
        : CAPACIDADES_BASE.Mesero;
    // Expandir comodines al copiar (p.ej. de Admin): un rol nuevo NUNCA nace
    // con '*'/'TODO' — nacen editables con la lista concreta equivalente.
    const rutasBase = Array.isArray(capBase.rutas) ? capBase.rutas : [];
    const rutasNuevas = rutasBase.includes('*')
      ? RUTAS_SISTEMA.map((r) => r.slug)
      : [...rutasBase];
    const permisosBase = base ? [...(base.permisos || [])] : ['Mesas'];
    const permisosNuevos = permisosBase.includes('TODO')
      ? MODULOS_SISTEMA.map((m) => m.id)
      : permisosBase;
    const payload = {
      id: uuid(),
      rol: nombre,
      permisos: permisosNuevos,
      capacidades: { ...capBase, rutas: rutasNuevas, es_sistema: false },
      restaurante_id: useAuthStore.getState().restauranteId,
    };
    guardarFila(payload);
    setRolActivoId(payload.id);
    setModalNuevo(null);
    showToast(`Rol "${nombre}" creado.`, 'success');
  };

  const renombrarRol = () => {
    const nombre = String(modalRenombrar?.nombre || '').trim();
    if (!fila || esSistema) return;
    if (!nombre) return showToast('El nombre no puede quedar vacío.', 'error');
    if (nombreDuplicado(nombre, fila.id))
      return showToast('Ya existe un rol con ese nombre.', 'error');
    actualizarActivo({ rol: nombre });
    setModalRenombrar(null);
    showToast(
      'Rol renombrado. Los empleados asignados se actualizan solos al sincronizar.',
      'success',
    );
  };

  const eliminarRol = () => {
    if (!fila || esSistema || empleadosConRol > 0) return;
    useAppStore.setState((prev) => ({
      roles_permisos: (prev.roles_permisos || []).filter(
        (r) => String(r.id) !== String(fila.id),
      ),
    }));
    enqueueAction('roles_permisos', 'delete', { id: fila.id });
    setModalEliminar(false);
    setRolActivoId(null);
    showToast(`Rol "${rolActivo}" eliminado.`, 'success');
  };

  const rutasDelRol = Array.isArray(cap.rutas) ? cap.rutas : [];
  const accesoTotal = rutasDelRol.includes('*');
  const inicialSlug = String(cap.ruta_inicial || '').replace(/^\//, '');

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-500 transition-colors">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-8 rounded-[2.5rem] border border-slate-200 dark:border-ui-border shadow-xl shadow-slate-200/50 dark:shadow-none mb-8 relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 p-12 bg-amber-50 dark:bg-brand-ambar/5 rounded-full -mr-12 -mt-12 opacity-50" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-amber-500 p-4 rounded-3xl shadow-lg shadow-amber-500/40 text-ui-obsidiana">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-brand-nacar tracking-tight">
              Matriz de Seguridad
            </h1>
            <p className="text-slate-500 dark:text-ui-muted font-bold mt-1 flex items-center gap-2">
              <Lock className="w-4 h-4" /> Roles y capacidades del restaurante
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalNuevo({ nombre: '', copiarDeId: fila?.id })}
          className="relative z-10 bg-amber-500 hover:bg-amber-400 text-ui-obsidiana px-6 py-4 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-amber-500/30 transition-colors"
        >
          <Plus className="w-5 h-5" /> Nuevo Rol
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 overflow-hidden">
        {/* PANEL IZQUIERDO: LISTA DE ROLES (VIVA) */}
        <div className="w-full lg:w-1/3 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-50 dark:border-ui-border shadow-sm p-6 flex flex-col h-full overflow-y-auto custom-scrollbar transition-colors">
          <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-6 px-2">
            Roles del restaurante
          </h3>
          <div className="space-y-3">
            {roles.map((r) => {
              const isActivo = String(r.id) === String(fila?.id);
              const esRoot = r?.capacidades?.es_sistema === true;
              return (
                <button
                  key={r.id}
                  onClick={() => setRolActivoId(r.id)}
                  className={`w-full text-left px-6 py-5 rounded-2xl font-black transition-all border-2 flex justify-between items-center ${
                    isActivo
                      ? 'bg-amber-50 dark:bg-brand-ambar/10 border-amber-500 text-amber-700 dark:text-brand-ambar shadow-md scale-100'
                      : 'bg-slate-50 dark:bg-ui-obsidiana border-transparent text-slate-600 dark:text-brand-nacar hover:bg-slate-100 dark:hover:bg-ui-border hover:scale-[0.98]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {esRoot && (
                      <ShieldCheck
                        className={`w-5 h-5 ${isActivo ? 'text-amber-500' : 'text-slate-400 dark:text-ui-muted'}`}
                      />
                    )}
                    {r.rol}
                  </span>
                  {isActivo && (
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* PANEL DERECHO: EDITOR DEL ROL */}
        <div className="w-full lg:w-2/3 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-50 dark:border-ui-border shadow-sm flex flex-col h-full overflow-hidden transition-colors">
          <div className="p-8 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50/50 dark:bg-ui-obsidiana/50">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
                {rolActivo || 'Sin roles'}
              </h2>
              <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mt-1">
                {empleadosConRol} empleado{empleadosConRol === 1 ? '' : 's'} con
                este rol
              </p>
            </div>
            <div className="flex items-center gap-2">
              {esSistema ? (
                <div className="bg-rose-50 dark:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border border-rose-100 dark:border-brand-arrecife/30">
                  <AlertTriangle className="w-4 h-4" /> Root Access
                </div>
              ) : (
                fila && (
                  <>
                    <button
                      onClick={() => setModalRenombrar({ nombre: rolActivo })}
                      title="Renombrar rol"
                      className="p-3 rounded-xl bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted hover:text-amber-600 dark:hover:text-brand-ambar transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        setModalNuevo({
                          nombre: `${rolActivo} (copia)`,
                          copiarDeId: fila.id,
                        })
                      }
                      title="Duplicar rol"
                      className="p-3 rounded-xl bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted hover:text-amber-600 dark:hover:text-brand-ambar transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => empleadosConRol === 0 && setModalEliminar(true)}
                      disabled={empleadosConRol > 0}
                      title={
                        empleadosConRol > 0
                          ? 'No se puede eliminar: hay empleados con este rol'
                          : 'Eliminar rol'
                      }
                      className={`p-3 rounded-xl transition-colors ${
                        empleadosConRol > 0
                          ? 'bg-slate-50 dark:bg-ui-obsidiana text-slate-300 dark:text-ui-border cursor-not-allowed'
                          : 'bg-rose-50 dark:bg-brand-arrecife/10 text-rose-500 dark:text-brand-arrecife hover:bg-rose-100'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
            {/* CAPACIDADES */}
            <section>
              <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Capacidades
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FLAGS_SISTEMA.map((f) => {
                  const activo = esSistema || cap[f.id] === true;
                  return (
                    <div
                      key={f.id}
                      onClick={() => toggleFlag(f.id)}
                      className={`p-4 rounded-2xl border-2 flex items-center justify-between gap-3 transition-all ${
                        esSistema
                          ? 'opacity-70 cursor-not-allowed border-slate-100 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana'
                          : 'cursor-pointer hover:border-slate-200 dark:hover:border-ui-muted border-slate-50 dark:border-ui-obsidiana bg-white dark:bg-ui-obsidiana'
                      } ${activo && !esSistema ? 'border-amber-100 dark:border-brand-ambar/30 bg-amber-50/30 dark:bg-brand-ambar/10' : ''}`}
                    >
                      <div>
                        <h4
                          className={`font-black text-sm ${activo ? 'text-slate-900 dark:text-brand-nacar' : 'text-slate-500 dark:text-ui-muted'}`}
                        >
                          {f.nombre}
                        </h4>
                        <p className="text-[11px] font-bold text-slate-400 dark:text-ui-muted mt-0.5">
                          {f.desc}
                        </p>
                      </div>
                      <div
                        className={`w-12 h-7 shrink-0 rounded-full relative transition-colors duration-300 ${activo ? 'bg-amber-500' : 'bg-slate-200 dark:bg-ui-border'}`}
                      >
                        <div
                          className={`absolute top-1 bg-white dark:bg-brand-nacar w-5 h-5 rounded-full shadow-sm transition-all duration-300 ${activo ? 'left-6' : 'left-1'}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* RUTAS */}
            <section>
              <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                <Compass className="w-4 h-4" /> Pantallas permitidas
              </h3>
              {esSistema ? (
                <p className="text-sm font-bold text-slate-500 dark:text-ui-muted bg-slate-50 dark:bg-ui-obsidiana rounded-2xl p-4">
                  Este rol tiene acceso a TODAS las pantallas.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {RUTAS_SISTEMA.map((r) => {
                      const activo =
                        accesoTotal || rutasDelRol.includes(r.slug);
                      return (
                        <button
                          key={r.slug}
                          onClick={() => toggleRuta(r.slug)}
                          className={`px-4 py-3 rounded-xl text-xs font-black text-left transition-all border-2 ${
                            activo
                              ? 'bg-amber-50 dark:bg-brand-ambar/10 border-amber-400 text-amber-700 dark:text-brand-ambar'
                              : 'bg-slate-50 dark:bg-ui-obsidiana border-transparent text-slate-500 dark:text-ui-muted hover:border-slate-200'
                          }`}
                        >
                          {r.nombre}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                      Pantalla inicial:
                    </span>
                    <select
                      value={inicialSlug}
                      onChange={(e) => setRutaInicial(e.target.value)}
                      className="px-4 py-2 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-xl font-bold text-sm text-slate-900 dark:text-brand-nacar outline-none cursor-pointer"
                    >
                      {rutasDelRol.map((slug) => (
                        <option key={slug} value={slug}>
                          {RUTAS_SISTEMA.find((r) => r.slug === slug)?.nombre ||
                            slug}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </section>

            {/* MÓDULOS (LEGADO) */}
            <section>
              <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-4">
                Módulos operativos
              </h3>
              <div className="space-y-3">
                {MODULOS_SISTEMA.map((modulo) => {
                  const Icono = modulo.icono;
                  const tieneAcceso =
                    permisosActuales.includes('TODO') ||
                    permisosActuales.includes(modulo.id);
                  return (
                    <div
                      key={modulo.id}
                      onClick={() => togglePermiso(modulo.id)}
                      className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
                        esSistema
                          ? 'opacity-70 cursor-not-allowed border-slate-100 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana'
                          : 'cursor-pointer hover:border-slate-200 dark:hover:border-ui-muted border-slate-50 dark:border-ui-obsidiana bg-white dark:bg-ui-obsidiana'
                      } ${tieneAcceso && !esSistema ? 'border-amber-100 dark:border-brand-ambar/30 bg-amber-50/30 dark:bg-brand-ambar/10' : ''}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-2.5 rounded-xl transition-colors ${tieneAcceso ? 'bg-amber-500 text-ui-obsidiana shadow-lg shadow-amber-500/30' : 'bg-slate-100 dark:bg-ui-humo text-slate-400 dark:text-ui-muted'}`}
                        >
                          <Icono className="w-5 h-5" />
                        </div>
                        <div>
                          <h4
                            className={`font-black ${tieneAcceso ? 'text-slate-900 dark:text-brand-nacar' : 'text-slate-500 dark:text-ui-muted'}`}
                          >
                            {modulo.nombre}
                          </h4>
                          <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-0.5">
                            {modulo.desc}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-14 h-8 shrink-0 rounded-full relative transition-colors duration-300 ${tieneAcceso ? 'bg-amber-500' : 'bg-slate-200 dark:bg-ui-border'}`}
                      >
                        <div
                          className={`absolute top-1 bg-white dark:bg-brand-nacar w-6 h-6 rounded-full shadow-sm transition-all duration-300 ${tieneAcceso ? 'left-7' : 'left-1'}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="p-6 bg-slate-900 dark:bg-ui-obsidiana shadow-[0_-10px_30px_rgba(0,0,0,0.1)] flex justify-between items-center z-10 relative border-t dark:border-ui-border transition-colors">
            <p className="text-slate-400 dark:text-ui-muted text-xs font-bold w-2/3">
              Los cambios se guardan y sincronizan automáticamente y toman
              efecto en el siguiente inicio de sesión. Renombrar un rol
              reasigna a sus empleados en automático.
            </p>
            <div className="bg-brand-cesped/20 text-brand-cesped px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-brand-cesped/30">
              <Save className="w-4 h-4" /> Auto-Guardado
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: NUEVO / DUPLICAR ROL */}
      {modalNuevo && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] p-8 w-full max-w-md shadow-2xl border dark:border-ui-border">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-brand-nacar">
                Nuevo rol
              </h3>
              <button
                onClick={() => setModalNuevo(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-1">
              Nombre del rol *
            </label>
            <input
              autoFocus
              value={modalNuevo.nombre}
              onChange={(e) =>
                setModalNuevo({ ...modalNuevo, nombre: e.target.value })
              }
              onKeyDown={(e) => e.key === 'Enter' && crearRol()}
              placeholder="Ej. Capitán de Meseros"
              className="w-full mt-1 mb-4 px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-amber-500 transition-colors"
            />
            <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-1">
              Copiar capacidades de
            </label>
            <select
              value={modalNuevo.copiarDeId || ''}
              onChange={(e) =>
                setModalNuevo({ ...modalNuevo, copiarDeId: e.target.value })
              }
              className="w-full mt-1 mb-6 px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none cursor-pointer"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rol}
                </option>
              ))}
            </select>
            <button
              onClick={crearRol}
              className="w-full bg-amber-500 hover:bg-amber-400 text-ui-obsidiana py-4 rounded-2xl font-black transition-colors"
            >
              Crear rol
            </button>
          </div>
        </div>
      )}

      {/* MODAL: RENOMBRAR */}
      {modalRenombrar && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] p-8 w-full max-w-md shadow-2xl border dark:border-ui-border">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-brand-nacar">
                Renombrar "{rolActivo}"
              </h3>
              <button
                onClick={() => setModalRenombrar(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              autoFocus
              value={modalRenombrar.nombre}
              onChange={(e) => setModalRenombrar({ nombre: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && renombrarRol()}
              className="w-full mb-3 px-4 py-3.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-amber-500 transition-colors"
            />
            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mb-6">
              Los {empleadosConRol} empleado{empleadosConRol === 1 ? '' : 's'}{' '}
              con este rol se reasignan automáticamente al nuevo nombre.
            </p>
            <button
              onClick={renombrarRol}
              className="w-full bg-amber-500 hover:bg-amber-400 text-ui-obsidiana py-4 rounded-2xl font-black transition-colors"
            >
              Renombrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL: ELIMINAR */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] p-8 w-full max-w-md shadow-2xl border dark:border-ui-border">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-rose-100 dark:bg-brand-arrecife/10 p-3 rounded-2xl text-rose-500 dark:text-brand-arrecife">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-brand-nacar">
                ¿Eliminar "{rolActivo}"?
              </h3>
            </div>
            <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mb-6">
              Esta acción no se puede deshacer. Nadie tiene este rol asignado,
              así que es seguro eliminarlo.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setModalEliminar(false)}
                className="flex-1 bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-brand-nacar py-4 rounded-2xl font-black transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={eliminarRol}
                className="flex-1 bg-rose-500 hover:bg-rose-400 text-white py-4 rounded-2xl font-black transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
