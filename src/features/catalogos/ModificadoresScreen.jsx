import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Button,
  Card,
  EmptyState,
  SearchField,
} from '../../components/ui';
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
    // Este catálogo NO usa DataTable a propósito: un grupo de modificadores
    // contiene una LISTA de opciones, y una tabla obligaría a aplanarla o a
    // esconderla tras un clic. La tarjeta enseña las tres primeras de un
    // vistazo, que es como se revisa un menú.
    <PageShell>
      <PageHeader
        icono={ListPlus}
        titulo="Grupos de Modificadores"
        descripcion="Opciones extra, términos de carne y complementos para el POS"
        acciones={
          <Button icono={Plus} onClick={() => abrirModal()}>
            Nuevo grupo
          </Button>
        }
      />

      <SearchField
        icono={Search}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar grupo de modificadores…"
        className="mb-5 max-w-md"
      />

      {/* GRID DE GRUPOS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-8">
        {modificadoresFiltrados?.length === 0 || !modificadores ? (
          <EmptyState
            icono={Settings2}
            titulo="Sin modificadores"
            descripcion={
              'Crea grupos como "Términos", "Extras" o "Sin ingrediente".'
            }
            accion={
              <Button icono={Plus} onClick={() => abrirModal()}>
                Crear el primero
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modificadoresFiltrados.map((grupo) => {
              const numOpciones = (grupo.opciones || []).length;
              return (
                <Card
                  key={grupo.id}
                  hover
                  className="p-6 relative group flex flex-col"
                >
                  {/* BOTONES HOVER */}
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-adm-panel pl-2">
                    <button
                      onClick={() => abrirModal(grupo)}
                      className="p-2 text-adm-info hover:bg-adm-info/10 dark:hover:bg-adm-bg rounded-ui transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(grupo)}
                      className="p-2 text-adm-danger hover:bg-adm-danger/10 dark:hover:bg-adm-bg rounded-ui transition-colors"
                      title="Ocultar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* HEADER TARJETA */}
                  <div className="mb-4 pr-16">
                    <h4 className="font-black text-xl text-adm-ink leading-tight">
                      {grupo.nombre}
                    </h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-ui flex items-center gap-1 ${grupo.tipo === 'unica' ? 'bg-adm-warn/15 text-adm-warn' : 'bg-adm-ok/15 text-adm-ok'}`}
                      >
                        {grupo.tipo === 'unica' ? (
                          <CircleDot className="w-3 h-3" />
                        ) : (
                          <CheckSquare className="w-3 h-3" />
                        )}
                        {grupo.tipo === 'unica' ? 'Opción Única' : 'Múltiple'}
                      </span>
                      {grupo.obligatorio && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-adm-danger/15 text-adm-danger px-2 py-1 rounded-ui">
                          Obligatorio
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MUESTRA DE OPCIONES */}
                  <div className="mt-auto space-y-2 bg-adm-bg p-4 rounded-ui border border-adm-border transition-colors">
                    <p className="text-xs font-bold text-adm-muted mb-2">
                      {numOpciones} opciones disponibles:
                    </p>
                    {(grupo.opciones || []).slice(0, 3).map((op, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center text-sm"
                      >
                        <span className="font-medium text-adm-ink flex items-center gap-1.5">
                          {op.id_producto ? (
                            <PackageOpen className="w-3 h-3 text-adm-info" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-adm-bg dark:bg-adm-muted"></span>
                          )}
                          {op.nombre}
                        </span>
                        <span
                          className={`font-black ${op.precio_extra > 0 ? 'text-adm-ok' : 'text-adm-muted'}`}
                        >
                          {op.precio_extra > 0
                            ? `+$${op.precio_extra}`
                            : 'Sin costo'}
                        </span>
                      </div>
                    ))}
                    {numOpciones > 3 && (
                      <p className="text-xs font-bold text-adm-info text-center pt-2 mt-2 border-t border-adm-border/50">
                        + {numOpciones - 3} opciones más
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL CREADOR DE GRUPOS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-media flex flex-col max-h-[90dvh] border-2 border-adm-border transition-colors">
            <div className="p-6 border-b border-adm-border flex justify-between items-center bg-adm-bg shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-adm-info/15 p-2 rounded-ui">
                  <ListPlus className="w-5 h-5 text-adm-info" />
                </div>
                <h2 className="text-xl font-black text-adm-ink">
                  {itemEditando
                    ? 'Editar Modificadores'
                    : 'Nuevo Grupo de Modificadores'}
                </h2>
              </div>
              <button
                onClick={cerrarModal}
                className="text-adm-muted hover:bg-adm-chip dark:hover:bg-adm-border p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col lg:flex-row">
              <div className="p-6 lg:w-1/3 border-b lg:border-b-0 lg:border-r border-adm-border space-y-6 bg-adm-bg/50">
                <div>
                  <label className="block text-sm font-bold text-adm-muted mb-2">
                    Nombre del Grupo
                  </label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                    className="w-full bg-white dark:bg-adm-panel border border-adm-field text-adm-ink font-bold px-4 py-3 rounded-ui outline-none focus:border-adm-info dark:focus:border-adm-info transition-colors"
                    placeholder="Ej: Tipo de Leche, Extras..."
                    required
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-adm-muted">
                    Reglas de Selección
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-ui border cursor-pointer transition-colors ${formData.tipo === 'unica' ? 'bg-adm-info/10 border-adm-info/30' : 'bg-white border-adm-border dark:bg-adm-panel hover:border-adm-info/30'}`}
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
                      <p className="font-bold text-adm-ink text-sm flex items-center gap-1">
                        <CircleDot className="w-3.5 h-3.5 text-adm-info" />{' '}
                        Opción Única (Radio)
                      </p>
                      <p className="text-[10px] text-adm-muted mt-0.5">
                        El cliente solo puede elegir uno (Ej. Término de carne).
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-ui border cursor-pointer transition-colors ${formData.tipo === 'multiple' ? 'bg-adm-info/10 border-adm-info/30' : 'bg-white border-adm-border dark:bg-adm-panel hover:border-adm-info/30'}`}
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
                      <p className="font-bold text-adm-ink text-sm flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-adm-info" />{' '}
                        Selección Múltiple (Checkbox)
                      </p>
                      <p className="text-[10px] text-adm-muted mt-0.5">
                        Puede elegir varios o ninguno (Ej. Quitar ingredientes).
                      </p>
                    </div>
                  </label>
                </div>

                <div className="pt-4 border-t border-adm-border/60">
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
                      className="w-5 h-5 rounded-ui border-adm-field text-adm-info focus:ring-adm-info"
                    />
                    <div>
                      <p className="font-bold text-adm-ink text-sm">
                        El cajero DEBE seleccionar
                      </p>
                      <p className="text-[10px] text-adm-muted">
                        No deja enviar comanda sin elegir.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-black text-adm-ink mb-4 flex items-center justify-between">
                  Opciones del Grupo
                  <span className="text-xs bg-adm-chip dark:bg-adm-bg text-adm-muted border dark:border-adm-border px-2 py-1 rounded-ui">
                    {(formData.opciones || []).length} agregadas
                  </span>
                </h3>

                <div className="bg-adm-bg p-4 rounded-ui border border-adm-border mb-6 space-y-3 transition-colors">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Nombre (Ej. Extra Tocino)"
                        value={opcionNombre}
                        onChange={(e) => setOpcionNombre(e.target.value)}
                        className="w-full bg-white dark:bg-adm-panel border border-adm-field text-adm-ink font-bold px-3 py-2.5 rounded-ui outline-none focus:border-adm-info dark:focus:border-adm-info text-sm transition-colors"
                      />
                    </div>
                    <div className="w-28 relative">
                      <span className="absolute left-3 top-2.5 text-adm-muted font-bold text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Costo"
                        value={opcionPrecio}
                        onChange={(e) => setOpcionPrecio(e.target.value)}
                        className="w-full bg-white dark:bg-adm-panel border border-adm-field text-adm-ink font-bold pl-7 pr-3 py-2.5 rounded-ui outline-none focus:border-adm-info dark:focus:border-adm-info text-sm transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 items-center border-t border-adm-border pt-3">
                    <PackageOpen className="w-4 h-4 text-adm-muted shrink-0" />
                    <div className="flex-1">
                      <select
                        value={opcionProductoId}
                        onChange={(e) => setOpcionProductoId(e.target.value)}
                        className="w-full bg-white dark:bg-adm-panel border border-adm-field text-adm-muted dark:text-adm-ink font-medium px-3 py-2 rounded-ui outline-none focus:border-adm-info dark:focus:border-adm-info text-xs transition-colors"
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
                          className="w-full bg-white dark:bg-adm-panel border border-adm-field text-adm-ink font-bold px-3 py-2 rounded-ui outline-none focus:border-adm-info dark:focus:border-adm-info text-xs transition-colors"
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={agregarOpcion}
                      className="bg-adm-ink hover:bg-adm-ink dark:bg-adm-info dark:hover:bg-adm-info text-adm-info-fg px-4 py-2 rounded-ui transition-transform active:scale-95 text-xs font-bold shrink-0"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                  {(formData.opciones || []).length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-adm-border rounded-ui text-adm-muted">
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
                          className="flex justify-between items-center p-3 border border-adm-border rounded-ui bg-white dark:bg-adm-panel hover:border-adm-info/30 dark:hover:border-adm-info transition-colors group"
                        >
                          <div>
                            <p className="font-black text-adm-ink text-sm flex items-center gap-2">
                              {formData.tipo === 'unica' ? (
                                <CircleDot className="w-3 h-3 text-adm-muted" />
                              ) : (
                                <CheckSquare className="w-3 h-3 text-adm-muted" />
                              )}
                              {op.nombre}
                              {op.precio_extra > 0 && (
                                <span className="text-xs text-adm-ok bg-adm-ok/10 px-2 py-0.5 rounded-ui">
                                  +$ {op.precio_extra}
                                </span>
                              )}
                            </p>
                            {prodVinculado && (
                              <p className="text-[10px] font-bold text-adm-muted mt-1 flex items-center gap-1">
                                <PackageOpen className="w-3 h-3" /> Descuenta{' '}
                                {op.cantidad} {prodVinculado.unidad} de{' '}
                                {prodVinculado.nombre}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removerOpcion(op.id_opcion)}
                            type="button"
                            className="text-adm-muted dark:text-adm-border hover:text-adm-danger dark:hover:text-adm-danger p-2 transition-colors"
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

            <div className="p-4 border-t border-adm-border bg-white dark:bg-adm-panel shrink-0">
              <button
                onClick={handleSubmit}
                className="w-full bg-adm-info hover:bg-adm-info dark:hover:bg-adm-info text-adm-info-fg font-black py-4 rounded-ui shadow-lg transition-transform active:scale-95"
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
        <div className="fixed inset-0 bg-adm-ink/80 dark:bg-adm-bg/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-sm shadow-2xl p-6 text-center border-2 border-adm-border animate-in zoom-in-95 transition-colors">
            <h2 className="text-xl font-black text-adm-ink mb-2">
              ¿Ocultar {confirmDelete.nombre}?
            </h2>
            <p className="text-adm-muted font-medium text-sm mb-6">
              Dejará de aparecer como opción en el Punto de Venta y al crear
              recetas. Las recetas que ya lo usan siguen funcionando.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 bg-adm-chip dark:bg-adm-bg hover:bg-adm-chip dark:hover:bg-adm-border text-adm-ink font-bold rounded-ui transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                className="flex-1 py-3 bg-adm-danger dark:hover:bg-adm-warn text-adm-danger-fg font-black rounded-ui shadow-lg transition-transform active:scale-95"
              >
                Ocultar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
