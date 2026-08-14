import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Button,
  Chip,
  EmptyState,
  SearchField,
  Select,
  IconButton,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  ArrowDownToLine,
  X,
  ArchiveRestore,
} from 'lucide-react';

export default function IngredientesScreen() {
  const { productos, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    categoria: 'Abarrotes',
    unidad: 'kg',
    precio: 0,
    stock: 0,
    min: 0,
  });
  const [inputNuevaCat, setInputNuevaCat] = useState('');

  const unidades = ['kg', 'g', 'lt', 'ml', 'pza', 'caja', 'lata', 'paquete'];

  const categoriasExistentes = useMemo(() => {
    const cats = (productos || [])
      .filter((p) => p.activo !== false)
      .map((p) => p.categoria)
      .filter(Boolean);
    return [...new Set(cats)];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    return (productos || [])
      .filter((p) => {
        if (p.activo === false) return false;
        const matchBusqueda =
          (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
          (p.codigo || '').toLowerCase().includes(busqueda.toLowerCase());
        const matchCategoria =
          filtroCategoria === 'Todas' || p.categoria === filtroCategoria;
        return matchBusqueda && matchCategoria;
      })
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [productos, busqueda, filtroCategoria]);

  const abrirModal = (item = null) => {
    if (item) {
      setItemEditando(item);
      setFormData({
        codigo: item.codigo || '',
        nombre: item.nombre || '',
        categoria: item.categoria || '',
        unidad: item.unidad || 'kg',
        precio: item.precio || 0,
        stock: item.stock || 0,
        min: item.min ?? 0,
      });
    } else {
      setItemEditando(null);
      setFormData({
        codigo: '',
        nombre: '',
        categoria: categoriasExistentes[0] || 'Abarrotes',
        unidad: 'kg',
        precio: '',
        stock: '',
        min: '',
      });
    }
    setInputNuevaCat('');
    setIsModalOpen(true);
  };

  const cerrarModal = () => {
    setIsModalOpen(false);
    setItemEditando(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim())
      return showToast('El nombre del insumo es obligatorio.', 'error');

    const categoriaFinal =
      formData.categoria === '__nueva__'
        ? inputNuevaCat.trim()
        : formData.categoria;
    if (formData.categoria === '__nueva__' && !categoriaFinal)
      return showToast('Escribe el nombre de la nueva categoría.', 'error');

    // CRÍTICO (RLS tenant_productos): sin restaurante_id, el insert se rechaza en silencio.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );

    const minNum = Number(formData.min);
    const payload = {
      codigo: (formData.codigo || '').toUpperCase().trim(),
      nombre: formData.nombre.trim(),
      categoria: categoriaFinal,
      unidad: formData.unidad,
      precio: Number(formData.precio),
      stock: Number(formData.stock),
      min: minNum,
      activo: true,
      restaurante_id: restauranteId,
    };

    if (itemEditando) {
      const registro = { id: itemEditando.id, ...payload };
      enqueueAction('productos', 'upsert', registro);
      useAppStore.setState((prev) => ({
        productos: prev.productos.map((p) =>
          p.id === itemEditando.id ? { ...p, ...registro } : p,
        ),
      }));
      // KARDEX: editar el stock a mano es un AJUSTE y debe dejar rastro
      // (mismo shape que Recepción/Mermas). Sin esto, el inventario cambia
      // sin trazabilidad y los reportes de kardex no cuadran.
      const stockAnterior = Number(itemEditando.stock) || 0;
      const stockNuevo = Number(payload.stock) || 0;
      if (stockNuevo !== stockAnterior) {
        enqueueAction('movimientos', 'upsert', {
          id: Date.now(),
          tipo: 'Ajuste',
          producto_id: itemEditando.id,
          cantidad: Math.abs(stockNuevo - stockAnterior),
          referencia: 'Edición manual del insumo',
          fecha: new Date().toISOString(),
          usuario: useAuthStore.getState().user?.nombre || 'Sistema',
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          restaurante_id: restauranteId,
        });
      }
      showToast('Insumo actualizado.', 'success');
    } else {
      // upsert (no insert): idempotente si la cola reintenta offline.
      const nuevoProducto = { id: Date.now(), ...payload };
      enqueueAction('productos', 'upsert', nuevoProducto);
      useAppStore.setState((prev) => ({
        productos: [...(prev.productos || []), nuevoProducto],
      }));
      showToast('Materia prima registrada.', 'success');
    }
    cerrarModal();
  };

  const handleEliminar = () => {
    if (!confirmDelete) return;
    // confirmDelete viene del store (ya trae restaurante_id) → soft-delete conserva tenant.
    const payload = { ...confirmDelete, activo: false };
    enqueueAction('productos', 'upsert', payload);
    useAppStore.setState((prev) => ({
      productos: prev.productos.map((p) =>
        p.id === confirmDelete.id ? payload : p,
      ),
    }));
    showToast(`${confirmDelete.nombre} ocultado del sistema.`, 'success');
    setConfirmDelete(null);
  };

  // ── Columnas de la tabla ────────────────────────────────────────────────
  // El semáforo de stock va como PUNTO en la primera columna, no como columna
  // propia: en una tabla densa una columna de 12px de color es ruido, y el
  // dato duro (la cifra con su unidad) ya está a la derecha.
  const columnas = [
    {
      id: 'insumo',
      titulo: 'Código / Insumo',
      celda: (item) => {
        const vacio = Number(item.stock) <= 0;
        const critico = Number(item.stock) <= Number(item.min);
        return (
          <div className="flex items-center gap-3">
            <span
              title={vacio ? 'Agotado' : critico ? 'Bajo mínimo' : 'En nivel'}
              className={`w-2 h-2 rounded-full shrink-0 ${vacio ? 'bg-adm-danger' : critico ? 'bg-adm-warn' : 'bg-adm-ok'}`}
            />
            <div className="min-w-0">
              <p className="font-bold text-adm-ink leading-tight truncate">
                {item.nombre}
              </p>
              <p className="text-[10px] font-mono text-adm-muted mt-0.5">
                {item.codigo || 'SIN CÓDIGO'}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'categoria',
      titulo: 'Categoría',
      ancho: '1%',
      celda: (item) => <Chip>{item.categoria}</Chip>,
    },
    {
      id: 'costo',
      titulo: 'Costo unit.',
      alinear: 'der',
      ancho: '1%',
      celda: (item) => (
        <>
          <span className="font-bold text-adm-ink">
            $
            {Number(item.precio).toLocaleString('es-MX', {
              minimumFractionDigits: 2,
            })}
          </span>
          <span className="block text-[10px] text-adm-muted uppercase tracking-[0.14em]">
            por {item.unidad}
          </span>
        </>
      ),
    },
    {
      id: 'stock',
      titulo: 'Inventario',
      alinear: 'der',
      ancho: '1%',
      celda: (item) => {
        const vacio = Number(item.stock) <= 0;
        const critico = Number(item.stock) <= Number(item.min);
        return (
          <>
            <span
              className={`font-bold tabular-nums ${vacio ? 'text-adm-danger' : critico ? 'text-adm-warn' : 'text-adm-ink'}`}
            >
              {item.stock}
              <span className="text-[10px] uppercase opacity-70 ml-1">
                {item.unidad}
              </span>
            </span>
            {(vacio || critico) && (
              <span
                className={`block text-[10px] font-bold ${vacio ? 'text-adm-danger' : 'text-adm-warn'}`}
              >
                {vacio ? 'Agotado' : 'Reordenar'}
              </span>
            )}
          </>
        );
      },
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'centro',
      ancho: '1%',
      celda: (item) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icono={Edit}
            titulo="Editar"
            onClick={(e) => {
              e.stopPropagation();
              abrirModal(item);
            }}
          />
          <IconButton
            icono={Trash2}
            titulo="Eliminar"
            className="hover:text-adm-danger"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(item);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell className="overflow-y-auto">
      <PageHeader
        icono={Package}
        titulo="Materia Prima"
        descripcion="Catálogo de insumos y costos base"
        scopeAtajos="tabla-ingredientes"
        acciones={
          <Button icono={Plus} onClick={() => abrirModal()}>
            Nuevo insumo
          </Button>
        }
      />

      {/* ─── FILTROS Y BÚSQUEDA ─── */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <SearchField
          icono={Search}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className="flex-1"
        />
        <Select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="md:w-64"
          aria-label="Filtrar por categoría"
        >
          <option value="Todas">Todas las categorías</option>
          {categoriasExistentes.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
      </div>

      {/* ─── TABLA ─── */}
      <DataTable
        scope="tabla-ingredientes"
        titulo="Materia prima"
        columnas={columnas}
        filas={productosFiltrados}
        onEditar={abrirModal}
        onNuevo={() => abrirModal()}
        onEliminar={setConfirmDelete}
        // Los atajos de tabla se apagan con un modal encima: Supr no puede
        // borrar la fila de detrás mientras editas otra cosa.
        activo={!isModalOpen && !confirmDelete}
        vacio={
          <EmptyState
            icono={ArchiveRestore}
            titulo="Sin materia prima"
            descripcion="No hay insumos que coincidan con tu búsqueda."
            accion={
              <Button icono={Plus} onClick={() => abrirModal()}>
                Registrar el primero
              </Button>
            }
          />
        }
      />

      {/* ─── MODAL FORMULARIO DE INSUMO ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-media">
            <div className="p-6 border-b border-adm-border flex justify-between items-center bg-adm-bg">
              <div className="flex items-center gap-3">
                <div className="bg-adm-info/10 p-2 rounded-ui">
                  <Package className="w-6 h-6 text-adm-info" />
                </div>
                <h2 className="text-xl font-black font-syne text-adm-ink">
                  {itemEditando ? 'Editar Insumo' : 'Nuevo Insumo'}
                </h2>
              </div>
              <button
                onClick={cerrarModal}
                className="text-adm-muted hover:text-adm-danger p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 max-h-[70dvh] overflow-y-auto custom-scrollbar">
              <form
                id="formInsumo"
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                {/* BLOQUE A: IDENTIFICACIÓN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-adm-muted mb-2">
                      Nombre del Insumo *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nombre}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre: e.target.value })
                      }
                      className="w-full bg-adm-bg border-2 border-adm-field text-adm-ink font-bold px-4 py-4 rounded-ui outline-none focus:border-adm-info"
                      placeholder="Ej: Tomate Saladet"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-adm-muted mb-2">
                      Código POS (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.codigo}
                      onChange={(e) =>
                        setFormData({ ...formData, codigo: e.target.value })
                      }
                      className="w-full bg-adm-bg border-2 border-adm-field text-adm-ink font-mono font-bold px-4 py-4 rounded-ui outline-none focus:border-adm-info uppercase"
                      placeholder="TOM-01"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-adm-muted mb-2">
                      Categoría
                    </label>
                    <select
                      value={formData.categoria}
                      onChange={(e) =>
                        setFormData({ ...formData, categoria: e.target.value })
                      }
                      className="w-full bg-adm-bg border-2 border-adm-field text-adm-ink font-bold px-4 py-4 rounded-ui outline-none focus:border-adm-info"
                    >
                      {categoriasExistentes.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      {!categoriasExistentes.includes('Abarrotes') && (
                        <option value="Abarrotes">Abarrotes</option>
                      )}
                      <option value="__nueva__">✏️ Nueva categoría...</option>
                    </select>
                    {formData.categoria === '__nueva__' && (
                      <input
                        type="text"
                        required
                        value={inputNuevaCat}
                        onChange={(e) => setInputNuevaCat(e.target.value)}
                        placeholder="Escribe la categoría"
                        className="w-full mt-3 border-2 border-adm-info bg-white dark:bg-adm-bg p-4 rounded-ui outline-none font-bold text-adm-ink transition-colors"
                        autoFocus
                      />
                    )}
                  </div>
                </div>

                {/* BLOQUE B: INVENTARIO Y COSTOS */}
                <div className="bg-adm-bg p-6 rounded-ui-lg border border-adm-border space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-adm-muted flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4" /> Control Financiero y
                    Stock
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-adm-muted uppercase tracking-widest mb-2">
                        Unidad M. *
                      </label>
                      <select
                        value={formData.unidad}
                        onChange={(e) =>
                          setFormData({ ...formData, unidad: e.target.value })
                        }
                        className="w-full bg-white dark:bg-adm-panel border-2 border-adm-field text-adm-ink font-black px-4 py-4 rounded-ui outline-none focus:border-adm-info"
                      >
                        {unidades.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-adm-muted uppercase tracking-widest mb-2">
                        Costo Base *
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-adm-muted font-black">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={formData.precio}
                          onChange={(e) =>
                            setFormData({ ...formData, precio: e.target.value })
                          }
                          className="w-full bg-white dark:bg-adm-panel border-2 border-adm-field text-adm-ink font-black pl-8 pr-3 py-4 rounded-ui outline-none focus:border-adm-info"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-adm-muted uppercase tracking-widest mb-2">
                        Stock Mín. *
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        required
                        value={formData.min}
                        onChange={(e) =>
                          setFormData({ ...formData, min: e.target.value })
                        }
                        className="w-full bg-adm-warn/10 border-2 border-adm-warn/30 text-adm-warn font-black px-4 py-4 rounded-ui outline-none focus:border-adm-warn text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-adm-muted uppercase tracking-widest mb-2">
                        Físico Actual
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData({ ...formData, stock: e.target.value })
                        }
                        className="w-full bg-adm-ok/10 border-2 border-adm-ok/30 text-adm-ok font-black px-4 py-4 rounded-ui outline-none focus:border-adm-ok text-center"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-adm-border bg-adm-bg flex gap-4 shrink-0">
              <button
                type="button"
                onClick={cerrarModal}
                className="flex-1 py-4 rounded-ui border-2 border-adm-border text-adm-muted dark:text-adm-ink font-black hover:bg-adm-chip dark:hover:bg-adm-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="formInsumo"
                className="flex-1 bg-adm-info hover:bg-adm-info text-adm-info-fg font-black py-4 rounded-ui shadow-lg shadow-adm-info/30 transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                {itemEditando ? 'Guardar Cambios' : 'Registrar Insumo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ELIMINAR (SOFT DELETE) ─── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-adm-ink/80 dark:bg-adm-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border w-full max-w-sm shadow-2xl p-8 text-center animate-in zoom-in-95">
            <div className="w-20 h-20 bg-adm-danger/15 text-adm-danger rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black font-syne text-adm-ink mb-2">
              ¿Ocultar Insumo?
            </h2>
            <p className="text-adm-muted font-bold text-sm mb-8">
              El insumo {confirmDelete.nombre} se ocultará de las listas para no
              afectar recetas antiguas.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleEliminar}
                className="w-full py-4 bg-adm-danger dark:hover:bg-adm-warn text-adm-danger-fg font-black rounded-ui shadow-lg transition-transform active:scale-95"
              >
                Sí, Ocultar
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="w-full py-4 bg-adm-chip dark:bg-adm-bg hover:bg-adm-chip dark:hover:bg-adm-border text-adm-ink font-bold rounded-ui transition-colors border border-adm-border"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
