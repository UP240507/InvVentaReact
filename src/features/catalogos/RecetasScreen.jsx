import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import {
  ChefHat,
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  AlertTriangle,
  UtensilsCrossed,
  Calculator,
  Tags,
  PackageMinus,
  FolderOpen,
  TrendingDown,
  TrendingUp,
  ArchiveRestore,
  ListPlus,
  Info,
  PlusCircle,
  Coins,
  EyeOff,
  Save,
} from 'lucide-react';

export default function RecetasScreen() {
  const { recetas, productos, modificadores, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Activos');

  const [showModal, setShowModal] = useState(false);
  const [recetaAEliminar, setRecetaAEliminar] = useState(null);
  const [editId, setEditId] = useState(null);
  const [modalTab, setModalTab] = useState('general');

  const [form, setForm] = useState({
    nombre: '',
    codigo_pos: '',
    categoria: 'Platos Fuertes',
    precio_venta: '',
    insumos: [],
    grupos_modificadores: [],
  });

  const [inputNuevaCat, setInputNuevaCat] = useState('');
  const [insumoSeleccionado, setInsumoSeleccionado] = useState('');
  const [cantidadInsumo, setCantidadInsumo] = useState('');
  const [mermaInsumo, setMermaInsumo] = useState(0);

  const categoriasExistentes = useMemo(() => {
    const cats = (recetas || [])
      .filter((r) => r.activo !== false)
      .map((r) => r.categoria)
      .filter(Boolean);
    return [...new Set(cats)];
  }, [recetas]);

  const recetasFiltradas = useMemo(() => {
    return (recetas || [])
      .filter((r) => {
        if (filtroEstado === 'Activos' && r.activo === false) return false;
        if (filtroEstado === 'Inactivos' && r.activo !== false) return false;
        return (
          (r.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
          (r.codigo_pos || '').toLowerCase().includes(busqueda.toLowerCase())
        );
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [recetas, busqueda, filtroEstado]);

  const recetasPorCategoria = useMemo(() => {
    const grupos = {};
    recetasFiltradas.forEach((r) => {
      const cat = r.categoria || 'Sin categoría';
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(r);
    });
    return grupos;
  }, [recetasFiltradas]);

  const calcularCostoReceta = (ingredientesList = []) => {
    if (!ingredientesList) return 0;
    return ingredientesList.reduce((acc, ing) => {
      const prod = productos.find(
        (p) => String(p.id) === String(ing.productoId ?? ing.id_producto),
      );
      if (!prod) return acc;
      const costoUnitario = Number(prod.precio) || 0;
      const merma = Math.round(Number(ing.merma || 0) * 100) / 100;
      const rendimiento = 1 - merma / 100;
      return (
        acc +
        (rendimiento > 0
          ? (costoUnitario / rendimiento) * Number(ing.cantidad)
          : 0)
      );
    }, 0);
  };

  const costoActual = calcularCostoReceta(form.insumos || []);
  const precioVenta = Number(form.precio_venta || 0);
  const utilidadBruta = precioVenta - costoActual;
  const margenPorcentaje =
    precioVenta > 0 ? (utilidadBruta / precioVenta) * 100 : 0;

  const cerrarModal = () => {
    setShowModal(false);
    setEditId(null);
    setInsumoSeleccionado('');
    setCantidadInsumo('');
    setMermaInsumo(0);
    setInputNuevaCat('');
  };

  const abrirEditar = (item) => {
    const insumosNorm = (item.insumos || item.ingredientes || []).map((i) => ({
      productoId: Number(i.productoId ?? i.id_producto),
      cantidad: Number(i.cantidad) || 0,
      merma: Number(i.merma) || 0,
    }));
    setForm({
      ...item,
      precio_venta: item.precio_venta || '',
      insumos: insumosNorm,
      grupos_modificadores: item.grupos_modificadores || [],
    });
    setEditId(item.id);
    setModalTab('general');
    setShowModal(true);
  };

  const toggleModificador = (grupoId) => {
    const existe = (form.grupos_modificadores || []).includes(grupoId);
    setForm({
      ...form,
      grupos_modificadores: existe
        ? form.grupos_modificadores.filter((id) => id !== grupoId)
        : [...(form.grupos_modificadores || []), grupoId],
    });
  };

  const guardar = (e) => {
    e.preventDefault();
    if (!form.nombre.trim())
      return showToast('El nombre es obligatorio.', 'error');
    if ((form.insumos || []).length === 0)
      return showToast('Agrega al menos 1 ingrediente.', 'error');
    const categoriaFinal =
      form.categoria === '__nueva__' ? inputNuevaCat.trim() : form.categoria;
    // Payload CANÓNICO: solo columnas vivas de 'recetas' (precio_venta, costo, insumos).
    const payload = {
      id: editId || Date.now(),
      nombre: form.nombre.trim(),
      codigo_pos: (form.codigo_pos || '').toUpperCase(),
      categoria: categoriaFinal,
      precio_venta: Number(form.precio_venta) || 0,
      costo: Number(costoActual.toFixed(2)),
      insumos: (form.insumos || []).map((i) => ({
        productoId: Number(i.productoId ?? i.id_producto),
        cantidad: Number(i.cantidad) || 0,
        merma: Number(i.merma) || 0,
      })),
      grupos_modificadores: form.grupos_modificadores || [],
      activo: true,
    };
    enqueueAction('recetas', 'upsert', payload);
    useAppStore.getState().upsertReceta(payload);
    cerrarModal();
    showToast(editId ? 'Receta actualizada' : 'Platillo guardado', 'success');
  };

  const desactivarReceta = (r) => {
    const payload = { ...r, activo: false };
    enqueueAction('recetas', 'upsert', payload);
    useAppStore.getState().upsertReceta(payload);
    showToast(`${r.nombre} ha sido ocultado del menú.`, 'info');
  };

  const reactivarReceta = (r) => {
    const payload = { ...r, activo: true };
    enqueueAction('recetas', 'upsert', payload);
    useAppStore.getState().upsertReceta(payload);
    showToast(`${r.nombre} reactivado exitosamente.`, 'success');
  };

  const confirmarEliminarRecetaTotal = () => {
    if (!recetaAEliminar) return;
    enqueueAction('recetas', 'delete', recetaAEliminar);
    useAppStore.setState((prev) => ({
      recetas: prev.recetas.filter((r) => r.id !== recetaAEliminar.id),
    }));
    showToast(`Platillo eliminado de raíz.`, 'success');
    setRecetaAEliminar(null);
  };

  const agregarIngrediente = () => {
    if (!insumoSeleccionado || !cantidadInsumo || Number(cantidadInsumo) <= 0)
      return showToast('Datos inválidos.', 'error');
    const mermaFinal = Math.round(Number(mermaInsumo) * 100) / 100;
    if (mermaFinal >= 100) return showToast('Merma inválida.', 'error');
    setForm((prev) => {
      const clone = [...(prev.insumos || [])];
      const idx = clone.findIndex(
        (i) =>
          String(i.productoId ?? i.id_producto) === String(insumoSeleccionado),
      );
      if (idx !== -1) {
        clone[idx].cantidad += Number(cantidadInsumo);
        clone[idx].merma = mermaFinal;
      } else {
        clone.push({
          productoId: Number(insumoSeleccionado),
          cantidad: Number(cantidadInsumo),
          merma: mermaFinal,
        });
      }
      return { ...prev, insumos: clone };
    });
    setInsumoSeleccionado('');
    setCantidadInsumo('');
    setMermaInsumo(0);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 bg-white dark:bg-ui-humo p-8 rounded-brand border-2 border-slate-100 dark:border-ui-border shadow-xl shadow-slate-200/50 dark:shadow-none mb-8 relative overflow-hidden transition-colors duration-500">
        <div className="absolute top-0 right-0 p-12 bg-brand-arrecife/10 rounded-full -mr-12 -mt-12 opacity-50" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-brand-arrecife p-4 rounded-3xl shadow-lg shadow-brand-arrecife/40">
            <ChefHat className="w-8 h-8 text-white dark:text-ui-obsidiana" />
          </div>
          <div>
            <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight">
              Menú Maestro
            </h1>
            <p className="text-slate-500 dark:text-ui-muted font-bold mt-1 flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4" /> Ingeniería de Menú y
              Costos
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setForm({
              nombre: '',
              codigo_pos: '',
              categoria: categoriasExistentes[0] || 'Platos Fuertes',
              precio_venta: '',
              insumos: [],
              grupos_modificadores: [],
            });
            setEditId(null);
            setModalTab('general');
            setShowModal(true);
          }}
          className="w-full sm:w-auto bg-slate-900 dark:bg-brand-arrecife hover:bg-slate-800 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana px-8 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl transition-all hover:scale-105 active:scale-95 group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />{' '}
          Nuevo Platillo
        </button>
      </div>

      {/* ─── FILTROS ─── */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-md group">
          <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-brand-arrecife transition-colors" />
          <input
            type="text"
            placeholder="Buscar por nombre o código POS..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border rounded-2xl text-slate-800 dark:text-brand-nacar font-bold outline-none focus:border-brand-arrecife shadow-sm transition-all"
          />
        </div>
        <div className="flex bg-slate-100 dark:bg-ui-humo p-1.5 rounded-2xl border border-slate-200 dark:border-ui-border">
          {['Activos', 'Inactivos'].map((estado) => (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all ${filtroEstado === estado ? 'bg-white dark:bg-ui-obsidiana text-brand-arrecife shadow-md scale-100' : 'text-slate-500 dark:text-ui-muted hover:text-slate-800 dark:hover:text-brand-nacar hover:scale-95'}`}
            >
              {estado}
            </button>
          ))}
        </div>
      </div>

      {/* ─── GRID DE PLATILLOS ─── */}
      <div className="flex-1 space-y-12 pb-10">
        {Object.keys(recetasPorCategoria).map((cat) => (
          <div key={cat} className="animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <FolderOpen className="w-4 h-4" /> {cat}
              <div className="h-px flex-1 bg-slate-200 dark:bg-ui-border" />
              <span className="bg-slate-100 dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-500 dark:text-ui-muted px-3 py-1 rounded-full text-[10px] font-bold">
                {recetasPorCategoria[cat].length} items
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {recetasPorCategoria[cat].map((r) => {
                const costo = calcularCostoReceta(
                  r.insumos || r.ingredientes || [],
                );
                const precio = Number(r.precio_venta) || 0;
                const ganancia = precio - costo;
                const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
                const inactivo = r.activo === false;
                const margenColor =
                  margen <= 0
                    ? 'bg-rose-500 dark:bg-brand-arrecife'
                    : margen < 30
                      ? 'bg-amber-400 dark:bg-brand-ambar'
                      : 'bg-emerald-500 dark:bg-brand-cesped';

                return (
                  <div
                    key={r.id}
                    className={`bg-white dark:bg-ui-humo rounded-brand border-2 shadow-sm transition-all relative overflow-hidden group hover:shadow-2xl hover:-translate-y-1 ${inactivo ? 'border-rose-100 dark:border-brand-arrecife/30 opacity-75' : 'border-slate-100 dark:border-ui-border'}`}
                  >
                    <div
                      className={`absolute top-0 left-0 w-1.5 h-full ${margenColor}`}
                    />
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                          <div
                            className={`${inactivo ? 'bg-rose-50 dark:bg-brand-arrecife/10 text-rose-500 dark:text-brand-arrecife' : 'bg-brand-arrecife/10 text-brand-arrecife'} p-4 rounded-2xl`}
                          >
                            <UtensilsCrossed className="w-6 h-6" />
                          </div>
                          <div className="min-w-0 pr-4">
                            <h4 className="font-black font-syne text-xl text-slate-900 dark:text-brand-nacar truncate leading-tight">
                              {r.nombre}
                            </h4>
                            <span className="text-[10px] font-mono font-black text-slate-400 dark:text-ui-muted bg-slate-50 dark:bg-ui-obsidiana px-2 py-0.5 rounded-md mt-1.5 inline-block border border-slate-200 dark:border-ui-border">
                              {r.codigo_pos || 'NO-POS'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {inactivo ? (
                            <button
                              onClick={() => reactivarReceta(r)}
                              className="p-2 bg-emerald-50 dark:bg-brand-cesped/10 text-emerald-600 dark:text-brand-cesped hover:bg-emerald-500 dark:hover:bg-brand-cesped hover:text-white dark:hover:text-ui-obsidiana rounded-xl transition-all"
                              title="Reactivar"
                            >
                              <ArchiveRestore className="w-5 h-5" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => desactivarReceta(r)}
                                className="p-2 bg-slate-50 dark:bg-ui-obsidiana text-slate-400 dark:text-ui-muted hover:bg-rose-500 dark:hover:bg-brand-arrecife hover:text-white dark:hover:text-ui-obsidiana rounded-xl transition-all"
                                title="Ocultar del Menú"
                              >
                                <EyeOff className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => abrirEditar(r)}
                                className="p-2 bg-slate-50 dark:bg-ui-obsidiana text-slate-400 dark:text-ui-muted hover:bg-brand-arrecife hover:text-white dark:hover:text-ui-obsidiana rounded-xl transition-all"
                                title="Editar"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border">
                          <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1">
                            Costo Producción
                          </p>
                          <p className="text-lg font-black text-slate-800 dark:text-brand-nacar">
                            $
                            {costo.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                        <div className="bg-emerald-50/50 dark:bg-brand-cesped/10 p-4 rounded-2xl border border-emerald-100/50 dark:border-brand-cesped/20">
                          <p className="text-[9px] font-black text-emerald-600 dark:text-brand-cesped uppercase tracking-wider mb-1">
                            Venta Público
                          </p>
                          <p className="text-lg font-black text-emerald-700 dark:text-brand-cesped">
                            $
                            {precio.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase flex items-center gap-1">
                            {margen < 30 ? (
                              <TrendingDown className="w-3 h-3 text-rose-500 dark:text-brand-arrecife" />
                            ) : (
                              <TrendingUp className="w-3 h-3 text-emerald-500 dark:text-brand-cesped" />
                            )}
                            Rentabilidad
                          </p>
                          <p
                            className={`text-xs font-black ${margen < 30 ? 'text-rose-500 dark:text-brand-arrecife' : 'text-emerald-500 dark:text-brand-cesped'}`}
                          >
                            {margen.toFixed(1)}%
                          </p>
                        </div>
                        <div className="w-full h-2 bg-slate-100 dark:bg-ui-obsidiana rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${margenColor}`}
                            style={{
                              width: `${Math.min(100, Math.max(0, margen))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-ui-obsidiana/50 p-4 flex justify-between items-center border-t border-slate-100 dark:border-ui-border">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-ui-muted bg-white dark:bg-ui-humo px-2 py-1 rounded-lg border border-slate-200 dark:border-ui-border">
                          <PackageMinus className="w-3 h-3" />{' '}
                          {(r.insumos || r.ingredientes || []).length} Insumos
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-ui-muted bg-white dark:bg-ui-humo px-2 py-1 rounded-lg border border-slate-200 dark:border-ui-border">
                          <Tags className="w-3 h-3" />{' '}
                          {(r.grupos_modificadores || []).length} Mods
                        </span>
                      </div>
                      <button
                        onClick={() => setRecetaAEliminar(r)}
                        className="p-2 text-slate-300 dark:text-ui-border hover:text-rose-600 dark:hover:text-brand-arrecife transition-colors"
                        title="Eliminar Permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ─── MODAL EXPLOSIÓN DE RECETA ─── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 dark:bg-ui-obsidiana/90 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] border-2 border-slate-100 dark:border-ui-border p-8 md:p-10 max-w-5xl w-full shadow-2xl flex flex-col h-[90vh] animate-in zoom-in-95 duration-300">
            {/* HEADER MODAL */}
            <div className="flex justify-between items-start mb-6 shrink-0">
              <div>
                <h2 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight">
                  {editId ? 'Ajustar Platillo' : 'Nuevo en el Menú'}
                </h2>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs font-black text-emerald-500 dark:text-brand-cesped flex items-center gap-1 bg-emerald-50 dark:bg-brand-cesped/10 px-3 py-1 rounded-lg">
                    <Calculator className="w-3.5 h-3.5" /> Costo: $
                    {costoActual.toFixed(2)}
                  </span>
                  <span className="text-xs font-black text-brand-arrecife flex items-center gap-1 bg-rose-50 dark:bg-brand-arrecife/10 px-3 py-1 rounded-lg">
                    <PackageMinus className="w-3.5 h-3.5" /> Insumos:{' '}
                    {(form.insumos || []).length}
                  </span>
                </div>
              </div>
              <button
                onClick={cerrarModal}
                className="p-2 bg-slate-100 dark:bg-ui-obsidiana rounded-full text-slate-400 dark:text-ui-muted hover:text-brand-arrecife dark:hover:text-brand-arrecife transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* TABS */}
            <div className="flex gap-6 mb-6 border-b-2 border-slate-100 dark:border-ui-border shrink-0">
              {['general', 'ingredientes', 'modificadores'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setModalTab(tab)}
                  className={`pb-4 text-xs font-black uppercase tracking-widest border-b-4 transition-all ${modalTab === tab ? 'border-brand-arrecife text-brand-arrecife' : 'border-transparent text-slate-400 dark:text-ui-muted hover:text-slate-700 dark:hover:text-brand-nacar'}`}
                >
                  {tab === 'general'
                    ? 'Información Base'
                    : tab === 'ingredientes'
                      ? 'Explosión de Insumos'
                      : 'Extras y Modificadores'}
                </button>
              ))}
            </div>

            {/* FORMULARIO CONTENIDO */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-10">
              <form id="formReceta" onSubmit={guardar}>
                {/* TAB: GENERAL */}
                {modalTab === 'general' && (
                  <div className="space-y-8 animate-in slide-in-from-right-4 duration-300 max-w-2xl">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase px-2 tracking-widest">
                        Nombre Público *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.nombre}
                        onChange={(e) =>
                          setForm({ ...form, nombre: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-black text-slate-800 dark:text-brand-nacar focus:border-brand-arrecife outline-none"
                        placeholder="Ej: Hamburguesa Azul"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase px-2 tracking-widest">
                          Código KDS/POS
                        </label>
                        <input
                          type="text"
                          value={form.codigo_pos}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              codigo_pos: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="HAM-01"
                          className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-mono font-black text-slate-800 dark:text-brand-nacar focus:border-brand-arrecife outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase px-2 tracking-widest">
                          Categoría Menú *
                        </label>
                        <select
                          value={form.categoria}
                          onChange={(e) =>
                            setForm({ ...form, categoria: e.target.value })
                          }
                          className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl font-black text-slate-800 dark:text-brand-nacar focus:border-brand-arrecife outline-none"
                        >
                          {categoriasExistentes.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                          {!categoriasExistentes.includes('Platos Fuertes') && (
                            <option value="Platos Fuertes">
                              Platos Fuertes
                            </option>
                          )}
                          <option value="__nueva__">
                            ✏️ Nueva categoría...
                          </option>
                        </select>
                      </div>
                    </div>
                    {form.categoria === '__nueva__' && (
                      <input
                        type="text"
                        required
                        value={inputNuevaCat}
                        onChange={(e) => setInputNuevaCat(e.target.value)}
                        placeholder="Nombre de categoría"
                        className="w-full border-2 border-brand-arrecife bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl font-black text-slate-800 dark:text-brand-nacar outline-none"
                        autoFocus
                      />
                    )}
                  </div>
                )}

                {/* TAB: INGREDIENTES */}
                {modalTab === 'ingredientes' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div className="p-6 bg-slate-900 dark:bg-ui-obsidiana border-2 border-slate-800 dark:border-ui-border rounded-3xl shadow-xl">
                      <label className="text-xs font-black text-brand-ambar uppercase mb-4 flex items-center gap-2">
                        <PlusCircle className="w-4 h-4" /> Añadir Materia Prima
                        a la Receta
                      </label>
                      <div className="flex flex-col lg:flex-row gap-4">
                        <select
                          value={insumoSeleccionado}
                          onChange={(e) =>
                            setInsumoSeleccionado(e.target.value)
                          }
                          className="flex-1 bg-slate-800 dark:bg-ui-humo border border-slate-700 dark:border-ui-border text-white dark:text-brand-nacar font-black px-6 py-4 rounded-2xl outline-none focus:border-brand-ambar transition-colors"
                        >
                          <option value="">Buscar insumo en almacén...</option>
                          {(productos || [])
                            .filter((p) => p.activo !== false)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre} (${Number(p.precio)}/{p.unidad})
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-4">
                          <input
                            type="number"
                            step="0.001"
                            placeholder="Cant."
                            value={cantidadInsumo}
                            onChange={(e) => setCantidadInsumo(e.target.value)}
                            className="w-24 bg-slate-800 dark:bg-ui-humo border border-slate-700 dark:border-ui-border font-black text-white dark:text-brand-nacar rounded-2xl text-center outline-none focus:border-brand-ambar"
                          />
                          <div className="bg-slate-800 dark:bg-ui-humo border border-slate-700 dark:border-ui-border rounded-2xl flex items-center px-4 focus-within:border-brand-ambar transition-colors">
                            <input
                              type="number"
                              step="0.01"
                              value={mermaInsumo}
                              onChange={(e) => setMermaInsumo(e.target.value)}
                              className="w-16 bg-transparent font-black text-white dark:text-brand-nacar text-center pr-2 outline-none"
                              placeholder="0"
                            />
                            <span className="text-[10px] font-black text-slate-500">
                              % Merma
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={agregarIngrediente}
                            className="bg-brand-ambar text-slate-900 dark:text-ui-obsidiana px-8 py-4 rounded-2xl font-black shadow-lg shadow-brand-ambar/30 transition-all hover:scale-105 active:scale-95"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-ui-humo rounded-2xl border-2 border-slate-100 dark:border-ui-border overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-ui-obsidiana/50 text-slate-500 dark:text-ui-muted text-[10px] uppercase tracking-widest border-b border-slate-200 dark:border-ui-border">
                          <tr>
                            <th className="px-6 py-4 font-black">
                              Ingrediente
                            </th>
                            <th className="px-4 py-4 font-black text-center">
                              Porción Pura
                            </th>
                            <th className="px-4 py-4 font-black text-center">
                              Merma C.
                            </th>
                            <th className="px-6 py-4 font-black text-right">
                              Costo Real
                            </th>
                            <th className="px-4 py-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-ui-border">
                          {(form.insumos || []).length === 0 && (
                            <tr>
                              <td
                                colSpan="5"
                                className="p-8 text-center text-slate-400 dark:text-ui-muted font-bold"
                              >
                                Sin ingredientes. Usa el buscador de arriba.
                              </td>
                            </tr>
                          )}
                          {(form.insumos || []).map((ing) => {
                            const prod = productos.find(
                              (p) =>
                                String(p.id) ===
                                String(ing.productoId ?? ing.id_producto),
                            );
                            if (!prod) return null;
                            const mermaVal = Number(ing.merma || 0).toFixed(2);
                            const rendimiento = 1 - Number(mermaVal) / 100;
                            const costoReal =
                              rendimiento > 0
                                ? (Number(prod.precio) / rendimiento) *
                                  Number(ing.cantidad)
                                : 0;
                            return (
                              <tr
                                key={ing.productoId ?? ing.id_producto}
                                className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/30"
                              >
                                <td className="px-6 py-4 font-black text-slate-800 dark:text-brand-nacar">
                                  {prod.nombre}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-ui-text px-3 py-1.5 rounded-lg font-mono text-xs font-black border border-slate-200 dark:border-ui-border">
                                    {ing.cantidad} {prod.unidad}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  {Number(mermaVal) > 0 ? (
                                    <span className="bg-rose-50 dark:bg-brand-arrecife/10 text-rose-500 dark:text-brand-arrecife px-3 py-1 rounded-lg text-[10px] font-black border border-rose-100 dark:border-brand-arrecife/20">
                                      {mermaVal}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-ui-muted">
                                      -
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-brand-cesped">
                                  $
                                  {costoReal.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setForm({
                                        ...form,
                                        insumos: (form.insumos || []).filter(
                                          (i) =>
                                            (i.productoId ?? i.id_producto) !==
                                            (ing.productoId ?? ing.id_producto),
                                        ),
                                      })
                                    }
                                    className="p-2 text-slate-300 hover:text-rose-500 dark:text-ui-muted dark:hover:text-brand-arrecife transition-all rounded-lg hover:bg-rose-50 dark:hover:bg-brand-arrecife/10"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB: MODIFICADORES */}
                {modalTab === 'modificadores' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-right-4 duration-300">
                    {(modificadores || [])
                      .filter((m) => m.activo !== false)
                      .map((grupo) => {
                        const activo = (
                          form.grupos_modificadores || []
                        ).includes(grupo.id);
                        return (
                          <div
                            key={grupo.id}
                            onClick={() => toggleModificador(grupo.id)}
                            className={`p-6 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${activo ? 'border-brand-amatista bg-brand-amatista/5 shadow-lg shadow-brand-amatista/10 dark:bg-brand-amatista/10' : 'border-slate-200 dark:border-ui-border bg-white dark:bg-ui-obsidiana hover:border-brand-amatista/50'}`}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activo ? 'bg-brand-amatista text-white dark:text-ui-obsidiana' : 'bg-slate-100 dark:bg-ui-humo text-slate-400 dark:text-ui-muted'}`}
                              >
                                <ListPlus className="w-5 h-5" />
                              </div>
                              <p
                                className={`font-black text-sm ${activo ? 'text-brand-amatista' : 'text-slate-600 dark:text-brand-nacar'}`}
                              >
                                {grupo.nombre}
                              </p>
                            </div>
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${activo ? 'bg-brand-amatista border-brand-amatista' : 'border-slate-200 dark:border-ui-border'}`}
                            >
                              {activo && (
                                <X className="w-3.5 h-3.5 text-white dark:text-ui-obsidiana" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </form>
            </div>

            {/* CALCULADORA INFERIOR FIJA */}
            <div className="bg-slate-50 dark:bg-ui-obsidiana p-6 rounded-3xl border-2 border-slate-200 dark:border-ui-border flex flex-col md:flex-row justify-between items-center gap-6 shadow-inner shrink-0 relative z-20 mt-4">
              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 w-full md:w-auto">
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-ui-muted font-black uppercase tracking-[0.2em] mb-1">
                    Costo Producción
                  </p>
                  <p className="text-2xl font-black text-rose-500 dark:text-brand-arrecife leading-none">
                    $
                    {costoActual.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="hidden md:block h-10 w-px bg-slate-200 dark:bg-ui-border" />
                <div className="group relative">
                  <p className="text-[10px] text-slate-500 dark:text-ui-muted font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1 group-hover:text-emerald-500 dark:group-hover:text-brand-cesped transition-colors">
                    <Coins className="w-3 h-3" /> Precio Público *
                  </p>
                  <div className="flex items-center bg-white dark:bg-ui-humo rounded-2xl px-5 py-2.5 border-2 border-slate-200 dark:border-ui-border focus-within:border-emerald-500 dark:focus-within:border-brand-cesped transition-all shadow-sm">
                    <span className="text-slate-400 dark:text-ui-muted font-black mr-2 text-lg">
                      $
                    </span>
                    <input
                      type="number"
                      form="formReceta"
                      step="0.5"
                      required
                      min={0}
                      value={form.precio_venta}
                      onChange={(e) =>
                        setForm({ ...form, precio_venta: e.target.value })
                      }
                      className="w-28 bg-transparent text-emerald-600 dark:text-brand-cesped font-black text-2xl outline-none"
                    />
                  </div>
                </div>
                <div className="hidden md:block h-10 w-px bg-slate-200 dark:bg-ui-border" />
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-ui-muted font-black uppercase tracking-[0.2em] mb-1">
                    Rentabilidad
                  </p>
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-2xl font-black leading-none ${margenPorcentaje >= 30 ? 'text-emerald-500 dark:text-brand-cesped' : 'text-rose-500 dark:text-brand-arrecife'}`}
                    >
                      {margenPorcentaje.toFixed(1)}%
                    </p>
                    <div
                      className={`p-1.5 rounded-lg ${margenPorcentaje >= 30 ? 'bg-emerald-100 text-emerald-600 dark:bg-brand-cesped/20 dark:text-brand-cesped' : 'bg-rose-100 text-rose-600 dark:bg-brand-arrecife/20 dark:text-brand-arrecife'}`}
                    >
                      {margenPorcentaje >= 30 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                form="formReceta"
                className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 dark:bg-brand-arrecife dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black px-10 py-5 rounded-[1.5rem] shadow-xl shadow-slate-900/20 dark:shadow-brand-arrecife/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
              >
                <Save className="w-5 h-5" /> Guardar Platillo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ELIMINAR PERMANENTE (HARD DELETE) ─── */}
      {recetaAEliminar && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] w-full max-w-md p-10 text-center shadow-2xl border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95">
            <div className="w-20 h-20 bg-rose-50 dark:bg-brand-arrecife/20 text-rose-500 dark:text-brand-arrecife rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-3 tracking-tight">
              ¿Eliminar Permanentemente?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold mb-10 leading-relaxed text-sm">
              Esta acción borrará el platillo de la base de datos de forma
              definitiva. Si solo quieres que no aparezca en el POS, usa el
              botón de "Ocultar".
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmarEliminarRecetaTotal}
                className="w-full py-4 bg-rose-500 dark:bg-brand-arrecife hover:bg-rose-600 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-2xl shadow-lg transition-all active:scale-95"
              >
                Eliminar de raíz
              </button>
              <button
                onClick={() => setRecetaAEliminar(null)}
                className="w-full py-4 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-600 dark:text-brand-nacar font-bold rounded-2xl transition-all border border-transparent hover:border-slate-300 dark:hover:border-ui-border"
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
