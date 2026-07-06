//./rh/NominasScreeen

import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Banknote,
  FileText,
  History,
  CheckCircle2,
  Calculator,
  Coins,
} from 'lucide-react';

export default function NominaScreen() {
  const { staff, nominas, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [tab, setTab] = useState('generar');

  const hoy = new Date();
  const hace7Dias = new Date(hoy);
  hace7Dias.setDate(hoy.getDate() - 6);

  const [fechaInicio, setFechaInicio] = useState(
    hace7Dias.toISOString().split('T')[0],
  );
  const [fechaFin, setFechaFin] = useState(hoy.toISOString().split('T')[0]);

  const [draft, setDraft] = useState({});

  const empleadosActivos = useMemo(() => {
    return (staff || [])
      .filter((s) => s.activo !== false)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [staff]);

  useEffect(() => {
    const nuevoDraft = {};
    empleadosActivos.forEach((emp) => {
      nuevoDraft[emp.id] = { dias: 7, propinas: '' };
    });
    setDraft(nuevoDraft);
  }, [empleadosActivos]);

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
      const dias = Number(datos.dias) || 0;
      const propinas = Number(datos.propinas) || 0;
      const sueldoBase = Number(emp.salario_base) || 0;

      const totalSueldo = dias * sueldoBase;
      const totalPagar = totalSueldo + propinas;

      totalSueldos += totalSueldo;
      totalPropinas += propinas;

      return {
        id_empleado: emp.id,
        nombre: emp.nombre,
        puesto: emp.puesto || emp.rol,
        sueldo_diario: sueldoBase,
        dias: dias,
        total_sueldo: totalSueldo,
        propinas: propinas,
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
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-500 transition-colors">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-8 rounded-[2.5rem] border border-slate-200 dark:border-ui-border shadow-xl shadow-slate-200/50 dark:shadow-none mb-8 relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 p-12 bg-emerald-50 dark:bg-brand-cesped/5 rounded-full -mr-12 -mt-12 opacity-50" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-brand-cesped p-4 rounded-3xl shadow-lg shadow-emerald-500/40 dark:shadow-brand-cesped/20 text-ui-obsidiana">
            <Banknote className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-brand-nacar tracking-tight">
              Cálculo de Nómina
            </h1>
            <p className="text-slate-500 dark:text-ui-muted font-bold mt-1 flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Sueldos y dispersión de
              propinas
            </p>
          </div>
        </div>
        <div className="flex bg-slate-100 dark:bg-ui-obsidiana p-1.5 rounded-2xl relative z-10 shadow-inner transition-colors">
          <button
            onClick={() => setTab('generar')}
            className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${tab === 'generar' ? 'bg-white dark:bg-ui-humo text-emerald-600 dark:text-brand-cesped shadow-md scale-100' : 'text-slate-500 dark:text-ui-muted hover:text-slate-900 dark:hover:text-brand-nacar'}`}
          >
            <Calculator className="w-4 h-4" /> Generar Periodo
          </button>
          <button
            onClick={() => setTab('historial')}
            className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${tab === 'historial' ? 'bg-white dark:bg-ui-humo text-emerald-600 dark:text-brand-cesped shadow-md scale-100' : 'text-slate-500 dark:text-ui-muted hover:text-slate-900 dark:hover:text-brand-nacar'}`}
          >
            <History className="w-4 h-4" /> Historial
          </button>
        </div>
      </div>

      {tab === 'generar' && (
        <div className="flex-1 flex flex-col gap-8 animate-in slide-in-from-right-4 duration-300">
          {/* BARRA DE FECHAS */}
          <div className="bg-white dark:bg-ui-humo p-6 rounded-[2rem] border-2 border-slate-50 dark:border-ui-border shadow-sm flex flex-wrap items-end gap-6 transition-colors">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-2 block">
                Periodo Inicio
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border px-4 py-3 rounded-xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-emerald-500 dark:focus:border-brand-cesped transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-2 block">
                Periodo Fin
              </label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border px-4 py-3 rounded-xl font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-emerald-500 dark:focus:border-brand-cesped transition-colors"
              />
            </div>
            <div className="w-full md:w-auto flex flex-col min-w-[150px]">
              <label className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-2 block text-right">
                Empleados Activos
              </label>
              <div className="bg-emerald-50 dark:bg-brand-cesped/10 text-emerald-600 dark:text-brand-cesped px-6 py-3 rounded-xl font-black text-center border border-emerald-100 dark:border-brand-cesped/30">
                {empleadosActivos.length} Staff
              </div>
            </div>
          </div>

          {/* TABLA EDITABLE */}
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-50 dark:border-ui-border shadow-sm overflow-hidden flex-1 transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 border-b border-slate-100 dark:border-ui-border transition-colors">
                  <tr>
                    <th className="p-5 text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-[0.15em]">
                      Colaborador
                    </th>
                    <th className="p-5 text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-[0.15em] text-center w-32">
                      Días Trabajados
                    </th>
                    <th className="p-5 text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-[0.15em] text-right w-40">
                      Salario Diario
                    </th>
                    <th className="p-5 text-[10px] font-black text-emerald-500 dark:text-brand-cesped uppercase tracking-[0.15em] text-center w-40">
                      + Propinas
                    </th>
                    <th className="p-5 text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-[0.15em] text-right w-40">
                      Total a Pagar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-ui-border">
                  {empleadosActivos.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="p-12 text-center text-slate-400 dark:text-ui-muted font-bold"
                      >
                        No hay empleados activos registrados.
                      </td>
                    </tr>
                  ) : (
                    resumenNomina.detalles.map((linea) => (
                      <tr
                        key={linea.id_empleado}
                        className="hover:bg-slate-50/50 dark:hover:bg-ui-obsidiana/30 transition-colors group"
                      >
                        <td className="p-5">
                          <p className="font-black text-slate-900 dark:text-brand-nacar">
                            {linea.nombre}
                          </p>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase">
                            {linea.puesto}
                          </span>
                        </td>
                        <td className="p-5">
                          <div className="flex items-center justify-center">
                            <input
                              type="number"
                              min="0"
                              max="31"
                              step="0.5"
                              value={draft[linea.id_empleado]?.dias ?? ''}
                              onChange={(e) =>
                                handleUpdateDraft(
                                  linea.id_empleado,
                                  'dias',
                                  e.target.value,
                                )
                              }
                              className="w-16 bg-white dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-center font-black text-slate-900 dark:text-brand-nacar py-2 rounded-xl focus:border-indigo-500 outline-none transition-colors"
                            />
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <p className="font-bold text-slate-600 dark:text-brand-nacar">
                            $
                            {linea.sueldo_diario.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-ui-muted">
                            Total: $
                            {linea.total_sueldo.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        </td>
                        <td className="p-5">
                          <div className="flex items-center relative">
                            <span className="absolute left-3 font-black text-emerald-400 dark:text-brand-cesped">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder="0.00"
                              value={draft[linea.id_empleado]?.propinas ?? ''}
                              onChange={(e) =>
                                handleUpdateDraft(
                                  linea.id_empleado,
                                  'propinas',
                                  e.target.value,
                                )
                              }
                              className="w-full bg-emerald-50/50 dark:bg-brand-cesped/10 border-2 border-emerald-100 dark:border-brand-cesped/30 text-right pl-8 pr-4 py-2 font-black text-emerald-700 dark:text-brand-cesped rounded-xl focus:border-emerald-500 dark:focus:border-brand-cesped focus:bg-white dark:focus:bg-ui-obsidiana outline-none transition-all placeholder:text-emerald-200 dark:placeholder:text-brand-cesped/50"
                            />
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <p className="font-black text-slate-900 dark:text-brand-nacar text-lg">
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
          <div className="bg-slate-900 dark:bg-ui-obsidiana border dark:border-ui-border rounded-[2rem] p-6 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 mt-auto transition-colors">
            <div className="flex items-center gap-8 w-full md:w-auto overflow-x-auto custom-scrollbar pb-2 md:pb-0">
              <div>
                <p className="text-[10px] text-slate-500 dark:text-ui-muted font-black uppercase tracking-[0.2em] mb-1">
                  Total Sueldos
                </p>
                <p className="text-xl font-black text-white dark:text-brand-nacar leading-none">
                  $
                  {resumenNomina.totalSueldos.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="h-10 w-px bg-slate-800 dark:bg-ui-border shrink-0" />
              <div>
                <p className="text-[10px] text-slate-500 dark:text-ui-muted font-black uppercase tracking-[0.2em] mb-1 flex items-center gap-1">
                  <Coins className="w-3 h-3 text-emerald-500 dark:text-brand-cesped" />{' '}
                  Total Propinas
                </p>
                <p className="text-xl font-black text-emerald-400 dark:text-brand-cesped leading-none">
                  $
                  {resumenNomina.totalPropinas.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="h-10 w-px bg-slate-800 dark:bg-ui-border shrink-0" />
              <div>
                <p className="text-[10px] text-indigo-400 dark:text-brand-amatista font-black uppercase tracking-[0.2em] mb-1">
                  Gran Total Nómina
                </p>
                <p className="text-3xl font-black text-indigo-400 dark:text-brand-amatista leading-none">
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
              className="w-full md:w-auto bg-brand-cesped hover:bg-emerald-400 disabled:bg-slate-800 disabled:dark:bg-ui-border disabled:text-slate-600 disabled:dark:text-ui-muted disabled:cursor-not-allowed text-ui-obsidiana font-black px-10 py-5 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap"
            >
              <CheckCircle2 className="w-5 h-5" /> Procesar y Guardar
            </button>
          </div>
        </div>
      )}

      {/* PESTAÑA HISTORIAL */}
      {tab === 'historial' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar animate-in slide-in-from-left-4 duration-300">
          {(nominas || []).length === 0 ? (
            <div className="bg-white dark:bg-ui-humo rounded-[3rem] border-4 border-dashed border-slate-100 dark:border-ui-border py-32 text-center transition-colors">
              <div className="bg-slate-50 dark:bg-ui-obsidiana w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <History className="w-10 h-10 text-slate-300 dark:text-ui-muted" />
              </div>
              <h3 className="text-xl font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
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
                    className="bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all group transition-colors"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-50 dark:bg-brand-cesped/10 p-3 rounded-2xl text-emerald-600 dark:text-brand-cesped">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 dark:text-brand-nacar">
                            Nómina Pagada
                          </h4>
                          <p className="text-xs font-bold text-slate-500 dark:text-ui-muted">
                            {nom.fecha_inicio} al {nom.fecha_fin}
                          </p>
                        </div>
                      </div>
                      <span className="bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-ui-muted text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-slate-200 dark:border-ui-border">
                        {(nom.detalles || []).length} Staff
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-50 dark:bg-ui-obsidiana rounded-xl p-3 border border-slate-100 dark:border-ui-border">
                        <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1">
                          Sueldos Fijos
                        </p>
                        <p className="font-bold text-slate-700 dark:text-brand-nacar">
                          $
                          {Number(nom.total_sueldos).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div className="bg-emerald-50 dark:bg-brand-cesped/10 rounded-xl p-3 border border-emerald-100 dark:border-brand-cesped/20">
                        <p className="text-[9px] font-black text-emerald-600 dark:text-brand-cesped uppercase tracking-wider mb-1">
                          Propinas Dispersadas
                        </p>
                        <p className="font-bold text-emerald-700 dark:text-brand-cesped">
                          $
                          {Number(nom.total_propinas).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-ui-border pt-4 flex justify-between items-center">
                      <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                        Gran Total
                      </p>
                      <p className="text-xl font-black text-slate-900 dark:text-brand-nacar">
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
    </div>
  );
}
