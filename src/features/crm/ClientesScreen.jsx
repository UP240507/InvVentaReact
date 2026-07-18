import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { localDB } from '../../store/localDB';
import {
  Users, Plus, Search, Edit3, Trash2, X, Phone,
  Mail, Cake, Star, Trophy, Heart, MessageSquare,
  ArchiveRestore, Ban, Save, Receipt, History
} from 'lucide-react';

// ¿El cliente cumple años este mes? (cumpleanos = 'YYYY-MM-DD' del input date)
const cumpleEsteMes = (cumpleanos) => {
  if (!cumpleanos || typeof cumpleanos !== 'string') return false;
  const mes = cumpleanos.slice(5, 7);
  const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');
  return mes === mesActual;
};

export default function CrmScreen() {
  const { clientes, ventas, showToast } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Activos');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [itemAEliminar, setItemAEliminar] = useState(null);
  // Panel de detalle: historial de consumo + stats del cliente.
  const [detalleCliente, setDetalleCliente] = useState(null);

  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', cumpleanos: '', preferencias: '',
    rfc: '', razon_social: ''
  });

  // Historial del cliente en detalle: ventas de RAM/Dexie con su cliente_id
  // (la asociación nace en ModalCobro y viaja en nuevaVentaBD).
  const historialDetalle = useMemo(() => {
    if (!detalleCliente) return [];
    return (ventas || [])
      .filter((v) => String(v.cliente_id) === String(detalleCliente.id))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 30);
  }, [ventas, detalleCliente]);

  // El detalle debe reflejar la acumulación EN VIVO (eco realtime de clientes):
  // leemos la versión fresca del store, no el snapshot del click.
  const clienteVivo = useMemo(() => {
    if (!detalleCliente) return null;
    return (
      (clientes || []).find(
        (c) => String(c.id) === String(detalleCliente.id),
      ) || detalleCliente
    );
  }, [clientes, detalleCliente]);

  // 🌟 FIX: FUNCIÓN DESTRUCTORA DE DUPLICADOS (Asegura unicidad por ID)
  const upsertClienteLocal = (payload) => {
    useAppStore.setState(prev => {
      // Barremos el arreglo para destruir cualquier clon fantasma que tenga este mismo ID
      const clientesLimpios = (prev.clientes || []).filter(c => String(c.id) !== String(payload.id));
      // Insertamos la versión actualizada
      return { clientes: [payload, ...clientesLimpios] };
    });
  };

  const listaFiltrada = useMemo(() => {
    return (clientes || []).filter(c => {
      const matchEstado = filtroEstado === 'Activos' ? c.activo !== false : c.activo === false;
      const term = busqueda.toLowerCase();
      const matchBusqueda = (c.nombre || '').toLowerCase().includes(term) || 
                            (c.telefono || '').toLowerCase().includes(term);
      return matchEstado && matchBusqueda;
    }).sort((a, b) => (b.total_gastado || 0) - (a.total_gastado || 0));
  }, [clientes, busqueda, filtroEstado]);

  const abrirNuevo = () => {
    setForm({ nombre: '', telefono: '', email: '', cumpleanos: '', preferencias: '', rfc: '', razon_social: '' });
    setEditId(null);
    setShowModal(true);
  };

  const abrirEditar = (c) => {
    setForm({ ...c, email: c.email || '', cumpleanos: c.cumpleanos || '', preferencias: c.preferencias || '', rfc: c.rfc || '', razon_social: c.razon_social || '' });
    setEditId(c.id);
    setShowModal(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return showToast('El nombre es obligatorio', 'error');

    // ANTI-CLOBBER de contadores: el form trae visitas/total_gastado/puntos
    // congelados de cuando se abrió el modal — si otra terminal (o la RPC)
    // acumuló mientras tanto, mandarlos PISARÍA los valores frescos. En
    // EDICIÓN el payload remoto NO lleva contadores (el upsert de PostgREST
    // solo escribe las columnas presentes → los contadores del server quedan
    // intactos); en ALTA arrancan en 0.
    const formLimpio = { ...form };
    delete formLimpio.estado; // propiedad basura legada
    delete formLimpio.visitas;
    delete formLimpio.total_gastado;
    delete formLimpio.puntos_lealtad;

    const payload = {
        ...formLimpio,
        id: editId || Date.now(),
        activo: true,
        ...(editId ? {} : { visitas: 0, total_gastado: 0, puntos_lealtad: 0 })
    };

    enqueueAction('clientes', 'upsert', payload);
    // Local (RAM + Dexie): fusionar con el registro VIVO para conservar los
    // contadores actuales (el eco realtime después trae la verdad del server).
    const vivo = (clientes || []).find(
      (c) => String(c.id) === String(payload.id),
    );
    const fusionado = { ...(vivo || {}), ...payload };
    upsertClienteLocal(fusionado);
    localDB.clientes.put(fusionado).catch(() => {});

    setShowModal(false);
    showToast(editId ? 'Perfil actualizado' : 'Cliente registrado', 'success');
  };

  const toggleEstado = (c) => {
    const { estado, ...clienteLimpio } = c; 
    
    const nuevoEstado = clienteLimpio.activo === false ? true : false;
    const payload = { ...clienteLimpio, activo: nuevoEstado };
    
    enqueueAction('clientes', 'upsert', payload);
    upsertClienteLocal(payload); // 🌟 Usamos nuestra función local blindada
    
    showToast(`${payload.nombre} ${nuevoEstado ? 'activado' : 'bloqueado'}`, 'info');
  };

  const eliminarDefinitivo = () => {
    if (!itemAEliminar) return;
    enqueueAction('clientes', 'delete', itemAEliminar);
    
    useAppStore.setState(prev => ({ 
      clientes: (prev.clientes || []).filter(c => String(c.id) !== String(itemAEliminar.id)) 
    }));
    
    showToast('Cliente borrado de la base de datos', 'success');
    setItemAEliminar(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col h-full animate-in fade-in transition-colors duration-500 text-slate-800 dark:text-ui-text">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-sm mb-8 relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 p-12 bg-pink-500/5 rounded-full -mr-12 -mt-12 opacity-50" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-gradient-to-br from-pink-500 to-rose-500 p-4 rounded-3xl shadow-lg shadow-pink-500/40">
            <Heart className="w-8 h-8 text-white dark:text-ui-obsidiana"/>
          </div>
          <div>
            <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight">CRM y Lealtad</h1>
            <p className="text-slate-500 dark:text-ui-muted font-bold mt-1 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400"/> Base de datos y retención de clientes
            </p>
          </div>
        </div>
        <button onClick={abrirNuevo} className="w-full sm:w-auto bg-slate-900 dark:bg-brand-arrecife hover:bg-slate-800 dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana px-8 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl transition-all hover:scale-105 active:scale-95 group">
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform"/> Nuevo Cliente
        </button>
      </div>

      {/* BUSCADOR Y FILTROS */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1 max-w-md group">
          <Search className="w-5 h-5 text-slate-400 dark:text-ui-muted absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-pink-500 dark:group-focus-within:text-pink-400 transition-colors"/>
          <input type="text" placeholder="Buscar por nombre o teléfono..." value={busqueda} onChange={e => setBusqueda(e.target.value)} 
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border rounded-2xl text-slate-800 dark:text-brand-nacar font-bold outline-none focus:border-pink-500 dark:focus:border-pink-500 shadow-sm transition-all" />
        </div>
        <div className="flex bg-slate-100 dark:bg-ui-obsidiana p-1.5 rounded-2xl border border-transparent dark:border-ui-border transition-colors">
          {['Activos', 'Inactivos'].map(estado => (
            <button key={estado} onClick={() => setFiltroEstado(estado)} 
              className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all ${filtroEstado === estado ? 'bg-white dark:bg-ui-humo text-pink-600 dark:text-brand-arrecife shadow-md' : 'text-slate-500 dark:text-ui-muted hover:text-slate-800 dark:hover:text-brand-nacar'}`}>
              {estado === 'Activos' ? 'Cartera Activa' : 'Bloqueados'}
            </button>
          ))}
        </div>
      </div>

      {/* GRID DE CLIENTES */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {listaFiltrada.length === 0 ? (
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] border-4 border-dashed border-slate-100 dark:border-ui-border py-32 text-center transition-colors">
            <div className="bg-slate-50 dark:bg-ui-obsidiana w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-slate-100 dark:border-ui-border">
               <Users className="w-16 h-16 text-slate-300 dark:text-ui-muted"/>
            </div>
            <h3 className="text-2xl font-black font-syne text-slate-400 dark:text-ui-muted uppercase tracking-tighter">Sin resultados</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {listaFiltrada.map(c => {
              const inicial = (c.nombre && c.nombre.length > 0) ? c.nombre[0].toUpperCase() : '?';
              const esVIP = Number(c.total_gastado) > 5000 || Number(c.visitas) > 10;

              return (
                <div key={c.id} className={`bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 shadow-sm transition-all relative overflow-hidden group hover:shadow-2xl hover:-translate-y-1 ${c.activo === false ? 'border-rose-100 dark:border-brand-arrecife/20 opacity-75' : esVIP ? 'border-amber-200 dark:border-brand-ambar/30' : 'border-slate-100 dark:border-ui-border'}`}>
                  
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${c.activo === false ? 'bg-rose-500 dark:bg-brand-arrecife' : esVIP ? 'bg-amber-400 dark:bg-brand-ambar' : 'bg-pink-500'}`} />

                  <div className="p-6 cursor-pointer" onClick={() => setDetalleCliente(c)}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${c.activo === false ? 'bg-rose-50 text-rose-500 dark:bg-brand-arrecife/10 dark:text-brand-arrecife' : esVIP ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-500/30' : 'bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400'}`}>
                          {inicial}
                        </div>
                        <div className="min-w-0 pr-2">
                          <h3 className="font-black font-syne text-slate-900 dark:text-brand-nacar text-lg leading-tight truncate">{c.nombre || 'Sin Nombre'}</h3>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {esVIP && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-brand-ambar/10 text-amber-600 dark:text-brand-ambar font-black text-[9px] uppercase tracking-widest rounded-md border border-amber-200 dark:border-brand-ambar/30"><Trophy className="w-3 h-3"/> VIP</span>}
                            {cumpleEsteMes(c.cumpleanos) && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 font-black text-[9px] uppercase tracking-widest rounded-md border border-pink-200 dark:border-pink-500/30"><Cake className="w-3 h-3"/> Cumple este mes</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.activo === false ? (
                          <button onClick={(e) => { e.stopPropagation(); toggleEstado(c); }} className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-brand-cesped/10 rounded-xl transition-all" title="Desbloquear"><ArchiveRestore className="w-4 h-4"/></button>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); toggleEstado(c); }} className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-brand-arrecife bg-slate-50 dark:bg-ui-obsidiana rounded-xl transition-all" title="Bloquear"><Ban className="w-4 h-4"/></button>
                            <button onClick={(e) => { e.stopPropagation(); abrirEditar(c); }} className="p-2 text-slate-400 hover:text-pink-500 dark:hover:text-brand-amatista bg-slate-50 dark:bg-ui-obsidiana rounded-xl transition-all" title="Editar"><Edit3 className="w-4 h-4"/></button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="bg-slate-50 dark:bg-ui-obsidiana p-3 rounded-2xl border border-slate-100 dark:border-ui-border transition-colors">
                            <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1">Total Gastado</p>
                            <p className="text-base font-black text-slate-900 dark:text-brand-nacar">${Number(c.total_gastado || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-ui-obsidiana p-3 rounded-2xl border border-slate-100 dark:border-ui-border flex justify-between items-center transition-colors">
                            <div>
                               <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1">Visitas</p>
                               <p className="text-base font-black text-slate-900 dark:text-brand-nacar">{c.visitas || 0}</p>
                            </div>
                            <div className="text-center">
                               <p className="text-[9px] font-black text-amber-500 uppercase tracking-wider mb-1">Puntos</p>
                               <p className="text-base font-black text-amber-500">{c.puntos_lealtad || 0}</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-ui-muted bg-white dark:bg-ui-obsidiana border border-slate-100 dark:border-ui-border px-3 py-2.5 rounded-xl transition-colors">
                        <Phone className="w-4 h-4 text-slate-300 dark:text-ui-muted/50"/> {c.telefono || 'Sin teléfono'}
                      </div>
                      {c.preferencias && (
                        <div className="flex items-start gap-3 text-xs font-bold text-pink-600 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-500/5 border border-pink-100 dark:border-pink-500/20 px-3 py-2.5 rounded-xl transition-colors">
                          <MessageSquare className="w-4 h-4 text-pink-300 dark:text-pink-500 shrink-0 mt-0.5"/> 
                          <span className="line-clamp-2">{c.preferencias}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-ui-obsidiana/50 p-4 flex justify-between items-center border-t border-slate-100 dark:border-ui-border transition-colors">
                    <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                       {c.cumpleanos && <span className="flex items-center gap-1.5"><Cake className="w-3.5 h-3.5 text-pink-400 dark:text-pink-500"/> {c.cumpleanos}</span>}
                    </div>
                    {filtroEstado === 'Inactivos' && (
                      <button onClick={() => setItemAEliminar(c)} className="p-1.5 text-slate-300 dark:text-ui-muted hover:text-rose-600 dark:hover:text-brand-arrecife transition-colors">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL FORMULARIO */}
      {showModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95 duration-300 transition-colors">
            <div className="p-8 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-pink-500 to-rose-500 p-3 rounded-2xl shadow-lg shadow-pink-500/30">
                  <Heart className="w-6 h-6 text-white dark:text-ui-obsidiana"/>
                </div>
                <div>
                  <h3 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar leading-tight">{editId ? 'Perfil de Cliente' : 'Nuevo Cliente'}</h3>
                  <p className="text-sm font-bold text-slate-400 dark:text-ui-muted">Datos y preferencias de servicio</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-brand-arrecife p-2 transition-colors"><X className="w-6 h-6"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <form id="formCrm" onSubmit={guardar} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">Nombre Completo *</label>
                    <input type="text" required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Ej. Mariana Ríos" 
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-black text-slate-800 dark:text-brand-nacar focus:border-pink-500 dark:focus:border-brand-amatista outline-none transition-all" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">Teléfono (WhatsApp)</label>
                    <input type="tel" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} placeholder="000 000 0000" 
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-pink-500 dark:focus:border-brand-amatista transition-all" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">Cumpleaños</label>
                    <input type="date" value={form.cumpleanos} onChange={e => setForm({...form, cumpleanos: e.target.value})} 
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-bold text-slate-500 dark:text-ui-muted outline-none focus:border-pink-500 dark:focus:border-brand-amatista transition-all" />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">Correo Electrónico</label>
                    <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="cliente@correo.com" 
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-pink-500 dark:focus:border-brand-amatista transition-all" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">RFC (facturación)</label>
                    <input type="text" value={form.rfc} onChange={e => setForm({...form, rfc: e.target.value.toUpperCase()})} placeholder="XAXX010101000" maxLength={13}
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-pink-500 dark:focus:border-brand-amatista transition-all uppercase" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest px-2">Razón Social</label>
                    <input type="text" value={form.razon_social} onChange={e => setForm({...form, razon_social: e.target.value})} placeholder="Como aparece en su CSF"
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-pink-500 dark:focus:border-brand-amatista transition-all" />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase t
acking-widest px-2 flex justify-between">
                      <span>Preferencias y Notas</span>
                      <span className="text-pink-400 dark:text-pink-500">Alergias, mesa favorita, etc.</span>
                    </label>
                    <textarea rows="3" value={form.preferencias} onChange={e => setForm({...form, preferencias: e.target.value})} placeholder="Ej. Alérgico a los mariscos. Siempre pide hielo extra." 
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-3xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-pink-500 dark:focus:border-brand-amatista transition-all resize-none" />
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana flex gap-4 transition-colors">
               <button onClick={() => setShowModal(false)} className="flex-1 py-4 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-600 dark:text-brand-nacar font-black rounded-2xl transition-all active:scale-95">Cancelar</button>
               <button type="submit" form="formCrm" className="flex-1 py-4 bg-slate-900 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana font-black rounded-2xl shadow-xl shadow-slate-900/20 dark:shadow-brand-arrecife/30 hover:scale-105 active:scale-95 transition-all">
                 <Save className="w-5 h-5 inline mr-2"/> {editId ? 'Guardar Cambios' : 'Registrar Cliente'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL DE DETALLE: stats en vivo + historial de consumo */}
      {clienteVivo && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md animate-in fade-in" onClick={() => setDetalleCliente(null)}>
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95 duration-300 transition-colors" onClick={(e) => e.stopPropagation()}>
            <div className="p-8 border-b border-slate-100 dark:border-ui-border flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 shadow-inner">
                  {(clienteVivo.nombre || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar leading-tight truncate">{clienteVivo.nombre}</h3>
                  <p className="text-sm font-bold text-slate-400 dark:text-ui-muted flex items-center gap-2 flex-wrap">
                    {clienteVivo.telefono && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5"/> {clienteVivo.telefono}</span>}
                    {clienteVivo.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5"/> {clienteVivo.email}</span>}
                    {cumpleEsteMes(clienteVivo.cumpleanos) && <span className="flex items-center gap-1 text-pink-500 dark:text-pink-400"><Cake className="w-3.5 h-3.5"/> ¡Cumple este mes!</span>}
                  </p>
                </div>
              </div>
              <button onClick={() => setDetalleCliente(null)} className="text-slate-400 hover:text-brand-arrecife p-2 transition-colors shrink-0"><X className="w-6 h-6"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              {/* Stats reales (alimentadas por la RPC, eco realtime en vivo) */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border text-center">
                  <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1">Visitas</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-brand-nacar">{Number(clienteVivo.visitas) || 0}</p>
                </div>
                <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border text-center">
                  <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1">Total Gastado</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-brand-nacar">${Number(clienteVivo.total_gastado || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                </div>
                <div className="bg-amber-50 dark:bg-brand-ambar/10 p-4 rounded-2xl border border-amber-100 dark:border-brand-ambar/30 text-center">
                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1"><Star className="w-3 h-3"/> Puntos</p>
                  <p className="text-2xl font-black text-amber-500">{Number(clienteVivo.puntos_lealtad) || 0}</p>
                </div>
              </div>

              {(clienteVivo.rfc || clienteVivo.razon_social) && (
                <div className="bg-slate-50 dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-100 dark:border-ui-border">
                  <p className="text-[9px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-wider mb-1 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5"/> Datos de facturación</p>
                  <p className="font-black text-slate-800 dark:text-brand-nacar text-sm">{clienteVivo.razon_social || '—'}</p>
                  <p className="font-bold text-slate-500 dark:text-ui-muted text-xs uppercase">{clienteVivo.rfc || 'Sin RFC'}</p>
                </div>
              )}

              {clienteVivo.preferencias && (
                <div className="flex items-start gap-3 text-xs font-bold text-pink-600 dark:text-pink-400 bg-pink-50/50 dark:bg-pink-500/5 border border-pink-100 dark:border-pink-500/20 px-4 py-3 rounded-2xl">
                  <MessageSquare className="w-4 h-4 text-pink-300 dark:text-pink-500 shrink-0 mt-0.5"/>
                  <span>{clienteVivo.preferencias}</span>
                </div>
              )}

              {/* Historial de consumo (ventas locales con cliente_id) */}
              <div>
                <p className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-3 flex items-center gap-2"><History className="w-4 h-4"/> Historial de consumo</p>
                {historialDetalle.length === 0 ? (
                  <p className="text-sm font-bold text-slate-400 dark:text-ui-muted bg-slate-50 dark:bg-ui-obsidiana rounded-2xl border border-dashed border-slate-200 dark:border-ui-border p-6 text-center">
                    Sin ventas asociadas en este dispositivo todavía. Asocia al
                    cliente desde el cobro en el POS.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {historialDetalle.map((v) => (
                      <div key={v.id} className="flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana rounded-xl border border-slate-100 dark:border-ui-border px-4 py-3">
                        <div>
                          <p className="font-black text-slate-800 dark:text-brand-nacar text-sm">{v.folio}</p>
                          <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted">
                            {v.fecha ? new Date(v.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                            {v.metodo_pago ? ` · ${v.metodo_pago}` : ''}
                          </p>
                        </div>
                        <p className="font-black text-slate-900 dark:text-brand-nacar">${Number(v.total || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana flex gap-4 transition-colors">
              <button onClick={() => setDetalleCliente(null)} className="flex-1 py-4 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border text-slate-600 dark:text-brand-nacar font-black rounded-2xl transition-all active:scale-95">Cerrar</button>
              <button onClick={() => { const c = clienteVivo; setDetalleCliente(null); abrirEditar(c); }} className="flex-1 py-4 bg-slate-900 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                <Edit3 className="w-5 h-5"/> Editar perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {itemAEliminar && (
        <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/90 backdrop-blur-md z-[160] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[3rem] w-full max-w-sm p-10 text-center shadow-2xl border-2 border-slate-100 dark:border-ui-border animate-in zoom-in-95 transition-colors">
            <div className="w-20 h-20 bg-rose-50 dark:bg-brand-arrecife/10 text-rose-500 dark:text-brand-arrecife rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner border border-rose-100 dark:border-brand-arrecife/30"><Trash2 className="w-10 h-10"/></div>
            <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-3 tracking-tight">¿Eliminar Cliente?</h2>
            <p className="text-slate-500 dark:text-ui-muted font-bold mb-10 leading-relaxed text-sm">Se perderán sus puntos y su historial de vida. Se recomienda solo Bloquearlo.</p>
            <div className="flex gap-4">
              <button onClick={() => setItemAEliminar(null)} className="flex-1 py-4 bg-slate-100 dark:bg-ui-obsidiana text-slate-600 dark:text-brand-nacar border border-transparent dark:border-ui-border font-black rounded-2xl transition-all">Cancelar</button>
              <button onClick={eliminarDefinitivo} className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 dark:bg-brand-arrecife dark:hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-2xl shadow-xl transition-all">Eliminar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}