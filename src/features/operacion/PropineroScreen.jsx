import { useState, useMemo, useEffect } from 'react';
import { useAppStore, parseUTC } from '../../store/useAppStore';
import { useAuthStore } from '../auth/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { supabase } from '../../api/supabase';
import {
  DollarSign,
  Calculator,
  Users,
  AlertCircle,
  ReceiptText,
  ShieldCheck,
  Coins,
  Check,
  WifiOff,
  History,
  Clock,
  PencilLine,
  SplitSquareHorizontal,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';

// ── Helpers numéricos ─────────────────────────────────────────────────────────
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const floor2 = (n) => Math.floor((Number(n) || 0) * 100) / 100;
const money = (n) =>
  (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

const METODOS = [
  {
    id: 'equitativo',
    label: 'Equitativo',
    icon: SplitSquareHorizontal,
    desc: 'Partes iguales entre los incluidos',
  },
  {
    id: 'horas',
    label: 'Por horas',
    icon: Clock,
    desc: 'Proporcional a horas trabajadas (asistencias)',
  },
  {
    id: 'manual',
    label: 'Manual',
    icon: PencilLine,
    desc: 'Capturas el monto de cada quien',
  },
];

const SCOPES = [
  { id: 'turno', label: 'Turno' },
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'rango', label: 'Rango' },
];

// Lunes 00:00 → Domingo 23:59 de la semana que contiene fechaStr.
function semanaDe(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  const day = d.getDay(); // 0 Dom .. 6 Sáb
  const diff = day === 0 ? -6 : 1 - day;
  const lun = new Date(d);
  lun.setDate(d.getDate() + diff);
  lun.setHours(0, 0, 0, 0);
  const dom = new Date(lun);
  dom.setDate(lun.getDate() + 6);
  dom.setHours(23, 59, 59, 999);
  return { desdeDt: lun, hastaDt: dom };
}

// Horas trabajadas de un empleado en [desde, hasta] a partir de asistencias.
// Empareja entrada→salida en orden cronológico; ignora colgados.
function horasTrabajadas(asistencias, nombre, desdeDt, hastaDt) {
  if (!nombre) return 0;
  const regs = (asistencias || [])
    .filter((a) => a.empleado_nombre === nombre)
    .map((a) => ({ ...a, t: parseUTC(a.fecha_hora) }))
    .filter(
      (a) =>
        a.t && (!desdeDt || a.t >= desdeDt) && (!hastaDt || a.t <= hastaDt),
    )
    .sort((a, b) => a.t - b.t);

  let total = 0;
  let entradaT = null;
  for (const r of regs) {
    const tipo = String(r.tipo || '').toLowerCase();
    if (tipo.includes('entra')) {
      entradaT = r.t;
    } else if (tipo.includes('sal') && entradaT) {
      total += (r.t - entradaT) / 3600000; // ms → horas
      entradaT = null;
    }
  }
  return round2(total);
}

export default function PropineroScreen() {
  const { ventas, staff, turnos, asistencias, registrarAuditoria, showToast } =
    useAppStore();
  const { user } = useAuthStore();
  const isOffline = useSyncStore((s) => s.isOffline);

  const turnosOrden = useMemo(() => turnos || [], [turnos]);

  // ── Scope del bote ─────────────────────────────────────────────────────────
  const [modo, setModo] = useState('turno');
  const [turnoId, setTurnoId] = useState(turnosOrden[0]?.id || '');
  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaSel, setFechaSel] = useState(hoy); // para dia / semana
  const [desde, setDesde] = useState(hoy); // para rango
  const [hasta, setHasta] = useState(hoy);

  useEffect(() => {
    if (!turnoId && turnosOrden[0]?.id) setTurnoId(turnosOrden[0].id);
  }, [turnosOrden, turnoId]);

  const turnoSel = useMemo(
    () => turnosOrden.find((t) => String(t.id) === String(turnoId)) || null,
    [turnosOrden, turnoId],
  );

  // Ventana temporal del scope (para horas y para filtrar ventas por fecha).
  const periodo = useMemo(() => {
    if (modo === 'turno') {
      const d = turnoSel?.fecha_apertura
        ? parseUTC(turnoSel.fecha_apertura)
        : null;
      const h = turnoSel?.fecha_cierre
        ? parseUTC(turnoSel.fecha_cierre)
        : new Date();
      return { desdeDt: d, hastaDt: h };
    }
    if (modo === 'dia') {
      return {
        desdeDt: new Date(fechaSel + 'T00:00:00'),
        hastaDt: new Date(fechaSel + 'T23:59:59'),
      };
    }
    if (modo === 'semana') {
      return semanaDe(fechaSel);
    }
    return {
      desdeDt: new Date(desde + 'T00:00:00'),
      hastaDt: new Date(hasta + 'T23:59:59'),
    };
  }, [modo, turnoSel, fechaSel, desde, hasta]);

  // Ventas del scope (todas).
  const ventasScope = useMemo(() => {
    if (modo === 'turno') {
      if (!turnoId) return [];
      return (ventas || []).filter(
        (v) => String(v.turno_id) === String(turnoId),
      );
    }
    const { desdeDt, hastaDt } = periodo;
    return (ventas || []).filter((v) => {
      const f = parseUTC(v.fecha);
      return f && f >= desdeDt && f <= hastaDt;
    });
  }, [ventas, modo, turnoId, periodo]);

  // ── El bote: solo propinas de ventas AÚN NO repartidas ──────────────────────
  // Marcado local optimista para reflejar el vaciado sin esperar refresh global.
  const [repartidoLocal, setRepartidoLocal] = useState([]);

  const ventasConPropina = useMemo(
    () => ventasScope.filter((v) => Number(v.propina) > 0),
    [ventasScope],
  );
  const ventasDisponibles = useMemo(
    () =>
      ventasConPropina.filter(
        (v) => !v.reparto_id && !repartidoLocal.includes(v.id),
      ),
    [ventasConPropina, repartidoLocal],
  );
  const propinasYaRepartidas = useMemo(
    () =>
      round2(
        ventasConPropina
          .filter((v) => v.reparto_id || repartidoLocal.includes(v.id))
          .reduce((a, v) => a + Number(v.propina || 0), 0),
      ),
    [ventasConPropina, repartidoLocal],
  );

  const bote = round2(
    ventasDisponibles.reduce((a, v) => a + Number(v.propina || 0), 0),
  );
  const ventasTotales = round2(
    ventasScope.reduce((a, v) => a + Number(v.total || 0), 0),
  );

  // ── Participantes y método ─────────────────────────────────────────────────
  const [metodo, setMetodo] = useState('equitativo');
  const [ajustes, setAjustes] = useState({}); // por id: { incluido, montoManual }

  const staffActivo = useMemo(
    () => (staff || []).filter((s) => s.activo !== false),
    [staff],
  );

  const setAjuste = (id, patch) =>
    setAjustes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const participantes = useMemo(() => {
    return staffActivo.map((s) => {
      const aj = ajustes[s.id] || {};
      const rol = s.rol || s.puesto || '—';
      const incluido = aj.incluido !== false;
      const horas = horasTrabajadas(
        asistencias,
        s.nombre,
        periodo.desdeDt,
        periodo.hastaDt,
      );
      const montoManual = aj.montoManual != null ? Number(aj.montoManual) : 0;
      return { id: s.id, nombre: s.nombre, rol, incluido, horas, montoManual };
    });
  }, [staffActivo, ajustes, asistencias, periodo]);

  const baseDe = (p) =>
    metodo === 'equitativo' ? 1 : metodo === 'horas' ? Number(p.horas) || 0 : 0;

  const distribucion = useMemo(() => {
    if (metodo === 'manual') {
      return participantes.map((p) => ({
        ...p,
        base: p.montoManual,
        monto: p.incluido ? round2(p.montoManual || 0) : 0,
      }));
    }
    const incluidos = participantes.filter((p) => p.incluido);
    const sumBase = incluidos.reduce((a, p) => a + (Number(baseDe(p)) || 0), 0);
    return participantes.map((p) => {
      const base = Number(baseDe(p)) || 0;
      const monto =
        p.incluido && sumBase > 0 ? floor2((bote * base) / sumBase) : 0;
      return { ...p, base, monto };
    });
  }, [participantes, metodo, bote]);

  const incluidosConMonto = distribucion.filter((p) => p.incluido);
  const totalRepartido = round2(distribucion.reduce((a, p) => a + p.monto, 0));
  const remanente = round2(bote - totalRepartido);

  // ── Historial (online) ───────────────────────────────────────────────────────
  const [historial, setHistorial] = useState([]);
  const cargarHistorial = async () => {
    if (isOffline) return;
    try {
      const restauranteId = useAuthStore.getState().restauranteId;
      const { data } = await supabase
        .from('propinas_reparto')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .order('creado_en', { ascending: false })
        .limit(10);
      setHistorial(data || []);
    } catch (e) {
      console.warn('[Propinero] No se pudo cargar historial:', e?.message);
    }
  };
  useEffect(() => {
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acumuladoHistorial = useMemo(
    () =>
      round2(historial.reduce((a, h) => a + Number(h.total_repartido || 0), 0)),
    [historial],
  );

  // ── Registro ──────────────────────────────────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const yaRepartidoScope = bote <= 0 && propinasYaRepartidas > 0;
  const sinPropinas = bote <= 0 && propinasYaRepartidas <= 0;

  const puedeRegistrar =
    !isOffline &&
    bote > 0 &&
    incluidosConMonto.some((p) => p.monto > 0) &&
    (metodo !== 'manual' || remanente >= -0.001);

  const handleRegistrar = async () => {
    setIsProcessing(true);
    setConfirmando(false);
    try {
      const restauranteId = useAuthStore.getState().restauranteId;
      const nuevoId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const idsVentas = ventasDisponibles.map((v) => v.id);

      // participantes como ARRAY directo (jsonb) — NUNCA JSON.stringify (regla 9).
      const participantesPayload = incluidosConMonto
        .filter((p) => p.monto !== 0)
        .map((p) => ({
          nombre: p.nombre,
          rol: p.rol,
          base: round2(p.base),
          monto: round2(p.monto),
        }));

      const payload = {
        id: nuevoId,
        restaurante_id: restauranteId,
        turno_id: modo === 'turno' ? turnoId || null : null,
        modo,
        rango_desde:
          modo === 'turno'
            ? null
            : periodo.desdeDt
              ? periodo.desdeDt.toISOString()
              : null,
        rango_hasta:
          modo === 'turno'
            ? null
            : periodo.hastaDt
              ? periodo.hastaDt.toISOString()
              : null,
        bote_total: bote,
        metodo,
        participantes: participantesPayload,
        total_repartido: totalRepartido,
        remanente,
        notas: null,
        creado_por: user?.nombre || 'Administrador',
        creado_en: new Date().toISOString(),
      };

      // 1) Insertar el registro del reparto (acumulado para reportes).
      const { error: insErr } = await supabase
        .from('propinas_reparto')
        .insert(payload);
      if (insErr) throw insErr;

      // 2) Sellar las ventas consumidas → vacían el bote y no se vuelven a repartir.
      if (idsVentas.length) {
        const { error: upErr } = await supabase
          .from('ventas')
          .update({ reparto_id: nuevoId })
          .in('id', idsVentas);
        if (upErr) {
          console.error(
            '[Propinero] Reparto guardado pero no se sellaron ventas:',
            upErr,
          );
          showToast(
            'Reparto guardado, pero no se pudo sellar el bote. Revisa antes de repartir de nuevo.',
            'error',
          );
        }
      }

      // Vaciado optimista local (sin esperar refresh global del store).
      setRepartidoLocal((prev) => [...prev, ...idsVentas]);

      registrarAuditoria?.({
        usuario: user?.nombre || 'Administrador',
        accion: 'REPARTO_PROPINAS',
        modulo: 'PROPINERO',
        nivel: 'info',
        detalles: `Bote $${money(bote)} repartido (${metodo}) entre ${participantesPayload.length} personas. Remanente $${money(remanente)}.`,
      });

      showToast('Reparto registrado. Bote vaciado.', 'success');
      await cargarHistorial();
    } catch (e) {
      console.error('[Propinero] Error registrando reparto:', e);
      showToast(
        'No se pudo registrar el reparto: ' + (e?.message || ''),
        'error',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const fmtFecha = (s) => {
    const d = parseUTC(s);
    return d
      ? d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
      : '—';
  };
  const fmtDia = (d) =>
    d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—';

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto h-full animate-in fade-in duration-500 transition-colors">
      {/* CABECERA */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-indigo-500 dark:bg-brand-amatista/20 p-3 rounded-2xl shadow-lg shadow-indigo-500/30 dark:shadow-none border border-transparent dark:border-brand-amatista/30 transition-colors">
          <Calculator className="w-8 h-8 text-white dark:text-brand-amatista" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-brand-nacar tracking-tight">
            Propinero
          </h1>
          <p className="text-sm font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mt-1">
            Reparto de propinas · acumulado para reportes
          </p>
        </div>
      </div>

      {isOffline && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-amber-50 dark:bg-brand-ambar/10 border-2 border-amber-200 dark:border-brand-ambar/30 rounded-2xl">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-brand-ambar shrink-0" />
          <p className="text-sm font-bold text-amber-700 dark:text-brand-ambar leading-snug">
            Sin conexión: puedes revisar el cálculo, pero el registro del
            reparto requiere internet. Regístralo al reconectar.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ───────────── PANEL IZQUIERDO ───────────── */}
        <div className="lg:col-span-1 space-y-6">
          {/* SELECTOR DE SCOPE */}
          <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
            <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-4">
              Periodo del bote
            </h3>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setModo(s.id)}
                  className={`py-2.5 rounded-xl text-xs font-black transition-all ${
                    modo === s.id
                      ? 'bg-indigo-600 dark:bg-brand-amatista text-white shadow-md'
                      : 'bg-slate-100 dark:bg-ui-border text-slate-600 dark:text-ui-muted hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {modo === 'turno' && (
              <select
                value={turnoId}
                onChange={(e) => setTurnoId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
              >
                {turnosOrden.length === 0 && (
                  <option value="">Sin turnos</option>
                )}
                {turnosOrden.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fmtFecha(t.fecha_apertura)} · {t.usuario || '—'} ·{' '}
                    {t.estado === 'abierto' ? 'ABIERTO' : 'cerrado'}
                  </option>
                ))}
              </select>
            )}

            {(modo === 'dia' || modo === 'semana') && (
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest block mb-1">
                  {modo === 'dia' ? 'Día' : 'Semana de'}
                </label>
                <input
                  type="date"
                  value={fechaSel}
                  onChange={(e) => setFechaSel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista"
                />
                {modo === 'semana' && (
                  <p className="text-[11px] font-bold text-slate-400 dark:text-ui-muted mt-2 flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3" />
                    {fmtDia(periodo.desdeDt)} – {fmtDia(periodo.hastaDt)}
                  </p>
                )}
              </div>
            )}

            {modo === 'rango' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest block mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest block mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t-2 border-slate-100 dark:border-ui-border">
              <p className="text-sm font-bold text-slate-500 dark:text-ui-muted flex justify-between">
                <span>Ventas del periodo:</span>
                <span className="text-slate-900 dark:text-brand-nacar">
                  ${money(ventasTotales)} · {ventasScope.length}
                </span>
              </p>
            </div>
          </div>

          {/* CAJA FUERTE DEL BOTE */}
          <div className="bg-slate-900 dark:bg-ui-obsidiana rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-800 dark:border-ui-border transition-colors">
            <div className="absolute -right-4 -top-4 opacity-10">
              <DollarSign className="w-32 h-32 text-white dark:text-brand-nacar" />
            </div>
            <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-6 relative z-10">
              Bote disponible
            </h3>
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-end">
                <span className="text-slate-300 dark:text-ui-muted font-bold text-sm">
                  Propinas sin repartir
                </span>
                <span className="text-3xl font-black text-white dark:text-brand-nacar">
                  ${money(bote)}
                </span>
              </div>
              {propinasYaRepartidas > 0 && (
                <div className="flex justify-between items-center text-sm pt-3 border-t border-slate-700/50 dark:border-ui-border">
                  <span className="text-slate-400 dark:text-ui-muted font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ya repartidas
                  </span>
                  <span className="font-black text-slate-400 dark:text-ui-muted">
                    ${money(propinasYaRepartidas)}
                  </span>
                </div>
              )}
              <p className="text-[11px] font-bold text-slate-500 dark:text-ui-muted flex items-center gap-1.5 pt-1">
                <ReceiptText className="w-3 h-3 shrink-0" /> Automático de las
                propinas cobradas. El cajero no captura nada.
              </p>
            </div>
          </div>

          {/* HISTORIAL */}
          <div className="bg-white dark:bg-ui-humo p-6 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Acumulado
              </h3>
              {historial.length > 0 && (
                <span className="text-xs font-black text-emerald-600 dark:text-brand-cesped">
                  ${money(acumuladoHistorial)}
                </span>
              )}
            </div>
            {historial.length === 0 ? (
              <p className="text-sm font-bold text-slate-400 dark:text-ui-muted">
                Aún no hay reparto registrado.
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {historial.map((h) => (
                  <div
                    key={h.id}
                    className="flex justify-between items-center text-xs p-2.5 bg-slate-50 dark:bg-ui-obsidiana rounded-xl border border-slate-100 dark:border-ui-border"
                  >
                    <div>
                      <p className="font-black text-slate-700 dark:text-brand-nacar">
                        ${money(h.total_repartido)}{' '}
                        <span className="font-bold text-slate-400 dark:text-ui-muted capitalize">
                          · {h.metodo} · {h.modo}
                        </span>
                      </p>
                      <p className="font-bold text-slate-400 dark:text-ui-muted">
                        {fmtFecha(h.creado_en)}
                      </p>
                    </div>
                    <span className="font-black text-slate-400 dark:text-ui-muted">
                      {(h.participantes || []).length} pers.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ───────────── PANEL DERECHO ───────────── */}
        <div className="lg:col-span-2 bg-white dark:bg-ui-humo p-6 md:p-8 rounded-3xl border-2 border-slate-100 dark:border-ui-border shadow-sm flex flex-col transition-colors">
          {/* MÉTODO */}
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-indigo-500 dark:text-brand-amatista" />{' '}
              Método de reparto
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodo(m.id)}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-2xl border-2 transition-all ${
                    metodo === m.id
                      ? 'bg-indigo-600 dark:bg-brand-amatista text-white border-indigo-600 dark:border-brand-amatista shadow-md'
                      : 'bg-slate-50 dark:bg-ui-obsidiana text-slate-600 dark:text-ui-muted border-slate-200 dark:border-ui-border hover:border-indigo-300'
                  }`}
                >
                  <m.icon className="w-4 h-4" />
                  <span className="text-[11px] font-black leading-tight text-center">
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-ui-muted mt-2">
              {METODOS.find((m) => m.id === metodo)?.desc}
            </p>
          </div>

          {/* ESTADO YA REPARTIDO / SIN PROPINAS */}
          {yaRepartidoScope && (
            <div className="flex items-center gap-3 px-4 py-3 mb-5 bg-emerald-50 dark:bg-brand-cesped/10 border-2 border-emerald-200 dark:border-brand-cesped/30 rounded-2xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-brand-cesped shrink-0" />
              <p className="text-sm font-bold text-emerald-700 dark:text-brand-cesped leading-snug">
                Este periodo ya fue repartido (${money(propinasYaRepartidas)}).
                El bote está vacío; no se puede repartir de nuevo.
              </p>
            </div>
          )}

          {/* PARTICIPANTES */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-5">
            {participantes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-ui-muted py-10">
                <AlertCircle className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-bold">No hay staff activo para repartir</p>
                <p className="text-xs font-bold mt-1">
                  Agrega personal en el módulo de Staff.
                </p>
              </div>
            ) : (
              participantes.map((p) => {
                const dist = distribucion.find((d) => d.id === p.id) || {
                  monto: 0,
                };
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-colors ${
                      p.incluido
                        ? 'bg-slate-50 dark:bg-ui-obsidiana border-slate-100 dark:border-ui-border'
                        : 'bg-slate-50/40 dark:bg-ui-obsidiana/40 border-dashed border-slate-200 dark:border-ui-border opacity-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setAjuste(p.id, { incluido: !p.incluido })}
                      className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center border-2 transition-all ${
                        p.incluido
                          ? 'bg-indigo-600 dark:bg-brand-amatista border-indigo-600 dark:border-brand-amatista text-white'
                          : 'bg-transparent border-slate-300 dark:border-ui-border text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-slate-900 dark:text-brand-nacar truncate">
                        {p.nombre}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 dark:text-ui-muted truncate">
                        {p.rol}
                        {metodo === 'horas' && ` · ${p.horas} h`}
                      </p>
                    </div>

                    {metodo === 'manual' && p.incluido && (
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={ajustes[p.id]?.montoManual ?? ''}
                          onChange={(e) =>
                            setAjuste(p.id, { montoManual: e.target.value })
                          }
                          placeholder="0"
                          className="w-24 pl-5 pr-2 py-1.5 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-lg font-black text-sm text-right text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista"
                        />
                      </div>
                    )}

                    <div className="text-right w-24 shrink-0">
                      <p className="text-base font-black text-emerald-600 dark:text-brand-cesped">
                        ${money(dist.monto)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* RECONCILIACIÓN */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-slate-50 dark:bg-ui-obsidiana rounded-2xl p-3 text-center border border-slate-100 dark:border-ui-border">
              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                Bote
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-brand-nacar">
                ${money(bote)}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-ui-obsidiana rounded-2xl p-3 text-center border border-slate-100 dark:border-ui-border">
              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                Repartido
              </p>
              <p className="text-lg font-black text-emerald-600 dark:text-brand-cesped">
                ${money(totalRepartido)}
              </p>
            </div>
            <div
              className={`rounded-2xl p-3 text-center border ${
                remanente < -0.001
                  ? 'bg-rose-50 dark:bg-brand-arrecife/10 border-rose-200 dark:border-brand-arrecife/30'
                  : 'bg-slate-50 dark:bg-ui-obsidiana border-slate-100 dark:border-ui-border'
              }`}
            >
              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center justify-center gap-1">
                <Coins className="w-3 h-3" />
                {remanente < -0.001 ? 'Sobregiro' : 'Remanente'}
              </p>
              <p
                className={`text-lg font-black ${
                  remanente < -0.001
                    ? 'text-rose-600 dark:text-brand-arrecife'
                    : 'text-slate-900 dark:text-brand-nacar'
                }`}
              >
                ${money(remanente)}
              </p>
            </div>
          </div>

          {remanente > 0.001 && metodo !== 'manual' && (
            <p className="text-[11px] font-bold text-slate-400 dark:text-ui-muted text-center mb-4">
              El remanente de ${money(remanente)} (centavos no divisibles) queda
              en caja.
            </p>
          )}
          {remanente < -0.001 && (
            <p className="text-[11px] font-bold text-rose-500 dark:text-brand-arrecife text-center mb-4">
              Asignaste ${money(Math.abs(remanente))} más que el bote. Ajusta
              antes de registrar.
            </p>
          )}

          {/* BOTÓN / CONFIRMACIÓN */}
          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={isProcessing || !puedeRegistrar}
              className="w-full bg-slate-900 dark:bg-brand-amatista hover:bg-slate-800 dark:hover:bg-indigo-600 text-white disabled:bg-slate-200 disabled:dark:bg-ui-border disabled:text-slate-400 disabled:dark:text-ui-muted font-black py-5 rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Coins className="w-5 h-5" />
              {isOffline
                ? 'Sin conexión para registrar'
                : yaRepartidoScope
                  ? 'Periodo ya repartido'
                  : sinPropinas
                    ? 'Sin propinas que repartir'
                    : 'Registrar y vaciar bote'}
            </button>
          ) : (
            <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-ui-obsidiana rounded-2xl border-2 border-slate-200 dark:border-ui-border">
              <p className="text-sm font-bold text-slate-700 dark:text-brand-nacar text-center">
                Repartir{' '}
                <span className="font-black">${money(totalRepartido)}</span>{' '}
                entre {incluidosConMonto.filter((p) => p.monto > 0).length}{' '}
                personas. El bote se vacía y queda en auditoría.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-xl font-black text-sm bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-600 dark:text-ui-muted active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRegistrar}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-xl font-black text-sm bg-indigo-600 dark:bg-brand-amatista text-white shadow-md active:scale-95 transition-all"
                >
                  {isProcessing ? 'Registrando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-4 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Acción registrada en auditoría
          </p>
        </div>
      </div>
    </div>
  );
}
