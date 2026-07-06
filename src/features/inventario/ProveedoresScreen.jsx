import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Truck,
  Plus,
  Search,
  Phone,
  Mail,
  User,
  Building2,
  X,
  Trash2,
  Edit3,
  AlertTriangle,
  ShoppingCart,
  ArchiveRestore,
} from 'lucide-react';

const EMPTY = {
  nombre: '',
  rfc: '',
  telefono: '',
  email: '',
  contacto: '',
  direccion: '',
  notas: '',
};

// Componente a NIVEL DE MÓDULO (recibe form/setForm por props). Definirlo dentro
// del componente lo recrearía en cada render → React remonta el input → pierde
// el foco en cada tecla. No moverlo adentro.
const LabelInput = ({
  label,
  field,
  type = 'text',
  placeholder,
  required = false,
  form,
  setForm,
}) => (
  <div>
    <label className="text-xs font-bold text-slate-500 dark:text-ui-muted uppercase tracking-wide block mb-1">
      {label} {required && '*'}
    </label>
    <input
      type={type}
      required={required}
      value={form[field] || ''}
      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
      placeholder={placeholder}
      className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border rounded-xl font-bold text-slate-800 dark:text-brand-nacar text-sm outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-colors"
    />
  </div>
);

export default function ProveedoresScreen() {
  const { proveedores, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();
  const navigate = useNavigate();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Activos');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const [proveedorAEliminar, setProveedorAEliminar] = useState(null);

  const lista = (proveedores || [])
    .filter((p) => {
      if (filtroEstado === 'Activos' && p.activo === false) return false;
      if (filtroEstado === 'Inactivos' && p.activo !== false) return false;

      const matchBusqueda =
        (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.rfc || '').toLowerCase().includes(busqueda.toLowerCase());
      return matchBusqueda;
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const abrirNuevo = () => {
    setForm(EMPTY);
    setEditId(null);
    setShowModal(true);
  };
  const abrirEditar = (p) => {
    setForm({ ...p });
    setEditId(p.id);
    setShowModal(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    if (!form.nombre.trim())
      return showToast('El nombre del proveedor es obligatorio.', 'error');

    // CRÍTICO (RLS tenant_proveedores estricto): sin restaurante_id el insert se rechaza.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast(
        'No se pudo identificar el restaurante. Recarga la sesión.',
        'error',
      );

    const prov = {
      ...form,
      id: editId || Date.now(),
      activo: true,
      restaurante_id: restauranteId,
    };

    useAppStore.getState().upsertProveedor(prov);
    enqueueAction('proveedores', 'upsert', prov);

    setShowModal(false);
    showToast(
      editId
        ? 'Proveedor actualizado'
        : `"${prov.nombre}" agregado exitosamente`,
      'success',
    );
  };

  const confirmarEliminar = () => {
    if (!proveedorAEliminar) return;
    const prov = { ...proveedorAEliminar, activo: false };

    useAppStore.getState().upsertProveedor(prov);
    enqueueAction('proveedores', 'upsert', prov);

    showToast(`Proveedor ocultado del sistema.`, 'success');
    setProveedorAEliminar(null);
  };

  const reactivarProveedor = (p) => {
    const prov = { ...p, activo: true };
    useAppStore.getState().upsertProveedor(prov);
    enqueueAction('proveedores', 'upsert', prov);
    showToast(`Proveedor ${p.nombre} reactivado exitosamente.`, 'success');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in transition-colors duration-500">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-6 rounded-3xl border border-slate-200 dark:border-ui-border shadow-sm mb-6 transition-colors">
        <div className="flex items-center gap-4">
          <div className="bg-orange-100 dark:bg-brand-arrecife/10 p-3 rounded-xl">
            <Truck className="w-6 h-6 text-orange-600 dark:text-brand-arrecife" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-brand-nacar">
              Proveedores
            </h1>
            <p className="text-sm text-slate-500 dark:text-ui-muted mt-1">
              Directorio y cadena de suministro
            </p>
          </div>
        </div>
        <button
          onClick={abrirNuevo}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-brand-amatista dark:hover:bg-indigo-500 text-white dark:text-ui-obsidiana px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 dark:shadow-brand-amatista/20 transition-transform active:scale-95"
        >
          <Plus className="w-5 h-5" /> Nuevo Proveedor
        </button>
      </div>

      {/* BUSCADOR Y TABS */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar proveedor o RFC..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border rounded-2xl text-slate-800 dark:text-brand-nacar font-bold outline-none focus:border-indigo-500 dark:focus:border-brand-amatista shadow-sm transition-colors"
          />
        </div>

        <div className="flex bg-slate-200/60 dark:bg-ui-obsidiana p-1.5 rounded-2xl overflow-x-auto custom-scrollbar shrink-0 transition-colors">
          {['Activos', 'Inactivos'].map((estado) => (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className={`px-6 py-2 rounded-xl text-sm font-bold capitalize whitespace-nowrap transition-all ${filtroEstado === estado ? 'bg-white dark:bg-ui-humo text-indigo-600 dark:text-brand-amatista shadow-sm' : 'text-slate-500 dark:text-ui-muted hover:text-slate-700 dark:hover:text-brand-nacar'}`}
            >
              {estado}
            </button>
          ))}
        </div>
      </div>

      {/* GRID DE TARJETAS */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {lista.length === 0 ? (
          <div className="bg-white dark:bg-ui-humo rounded-3xl border-2 border-dashed border-slate-300 dark:border-ui-border py-20 text-center transition-colors">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${filtroEstado === 'Inactivos' ? 'bg-rose-50 dark:bg-brand-arrecife/10' : 'bg-slate-50 dark:bg-ui-obsidiana'}`}
            >
              <Truck
                className={`w-12 h-12 ${filtroEstado === 'Inactivos' ? 'text-rose-200 dark:text-brand-arrecife/50' : 'text-slate-300 dark:text-ui-muted'}`}
              />
            </div>
            <p className="font-black text-xl text-slate-700 dark:text-brand-nacar">
              Sin proveedores {filtroEstado.toLowerCase()}
            </p>
            <p className="text-sm font-medium text-slate-500 dark:text-ui-muted mt-2">
              No hay proveedores que coincidan con tu búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {lista.map((p) => {
              const inactivo = p.activo === false;

              return (
                <div
                  key={p.id}
                  className={`bg-white dark:bg-ui-humo rounded-3xl border shadow-sm p-6 transition-all group flex flex-col ${inactivo ? 'border-rose-100 dark:border-brand-arrecife/30 opacity-80' : 'border-slate-200 dark:border-ui-border hover:shadow-lg'}`}
                >
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl border shrink-0 ${inactivo ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-brand-arrecife/10 dark:border-brand-arrecife/20 dark:text-brand-arrecife' : 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-brand-arrecife/10 dark:border-brand-arrecife/20 dark:text-brand-arrecife'}`}
                      >
                        {(p.nombre || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <h3
                          className="font-black text-slate-900 dark:text-brand-nacar leading-tight line-clamp-1 flex items-center gap-2"
                          title={p.nombre}
                        >
                          {p.nombre}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          {p.rfc && (
                            <p className="text-[10px] font-mono font-bold text-slate-400 dark:text-ui-muted">
                              {p.rfc}
                            </p>
                          )}
                          {inactivo && (
                            <span className="bg-rose-100 dark:bg-brand-arrecife/20 text-rose-600 dark:text-brand-arrecife text-[8px] font-black uppercase px-2 py-0.5 rounded-md border border-rose-200 dark:border-brand-arrecife/30">
                              Oculto
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1 transition-opacity">
                      {inactivo ? (
                        <button
                          onClick={() => reactivarProveedor(p)}
                          className="p-2 hover:bg-emerald-50 dark:hover:bg-brand-cesped/10 rounded-xl text-slate-400 dark:text-ui-muted hover:text-emerald-600 dark:hover:text-brand-cesped transition-colors flex items-center gap-1"
                          title="Reactivar Proveedor"
                        >
                          <ArchiveRestore className="w-5 h-5" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              navigate('/compras', {
                                state: { preselectedProveedor: p },
                              })
                            }
                            className="p-2 hover:bg-emerald-50 dark:hover:bg-brand-cesped/10 rounded-xl text-slate-400 dark:text-ui-muted hover:text-emerald-600 dark:hover:text-brand-cesped transition-colors"
                            title="Crear Orden de Compra"
                          >
                            <ShoppingCart className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => abrirEditar(p)}
                            className="p-2 hover:bg-indigo-50 dark:hover:bg-brand-amatista/10 rounded-xl text-slate-400 dark:text-ui-muted hover:text-indigo-600 dark:hover:text-brand-amatista transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setProveedorAEliminar(p)}
                            className="p-2 hover:bg-rose-50 dark:hover:bg-brand-arrecife/10 rounded-xl text-slate-400 dark:text-ui-muted hover:text-rose-500 dark:hover:text-brand-arrecife transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 flex-1">
                    {p.contacto && (
                      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-brand-nacar">
                        <User className="w-4 h-4 text-slate-400 dark:text-ui-muted shrink-0" />
                        {p.contacto}
                      </div>
                    )}
                    {p.telefono && (
                      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-brand-nacar">
                        <Phone className="w-4 h-4 text-slate-400 dark:text-ui-muted shrink-0" />
                        {p.telefono}
                      </div>
                    )}
                    {p.email && (
                      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-brand-nacar">
                        <Mail className="w-4 h-4 text-slate-400 dark:text-ui-muted shrink-0" />
                        {p.email}
                      </div>
                    )}
                    {p.direccion && (
                      <div className="flex items-start gap-2.5 text-sm font-medium text-slate-600 dark:text-brand-nacar">
                        <Building2 className="w-4 h-4 text-slate-400 dark:text-ui-muted shrink-0 mt-0.5" />
                        <span className="line-clamp-2 leading-snug">
                          {p.direccion}
                        </span>
                      </div>
                    )}
                  </div>

                  {p.notas && (
                    <div className="mt-4 bg-slate-50 dark:bg-ui-obsidiana border border-slate-100 dark:border-ui-border rounded-xl p-3 transition-colors">
                      <p className="text-xs font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-1">
                        Notas
                      </p>
                      <p className="text-xs font-medium text-slate-600 dark:text-brand-nacar line-clamp-2 italic">
                        "{p.notas}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {showModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md animate-in fade-in">
          <form
            onSubmit={guardar}
            className="bg-white dark:bg-ui-humo rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95 flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana shrink-0 transition-colors">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 dark:bg-brand-amatista/10 p-2 rounded-xl">
                  <Truck className="w-5 h-5 text-indigo-600 dark:text-brand-amatista" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-brand-nacar">
                  {editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-ui-border rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400 dark:text-ui-muted" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
              <LabelInput
                label="Nombre de la Empresa"
                field="nombre"
                placeholder="Ej. Distribuidora del Norte S.A."
                required
                form={form}
                setForm={setForm}
              />
              <div className="grid grid-cols-2 gap-4">
                <LabelInput
                  label="RFC"
                  field="rfc"
                  placeholder="XAXX010101000"
                  form={form}
                  setForm={setForm}
                />
                <LabelInput
                  label="Teléfono"
                  field="telefono"
                  placeholder="(00) 0000-0000"
                  type="tel"
                  form={form}
                  setForm={setForm}
                />
              </div>
              <LabelInput
                label="Correo Electrónico"
                field="email"
                type="email"
                placeholder="ventas@proveedor.mx"
                form={form}
                setForm={setForm}
              />
              <LabelInput
                label="Nombre del Contacto"
                field="contacto"
                placeholder="Nombre del agente o vendedor"
                form={form}
                setForm={setForm}
              />
              <LabelInput
                label="Dirección Física"
                field="direccion"
                placeholder="Calle, número, colonia, ciudad"
                form={form}
                setForm={setForm}
              />
              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-ui-muted uppercase tracking-wide block mb-1">
                  Notas / Observaciones
                </label>
                <textarea
                  value={form.notas || ''}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  rows={3}
                  placeholder="Ej. Días de entrega, condiciones..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border border-slate-200 dark:border-ui-border rounded-xl font-medium text-slate-800 dark:text-brand-nacar text-sm outline-none focus:border-indigo-500 dark:focus:border-brand-amatista resize-none transition-colors"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-ui-border bg-white dark:bg-ui-humo shrink-0 flex gap-4 transition-colors">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-4 rounded-2xl border-2 border-slate-200 dark:border-ui-border text-slate-600 dark:text-brand-nacar font-black hover:bg-slate-50 dark:hover:bg-ui-obsidiana transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 dark:bg-brand-amatista dark:hover:bg-indigo-500 text-white dark:text-ui-obsidiana font-black py-4 rounded-2xl shadow-lg shadow-indigo-500/30 dark:shadow-brand-amatista/20 transition-transform active:scale-95"
              >
                {editId ? 'Guardar Cambios' : 'Agregar Proveedor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {proveedorAEliminar && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border w-full max-w-sm shadow-2xl p-8 text-center animate-in zoom-in-95 transition-colors">
            <div className="w-16 h-16 bg-rose-100 dark:bg-brand-arrecife/20 text-rose-500 dark:text-brand-arrecife rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-brand-nacar mb-2">
              ¿Ocultar Proveedor?
            </h2>
            <p className="text-slate-500 dark:text-ui-muted font-medium text-sm mb-6">
              El proveedor{' '}
              <strong className="text-slate-700 dark:text-brand-nacar">
                {proveedorAEliminar.nombre}
              </strong>{' '}
              se ocultará de las listas para no afectar órdenes de compra
              pasadas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setProveedorAEliminar(null)}
                className="flex-1 py-3 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-700 dark:text-brand-nacar font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
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
