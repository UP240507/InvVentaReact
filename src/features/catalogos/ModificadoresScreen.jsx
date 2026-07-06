import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  ListPlus,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  MinusCircle,
  Settings2,
  CheckSquare,
  CircleDot,
  PackageOpen,
} from 'lucide-react';

export default function ModificadoresScreen() {
  const { modificadores, productos, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [busqueda, setBusqueda] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [formData, setFormData] = useState({
    nombre: '',
    tipo: 'multiple',
    obligatorio: false,
    opciones: [],
  });

  const [opcionNombre, setOpcionNombre] = useState('');
  const [opcionPrecio, setOpcionPrecio] = useState(0);
  const [opcionProductoId, setOpcionProductoId] = useState('');
  const [opcionCantidad, setOpcionCantidad] = useState('');

  const modificadoresFiltrados = useMemo(() => {
    return (modificadores || [])
      .filter(
        (m) =>
          m.activo !== false &&
          (m.nombre || '').toLowerCase().includes(busqueda.toLowerCase()),
      )
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [modificadores, busqueda]);

  const abrirModal = (item = null) => {
    if (item) {
      setItemEditando(item);
      setFormData({ ...item, opciones: item.opciones || [] });
    } else {
      setItemEditando(null);
      setFormData({
        nombre: '',
        tipo: 'multiple',
        obligatorio: false,
        opciones: [],
      });
    }
    limpiarInputsOpcion();
    setIsModalOpen(true);
  };

  const cerrarModal = () => {
    setIsModalOpen(false);
    setItemEditando(null);
  };

  const limpiarInputsOpcion = () => {
    setOpcionNombre('');
    setOpcionPrecio(0);
    setOpcionProductoId('');
    setOpcionCantidad('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      showToast('El nombre del grupo es obligatorio.', 'error');
      return;
    }
    if ((formData.opciones || []).length === 0) {
      showToast('Debes agregar al menos una opción al grupo.', 'error');
      return;
    }

    // CRÍTICO: sin restaurante_id el registro se inserta con tenant null y el
    // store (que filtra por restaurante_id) no lo carga → "desaparece" al recargar.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId) {
      showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );
      return;
    }

    // opciones es jsonb → array directo, NUNCA JSON.stringify (regla 9).
    const payload = {
      ...formData,
      nombre: formData.nombre.trim(),
      restaurante_id: restauranteId,
    };

    if (itemEditando) {
      const registro = { ...payload, id: itemEditando.id };
      enqueueAction('modificadores', 'upsert', registro);
      useAppStore.setState((prev) => ({
        modificadores: (prev.modificadores || []).map((m) =>
          m.id === itemEditando.id ? registro : m,
        ),
      }));
      showToast('Grupo de modificadores actualizado.', 'success');
    } else {
      // upsert (no insert): idempotente si la cola reintenta offline.
      const nuevoGrupo = { ...payload, id: Date.now(), activo: true };
      enqueueAction('modificadores', 'upsert', nuevoGrupo);
      useAppStore.setState((prev) => ({
        modificadores: [...(prev.modificadores || []), nuevoGrupo],
      }));
      showToast('Grupo creado exitosamente.', 'success');
    }
    cerrarModal();
  };

  const handleEliminar = () => {
    if (!confirmDelete) return;
    // SOFT DELETE: las recetas referencian modificadores por id en jsonb
    // (grupos_modificadores). Un hard delete dejaría recetas huérfanas.
    // Se oculta con activo:false; sigue resolviéndose para recetas existentes.
    const payload = { ...confirmDelete, activo: false };
    enqueueAction('modificadores', 'upsert', payload);
    useAppStore.setState((prev) => ({
      modificadores: (prev.modificadores || []).map((m) =>
        m.id === confirmDelete.id ? payload : m,
      ),
    }));
    showToast(`${confirmDelete.nombre} ocultado.`, 'success');
    setConfirmDelete(null);
  };

  const agregarOpcion = () => {
    if (!opcionNombre.trim()) {
      showToast('La opción debe tener un nombre.', 'error');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      opciones: [
        ...(prev.opciones || []),
        {
          id_opcion: Date.now() + Math.random(),
          nombre: opcionNombre.trim(),
          precio_extra: Number(opcionPrecio) || 0,
          id_producto: opcionProductoId ? Number(opcionProductoId) : null,
          cantidad: opcionCantidad ? Number(opcionCantidad) : 0,
        },
      ],
    }));

    limpiarInputsOpcion();
  };

  const removerOpcion = (id_opcion) => {
    setFormData((prev) => ({
      ...prev,
      opciones: (prev.opciones || []).filter((o) => o.id_opcion !== id_opcion),
    }));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in transition-colors duration-500">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border shadow-sm mb-6 transition-colors">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-brand-nacar flex items-center gap-3">
            <div className="bg-indigo-100 dark:bg-brand-amatista/10 p-2 rounded-xl">
              <ListPlus className="w-6 h-6 text-indigo-600 dark:text-brand-amatista" />
            </div>
            Grupos de Modificadores
          </h1>
          <p className="text-sm text-slate-500 dark:text-ui-muted mt-1">
            Opciones extra, términos de carne y complementos para el POS.
          </p>
        </div>
        <button
          onClick={() => abrirModal()}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-brand-amatista dark:hover:bg-indigo-500 text-white dark:text-ui-obsidiana px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-500/30 dark:shadow-brand-amatista/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Nuevo Grupo
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="relative mb-8">
        <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar grupo de modificadores..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold pl-12 pr-4 py-3.5 rounded-2xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista shadow-sm transition-colors"
        />
      </div>

      {/* GRID DE GRUPOS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {modificadoresFiltrados?.length === 0 || !modificadores ? (
          <div className="text-center py-20 bg-white dark:bg-ui-humo rounded-3xl border border-dashed border-slate-300 dark:border-ui-border transition-colors">
            <div className="bg-indigo-50 dark:bg-ui-obsidiana w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-ui-border">
              <Settings2 className="w-12 h-12 text-indigo-400 dark:text-ui-muted opacity-50" />
            </div>
            <h3 className="text-xl font-black text-slate-700 dark:text-brand-nacar">
              Sin Modificadores
            </h3>
            <p className="text-slate-500 dark:text-ui-muted mt-2 mb-6 font-medium">
              Crea grupos como "Términos", "Extras" o "Sin Ingrediente".
            </p>
            <button
              onClick={() => abrirModal()}
              className="text-indigo-500 dark:text-brand-amatista font-black hover:underline"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modificadoresFiltrados.map((grupo) => {
              const numOpciones = (grupo.opciones || []).length;
              return (
                <div
                  key={grupo.id}
                  className="bg-white dark:bg-ui-humo rounded-3xl border border-slate-200 dark:border-ui-border shadow-sm hover:shadow-lg transition-all p-6 relative group flex flex-col"
                >
                  {/* BOTONES HOVER */}
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-ui-humo pl-2">
                    <button
                      onClick={() => abrirModal(grupo)}
                      className="p-2 text-indigo-500 dark:text-brand-amatista hover:bg-indigo-50 dark:hover:bg-ui-obsidiana rounded-xl transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(grupo)}
                      className="p-2 text-rose-500 dark:text-brand-arrecife hover:bg-rose-50 dark:hover:bg-ui-obsidiana rounded-xl transition-colors"
                      title="Ocultar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* HEADER TARJETA */}
                  <div className="mb-4 pr-16">
                    <h4 className="font-black text-xl text-slate-900 dark:text-brand-nacar leading-tight">
                      {grupo.nombre}
                    </h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1 ${grupo.tipo === 'unica' ? 'bg-amber-100 dark:bg-brand-ambar/10 text-amber-700 dark:text-brand-ambar' : 'bg-emerald-100 dark:bg-brand-cesped/10 text-emerald-700 dark:text-brand-cesped'}`}
                      >
                        {grupo.tipo === 'unica' ? (
                          <CircleDot className="w-3 h-3" />
                        ) : (
                          <CheckSquare className="w-3 h-3" />
                        )}
                        {grupo.tipo === 'unica' ? 'Opción Única' : 'Múltiple'}
                      </span>
                      {grupo.obligatorio && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 dark:bg-brand-arrecife/10 text-rose-700 dark:text-brand-arrecife px-2 py-1 rounded-md">
                          Obligatorio
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MUESTRA DE OPCIONES */}
                  <div className="mt-auto space-y-2 bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border transition-colors">
                    <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mb-2">
                      {numOpciones} opciones disponibles:
                    </p>
                    {(grupo.opciones || []).slice(0, 3).map((op, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center text-sm"
                      >
                        <span className="font-medium text-slate-700 dark:text-brand-nacar flex items-center gap-1.5">
                          {op.id_producto ? (
                            <PackageOpen className="w-3 h-3 text-indigo-400 dark:text-brand-amatista" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-ui-muted"></span>
                          )}
                          {op.nombre}
                        </span>
                        <span
                          className={`font-black ${op.precio_extra > 0 ? 'text-emerald-600 dark:text-brand-cesped' : 'text-slate-400 dark:text-ui-muted'}`}
                        >
                          {op.precio_extra > 0
                            ? `+$${op.precio_extra}`
                            : 'Sin costo'}
                        </span>
                      </div>
                    ))}
                    {numOpciones > 3 && (
                      <p className="text-xs font-bold text-indigo-500 dark:text-brand-amatista text-center pt-2 mt-2 border-t border-slate-200/50 dark:border-ui-border/50">
                        + {numOpciones - 3} opciones más
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL CREADOR DE GRUPOS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-ui-humo rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] border-2 border-slate-100 dark:border-ui-border transition-colors">
            <div className="p-6 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 dark:bg-brand-amatista/10 p-2 rounded-xl">
                  <ListPlus className="w-5 h-5 text-indigo-600 dark:text-brand-amatista" />
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar">
                  {itemEditando
                    ? 'Editar Modificadores'
                    : 'Nuevo Grupo de Modificadores'}
                </h2>
              </div>
              <button
                onClick={cerrarModal}
                className="text-slate-400 dark:text-ui-muted hover:bg-slate-200 dark:hover:bg-ui-border p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col lg:flex-row">
              <div className="p-6 lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-ui-border space-y-6 bg-slate-50/50 dark:bg-ui-obsidiana/30">
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-ui-muted mb-2">
                    Nombre del Grupo
                  </label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                    className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold px-4 py-3 rounded-xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-colors"
                    placeholder="Ej: Tipo de Leche, Extras..."
                    required
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-slate-500 dark:text-ui-muted">
                    Reglas de Selección
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${formData.tipo === 'unica' ? 'bg-indigo-50 border-indigo-200 dark:bg-brand-amatista/10 dark:border-brand-amatista/30' : 'bg-white border-slate-200 dark:bg-ui-humo dark:border-ui-border hover:border-indigo-300'}`}
                  >
                    <input
                      type="radio"
                      name="tipoMod"
                      checked={formData.tipo === 'unica'}
                      onChange={() =>
                        setFormData({ ...formData, tipo: 'unica' })
                      }
                      className="mt-1"
                    />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-brand-nacar text-sm flex items-center gap-1">
                        <CircleDot className="w-3.5 h-3.5 text-indigo-500 dark:text-brand-amatista" />{' '}
                        Opción Única (Radio)
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-ui-muted mt-0.5">
                        El cliente solo puede elegir uno (Ej. Término de carne).
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${formData.tipo === 'multiple' ? 'bg-indigo-50 border-indigo-200 dark:bg-brand-amatista/10 dark:border-brand-amatista/30' : 'bg-white border-slate-200 dark:bg-ui-humo dark:border-ui-border hover:border-indigo-300'}`}
                  >
                    <input
                      type="radio"
                      name="tipoMod"
                      checked={formData.tipo === 'multiple'}
                      onChange={() =>
                        setFormData({ ...formData, tipo: 'multiple' })
                      }
                      className="mt-1"
                    />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-brand-nacar text-sm flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-500 dark:text-brand-amatista" />{' '}
                        Selección Múltiple (Checkbox)
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-ui-muted mt-0.5">
                        Puede elegir varios o ninguno (Ej. Quitar ingredientes).
                      </p>
                    </div>
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-200/60 dark:border-ui-border">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.obligatorio}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          obligatorio: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-brand-nacar text-sm">
                        El cajero DEBE seleccionar
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-ui-muted">
                        No deja enviar comanda sin elegir.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-black text-slate-900 dark:text-brand-nacar mb-4 flex items-center justify-between">
                  Opciones del Grupo
                  <span className="text-xs bg-slate-100 dark:bg-ui-obsidiana text-slate-500 dark:text-ui-muted border dark:border-ui-border px-2 py-1 rounded-lg">
                    {(formData.opciones || []).length} agregadas
                  </span>
                </h3>

                <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-200 dark:border-ui-border mb-6 space-y-3 transition-colors">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Nombre (Ej. Extra Tocino)"
                        value={opcionNombre}
                        onChange={(e) => setOpcionNombre(e.target.value)}
                        className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold px-3 py-2.5 rounded-xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista text-sm transition-colors"
                      />
                    </div>
                    <div className="w-28 relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Costo"
                        value={opcionPrecio}
                        onChange={(e) => setOpcionPrecio(e.target.value)}
                        className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold pl-7 pr-3 py-2.5 rounded-xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista text-sm transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 items-center border-t border-slate-200 dark:border-ui-border pt-3">
                    <PackageOpen className="w-4 h-4 text-slate-400 dark:text-ui-muted shrink-0" />
                    <div className="flex-1">
                      <select
                        value={opcionProductoId}
                        onChange={(e) => setOpcionProductoId(e.target.value)}
                        className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-600 dark:text-brand-nacar font-medium px-3 py-2 rounded-xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista text-xs transition-colors"
                      >
                        <option value="">No afecta inventario</option>
                        {(productos || [])
                          .filter((p) => p.activo !== false)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              Descontar: {p.nombre}
                            </option>
                          ))}
                      </select>
                    </div>
                    {opcionProductoId && (
                      <div className="w-24">
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          placeholder="Cant."
                          value={opcionCantidad}
                          onChange={(e) => setOpcionCantidad(e.target.value)}
                          className="w-full bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-900 dark:text-brand-nacar font-bold px-3 py-2 rounded-xl outline-none focus:border-indigo-500 dark:focus:border-brand-amatista text-xs transition-colors"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={agregarOpcion}
                      className="bg-slate-900 hover:bg-slate-800 dark:bg-brand-amatista dark:hover:bg-indigo-600 text-white dark:text-ui-obsidiana px-4 py-2 rounded-xl transition-transform active:scale-95 text-xs font-bold shrink-0"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                  {(formData.opciones || []).length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-slate-200 dark:border-ui-border rounded-2xl text-slate-400 dark:text-ui-muted">
                      <p className="font-bold">
                        No hay opciones en este grupo.
                      </p>
                      <p className="text-xs mt-1">
                        Ej: Rojo, Medio, Bien Cocido.
                      </p>
                    </div>
                  ) : (
                    formData.opciones.map((op, index) => {
                      const prodVinculado = op.id_producto
                        ? (productos || []).find(
                            (p) => String(p.id) === String(op.id_producto),
                          )
                        : null;

                      return (
                        <div
                          key={index}
                          className="flex justify-between items-center p-3 border border-slate-100 dark:border-ui-border rounded-xl bg-white dark:bg-ui-humo hover:border-indigo-200 dark:hover:border-brand-amatista transition-colors group"
                        >
                          <div>
                            <p className="font-black text-slate-900 dark:text-brand-nacar text-sm flex items-center gap-2">
                              {formData.tipo === 'unica' ? (
                                <CircleDot className="w-3 h-3 text-slate-300 dark:text-ui-muted" />
                              ) : (
                                <CheckSquare className="w-3 h-3 text-slate-300 dark:text-ui-muted" />
                              )}
                              {op.nombre}
                              {op.precio_extra > 0 && (
                                <span className="text-xs text-emerald-600 dark:text-brand-cesped bg-emerald-50 dark:bg-brand-cesped/10 px-2 py-0.5 rounded-md">
                                  +$ {op.precio_extra}
                                </span>
                              )}
                            </p>
                            {prodVinculado && (
                              <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted mt-1 flex items-center gap-1">
                                <PackageOpen className="w-3 h-3" /> Descuenta{' '}
                                {op.cantidad} {prodVinculado.unidad} de{' '}
                                {prodVinculado.nombre}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removerOpcion(op.id_opcion)}
                            type="button"
                            className="text-slate-300 dark:text-ui-border hover:text-rose-500 dark:hover:text-brand-arrecife p-2 transition-colors"
                          >
                            <MinusCircle className="w-5 h-5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-ui-border bg-white dark:bg-ui-humo shrink-0">
              <button
                onClick={handleSubmit}
                className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-brand-amatista dark:hover:bg-indigo-500 text-white dark:text-ui-obsidiana font-black py-4 rounded-xl shadow-lg transition-transform active:scale-95"
              >
                {itemEditando
                  ? 'Guardar Cambios'
                  : 'Crear Grupo de Modificadores'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OCULTAR (SOFT DELETE) */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95 transition-colors">
            <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar mb-2">
              ¿Ocultar {confirmDelete.nombre}?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-medium text-sm mb-6">
              Dejará de aparecer como opción en el Punto de Venta y al crear
              recetas. Las recetas que ya lo usan siguen funcionando.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-700 dark:text-brand-nacar font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 dark:bg-brand-arrecife dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-xl shadow-lg transition-transform active:scale-95"
              >
                Ocultar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
