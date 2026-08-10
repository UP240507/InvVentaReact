//./rh/NominasScreeen

import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../api/supabase';
import { parseUTC } from '../../utils/parseUTC';
import { unidadesDeSueldo, propinasPorEmpleado } from '../../lib/Nominas';
import { useAppStore } from '../../store/useAppStore';
import { PageShell, PageHeader, SegmentedControl } from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { Banknote, FileText, History, CheckCircle2, Coins } from 'lucide-react';
import { aISOLocal } from '../../lib/Fechas';

export default function NominaScreen() {
  const { staff, nominas, asistencias, turnos, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [tab, setTab] = useState('generar');

  const hoy = new Date();
  const hace7Dias = new Date(hoy);
  hace7Dias.setDate(hoy.getDate() - 6);

  // Fechas LOCALES: con UTC el periodo por defecto se corría un día entero
  // desde las 18:00, y una nómina se calcula sobre días de calendario.
  const [fechaInicio, setFechaInicio] = useState(aISOLocal(hace7Dias));
  const [fechaFin, setFechaFin] = useState(aISOLocal(hoy));

  const [draft, setDraft] = useState({});
  // Repartos del Propinero que caen en el periodo (fuente de verdad de propinas).
  const [repartosPeriodo, setRepartosPeriodo] = useState([]);
  const [propinasStatus, setPropinasStatus] = useState('cargando'); // cargando|ok|offline

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setPropinasStatus('cargando');
      if (!navigator.onLine) {
        setRepartosPeriodo([]);
        setPropinasStatus('offline');
        return;
      }
      try {
        const restauranteId = useAuthStore.getState().restauranteId;
        const { data, error } = await supabase
          .from('propinas_reparto')
          .select('*')
          .eq('restaurante_id', restauranteId);
        if (error) throw error;

        // Ventana del reparto: rango explícito (modo dia/semana/rango) o la
        // ventana del turno (modo turno, resuelta contra los turnos en RAM);
        // fallback: fecha de creación del reparto.
        const desdeDt = parseUTC(fechaInicio + 'T00:00:00.000');
        const hastaDt = parseUTC(fechaFin + 'T23:59:59.999');
        const enPeriodo = (data || []).filter((rep) => {
          let a = rep.rango_desde ? parseUTC(rep.rango_desde) : null;
          let b = rep.rango_hasta ? parseUTC(rep.rango_hasta) : null;
          if (!a && rep.turno_id) {
            const t = (turnos || []).find(
              (x) => String(x.id) === String(rep.turno_id),
            );
            a = t?.fecha_apertura ? parseUTC(t.fecha_apertura) : null;
            b = t?.fecha_cierre ? parseUTC(t.fecha_cierre) : a;
          }
          if (!a) a = rep.creado_en ? parseUTC(rep.creado_en) : null;
          if (!b) b = a;
          if (!a) return false;
          return a <= hastaDt && b >= desdeDt; // solapamiento de ventanas
        });
        if (!cancelado) {
          setRepartosPeriodo(enPeriodo);
          setPropinasStatus('ok');
        }
      } catch (e) {
        console.warn('[Nominas] No se pudieron leer los repartos:', e?.message);
        if (!cancelado) {
          setRepartosPeriodo([]);
          setPropinasStatus('offline');
        }
      }
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [fechaInicio, fechaFin, turnos]);

  const empleadosActivos = useMemo(() => {
    return (staff || [])
      .filter((s) => s.activo !== false)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [staff]);

  // Pre-cálculo automático por empleado según su tipo_sueldo. Las UNIDADES
  // quedan editables (última palabra humana en nómina); las PROPINAS son de
  // SOLO LECTURA: vienen del Propinero (fuente de verdad), no se capturan.
  useEffect(() => {
    const desdeDt = parseUTC(fechaInicio + 'T00:00:00.000');
    const hastaDt = parseUTC(fechaFin + 'T23:59:59.999');
    const nuevoDraft = {};
    empleadosActivos.forEach((emp) => {
      const u = unidadesDeSueldo(emp, {
        asistencias,
        turnos,
        desdeDt,
        hastaDt,
      });
      nuevoDraft[emp.id] = {
        dias: u.unidades,
        tipo: u.tipo,
        etiqueta: u.etiqueta,
        propinas: propinasPorEmpleado(repartosPeriodo, emp),
      };
    });
    setDraft(nuevoDraft);
  }, [
    empleadosActivos,
    fechaInicio,
    fechaFin,
    asistencias,
    turnos,
    repartosPeriodo,
  ]);

  const handleUpdateDraft = (id, campo, valor) => {
    setDraft((prev) => ({
      ...prev,
      [id]: { ...prev[id], [campo]: valor },
    }));
  };

  const resumenNomina = useMemo(() => {
    let totalSueldos = 0;
    let totalPropinas = 0;

    const detalles = empleadosActivos.map((emp) => {
      const datos = draft[emp.id] || { dias: 0, propinas: 0 };
      const unidades = Number(datos.dias) || 0;
      const propinas = Number(datos.propinas) || 0;
      const sueldoBase = Number(emp.salario_base) || 0;

      const totalSueldo = Number((unidades * sueldoBase).toFixed(2));
      const totalPagar = Number((totalSueldo + propinas).toFixed(2));

      totalSueldos += totalSueldo;
      totalPropinas += propinas;

      return {
        id_empleado: emp.id,
        nombre: emp.nombre,
        puesto: emp.puesto || emp.rol,
        tipo_sueldo: datos.tipo || emp.tipo_sueldo || 'dia',
        unidad: datos.etiqueta || 'días',
        sueldo_diario: sueldoBase, // nombre legado: tarifa por unidad
        dias: unidades, // nombre legado: unidades (hrs/días/turnos)
        total_sueldo: totalSueldo,
        propinas: propinas,
        propinas_fuente: 'propinero',
        total_pagar: totalPagar,
      };
    });

    return {
      detalles,
      totalSueldos,
      totalPropinas,
      granTotal: totalSueldos + totalPropinas,
    };
  }, [empleadosActivos, draft]);

  const guardarNomina = () => {
    if (resumenNomina.detalles.length === 0)
      return showToast('No hay empleados para generar nómina', 'error');
    if (!fechaInicio || !fechaFin)
      return showToast('Selecciona un rango de fechas válido', 'error');

    // CRÍTICO (RLS tenant_nominas estricto): sin restaurante_id el insert se rechaza.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );

    const payload = {
      id: Date.now(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      total_sueldos: Number(resumenNomina.totalSueldos.toFixed(2)),
      total_propinas: Number(resumenNomina.totalPropinas.toFixed(2)),
      gran_total: Number(resumenNomina.granTotal.toFixed(2)),
      detalles: resumenNomina.detalles,
      estado: 'Pagada',
      activo: true,
      restaurante_id: restauranteId,
    };

    // upsert (idempotente offline). upsertNomina no existe en el store;
    // se actualiza la RAM con setState directo, como el resto de pantallas.
    enqueueAction('nominas', 'upsert', payload);
    useAppStore.setState((prev) => ({
      nominas: [payload, ...(prev.nominas || [])],
    }));

    showToast('Nómina procesada y guardada exitosamente', 'success');
    setTab('historial');
  };

  return (
    <PageShell>
      <PageHeader
        icono={Banknote}
        titulo="Cálculo de Nómina"
        descripcion="Sueldos y dispersión de propinas"
        acciones={
          <SegmentedControl
            valor={tab}
            onChange={setTab}
            opciones={[
              { id: 'generar', label: 'Generar periodo' },
              { id: 'historial', label: 'Historial' },
            ]}
          />
        }
      />

      {tab === 'generar' && (
        <div className="flex-1 flex flex-col gap-8 animate-in slide-in-from-right-4 duration-media">
          {/* BARRA DE FECHAS */}
          <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm flex flex-wrap items-end gap-6 transition-colors">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-2 block">
                Periodo Inicio
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full bg-adm-bg border-2 border-adm-field px-4 py-3 rounded-ui font-bold text-adm-ink outline-none focus:border-adm-ok dark:focus:border-adm-ok transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-2 block">
                Periodo Fin
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full bg-adm-bg border-2 border-adm-field px-4 py-3 rounded-ui font-bold text-adm-ink outline-none focus:border-adm-ok dark:focus:border-adm-ok transition-colors"
              />
            </div>
            <div className="w-full md:w-auto flex flex-col min-w-[150px]">
              <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-2 block text-right">
                Empleados Activos
              </label>
              <div className="bg-adm-ok/10 text-adm-ok px-6 py-3 rounded-ui font-black text-center border border-adm-ok/30">
                {empleadosActivos.length} Staff
              </div>
            </div>
          </div>

          {/* ESTADO DE PROPINAS (fuente: Propinero) */}
          <div
            className={`mb-4 px-5 py-3 rounded-ui border-2 text-xs font-bold flex items-center gap-2 ${
              propinasStatus === 'offline'
                ? 'bg-adm-warn/10 border-adm-warn/30 text-adm-warn'
                : 'bg-adm-ok/10 border-adm-ok/30 text-adm-ok'
            }`}
          >
            {propinasStatus === 'offline'
              ? '⚠️ Sin conexión: no se pudieron leer los repartos del Propinero. Las propinas se muestran en $0 — genera la nómina con red.'
              : propinasStatus === 'cargando'
                ? 'Cargando repartos del Propinero...'
                : `Propinas de solo lectura, tomadas de ${repartosPeriodo.length} reparto${repartosPeriodo.length === 1 ? '' : 's'} del Propinero en el periodo. Para ajustarlas, reparte en el Propinero.`}
          </div>

          {/* TABLA EDITABLE */}
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm overflow-hidden flex-1 transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-adm-bg border-b border-adm-border transition-colors">
                  <tr>
                    <th className="p-5 text-[10px] font-black text-adm-muted uppercase tracking-[0.15em]">
                      Colaborador
                    </th>
                    <th className="p-5 text-[10px] font-black text-adm-muted uppercase tracking-[0.15em] text-center w-32">
                      Unidades
                    </th>
                    <th className="p-5 text-[10px] font-black text-adm-muted uppercase tracking-[0.15em] text-right w-40">
                      Tarifa
                    </th>
                    <th className="p-5 text-[10px] font-black text-adm-ok uppercase tracking-[0.15em] text-center w-40">
                      + Propinas
                    </th>
                    <th className="p-5 text-[10px] font-black text-adm-muted uppercase tracking-[0.15em] text-right w-40">
                      Total a Pagar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adm-border">
                  {empleadosActivos.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="p-12 text-center text-adm-muted font-bold"
                      >
                        No hay empleados activos registrados.
                      </td>
                    </tr>
                  ) : (
                    resumenNomina.detalles.map((linea) => (
                      <tr
                        key={linea.id_empleado}
                        className="hover:bg-adm-bg/50 dark:hover:bg-adm-bg/30 transition-colors group"
                      >
                        <td className="p-5">
                          <p className="font-black text-adm-ink">
                            {linea.nombre}
                          </p>
                          <span className="text-[10px] font-bold text-adm-muted uppercase">
                            {linea.puesto}
                          </span>
                        </td>
                        <td className="p-5">
                          <div className="flex items-center justify-center">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={draft[linea.id_empleado]?.dias ?? ''}
                              onChange={(e) =>
                                handleUpdateDraft(
                                  linea.id_empleado,
                                  'dias',
                                  e.target.value,
                                )
                              }
                              className="w-16 bg-white dark:bg-adm-bg border-2 border-adm-field text-center font-black text-adm-ink py-2 rounded-ui focus:border-adm-info outline-none transition-colors"
                            />
                            <span
                              className={`ml-2 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-ui border ${
                                draft[linea.id_empleado]?.tipo === 'hora'
                                  ? 'bg-adm-info/10 text-adm-info border-adm-info/30'
                                  : draft[linea.id_empleado]?.tipo === 'turno'
                                    ? 'bg-adm-warn/10 text-adm-warn border-adm-warn/30'
                                    : 'bg-adm-bg text-adm-muted border-adm-border'
                              }`}
                              title="Definido en Staff (tipo de sueldo)"
                            >
                              {draft[linea.id_empleado]?.tipo === 'hora'
                                ? 'Por hora'
                                : draft[linea.id_empleado]?.tipo === 'turno'
                                  ? 'Por turno'
                                  : 'Por día'}
                            </span>
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <p className="font-bold text-adm-muted dark:text-adm-ink">
                            $
                            {linea.sueldo_diario.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-adm-info">
                            por{' '}
                            {linea.tipo_sueldo === 'hora'
                              ? 'hora'
                              : linea.tipo_sueldo === 'turno'
                                ? 'turno'
                                : 'día'}
                          </p>
                          <p className="text-[9px] font-bold text-adm-muted">
                            Total: $
                            {linea.total_sueldo.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        </td>
                        <td className="p-5">
                          <div
                            className="text-right"
                            title="Suma de los repartos del Propinero en el periodo"
                          >
                            <p className="font-black text-adm-ok text-lg leading-none">
                              $
                              {Number(
                                draft[linea.id_empleado]?.propinas || 0,
                              ).toLocaleString('es-MX', {
                                minimumFractionDigits: 2,
                              })}
                            </p>
                            <span className="text-[9px] font-black uppercase tracking-widest text-adm-ok">
                              Propinero
                            </span>
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <p className="font-black text-adm-ink text-lg">
                            $
                            {linea.total_pagar.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* FOOTER TOTALES Y GUARDAR */}
          <div className="bg-adm-ink dark:bg-adm-bg border dark:border-adm-border rounded-ui-lg p-6 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 mt-auto transition-colors">
            <div className="flex items-center gap-8 w-full md:w-auto overflow-x-auto custom-scrollbar pb-2 md:pb-0">
              <div>
                <p className="text-[10px] text-adm-muted font-black uppercase tracking-[0.2em] mb-1">
                  Total Sueldos
                </p>
                <p className="text-xl font-black text-adm-bg dark:text-adm-ink leading-none">
                  $
                  {resumenNomina.totalSueldos.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="h-10 w-px bg-adm-ink dark:bg-adm-border shrink-0" />
              <div>
                <p className="text-[10px] text-adm-muted font-black uppercase tracking-[0.2em] mb-1 flex items-center gap-1">
                  <Coins className="w-3 h-3 text-adm-ok" /> Total Propinas
                </p>
                <p className="text-xl font-black text-adm-ok leading-none">
                  $
                  {resumenNomina.totalPropinas.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="h-10 w-px bg-adm-ink dark:bg-adm-border shrink-0" />
              <div>
                <p className="text-[10px] text-adm-info font-black uppercase tracking-[0.2em] mb-1">
                  Gran Total Nómina
                </p>
                <p className="text-3xl font-black text-adm-info leading-none">
                  $
                  {resumenNomina.granTotal.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>

            <button
              onClick={guardarNomina}
              disabled={empleadosActivos.length === 0}
              className="w-full md:w-auto bg-adm-ok disabled:bg-adm-ink disabled:dark:bg-adm-border disabled:text-adm-muted disabled:dark:text-adm-muted disabled:cursor-not-allowed text-adm-bg font-black px-10 py-5 rounded-ui shadow-xl shadow-adm-ok/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap"
            >
              <CheckCircle2 className="w-5 h-5" /> Procesar y Guardar
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA HISTORIAL */}
      {tab === 'historial' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar animate-in slide-in-from-left-4 duration-media">
          {(nominas || []).length === 0 ? (
            <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-4 border-dashed border-adm-border py-32 text-center transition-colors">
              <div className="bg-adm-bg w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <History className="w-10 h-10 text-adm-muted" />
              </div>
              <h3 className="text-xl font-black text-adm-muted uppercase tracking-widest">
                No hay historial de nóminas
              </h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(nominas || [])
                .slice()
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((nom) => (
                  <div
                    key={nom.id}
                    className="bg-white dark:bg-adm-panel border-2 border-adm-border rounded-ui-lg p-6 shadow-sm hover:shadow-xl transition-all group transition-colors"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="bg-adm-ok/10 p-3 rounded-ui text-adm-ok">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-black text-adm-ink">
                            Nómina Pagada
                          </h4>
                          <p className="text-xs font-bold text-adm-muted">
                            {nom.fecha_inicio} al {nom.fecha_fin}
                          </p>
                        </div>
                      </div>
                      <span className="bg-adm-chip dark:bg-adm-bg text-adm-muted text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-adm-border">
                        {(nom.detalles || []).length} Staff
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-adm-bg rounded-ui p-3 border border-adm-border">
                        <p className="text-[9px] font-black text-adm-muted uppercase tracking-wider mb-1">
                          Sueldos Fijos
                        </p>
                        <p className="font-bold text-adm-ink">
                          $
                          {Number(nom.total_sueldos).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div className="bg-adm-ok/10 rounded-ui p-3 border border-adm-ok/30">
                        <p className="text-[9px] font-black text-adm-ok uppercase tracking-wider mb-1">
                          Propinas Dispersadas
                        </p>
                        <p className="font-bold text-adm-ok">
                          $
                          {Number(nom.total_propinas).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-adm-border pt-4 flex justify-between items-center">
                      <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                        Gran Total
                      </p>
                      <p className="text-xl font-black text-adm-ink">
                        $
                        {Number(nom.gran_total).toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
