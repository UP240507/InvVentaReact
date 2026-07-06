import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  PackageCheck,
  Download,
  CheckCircle,
  Clock,
  ArchiveRestore,
  Truck,
  FileText,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

export default function RecepcionScreen() {
  const { ordenesCompra, productos, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState('pendientes');
  const [ordenAConfirmar, setOrdenAConfirmar] = useState(null);

  const { pendientes, recibidas } = useMemo(() => {
    const ordenes = ordenesCompra || [];
    return {
      pendientes: ordenes
        .filter((o) => o.estado === 'pendiente')
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha)),
      recibidas: ordenes
        .filter((o) => o.estado === 'completada')
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)),
    };
  }, [ordenesCompra]);

  const recibirMercancia = () => {
    if (!ordenAConfirmar) return;
    const orden = ordenAConfirmar;

    if (orden.estado !== 'pendiente') {
      showToast('Esta orden ya fue procesada anteriormente.', 'error');
      setOrdenAConfirmar(null);
      return;
    }

    // CRÍTICO (RLS estricto en movimientos y productos): sin restaurante_id los
    // upserts se rechazan en silencio → el stock/kardex aparece en RAM y se pierde al recargar.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId) {
      showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );
      return;
    }

    let productosActualizados = [...productos];
    const nuevosMovimientos = [];

    (orden.items || []).forEach((item, index) => {
      const prodIndex = productosActualizados.findIndex(
        (p) => String(p.id) === String(item.id_producto),
      );

      if (prodIndex !== -1) {
        const prod = productosActualizados[prodIndex];

        // 1. Variables de Stock
        const stockAnterior = Number(prod.stock || 0);
        const cantidadRecibida = Number(item.cantidad || 0);
        const nuevoStock = Number(
          (stockAnterior + cantidadRecibida).toFixed(3),
        );

        // 2. Costo Promedio Ponderado
        const costoAnterior = Number(prod.precio || 0);
        const costoRecibido = Number(item.precio_unitario || costoAnterior);
        let nuevoCostoPromedio = costoAnterior;

        if (nuevoStock > 0) {
          const valorInventarioAnterior = stockAnterior * costoAnterior;
          const valorEntradaNueva = cantidadRecibida * costoRecibido;
          nuevoCostoPromedio = Number(
            (
              (valorInventarioAnterior + valorEntradaNueva) /
              nuevoStock
            ).toFixed(2),
          );
        }

        productosActualizados[prodIndex] = {
          ...prod,
          stock: nuevoStock,
          precio: nuevoCostoPromedio,
          restaurante_id: prod.restaurante_id || restauranteId,
        };
        enqueueAction('productos', 'upsert', productosActualizados[prodIndex]);

        const movimiento = {
          id: Date.now() + index,
          tipo: 'Entrada',
          producto_id: prod.id,
          cantidad: cantidadRecibida,
          referencia: `OC: ${orden.numero || orden.folio} | Costo Ingreso: $${costoRecibido}`,
          fecha: new Date().toISOString(),
          usuario: user?.nombre || 'Administrador',
          stock_anterior: stockAnterior,
          stock_nuevo: nuevoStock,
          restaurante_id: restauranteId,
        };
        nuevosMovimientos.push(movimiento);
        enqueueAction('movimientos', 'upsert', movimiento);
      }
    });

    const ordenActualizada = { ...orden, estado: 'completada' };
    // Tabla en snake_case (ordenes_compra). El 'ordenesCompra' camelCase previo
    // generaba 404 "table not found" y moría en dead-letter.
    enqueueAction('ordenes_compra', 'upsert', ordenActualizada);

    useAppStore.setState((prev) => ({
      productos: productosActualizados,
      movimientos: [...(prev.movimientos || []), ...nuevosMovimientos],
      ordenesCompra: (prev.ordenesCompra || []).map((o) =>
        o.id === orden.id ? ordenActualizada : o,
      ),
    }));

    showToast(`Mercancía ingresada y costos promediados con éxito.`, 'success');
    setOrdenAConfirmar(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in transition-colors duration-500">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border shadow-sm mb-6 transition-colors">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-brand-nacar flex items-center gap-3">
            <div className="bg-emerald-100 dark:bg-brand-cesped/10 p-2 rounded-xl">
              <PackageCheck className="w-6 h-6 text-emerald-600 dark:text-brand-cesped" />
            </div>
            Recepción de Mercancía
          </h1>
          <p className="text-sm text-slate-500 dark:text-ui-muted mt-1">
            Dale entrada a los insumos y actualiza tu inventario y costos
            automáticamente.
          </p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-ui-border mb-6 pb-0 transition-colors">
        <button
          onClick={() => setActiveTab('pendientes')}
          className={`px-4 sm:px-6 py-4 font-black text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'pendientes' ? 'border-emerald-600 text-emerald-600 dark:text-brand-cesped dark:border-brand-cesped' : 'border-transparent text-slate-400 dark:text-ui-muted hover:text-slate-600 dark:hover:text-brand-nacar'}`}
        >
          <Download className="w-4 h-4" /> Por Recibir
          {pendientes.length > 0 && (
            <span className="bg-rose-500 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana text-[10px] px-2 py-0.5 rounded-full">
              {pendientes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          className={`px-4 sm:px-6 py-4 font-black text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'historial' ? 'border-slate-800 text-slate-900 dark:border-brand-nacar dark:text-brand-nacar' : 'border-transparent text-slate-400 dark:text-ui-muted hover:text-slate-600 dark:hover:text-brand-nacar'}`}
        >
          <Clock className="w-4 h-4" /> Historial
        </button>
      </div>

      {/* TAB PENDIENTES */}
      {activeTab === 'pendientes' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
          {pendientes.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-ui-humo rounded-3xl border border-dashed border-slate-300 dark:border-ui-border transition-colors">
              <div className="bg-emerald-50 dark:bg-ui-obsidiana w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-ui-border">
                <CheckCircle className="w-12 h-12 text-emerald-400 dark:text-ui-muted opacity-50" />
              </div>
              <h3 className="text-xl font-black text-slate-700 dark:text-brand-nacar">
                Almacén al día
              </h3>
              <p className="text-slate-500 dark:text-ui-muted mt-2 font-medium">
                No tienes órdenes de compra pendientes por recibir.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendientes.map((orden) => (
                <div
                  key={orden.id}
                  className="bg-white dark:bg-ui-humo p-6 rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm hover:border-emerald-300 dark:hover:border-brand-cesped transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border flex-shrink-0 group-hover:bg-emerald-50 dark:group-hover:bg-brand-cesped/10 transition-colors">
                      <Truck className="w-8 h-8 text-slate-400 dark:text-ui-muted group-hover:text-emerald-500 dark:group-hover:text-brand-cesped transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-black text-xl text-slate-900 dark:text-brand-nacar flex items-center gap-2">
                        {orden.numero || orden.folio}
                        {orden.referencia ===
                          'Generada automáticamente por stock bajo' && (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-brand-ambar bg-amber-50 dark:bg-brand-ambar/10 px-2 py-0.5 rounded-md border border-amber-200 dark:border-brand-ambar/30">
                            ⚡ Auto
                          </span>
                        )}
                      </h3>
                      <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mt-1">
                        {orden.proveedor_nombre || orden.proveedor}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs font-medium text-slate-400 dark:text-ui-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />{' '}
                          {new Date(orden.fecha).toLocaleDateString('es-MX')}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />{' '}
                          {(orden.items || []).length} Insumos
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full lg:w-auto flex-shrink-0 flex items-center gap-4">
                    <div className="text-right hidden lg:block">
                      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-ui-muted tracking-widest mb-0.5">
                        Importe Estimado
                      </p>
                      <p className="text-lg font-black text-slate-900 dark:text-brand-nacar">
                        $
                        {Number(
                          orden.total_estimado || orden.total || 0,
                        ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <button
                      onClick={() => setOrdenAConfirmar(orden)}
                      className="w-full lg:w-auto bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] text-white dark:text-ui-obsidiana px-8 py-4 rounded-xl font-black shadow-lg shadow-emerald-500/30 dark:shadow-brand-cesped/30 transition-transform active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" /> Dar Entrada
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB HISTORIAL */}
      {activeTab === 'historial' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
          {recibidas.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-ui-humo rounded-3xl border border-dashed border-slate-300 dark:border-ui-border transition-colors">
              <div className="bg-slate-50 dark:bg-ui-obsidiana w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-ui-border">
                <ArchiveRestore className="w-12 h-12 text-slate-400 dark:text-ui-muted opacity-50" />
              </div>
              <h3 className="text-xl font-black text-slate-700 dark:text-brand-nacar">
                Sin historial
              </h3>
            </div>
          ) : (
            <div className="bg-white dark:bg-ui-humo rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 text-slate-500 dark:text-ui-muted uppercase font-black text-[10px] tracking-widest border-b border-slate-200 dark:border-ui-border">
                    <tr>
                      <th className="p-4">Folio / Proveedor</th>
                      <th className="p-4">Fecha de Emisión</th>
                      <th className="p-4 text-center">Insumos Entrados</th>
                      <th className="p-4 text-right">Monto</th>
                      <th className="p-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-ui-border">
                    {recibidas.map((orden) => (
                      <tr
                        key={orden.id}
                        className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/30 transition-colors"
                      >
                        <td className="p-4">
                          <p className="font-black text-slate-900 dark:text-brand-nacar">
                            {orden.numero || orden.folio}
                          </p>
                          <p className="text-xs font-bold text-slate-500 dark:text-ui-muted mt-0.5">
                            {orden.proveedor_nombre || orden.proveedor}
                          </p>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-brand-nacar font-medium">
                          {new Date(orden.fecha).toLocaleDateString('es-MX')}
                        </td>
                        <td className="p-4 text-center font-bold text-slate-600 dark:text-brand-nacar">
                          {(orden.items || []).length} items
                        </td>
                        <td className="p-4 text-right font-black text-slate-900 dark:text-brand-cesped">
                          $
                          {Number(
                            orden.total_estimado || orden.total || 0,
                          ).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="p-4 text-center">
                          <span className="bg-emerald-50 dark:bg-brand-cesped/10 text-emerald-600 dark:text-brand-cesped border border-emerald-100 dark:border-brand-cesped/30 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">
                            Ingresada
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE RECEPCIÓN */}
      {ordenAConfirmar && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] w-full max-w-md shadow-2xl p-8 border-2 border-slate-100 dark:border-ui-border text-center animate-in zoom-in-95 transition-colors">
            <div className="w-20 h-20 bg-amber-100 dark:bg-brand-ambar/10 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-amber-200 dark:border-brand-ambar/30">
              <AlertTriangle className="w-10 h-10 text-amber-500 dark:text-brand-ambar" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-brand-nacar mb-2">
              ¿Confirmar Recepción?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-medium mb-6">
              ¿Confirmas que recibiste físicamente los insumos de la orden{' '}
              <strong className="text-slate-700 dark:text-brand-nacar">
                {ordenAConfirmar.numero || ordenAConfirmar.folio}
              </strong>
              ? Esto sumará el inventario y recalculará los costos promedio.
            </p>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setOrdenAConfirmar(null)}
                className="flex-1 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-700 dark:text-brand-nacar py-4 rounded-xl font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={recibirMercancia}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] text-white dark:text-ui-obsidiana py-4 rounded-xl font-black transition-transform active:scale-95 shadow-lg shadow-emerald-500/30 dark:shadow-brand-cesped/30"
              >
                Sí, Ingresar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
