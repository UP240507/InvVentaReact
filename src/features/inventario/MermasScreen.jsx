import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Button,
  Chip,
  EmptyState,
  SearchField,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { franjaAlEscribir } from '../../lib/Franjas';
import {
  Trash2,
  Plus,
  Search,
  AlertTriangle,
  PackageMinus,
  X,
  ArchiveRestore,
} from 'lucide-react';

export default function MermasScreen() {
  const { productos, movimientos, configuracion, showToast } = useAppStore();
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

    // El mismo reloj para la fecha y para la franja; ver el comentario de
    // `PosScreen` sobre por qué no pueden salir de dos `new Date()` distintos.
    const movidoEn = new Date();

    const nuevoMovimiento = {
      id: Date.now(),
      tipo: tipoMovimiento,
      producto_id: producto.id,
      cantidad: cantidad,
      referencia: `[${tipoAjuste}] ${motivoAjuste.trim()}`,
      fecha: movidoEn.toISOString(),
      // El inventario es UNO. La franja es una dimensión del movimiento —para
      // poder preguntar cuánto consumió cada turno—, nunca una partición del
      // stock: el refrigerador no se puede partir en dos. Ver §1.2 del diseño.
      franja: franjaAlEscribir(configuracion, movidoEn),
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

  // ── Columnas del historial ──────────────────────────────────────────────
  // Es un LIBRO: solo se lee, no se edita ni se borra (un ajuste de inventario
  // no se deshace, se compensa con otro). Por eso la tabla no recibe
  // onEditar/onEliminar y sus atajos no llegan a registrarse.
  const columnas = [
    {
      id: 'cuando',
      titulo: 'Fecha / Usuario',
      ancho: '1%',
      celda: (mov) => (
        <>
          <p className="font-bold text-adm-ink whitespace-nowrap">
            {new Date(mov.fecha).toLocaleString('es-MX', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="text-[10px] font-bold text-adm-muted uppercase tracking-[0.14em] mt-0.5">
            {mov.usuario}
          </p>
        </>
      ),
    },
    {
      id: 'insumo',
      titulo: 'Insumo afectado',
      celda: (mov) => {
        const prod = productos.find(
          (p) => String(p.id) === String(mov.producto_id),
        );
        return (
          <>
            <p className="font-bold text-adm-ink">
              {prod ? prod.nombre : 'Insumo desconocido'}
            </p>
            {prod?.codigo && (
              <p className="text-[10px] font-mono text-adm-muted mt-0.5">
                {prod.codigo}
              </p>
            )}
          </>
        );
      },
    },
    {
      id: 'motivo',
      titulo: 'Tipo y justificación',
      celda: (mov) => {
        const match = (mov.referencia || '').match(/\[(.*?)\] (.*)/);
        const etiqueta = match ? match[1] : mov.tipo;
        const justificacion = match ? match[2] : mov.referencia || '';
        const tono = etiqueta.includes('Alta')
          ? 'ok'
          : etiqueta.includes('Consumo')
            ? 'alerta'
            : 'peligro';
        return (
          <>
            <Chip tono={tono}>{etiqueta}</Chip>
            {justificacion && (
              <p className="text-xs text-adm-muted mt-1 leading-relaxed">
                {justificacion}
              </p>
            )}
          </>
        );
      },
    },
    {
      id: 'impacto',
      titulo: 'Impacto',
      alinear: 'der',
      ancho: '1%',
      celda: (mov) => {
        const prod = productos.find(
          (p) => String(p.id) === String(mov.producto_id),
        );
        const esMerma = mov.tipo === 'Merma';
        return (
          <span
            className={`font-bold whitespace-nowrap ${esMerma ? 'text-adm-danger' : 'text-adm-ok'}`}
          >
            {esMerma ? '−' : '+'}
            {formatNum(mov.cantidad)} {prod?.unidad}
          </span>
        );
      },
    },
    {
      id: 'final',
      titulo: 'Inventario final',
      alinear: 'der',
      ancho: '1%',
      celda: (mov) => {
        const prod = productos.find(
          (p) => String(p.id) === String(mov.producto_id),
        );
        return (
          <>
            <p className="font-bold text-adm-ink whitespace-nowrap">
              {formatNum(mov.stock_nuevo)} {prod?.unidad}
            </p>
            <p className="text-[10px] text-adm-muted mt-0.5">
              era {formatNum(mov.stock_anterior)}
            </p>
          </>
        );
      },
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icono={Trash2}
        titulo="Mermas y Ajustes"
        descripcion="Pérdidas, consumo de personal y cuadres de inventario físico"
        acciones={
          <Button icono={Plus} onClick={() => setIsModalOpen(true)}>
            Registrar ajuste
          </Button>
        }
      />

      <SearchField
        icono={Search}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por insumo o motivo…"
        className="mb-4 max-w-md"
      />

      <DataTable
        scope="tabla-mermas"
        titulo="Historial de ajustes"
        columnas={columnas}
        filas={historialAjustes}
        activo={!isModalOpen}
        vacio={
          <EmptyState
            icono={ArchiveRestore}
            titulo="Sin registros"
            descripcion="No se han registrado mermas ni ajustes manuales recientemente."
          />
        }
      />

      {/* MODAL REGISTRO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-lg shadow-2xl overflow-hidden border-2 border-adm-border animate-in zoom-in-95 transition-colors">
            <div className="p-6 border-b border-adm-border flex justify-between items-center bg-adm-bg transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-adm-chip dark:bg-adm-border p-2 rounded-ui">
                  <PackageMinus className="w-5 h-5 text-adm-ink" />
                </div>
                <h2 className="text-xl font-black text-adm-ink">
                  Ajuste de Inventario
                </h2>
              </div>
              <button
                onClick={cerrarModal}
                className="text-adm-muted hover:bg-adm-chip dark:hover:bg-adm-border p-2 rounded-full transition-colors"
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
                  <label className="block text-xs font-bold text-adm-muted mb-1.5">
                    Insumo a afectar *
                  </label>
                  <select
                    value={insumoSeleccionado}
                    onChange={(e) => setInsumoSeleccionado(e.target.value)}
                    className="w-full bg-adm-bg border border-adm-field text-adm-ink font-bold px-4 py-3 rounded-ui outline-none focus:border-adm-field dark:focus:border-adm-info transition-colors"
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
                    <label className="block text-xs font-bold text-adm-muted mb-1.5">
                      Categoría *
                    </label>
                    <select
                      value={tipoAjuste}
                      onChange={(e) => setTipoAjuste(e.target.value)}
                      className={`w-full border font-bold px-4 py-3 rounded-ui outline-none transition-colors ${
                        tipoAjuste === 'Alta de Inventario'
                          ? 'bg-adm-ok/10 border-adm-ok/30 text-adm-ok focus:border-adm-ok'
                          : tipoAjuste === 'Consumo Interno'
                            ? 'bg-adm-warn/10 border-adm-warn/30 text-adm-warn focus:border-adm-warn'
                            : 'bg-adm-danger/10 border-adm-danger/30 text-adm-danger focus:border-adm-danger'
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
                    <label className="block text-xs font-bold text-adm-muted mb-1.5">
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={cantidadAjuste}
                      onChange={(e) => setCantidadAjuste(e.target.value)}
                      className="w-full bg-adm-bg border border-adm-field text-adm-ink font-black px-4 py-3 rounded-ui outline-none focus:border-adm-field dark:focus:border-adm-info transition-colors"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {insumoSeleccionado && cantidadAjuste && (
                  <div className="bg-adm-chip dark:bg-adm-bg p-3 rounded-ui flex items-start gap-3 mt-2 border border-adm-border transition-colors">
                    <AlertTriangle className="w-5 h-5 text-adm-muted shrink-0 mt-0.5" />
                    <p className="text-xs text-adm-muted dark:text-adm-ink font-medium">
                      El sistema va a{' '}
                      <strong
                        className={
                          tipoAjuste === 'Alta de Inventario'
                            ? 'text-adm-ok'
                            : 'text-adm-danger'
                        }
                      >
                        {tipoAjuste === 'Alta de Inventario'
                          ? 'SUMAR'
                          : 'RESTAR'}{' '}
                        {cantidadAjuste}
                      </strong>{' '}
                      unidades del inventario. <br />
                      Stock final estimado:{' '}
                      <strong className="font-mono text-adm-ink text-sm">
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
                  <label className="block text-xs font-bold text-adm-muted mb-1.5">
                    Justificación del Ajuste *
                  </label>
                  <textarea
                    required
                    value={motivoAjuste}
                    onChange={(e) => setMotivoAjuste(e.target.value)}
                    className="w-full bg-adm-bg border border-adm-field text-adm-ink font-medium p-4 rounded-ui outline-none focus:border-adm-field dark:focus:border-adm-info min-h-[100px] resize-none text-sm transition-colors"
                    placeholder="Ej. Se echó a perder, comida para el turno de la tarde, error de conteo anterior..."
                  ></textarea>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-adm-border bg-white dark:bg-adm-panel shrink-0 flex gap-4 transition-colors">
              <button
                type="button"
                onClick={cerrarModal}
                className="flex-1 py-4 rounded-ui border-2 border-adm-border text-adm-muted dark:text-adm-ink font-black hover:bg-adm-bg dark:hover:bg-adm-bg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="formAjuste"
                className="flex-1 bg-adm-ink dark:bg-adm-danger hover:bg-adm-ink dark:hover:bg-adm-warn text-adm-danger-fg font-black py-4 rounded-ui shadow-lg shadow-adm-border/30 dark:shadow-adm-danger/30 transition-transform active:scale-95"
              >
                Confirmar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
