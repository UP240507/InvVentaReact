import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Trash2,
  Plus,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  PackageMinus,
  X,
  ArchiveRestore,
} from 'lucide-react';

export default function MermasScreen() {
  const { productos, movimientos, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();

  const [busqueda, setBusqueda] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [insumoSeleccionado, setInsumoSeleccionado] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('Merma');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');

  const historialAjustes = useMemo(() => {
    return (movimientos || [])
      .filter((m) => m.tipo === 'Ajuste' || m.tipo === 'Merma')
      .filter((m) => {
        if (!busqueda) return true;
        const prod = productos.find(
          (p) => String(p.id) === String(m.producto_id),
        );
        const matchProd = (prod?.nombre || '')
          .toLowerCase()
          .includes(busqueda.toLowerCase());
        const matchMotivo = (m.referencia || '')
          .toLowerCase()
          .includes(busqueda.toLowerCase());
        return matchProd || matchMotivo;
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [movimientos, productos, busqueda]);

  const registrarAjuste = (e) => {
    e.preventDefault();

    if (!insumoSeleccionado || !cantidadAjuste || Number(cantidadAjuste) <= 0) {
      return showToast(
        'Selecciona un insumo y una cantidad válida mayor a 0.',
        'error',
      );
    }

    if (!motivoAjuste.trim()) {
      return showToast('Debes justificar el motivo del ajuste.', 'error');
    }

    const producto = productos.find(
      (p) => String(p.id) === String(insumoSeleccionado),
    );
    if (!producto) return showToast('Insumo no encontrado.', 'error');

    // CRÍTICO (RLS estricto en movimientos y productos): sin restaurante_id los
    // upserts se rechazan en silencio → el ajuste aparece en RAM y se pierde al recargar.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId) {
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );
    }

    const stockActual = Number(producto.stock || 0);
    const cantidad = Number(cantidadAjuste);
    let nuevoStock = stockActual;
    let esAlta = false;

    if (tipoAjuste === 'Alta de Inventario') {
      nuevoStock = Number((stockActual + cantidad).toFixed(3));
      esAlta = true;
    } else {
      if (cantidad > stockActual) {
        return showToast(
          `No puedes dar de baja más stock del que tienes (${stockActual} ${producto.unidad}).`,
          'error',
        );
      }
      nuevoStock = Number((stockActual - cantidad).toFixed(3));
    }

    const tipoMovimiento = esAlta ? 'Ajuste' : 'Merma';

    const nuevoMovimiento = {
      id: Date.now(),
      tipo: tipoMovimiento,
      producto_id: producto.id,
      cantidad: cantidad,
      referencia: `[${tipoAjuste}] ${motivoAjuste.trim()}`,
      fecha: new Date().toISOString(),
      usuario: user?.nombre || 'Administrador',
      stock_anterior: stockActual,
      stock_nuevo: nuevoStock,
      restaurante_id: restauranteId,
    };

    const productoActualizado = {
      ...producto,
      stock: nuevoStock,
      restaurante_id: producto.restaurante_id || restauranteId,
    };

    enqueueAction('productos', 'upsert', productoActualizado);
    enqueueAction('movimientos', 'upsert', nuevoMovimiento);

    useAppStore.setState((prev) => ({
      productos: prev.productos.map((p) =>
        p.id === producto.id ? productoActualizado : p,
      ),
      movimientos: [nuevoMovimiento, ...(prev.movimientos || [])],
    }));

    showToast(`Inventario actualizado exitosamente.`, 'success');
    cerrarModal();
  };

  const cerrarModal = () => {
    setIsModalOpen(false);
    setInsumoSeleccionado('');
    setCantidadAjuste('');
    setMotivoAjuste('');
    setTipoAjuste('Merma');
  };

  const formatNum = (num) =>
    Number(num).toLocaleString('es-MX', { maximumFractionDigits: 3 });

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in transition-colors duration-500">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border shadow-sm mb-6 transition-colors">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-brand-nacar flex items-center gap-3">
            <div className="bg-rose-100 dark:bg-brand-arrecife/10 p-2 rounded-xl">
              <Trash2 className="w-6 h-6 text-rose-600 dark:text-brand-arrecife" />
            </div>
            Mermas y Ajustes
          </h1>
          <p className="text-sm text-slate-500 dark:text-ui-muted mt-1">
            Registra pérdidas, consumos de personal o cuadres de inventario
            físico.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto bg-slate-900 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana px-6 py-3 rounded-2xl font-black shadow-lg shadow-slate-900/20 dark:shadow-brand-arrecife/20 hover:bg-slate-800 dark:hover:bg-orange-600 transition-transform active:scale-95 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Registrar Ajuste
        </button>
      </div>

      {/* BÚSQUEDA */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por insumo o motivo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold pl-12 pr-4 py-3.5 rounded-2xl outline-none focus:border-rose-500 dark:focus:border-brand-arrecife shadow-sm transition-colors"
          />
        </div>
      </div>

      {/* TABLA DE HISTORIAL */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {historialAjustes.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-ui-humo rounded-3xl border border-dashed border-slate-300 dark:border-ui-border transition-colors">
            <div className="bg-slate-50 dark:bg-ui-obsidiana w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-ui-border">
              <ArchiveRestore className="w-12 h-12 text-slate-400 dark:text-ui-muted opacity-50" />
            </div>
            <h3 className="text-xl font-black text-slate-700 dark:text-brand-nacar">
              Sin registros
            </h3>
            <p className="text-slate-500 dark:text-ui-muted mt-2 mb-6 font-medium">
              No se han registrado mermas ni ajustes manuales recientemente.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-ui-humo rounded-3xl border border-slate-200 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 text-slate-500 dark:text-ui-muted uppercase font-black text-[10px] tracking-widest border-b border-slate-200 dark:border-ui-border">
                <tr>
                  <th className="p-4 pl-6 w-32">Fecha / Usuario</th>
                  <th className="p-4 w-48">Insumo Afectado</th>
                  <th className="p-4">Tipo y Justificación</th>
                  <th className="p-4 text-center w-36">Impacto (Cant)</th>
                  <th className="p-4 text-right w-36">Inventario Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-ui-border">
                {historialAjustes.map((mov) => {
                  const prod = productos.find(
                    (p) => String(p.id) === String(mov.producto_id),
                  );
                  const esMerma = mov.tipo === 'Merma';
                  const match = (mov.referencia || '').match(/\[(.*?)\] (.*)/);
                  const tipoEtiqueta = match ? match[1] : mov.tipo;
                  const justificacion = match ? match[2] : mov.referencia || '';

                  return (
                    <tr
                      key={mov.id}
                      className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/30 transition-colors group"
                    >
                      <td className="p-4 pl-6 align-top">
                        <p className="font-bold text-slate-900 dark:text-brand-nacar">
                          {new Date(mov.fecha).toLocaleString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-0.5">
                          {mov.usuario}
                        </p>
                      </td>
                      <td className="p-4 align-top">
                        <p className="font-black text-slate-700 dark:text-brand-nacar">
                          {prod ? prod.nombre : 'Insumo Desconocido'}
                        </p>
                        {prod && prod.codigo && (
                          <p className="text-[10px] font-mono text-slate-400 dark:text-ui-muted mt-0.5">
                            {prod.codigo}
                          </p>
                        )}
                      </td>
                      <td className="p-4 align-top max-w-sm">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border mb-1.5 inline-block ${
                            tipoEtiqueta.includes('Alta')
                              ? 'bg-emerald-50 dark:bg-brand-cesped/10 text-emerald-600 dark:text-brand-cesped border-emerald-200 dark:border-brand-cesped/30'
                              : tipoEtiqueta.includes('Consumo')
                                ? 'bg-amber-50 dark:bg-brand-ambar/10 text-amber-600 dark:text-brand-ambar border-amber-200 dark:border-brand-ambar/30'
                                : 'bg-rose-50 dark:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife border-rose-200 dark:border-brand-arrecife/30'
                          }`}
                        >
                          {tipoEtiqueta}
                        </span>
                        <p className="text-xs font-medium text-slate-600 dark:text-brand-nacar whitespace-normal break-words leading-relaxed">
                          {justificacion}
                        </p>
                      </td>
                      <td className="p-4 text-center align-top">
                        <div
                          className={`inline-flex items-center gap-1 font-black px-3 py-1.5 rounded-lg ${esMerma ? 'bg-rose-50 dark:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife' : 'bg-emerald-50 dark:bg-brand-cesped/10 text-emerald-600 dark:text-brand-cesped'}`}
                        >
                          {esMerma ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                          {formatNum(mov.cantidad)} {prod?.unidad}
                        </div>
                      </td>
                      <td className="p-4 text-right align-top">
                        <p className="font-black text-slate-900 dark:text-brand-nacar">
                          {formatNum(mov.stock_nuevo)} {prod?.unidad}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-ui-muted font-bold mt-1">
                          Era {formatNum(mov.stock_anterior)}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL REGISTRO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95 transition-colors">
            <div className="p-6 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-slate-200 dark:bg-ui-border p-2 rounded-xl">
                  <PackageMinus className="w-5 h-5 text-slate-700 dark:text-brand-nacar" />
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar">
                  Ajuste de Inventario
                </h2>
              </div>
              <button
                onClick={cerrarModal}
                className="text-slate-400 dark:text-ui-muted hover:bg-slate-200 dark:hover:bg-ui-border p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <form
                id="formAjuste"
                onSubmit={registrarAjuste}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-ui-muted mb-1.5">
                    Insumo a afectar *
                  </label>
                  <select
                    value={insumoSeleccionado}
                    onChange={(e) => setInsumoSeleccionado(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold px-4 py-3 rounded-xl outline-none focus:border-slate-500 dark:focus:border-brand-amatista transition-colors"
                  >
                    <option value="">Selecciona un insumo...</option>
                    {(productos || [])
                      .filter((p) => p.activo !== false)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} (Stock: {p.stock} {p.unidad})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-ui-muted mb-1.5">
                      Categoría *
                    </label>
                    <select
                      value={tipoAjuste}
                      onChange={(e) => setTipoAjuste(e.target.value)}
                      className={`w-full border font-bold px-4 py-3 rounded-xl outline-none transition-colors ${
                        tipoAjuste === 'Alta de Inventario'
                          ? 'bg-emerald-50 dark:bg-brand-cesped/10 border-emerald-200 dark:border-brand-cesped/30 text-emerald-800 dark:text-brand-cesped focus:border-emerald-500'
                          : tipoAjuste === 'Consumo Interno'
                            ? 'bg-amber-50 dark:bg-brand-ambar/10 border-amber-200 dark:border-brand-ambar/30 text-amber-800 dark:text-brand-ambar focus:border-amber-500'
                            : 'bg-rose-50 dark:bg-brand-arrecife/10 border-rose-200 dark:border-brand-arrecife/30 text-rose-800 dark:text-brand-arrecife focus:border-rose-500'
                      }`}
                    >
                      <option value="Merma">Merma (Desecho / Caducidad)</option>
                      <option value="Consumo Interno">
                        Consumo Interno / Cortesía
                      </option>
                      <option value="Alta de Inventario">
                        Alta (Sobra físico / Cuadre)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-ui-muted mb-1.5">
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={cantidadAjuste}
                      onChange={(e) => setCantidadAjuste(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-black px-4 py-3 rounded-xl outline-none focus:border-slate-500 dark:focus:border-brand-amatista transition-colors"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {insumoSeleccionado && cantidadAjuste && (
                  <div className="bg-slate-100 dark:bg-ui-obsidiana p-3 rounded-lg flex items-start gap-3 mt-2 border border-slate-200 dark:border-ui-border transition-colors">
                    <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-ui-muted shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 dark:text-brand-nacar font-medium">
                      El sistema va a{' '}
                      <strong
                        className={
                          tipoAjuste === 'Alta de Inventario'
                            ? 'text-emerald-600 dark:text-brand-cesped'
                            : 'text-rose-600 dark:text-brand-arrecife'
                        }
                      >
                        {tipoAjuste === 'Alta de Inventario'
                          ? 'SUMAR'
                          : 'RESTAR'}{' '}
                        {cantidadAjuste}
                      </strong>{' '}
                      unidades del inventario. <br />
                      Stock final estimado:{' '}
                      <strong className="font-mono text-slate-900 dark:text-brand-nacar text-sm">
                        {tipoAjuste === 'Alta de Inventario'
                          ? (
                              Number(
                                productos.find(
                                  (p) => String(p.id) === insumoSeleccionado,
                                )?.stock || 0,
                              ) + Number(cantidadAjuste)
                            ).toFixed(3)
                          : (
                              Number(
                                productos.find(
                                  (p) => String(p.id) === insumoSeleccionado,
                                )?.stock || 0,
                              ) - Number(cantidadAjuste)
                            ).toFixed(3)}
                      </strong>
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-ui-muted mb-1.5">
                    Justificación del Ajuste *
                  </label>
                  <textarea
                    required
                    value={motivoAjuste}
                    onChange={(e) => setMotivoAjuste(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-medium p-4 rounded-xl outline-none focus:border-slate-500 dark:focus:border-brand-amatista min-h-[100px] resize-none text-sm transition-colors"
                    placeholder="Ej. Se echó a perder, comida para el turno de la tarde, error de conteo anterior..."
                  ></textarea>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-ui-border bg-white dark:bg-ui-humo shrink-0 flex gap-4 transition-colors">
              <button
                type="button"
                onClick={cerrarModal}
                className="flex-1 py-4 rounded-2xl border-2 border-slate-200 dark:border-ui-border text-slate-600 dark:text-brand-nacar font-black hover:bg-slate-50 dark:hover:bg-ui-obsidiana transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="formAjuste"
                className="flex-1 bg-slate-900 dark:bg-brand-arrecife hover:bg-slate-800 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black py-4 rounded-2xl shadow-lg shadow-slate-900/30 dark:shadow-brand-arrecife/30 transition-transform active:scale-95"
              >
                Confirmar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
