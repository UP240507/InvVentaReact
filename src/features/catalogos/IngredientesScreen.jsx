import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  AlertTriangle,
  ArrowDownToLine,
  Filter,
  ArchiveRestore,
  ChevronDown,
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

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-6 rounded-brand border-2 border-slate-100 dark:border-ui-border shadow-sm mb-6 transition-colors">
        <div>
          <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar flex items-center gap-3">
            <div className="bg-brand-amatista/10 p-2 rounded-xl">
              <Package className="w-6 h-6 text-brand-amatista" />
            </div>
            Materia Prima
          </h1>
          <p className="text-xs font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mt-2">
            Catálogo de insumos y costos base
          </p>
        </div>
        <button
          onClick={() => abrirModal()}
          className="w-full sm:w-auto bg-brand-amatista text-white dark:text-brand-nacar px-6 py-4 rounded-xl font-black shadow-lg shadow-brand-amatista/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Nuevo Insumo
        </button>
      </div>

      {/* ─── FILTROS Y BÚSQUEDA ─── */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 group">
          <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-brand-amatista transition-colors" />
          <input
            type="text"
            placeholder="Buscar por código o nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-brand-amatista transition-colors shadow-sm"
          />
        </div>

        <div className="relative md:w-72 shrink-0 group">
          <Filter className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-brand-amatista transition-colors" />
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="w-full bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold pl-11 pr-10 py-4 rounded-2xl outline-none focus:border-brand-amatista shadow-sm appearance-none cursor-pointer transition-colors"
          >
            <option value="Todas">Todas las categorías</option>
            {categoriasExistentes.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none bg-slate-100 dark:bg-ui-obsidiana p-1.5 rounded-lg transition-colors">
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-ui-muted" />
          </div>
        </div>
      </div>

      {/* ─── TABLA DE INVENTARIO ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {productosFiltrados.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-ui-humo rounded-brand border-2 border-dashed border-slate-200 dark:border-ui-border transition-colors">
            <div className="bg-slate-100 dark:bg-ui-obsidiana w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
              <ArchiveRestore className="w-12 h-12 text-slate-400 dark:text-ui-muted" />
            </div>
            <h3 className="text-xl font-black font-syne text-slate-800 dark:text-brand-nacar">
              Sin Materia Prima
            </h3>
            <p className="text-slate-500 dark:text-ui-muted mt-2 mb-6 font-medium">
              No hay insumos que coincidan con tu búsqueda.
            </p>
            <button
              onClick={() => abrirModal()}
              className="text-brand-amatista font-black hover:underline"
            >
              Registrar el primero
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-ui-humo rounded-brand border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 text-slate-500 dark:text-ui-muted uppercase font-black text-[10px] tracking-widest border-b-2 border-slate-100 dark:border-ui-border">
                <tr>
                  <th className="p-5 pl-8">Código / Insumo</th>
                  <th className="p-5">Categoría</th>
                  <th className="p-5 text-right">Costo Unit.</th>
                  <th className="p-5 text-center">Inventario</th>
                  <th className="p-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-ui-border">
                {productosFiltrados.map((item) => {
                  const esStockCritico = Number(item.stock) <= Number(item.min);
                  const estaVacio = Number(item.stock) <= 0;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/50 transition-colors group"
                    >
                      <td className="p-5 pl-8">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-3 h-3 rounded-full shrink-0 ${estaVacio ? 'bg-brand-arrecife' : esStockCritico ? 'bg-brand-ambar' : 'bg-brand-cesped shadow-[0_0_10px_rgba(0,229,160,0.5)]'}`}
                          ></div>
                          <div>
                            <p className="font-black text-slate-900 dark:text-brand-nacar text-base leading-tight">
                              {item.nombre}
                            </p>
                            <p className="text-[10px] font-mono font-bold text-slate-400 dark:text-ui-muted mt-0.5">
                              {item.codigo || 'SIN CÓDIGO'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <span className="bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-ui-text px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200 dark:border-ui-border">
                          {item.categoria}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <p className="font-black text-slate-800 dark:text-brand-nacar text-lg">
                          $
                          {Number(item.precio).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-0.5">
                          por {item.unidad}
                        </p>
                      </td>
                      <td className="p-5">
                        <div className="flex flex-col items-center">
                          <span
                            className={`px-4 py-1.5 rounded-xl font-mono font-black border-2 text-sm transition-colors ${
                              estaVacio
                                ? 'bg-rose-50 dark:bg-brand-arrecife/10 text-rose-600 dark:text-brand-arrecife border-rose-200 dark:border-brand-arrecife/30'
                                : esStockCritico
                                  ? 'bg-amber-50 dark:bg-brand-ambar/10 text-amber-700 dark:text-brand-ambar border-amber-200 dark:border-brand-ambar/30'
                                  : 'bg-emerald-50 dark:bg-brand-cesped/10 text-emerald-700 dark:text-brand-cesped border-emerald-200 dark:border-brand-cesped/30'
                            }`}
                          >
                            {item.stock}{' '}
                            <span className="text-[10px] uppercase opacity-70 ml-1">
                              {item.unidad}
                            </span>
                          </span>
                          {esStockCritico && !estaVacio && (
                            <span className="text-[9px] font-black text-amber-600 dark:text-brand-ambar mt-1.5 flex items-center gap-1">
                              <ArrowDownToLine className="w-3 h-3" /> Reordenar
                            </span>
                          )}
                          {estaVacio && (
                            <span className="text-[9px] font-black text-rose-600 dark:text-brand-arrecife mt-1.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Agotado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex justify-center items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => abrirModal(item)}
                            className="p-2.5 text-brand-amatista bg-slate-100 dark:bg-ui-obsidiana hover:bg-brand-amatista hover:text-white dark:hover:text-brand-nacar rounded-xl transition-colors"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(item)}
                            className="p-2.5 text-rose-500 dark:text-brand-arrecife bg-slate-100 dark:bg-ui-obsidiana hover:bg-rose-500 dark:hover:bg-brand-arrecife hover:text-white dark:hover:text-brand-nacar rounded-xl transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── MODAL FORMULARIO DE INSUMO ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana/50">
              <div className="flex items-center gap-3">
                <div className="bg-brand-amatista/10 p-2 rounded-xl">
                  <Package className="w-6 h-6 text-brand-amatista" />
                </div>
                <h2 className="text-xl font-black font-syne text-slate-800 dark:text-brand-nacar">
                  {itemEditando ? 'Editar Insumo' : 'Nuevo Insumo'}
                </h2>
              </div>
              <button
                onClick={cerrarModal}
                className="text-slate-400 hover:text-brand-arrecife p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <form
                id="formInsumo"
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                {/* BLOQUE A: IDENTIFICACIÓN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-ui-muted mb-2">
                      Nombre del Insumo *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nombre}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-4 py-4 rounded-2xl outline-none focus:border-brand-amatista"
                      placeholder="Ej: Tomate Saladet"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-ui-muted mb-2">
                      Código POS (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formData.codigo}
                      onChange={(e) =>
                        setFormData({ ...formData, codigo: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-mono font-bold px-4 py-4 rounded-2xl outline-none focus:border-brand-amatista uppercase"
                      placeholder="TOM-01"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-ui-muted mb-2">
                      Categoría
                    </label>
                    <select
                      value={formData.categoria}
                      onChange={(e) =>
                        setFormData({ ...formData, categoria: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-bold px-4 py-4 rounded-2xl outline-none focus:border-brand-amatista"
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
                        className="w-full mt-3 border-2 border-brand-amatista bg-white dark:bg-ui-obsidiana p-4 rounded-2xl outline-none font-bold text-slate-800 dark:text-brand-nacar transition-colors"
                        autoFocus
                      />
                    )}
                  </div>
                </div>

                {/* BLOQUE B: INVENTARIO Y COSTOS */}
                <div className="bg-slate-50 dark:bg-ui-obsidiana p-6 rounded-3xl border border-slate-200 dark:border-ui-border space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4" /> Control Financiero y
                    Stock
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2">
                        Unidad M. *
                      </label>
                      <select
                        value={formData.unidad}
                        onChange={(e) =>
                          setFormData({ ...formData, unidad: e.target.value })
                        }
                        className="w-full bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-black px-4 py-4 rounded-xl outline-none focus:border-brand-amatista"
                      >
                        {unidades.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2">
                        Costo Base *
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">
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
                          className="w-full bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-800 dark:text-brand-nacar font-black pl-8 pr-3 py-4 rounded-xl outline-none focus:border-brand-amatista"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2">
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
                        className="w-full bg-amber-50 dark:bg-brand-ambar/10 border-2 border-amber-200 dark:border-brand-ambar/30 text-amber-700 dark:text-brand-ambar font-black px-4 py-4 rounded-xl outline-none focus:border-brand-ambar text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-2">
                        Físico Actual
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData({ ...formData, stock: e.target.value })
                        }
                        className="w-full bg-emerald-50 dark:bg-brand-cesped/10 border-2 border-emerald-200 dark:border-brand-cesped/30 text-emerald-700 dark:text-brand-cesped font-black px-4 py-4 rounded-xl outline-none focus:border-brand-cesped text-center"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana/50 flex gap-4 shrink-0">
              <button
                type="button"
                onClick={cerrarModal}
                className="flex-1 py-4 rounded-2xl border-2 border-slate-200 dark:border-ui-border text-slate-600 dark:text-brand-nacar font-black hover:bg-slate-100 dark:hover:bg-ui-border transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="formInsumo"
                className="flex-1 bg-brand-amatista hover:bg-indigo-600 text-white dark:text-brand-nacar font-black py-4 rounded-2xl shadow-lg shadow-brand-amatista/30 transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                {itemEditando ? 'Guardar Cambios' : 'Registrar Insumo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ELIMINAR (SOFT DELETE) ─── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-brand border-2 border-slate-100 dark:border-ui-border w-full max-w-sm shadow-2xl p-8 text-center animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-100 dark:bg-brand-arrecife/20 text-rose-500 dark:text-brand-arrecife rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-2">
              ¿Ocultar Insumo?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold text-sm mb-8">
              El insumo {confirmDelete.nombre} se ocultará de las listas para no
              afectar recetas antiguas.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleEliminar}
                className="w-full py-4 bg-rose-500 dark:bg-brand-arrecife hover:bg-rose-600 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-xl shadow-lg transition-transform active:scale-95"
              >
                Sí, Ocultar
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="w-full py-4 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-700 dark:text-brand-nacar font-bold rounded-xl transition-colors border border-slate-200 dark:border-ui-border"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
