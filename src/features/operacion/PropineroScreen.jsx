import { useState, useMemo, useEffect } from 'react';
import { useAppStore, parseUTC } from '../../store/useAppStore';
import { useAuthStore } from '../auth/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { supabase } from '../../api/supabase';
import { useAtajos } from '../../hooks/useAtajos';
import {
  OpsShell,
  OpsHeader,
  OpsTabs,
  OpsButton,
  AvisoOffline,
} from '../../components/ui';
import {
  DollarSign,
  Calculator,
  Users,
  AlertCircle,
  ReceiptText,
  ShieldCheck,
  Coins,
  Check,
  History,
  Clock,
  PencilLine,
  SplitSquareHorizontal,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import { hoyLocalISO } from '../../lib/Fechas';

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
  const {
    ventas,
    staff,
    turnos,
    asistencias,
    configuracion,
    registrarAuditoria,
    showToast,
  } = useAppStore();
  const { user } = useAuthStore();
  const isOffline = useSyncStore((s) => s.isOffline);

  const turnosOrden = useMemo(() => turnos || [], [turnos]);

  // ── Scope del bote ─────────────────────────────────────────────────────────
  const [modo, setModo] = useState('turno');
  const [turnoId, setTurnoId] = useState(turnosOrden[0]?.id || '');
  // Fecha LOCAL: en un restaurante la jornada fuerte es la noche, y con UTC el
  // Propinero abría por defecto en el día de MAÑANA (México va 6 h detrás).
  const hoy = hoyLocalISO();
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

  // Toggle por tenant (configuracion.roles_sin_propina): exclusión DURA.
  // Esos roles no aparecen en la lista ni se pueden reincluir a mano en un
  // reparto puntual. Si un restaurante quiere pagarles propina, los quita del
  // toggle en Configuración — una sola fuente de verdad, cero excepciones.
  const rolesSinPropina = useMemo(
    () =>
      Array.isArray(configuracion?.roles_sin_propina)
        ? configuracion.roles_sin_propina
        : ['Admin', 'Gerente'],
    [configuracion],
  );

  const staffActivo = useMemo(
    () =>
      (staff || []).filter(
        (s) =>
          s.activo !== false &&
          !rolesSinPropina.includes(s.rol || s.puesto || ''),
      ),
    [staff, rolesSinPropina],
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
          id: p.id, // staff.id → match robusto en Nóminas (legados: solo nombre)
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

  // ─── ATAJOS DEL PROPINERO (Proyecto D · tanda 5) ─────────────────────────
  // El reparto se hace al cierre, con prisa y con gente esperando su dinero.
  // F9 = acción de dinero, igual que cobrar en el POS: una sola convención.
  const mover = (delta) => {
    const i = SCOPES.findIndex((x) => x.id === modo);
    setModo(SCOPES[(i + delta + SCOPES.length) % SCOPES.length].id);
  };

  useAtajos(
    'propinero',
    {
      arrowright: { descripcion: 'Cambiar periodo', accion: () => mover(1) },
      arrowleft: { accion: () => mover(-1) },
      1: { descripcion: 'Método 1·2·3', accion: () => setMetodo('equitativo') },
      2: { accion: () => setMetodo('horas') },
      3: { accion: () => setMetodo('manual') },
      f9: {
        descripcion: 'Registrar el reparto',
        // Mismo gate que el botón: sin propinas, ya repartido o sin conexión
        // no se dispara nada.
        accion: () => puedeRegistrar && !isProcessing && setConfirmando(true),
      },
    },
    { titulo: 'Propinero', activo: !confirmando },
  );

  // Con la confirmación abierta el teclado se reduce a decidir: nada de andar
  // cambiando el periodo con el reparto a medio confirmar.
  useAtajos(
    'propinero-confirmar',
    {
      escape: {
        descripcion: 'Cancelar',
        accion: () => !isProcessing && setConfirmando(false),
      },
      enter: {
        descripcion: 'Confirmar el reparto',
        accion: () => !isProcessing && handleRegistrar(),
      },
    },
    { titulo: 'Confirmar reparto', activo: confirmando },
  );

  return (
    <OpsShell ancho="max-w-6xl" className="overflow-y-auto custom-scrollbar">
      <OpsHeader
        icono={Calculator}
        titulo="Propinero"
        subtitulo="Reparto de propinas · acumulado para reportes"
        scopeAtajos="propinero"
      />

      {isOffline && (
        <AvisoOffline className="mb-6">
          Sin conexión: puedes revisar el cálculo, pero el registro del reparto
          requiere internet. Regístralo al reconectar.
        </AvisoOffline>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ───────────── PANEL IZQUIERDO ───────────── */}
        <div className="lg:col-span-1 space-y-6">
          {/* SELECTOR DE SCOPE */}
          <div className="bg-ops-panel p-6 rounded-ui-lg border-2 border-ops-border shadow-sm transition-colors">
            <h3 className="text-xs font-black text-ops-muted uppercase tracking-widest mb-4">
              Periodo del bote
            </h3>
            <OpsTabs
              className="mb-4"
              valor={modo}
              onChange={setModo}
              opciones={SCOPES}
            />

            {modo === 'turno' && (
              <select
                value={turnoId}
                onChange={(e) => setTurnoId(e.target.value)}
                className="w-full px-4 py-3 bg-ops-panel-2 border-2 border-ops-field rounded-ui font-bold text-sm text-ops-ink outline-none focus:border-ops-accent dark:focus:border-ops-accent transition-all"
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
                <label className="text-[10px] font-black text-ops-muted uppercase tracking-widest block mb-1">
                  {modo === 'dia' ? 'Día' : 'Semana de'}
                </label>
                <input
                  type="date"
                  value={fechaSel}
                  onChange={(e) => setFechaSel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-ops-panel-2 border-2 border-ops-field rounded-ui font-bold text-sm text-ops-ink outline-none focus:border-ops-accent dark:focus:border-ops-accent"
                />
                {modo === 'semana' && (
                  <p className="text-[11px] font-bold text-ops-muted mt-2 flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3" />
                    {fmtDia(periodo.desdeDt)} – {fmtDia(periodo.hastaDt)}
                  </p>
                )}
              </div>
            )}

            {modo === 'rango' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-ops-muted uppercase tracking-widest block mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="w-full px-3 py-2.5 bg-ops-panel-2 border-2 border-ops-field rounded-ui font-bold text-sm text-ops-ink outline-none focus:border-ops-accent dark:focus:border-ops-accent"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-ops-muted uppercase tracking-widest block mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="w-full px-3 py-2.5 bg-ops-panel-2 border-2 border-ops-field rounded-ui font-bold text-sm text-ops-ink outline-none focus:border-ops-accent dark:focus:border-ops-accent"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t-2 border-ops-border">
              <p className="text-sm font-bold text-ops-muted flex justify-between">
                <span>Ventas del periodo:</span>
                <span className="text-ops-ink">
                  ${money(ventasTotales)} · {ventasScope.length}
                </span>
              </p>
            </div>
          </div>

          {/* CAJA FUERTE DEL BOTE */}
          <div className="bg-ops-accent text-ops-accent-fg rounded-ui-lg p-6 shadow-xl relative overflow-hidden transition-colors">
            <div className="absolute -right-4 -top-4 opacity-10">
              <DollarSign className="w-32 h-32" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest mb-6 relative z-10 opacity-70">
              Bote disponible
            </h3>
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-end">
                <span className="font-bold text-sm opacity-80">
                  Propinas sin repartir
                </span>
                <span className="text-3xl font-black tabular-nums">
                  ${money(bote)}
                </span>
              </div>
              {propinasYaRepartidas > 0 && (
                <div className="flex justify-between items-center text-sm pt-3 border-t border-ops-border/50">
                  <span className="text-ops-muted font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ya repartidas
                  </span>
                  <span className="font-black text-ops-muted">
                    ${money(propinasYaRepartidas)}
                  </span>
                </div>
              )}
              <p className="text-[11px] font-bold text-ops-muted flex items-center gap-1.5 pt-1">
                <ReceiptText className="w-3 h-3 shrink-0" /> Automático de las
                propinas cobradas. El cajero no captura nada.
              </p>
            </div>
          </div>

          {/* HISTORIAL */}
          <div className="bg-ops-panel p-6 rounded-ui-lg border-2 border-ops-border shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-ops-muted uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Acumulado
              </h3>
              {historial.length > 0 && (
                <span className="text-xs font-black text-ops-ok">
                  ${money(acumuladoHistorial)}
                </span>
              )}
            </div>
            {historial.length === 0 ? (
              <p className="text-sm font-bold text-ops-muted">
                Aún no hay reparto registrado.
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {historial.map((h) => (
                  <div
                    key={h.id}
                    className="flex justify-between items-center text-xs p-2.5 bg-ops-panel-2 rounded-ui border border-ops-border"
                  >
                    <div>
                      <p className="font-black text-ops-ink">
                        ${money(h.total_repartido)}{' '}
                        <span className="font-bold text-ops-muted capitalize">
                          · {h.metodo} · {h.modo}
                        </span>
                      </p>
                      <p className="font-bold text-ops-muted">
                        {fmtFecha(h.creado_en)}
                      </p>
                    </div>
                    <span className="font-black text-ops-muted">
                      {(h.participantes || []).length} pers.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ───────────── PANEL DERECHO ───────────── */}
        <div className="lg:col-span-2 bg-ops-panel p-6 md:p-8 rounded-ui-lg border-2 border-ops-border shadow-sm flex flex-col transition-colors">
          {/* MÉTODO */}
          <div className="mb-6">
            <h2 className="text-xl font-black text-ops-ink flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-ops-accent" /> Método de reparto
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {METODOS.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodo(m.id)}
                  title={`Atajo: ${i + 1}`}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-ui border-2 transition-all ${
                    metodo === m.id
                      ? 'bg-ops-accent text-ops-accent-fg border-ops-accent shadow-md'
                      : 'bg-ops-panel-2 text-ops-muted border-ops-border hover:border-ops-accent/30'
                  }`}
                >
                  <m.icon className="w-4 h-4" />
                  <span className="text-[11px] font-black leading-tight text-center">
                    {m.label}
                  </span>
                  {/* La tecla, impresa: así el atajo se aprende con el ratón. */}
                  <kbd className="text-[9px] font-black px-1 rounded-ui border border-current/40 opacity-60">
                    {i + 1}
                  </kbd>
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-ops-muted mt-2">
              {METODOS.find((m) => m.id === metodo)?.desc}
            </p>
          </div>

          {/* ESTADO YA REPARTIDO / SIN PROPINAS */}
          {yaRepartidoScope && (
            <div className="flex items-center gap-3 px-4 py-3 mb-5 bg-ops-ok/10 border-2 border-ops-ok/30 rounded-ui">
              <CheckCircle2 className="w-5 h-5 text-ops-ok shrink-0" />
              <p className="text-sm font-bold text-ops-ok leading-snug">
                Este periodo ya fue repartido (${money(propinasYaRepartidas)}).
                El bote está vacío; no se puede repartir de nuevo.
              </p>
            </div>
          )}

          {/* PARTICIPANTES */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-5">
            {participantes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-ops-muted py-10">
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
                    className={`flex items-center justify-between gap-3 p-3 rounded-ui border transition-colors ${
                      p.incluido
                        ? 'bg-ops-panel-2 border-ops-border'
                        : 'bg-ops-panel-2/40 dark:bg-ops-bg/40 border-dashed border-ops-border opacity-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setAjuste(p.id, { incluido: !p.incluido })}
                      className={`w-9 h-9 rounded-ui shrink-0 flex items-center justify-center border-2 transition-all ${
                        p.incluido
                          ? 'bg-ops-accent border-ops-accent text-ops-accent-fg'
                          : 'bg-transparent border-ops-border text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-ops-ink truncate">
                        {p.nombre}
                      </p>
                      <p className="text-[11px] font-bold text-ops-muted truncate">
                        {p.rol}
                        {metodo === 'horas' && ` · ${p.horas} h`}
                      </p>
                    </div>

                    {metodo === 'manual' && p.incluido && (
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-ops-muted">
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
                          className="w-24 pl-5 pr-2 py-1.5 bg-ops-panel border-2 border-ops-field rounded-ui font-black text-sm text-right text-ops-ink outline-none focus:border-ops-accent dark:focus:border-ops-accent"
                        />
                      </div>
                    )}

                    <div className="text-right w-24 shrink-0">
                      <p className="text-base font-black text-ops-ok">
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
            <div className="bg-ops-panel-2 rounded-ui p-3 text-center border border-ops-border">
              <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest">
                Bote
              </p>
              <p className="text-lg font-black text-ops-ink">${money(bote)}</p>
            </div>
            <div className="bg-ops-panel-2 rounded-ui p-3 text-center border border-ops-border">
              <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest">
                Repartido
              </p>
              <p className="text-lg font-black text-ops-ok">
                ${money(totalRepartido)}
              </p>
            </div>
            <div
              className={`rounded-ui p-3 text-center border ${
                remanente < -0.001
                  ? 'bg-ops-danger/10 border-ops-danger/30'
                  : 'bg-ops-panel-2 border-ops-border'
              }`}
            >
              <p className="text-[10px] font-black text-ops-muted uppercase tracking-widest flex items-center justify-center gap-1">
                <Coins className="w-3 h-3" />
                {remanente < -0.001 ? 'Sobregiro' : 'Remanente'}
              </p>
              <p
                className={`text-lg font-black ${
                  remanente < -0.001 ? 'text-ops-danger' : 'text-ops-ink'
                }`}
              >
                ${money(remanente)}
              </p>
            </div>
          </div>

          {remanente > 0.001 && metodo !== 'manual' && (
            <p className="text-[11px] font-bold text-ops-muted text-center mb-4">
              El remanente de ${money(remanente)} (centavos no divisibles) queda
              en caja.
            </p>
          )}
          {remanente < -0.001 && (
            <p className="text-[11px] font-bold text-ops-danger text-center mb-4">
              Asignaste ${money(Math.abs(remanente))} más que el bote. Ajusta
              antes de registrar.
            </p>
          )}

          {/* BOTÓN / CONFIRMACIÓN */}
          {!confirmando ? (
            <OpsButton
              variante="primario"
              tamano="lg"
              icono={Coins}
              tecla="F9"
              onClick={() => setConfirmando(true)}
              disabled={isProcessing || !puedeRegistrar}
              className="w-full py-5"
            >
              {isOffline
                ? 'Sin conexión para registrar'
                : yaRepartidoScope
                  ? 'Periodo ya repartido'
                  : sinPropinas
                    ? 'Sin propinas que repartir'
                    : 'Registrar y vaciar bote'}
            </OpsButton>
          ) : (
            <div className="flex flex-col gap-3 p-4 bg-ops-panel-2 rounded-ui border-2 border-ops-border">
              <p className="text-sm font-bold text-ops-ink text-center">
                Repartir{' '}
                <span className="font-black">${money(totalRepartido)}</span>{' '}
                entre {incluidosConMonto.filter((p) => p.monto > 0).length}{' '}
                personas. El bote se vacía y queda en auditoría.
              </p>
              <div className="flex gap-3">
                <OpsButton
                  className="flex-1"
                  tecla="Esc"
                  onClick={() => setConfirmando(false)}
                  disabled={isProcessing}
                >
                  Cancelar
                </OpsButton>
                <OpsButton
                  variante="primario"
                  className="flex-1"
                  tecla="Enter"
                  onClick={handleRegistrar}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Registrando…' : 'Confirmar'}
                </OpsButton>
              </div>
            </div>
          )}

          <p className="text-center text-[10px] font-bold text-ops-muted uppercase tracking-widest mt-4 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Acción registrada en auditoría
          </p>
        </div>
      </div>
    </OpsShell>
  );
}
