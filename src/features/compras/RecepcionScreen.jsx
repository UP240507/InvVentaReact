import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Card,
  CardBody,
  Button,
  Chip,
  EmptyState,
  SegmentedControl,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import { franjaAlEscribir } from '../../lib/Franjas';
import {
  PackageCheck,
  Download,
  CheckCircle,
  ArchiveRestore,
  Truck,
  FileText,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

export default function RecepcionScreen() {
  const { ordenesCompra, productos, configuracion, showToast } = useAppStore();
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
    // Un solo instante para toda la recepción; ver el comentario del
    // movimiento, unas líneas más abajo.
    const recibidoEn = new Date();

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
          fecha: recibidoEn.toISOString(),
          // Toda la recepción comparte instante y franja: es un solo acto, y
          // partirla porque el bucle cruzó las 16:00 sería inventar una
          // entrega en dos turnos.
          franja: franjaAlEscribir(configuracion, recibidoEn),
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

  // ── Historial: tabla de solo lectura ────────────────────────────────────
  // Sin onEditar ni onEliminar, igual que Mermas: una entrada de mercancía ya
  // movió stock y costos; corregirla es otra operación, no un "editar fila".
  const columnasHistorial = [
    {
      id: 'folio',
      titulo: 'Folio / Proveedor',
      celda: (o) => (
        <>
          <p className="font-bold text-adm-ink">{o.numero || o.folio}</p>
          <p className="text-xs text-adm-muted mt-0.5">
            {o.proveedor_nombre || o.proveedor}
          </p>
        </>
      ),
    },
    {
      id: 'fecha',
      titulo: 'Emisión',
      ancho: '1%',
      celda: (o) => (
        <span className="text-adm-muted whitespace-nowrap">
          {new Date(o.fecha).toLocaleDateString('es-MX')}
        </span>
      ),
    },
    {
      id: 'items',
      titulo: 'Insumos',
      alinear: 'der',
      ancho: '1%',
      celda: (o) => (
        <span className="text-adm-muted">{(o.items || []).length}</span>
      ),
    },
    {
      id: 'monto',
      titulo: 'Monto',
      alinear: 'der',
      ancho: '1%',
      celda: (o) => (
        <span className="font-bold text-adm-ink">
          $
          {Number(o.total_estimado || o.total || 0).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      id: 'estado',
      titulo: 'Estado',
      alinear: 'centro',
      ancho: '1%',
      celda: () => <Chip tono="ok">Ingresada</Chip>,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icono={PackageCheck}
        titulo="Recepción de Mercancía"
        descripcion="Da entrada a los insumos y actualiza inventario y costos automáticamente"
      />

      {/* PESTAÑAS */}
      <SegmentedControl
        className="mb-4"
        valor={activeTab}
        onChange={setActiveTab}
        opciones={[
          {
            id: 'pendientes',
            label: pendientes.length
              ? `Por recibir (${pendientes.length})`
              : 'Por recibir',
          },
          { id: 'historial', label: 'Historial' },
        ]}
      />

      {/* TAB PENDIENTES */}
      {activeTab === 'pendientes' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-8">
          {pendientes.length === 0 ? (
            <EmptyState
              icono={CheckCircle}
              titulo="Almacén al día"
              descripcion="No tienes órdenes de compra pendientes por recibir."
            />
          ) : (
            // Las pendientes NO son tabla: cada una es una decisión con un
            // botón grande ("dar entrada"), no un registro que se compara con
            // los de al lado.
            <div className="space-y-3">
              {pendientes.map((orden) => (
                <Card key={orden.id} hover>
                  <CardBody className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="bg-adm-chip text-adm-chip-fg p-3 rounded-ui shrink-0">
                        <Truck className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-fraunces font-bold text-lg text-adm-ink flex items-center gap-2">
                          {orden.numero || orden.folio}
                          {orden.referencia ===
                            'Generada automáticamente por stock bajo' && (
                            <Chip tono="alerta">Auto</Chip>
                          )}
                        </h3>
                        <p className="text-sm text-adm-muted">
                          {orden.proveedor_nombre || orden.proveedor}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-adm-muted">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(orden.fecha).toLocaleDateString('es-MX')}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            {(orden.items || []).length} insumos
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-adm-muted">
                          Importe estimado
                        </p>
                        <p className="font-fraunces font-bold text-xl text-adm-ink tabular-nums">
                          $
                          {Number(
                            orden.total_estimado || orden.total || 0,
                          ).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <Button
                        icono={Download}
                        onClick={() => setOrdenAConfirmar(orden)}
                      >
                        Dar entrada
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB HISTORIAL */}
      {activeTab === 'historial' && (
        <DataTable
          scope="tabla-recepcion"
          titulo="Historial de recepciones"
          columnas={columnasHistorial}
          filas={recibidas}
          activo={!ordenAConfirmar}
          vacio={
            <EmptyState
              icono={ArchiveRestore}
              titulo="Sin historial"
              descripcion="Aquí aparecerán las órdenes que ya diste de entrada."
            />
          }
        />
      )}

      {/* MODAL DE CONFIRMACIÓN DE RECEPCIÓN */}
      {ordenAConfirmar && (
        <div className="fixed inset-0 bg-adm-ink/80 dark:bg-adm-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-md shadow-2xl p-8 border-2 border-adm-border text-center animate-in zoom-in-95 transition-colors">
            <div className="w-20 h-20 bg-adm-warn/15 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-adm-warn/30">
              <AlertTriangle className="w-10 h-10 text-adm-warn" />
            </div>
            <h2 className="text-2xl font-black text-adm-ink mb-2">
              ¿Confirmar Recepción?
            </h2>
            <p className="text-adm-muted font-medium mb-6">
              ¿Confirmas que recibiste físicamente los insumos de la orden{' '}
              <strong className="text-adm-ink">
                {ordenAConfirmar.numero || ordenAConfirmar.folio}
              </strong>
              ? Esto sumará el inventario y recalculará los costos promedio.
            </p>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setOrdenAConfirmar(null)}
                className="flex-1 bg-adm-chip dark:bg-adm-bg hover:bg-adm-chip dark:hover:bg-adm-border text-adm-ink py-4 rounded-ui font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={recibirMercancia}
                className="flex-1 bg-adm-ok dark:hover:bg-[#00c98c] text-adm-ok-fg py-4 rounded-ui font-black transition-transform active:scale-95 shadow-lg shadow-adm-ok/30"
              >
                Sí, Ingresar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
