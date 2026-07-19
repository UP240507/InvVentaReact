import { useState, useEffect, useMemo } from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useAppStore } from '../../store/useAppStore';
import { getCapacidades, tieneFlag } from '../../lib/Permisos';
import { useAuthStore } from '../auth/useAuthStore'; // 🌟 FIX: Importamos tu sesión de dueño

import {
  TrendingUp,
  ChefHat,
  Users,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import AbrirTurnoModal from './AbrirTurnoModal';
import CierreTurnoModal from './CierreTurnoModal';

export default function DashboardScreen() {
  // ─── STORES ─────────────────────────────────────────────────────────────
  const { empleadoActivo } = useSessionStore();
  const { ordenes, mesas, turnos } = useAppStore();
  const { user } = useAuthStore(); // 🌟 FIX: Sacamos tu cuenta de Admin

  // ─── ESTADOS LOCALES ────────────────────────────────────────────────────
  const [showAbrirModal, setShowAbrirModal] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const turnoActivo =
    (turnos || []).find((t) => t.estado === 'abierto') || null;

  useEffect(() => {
    if (!turnoActivo?.fecha_apertura) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [turnoActivo]);

  const fechaActual = new Date()
    .toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    .toUpperCase();

  let duracionTurno = '0h 0m';
  if (turnoActivo?.fecha_apertura) {
    const inicio = new Date(turnoActivo.fecha_apertura).getTime();
    const diffMins = Math.floor((now - inicio) / 60000);
    duracionTurno = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  }

  const metricas = useMemo(() => {
    const mesasActivas = (mesas || []).filter((m) =>
      ['ocupada', 'por_cobrar'].includes(m.estado),
    ).length;

    const comandasKDS = (ordenes || []).filter((o) =>
      ['pendiente', 'en_preparacion'].includes(o.estado),
    ).length;

    if (!turnoActivo?.fecha_apertura) {
      return { ingresos: 0, tickets: 0, comandasKDS, mesasActivas };
    }

    const fechaApertura = new Date(turnoActivo.fecha_apertura).getTime();
    const ordenesTurno = (ordenes || []).filter(
      (o) =>
        o.estado === 'pagada' &&
        new Date(o.fecha_pago || o.created_at).getTime() >= fechaApertura,
    );

    const ingresosNetos = ordenesTurno.reduce(
      (acc, o) => acc + (Number(o.total) || 0),
      0,
    );

    return {
      ingresos: ingresosNetos,
      tickets: ordenesTurno.length,
      comandasKDS,
      mesasActivas,
    };
  }, [ordenes, mesas, turnoActivo]);

  // 🌟 FIX: Lógica de Jerarquía de Operador
  // Si eres el dueño (Admin), mostramos tu nombre base. Si eres un empleado con PIN, mostramos el del empleado.
  const esAdminPrincipal = tieneFlag(
    getCapacidades(user?.rol, useAppStore.getState().roles_permisos),
    'admin_config',
  );
  const nombreUsuario = esAdminPrincipal
    ? user?.nombre
    : empleadoActivo?.nombre || user?.nombre || 'Usuario';

  const horaAperturaFormat = turnoActivo
    ? new Date(turnoActivo.fecha_apertura).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--';

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50 dark:bg-ui-obsidiana animate-in fade-in">
      {/* ── HEADER SALUDO ── */}
      <div className="mb-8">
        <p className="text-xs font-black tracking-widest uppercase text-slate-400 dark:text-ui-muted mb-1">
          Buenos días,
        </p>
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-brand-amatista" />
          <h1 className="text-4xl font-black font-syne text-slate-900 dark:text-brand-nacar">
            {nombreUsuario}
          </h1>
        </div>
        <p className="text-sm font-bold text-slate-500 dark:text-brand-nacar/60 uppercase tracking-widest mt-2">
          {fechaActual}
        </p>
      </div>

      {/* ── WIDGET DE TURNO DE CAJA ── */}
      <div
        className={`mb-8 p-6 rounded-3xl border-2 transition-colors ${
          turnoActivo
            ? 'bg-white border-emerald-100 dark:bg-ui-humo dark:border-brand-cesped/20'
            : 'bg-white border-slate-200 dark:bg-ui-humo dark:border-ui-border shadow-sm'
        }`}
      >
        {!turnoActivo ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <h3 className="text-xl font-black font-syne text-slate-800 dark:text-brand-nacar mb-2">
              Caja Cerrada
            </h3>
            <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mb-6">
              Abre el turno para comenzar a registrar ventas.
            </p>
            <button
              onClick={() => setShowAbrirModal(true)}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] text-white font-black rounded-xl shadow-lg transition-transform active:scale-95"
            >
              Abrir Turno
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-brand-cesped/20 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 rounded-full bg-emerald-500 dark:bg-brand-cesped animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                  Turno de Caja
                </p>
                <p className="text-xl font-black font-syne text-emerald-600 dark:text-brand-cesped">
                  Abierto
                </p>
              </div>
            </div>

            <div className="flex items-center gap-8 md:gap-12 flex-1 md:justify-center border-y md:border-y-0 md:border-x border-slate-100 dark:border-ui-border py-4 md:py-0 md:px-8">
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
                  Apertura
                </p>
                <p className="font-mono font-bold text-slate-800 dark:text-brand-nacar">
                  {horaAperturaFormat}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
                  Duración
                </p>
                <p className="font-mono font-bold text-slate-800 dark:text-brand-nacar">
                  {duracionTurno}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
                  Fondo
                </p>
                <p className="font-mono font-bold text-slate-800 dark:text-brand-nacar">
                  ${turnoActivo.fondo_inicial?.toFixed(2) || '0.00'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCierreModal(true)}
              className="px-6 py-3 border-2 border-rose-500 text-rose-500 hover:bg-rose-50 dark:border-brand-arrecife dark:text-brand-arrecife dark:hover:bg-brand-arrecife/10 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Cerrar Turno
            </button>
          </div>
        )}
      </div>

      {/* ── GRID DE MÉTRICAS (KPIs) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border flex flex-col justify-between hover:shadow-lg transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-brand-cesped/10 flex items-center justify-center mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-brand-cesped" />
          </div>
          <div>
            <h2 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-1">
              ${metricas.ingresos.toFixed(2)}
            </h2>
            <p className="text-sm font-bold text-slate-600 dark:text-brand-nacar/80">
              Ingresos del Día
            </p>
            <p className="text-[10px] font-black text-brand-amatista uppercase tracking-widest mt-2">
              {metricas.tickets} Tickets cobrados
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border flex flex-col justify-between hover:shadow-lg transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-brand-arrecife/10 flex items-center justify-center mb-4">
            <ChefHat className="w-5 h-5 text-rose-600 dark:text-brand-arrecife" />
          </div>
          <div>
            <h2 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-1">
              {metricas.comandasKDS}
            </h2>
            <p className="text-sm font-bold text-slate-600 dark:text-brand-nacar/80">
              Comandas Activas
            </p>
            <p className="text-[10px] font-black text-rose-500 dark:text-brand-arrecife uppercase tracking-widest mt-2">
              En Preparación (KDS)
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border flex flex-col justify-between hover:shadow-lg transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-4">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-1">
              {metricas.mesasActivas}
            </h2>
            <p className="text-sm font-bold text-slate-600 dark:text-brand-nacar/80">
              Mesas Ocupadas
            </p>
            <p className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mt-2">
              Comedores Activos
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border flex flex-col justify-between hover:shadow-lg transition-shadow opacity-60">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-brand-ambar/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-brand-ambar" />
          </div>
          <div>
            <h2 className="text-xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-1">
              Sin Alertas
            </h2>
            <p className="text-sm font-bold text-slate-600 dark:text-brand-nacar/80">
              Inventario estable
            </p>
            <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-2">
              Módulo de Alertas
            </p>
          </div>
        </div>
      </div>

      {/* ── MODALES ── */}
      {showAbrirModal && (
        <AbrirTurnoModal onClose={() => setShowAbrirModal(false)} />
      )}
      {showCierreModal && (
        <CierreTurnoModal onClose={() => setShowCierreModal(false)} />
      )}
    </div>
  );
}
