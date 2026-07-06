import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
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
} from 'lucide-react';

const ROLES_DISPONIBLES = [
  'Administrador',
  'Gerente',
  'Cajero',
  'Mesero',
  'Cocinero',
  'Hostess',
  'Limpieza',
];

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

export default function PermisosScreen() {
  const { roles_permisos, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [rolActivo, setRolActivo] = useState('Mesero');

  const permisosActuales = useMemo(() => {
    if (rolActivo === 'Administrador') return ['TODO'];

    const rolData = (roles_permisos || []).find((r) => r.rol === rolActivo);
    try {
      if (!rolData) return [];
      if (typeof rolData.permisos === 'string')
        return JSON.parse(rolData.permisos);
      return rolData.permisos || [];
    } catch (e) {
      return [];
    }
  }, [roles_permisos, rolActivo]);

  const togglePermiso = (moduloId) => {
    if (rolActivo === 'Administrador') return;

    let nuevosPermisos = [...permisosActuales];

    if (nuevosPermisos.includes(moduloId)) {
      nuevosPermisos = nuevosPermisos.filter((id) => id !== moduloId);
    } else {
      nuevosPermisos.push(moduloId);
    }

    // Fix del crash: upsertRolPermiso NO existe en el store → TypeError al
    // primer toggle. Reglas del payload contra el esquema real:
    //  - id: uuid PK (NO hay unique en (restaurante_id, rol)) → REUSAR el id
    //    de la fila existente para actualizar; uuid nuevo solo si es alta.
    //  - restaurante_id: obligatorio para pasar RLS (antes iba sin él → 4xx
    //    permanente reintentado 5x en la cola).
    //  - permisos: array crudo (la columna es jsonb; nunca JSON.stringify).
    const existente = (roles_permisos || []).find((r) => r.rol === rolActivo);
    const payload = {
      id:
        existente?.id ??
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      rol: rolActivo,
      permisos: nuevosPermisos,
      restaurante_id: useAuthStore.getState().restauranteId,
    };

    // Upsert en RAM directo con setState (el store no expone upsertRolPermiso).
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
              <Lock className="w-4 h-4" /> Control de accesos por rol
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 overflow-hidden">
        {/* PANEL IZQUIERDO: LISTA DE ROLES */}
        <div className="w-full lg:w-1/3 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-50 dark:border-ui-border shadow-sm p-6 flex flex-col h-full overflow-y-auto custom-scrollbar transition-colors">
          <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-6 px-2">
            Selecciona un Puesto
          </h3>
          <div className="space-y-3">
            {ROLES_DISPONIBLES.map((rol) => {
              const isActivo = rolActivo === rol;
              const esAdmin = rol === 'Administrador';
              return (
                <button
                  key={rol}
                  onClick={() => setRolActivo(rol)}
                  className={`w-full text-left px-6 py-5 rounded-2xl font-black transition-all border-2 flex justify-between items-center ${
                    isActivo
                      ? 'bg-amber-50 dark:bg-brand-ambar/10 border-amber-500 text-amber-700 dark:text-brand-ambar shadow-md scale-100'
                      : 'bg-slate-50 dark:bg-ui-obsidiana border-transparent text-slate-600 dark:text-brand-nacar hover:bg-slate-100 dark:hover:bg-ui-border hover:scale-[0.98]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {esAdmin && (
                      <ShieldCheck
                        className={`w-5 h-5 ${isActivo ? 'text-amber-500' : 'text-slate-400 dark:text-ui-muted'}`}
                      />
                    )}
                    {rol}
                  </span>
                  {isActivo && (
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* PANEL DERECHO: INTERRUPTORES DE PERMISOS */}
        <div className="w-full lg:w-2/3 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-50 dark:border-ui-border shadow-sm flex flex-col h-full overflow-hidden transition-colors">
          <div className="p-8 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50/50 dark:bg-ui-obsidiana/50">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
                Permisos: {rolActivo}
              </h2>
              <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mt-1">
                Activa o desactiva los módulos permitidos.
              </p>
            </div>
            {rolActivo === 'Administrador' && (
              <div className="bg-rose-50 dark:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border border-rose-100 dark:border-brand-arrecife/30">
                <AlertTriangle className="w-4 h-4" /> Root Access
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4">
            {MODULOS_SISTEMA.map((modulo) => {
              const Icono = modulo.icono;
              const tieneAcceso =
                permisosActuales.includes('TODO') ||
                permisosActuales.includes(modulo.id);
              const isBloqueado = rolActivo === 'Administrador';

              return (
                <div
                  key={modulo.id}
                  onClick={() => !isBloqueado && togglePermiso(modulo.id)}
                  className={`p-5 rounded-2xl border-2 flex items-center justify-between transition-all ${
                    isBloqueado
                      ? 'opacity-70 cursor-not-allowed border-slate-100 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana'
                      : 'cursor-pointer hover:border-slate-200 dark:hover:border-ui-muted border-slate-50 dark:border-ui-obsidiana bg-white dark:bg-ui-obsidiana'
                  } ${tieneAcceso && !isBloqueado ? 'border-amber-100 dark:border-brand-ambar/30 bg-amber-50/30 dark:bg-brand-ambar/10' : ''}`}
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`p-3 rounded-xl transition-colors ${tieneAcceso ? 'bg-amber-500 text-ui-obsidiana shadow-lg shadow-amber-500/30' : 'bg-slate-100 dark:bg-ui-humo text-slate-400 dark:text-ui-muted'}`}
                    >
                      <Icono className="w-6 h-6" />
                    </div>
                    <div>
                      <h4
                        className={`font-black text-lg ${tieneAcceso ? 'text-slate-900 dark:text-brand-nacar' : 'text-slate-500 dark:text-ui-muted'}`}
                      >
                        {modulo.nombre}
                      </h4>
                      <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-0.5">
                        {modulo.desc}
                      </p>
                    </div>
                  </div>

                  {/* SWITCH TIPO iOS */}
                  <div
                    className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${tieneAcceso ? 'bg-amber-500' : 'bg-slate-200 dark:bg-ui-border'}`}
                  >
                    <div
                      className={`absolute top-1 bg-white dark:bg-brand-nacar w-6 h-6 rounded-full shadow-sm transition-all duration-300 ${tieneAcceso ? 'left-7' : 'left-1'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-6 bg-slate-900 dark:bg-ui-obsidiana shadow-[0_-10px_30px_rgba(0,0,0,0.1)] flex justify-between items-center z-10 relative border-t dark:border-ui-border transition-colors">
            <p className="text-slate-400 dark:text-ui-muted text-xs font-bold w-2/3">
              Los cambios se guardan y sincronizan automáticamente. Toma efecto
              en el siguiente inicio de sesión del usuario. OJO: los guards de
              rutas siguen leyendo RUTAS_POR_ROL (hardcodeado); unificar con
              esta tabla es un proyecto aparte.
            </p>
            <div className="bg-brand-cesped/20 text-brand-cesped px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-brand-cesped/30">
              <Save className="w-4 h-4" /> Auto-Guardado
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
