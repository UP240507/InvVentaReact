import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getCapacidades, tieneFlag } from '../../lib/Permisos';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Settings,
  Building2,
  Receipt,
  Percent,
  Tag,
  Printer,
  Plus,
  X,
  CheckCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';

const TABS = [
  { id: 'restaurante', label: 'Restaurante', icon: Building2 },
  { id: 'fiscal', label: 'Fiscal / IVA', icon: Percent },
  { id: 'categorias', label: 'Categorías', icon: Tag },
  { id: 'tickets', label: 'Tickets', icon: Receipt },
  { id: 'impresoras', label: 'Impresoras', icon: Printer },
  { id: 'turnos', label: 'Turnos', icon: Clock },
];

// ── Componentes de campo reutilizables (NIVEL DE MÓDULO) ──────────────────────
// IMPORTANTE: estos componentes viven a nivel de módulo y reciben form/setForm
// por props. NUNCA redefinirlos dentro del cuerpo de ConfiguracionScreen: hacerlo
// crea un tipo de componente nuevo en cada render → React desmonta/remonta el
// <input> en cada keystroke → el campo pierde el foco después de cada letra.
const Field = ({
  label,
  field,
  type = 'text',
  placeholder,
  note,
  form,
  setForm,
}) => (
  <div>
    <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
      {label}
    </label>
    <input
      type={type}
      value={form[field] || ''}
      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
      placeholder={placeholder}
      className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
    />
    {note && (
      <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted mt-1">
        {note}
      </p>
    )}
  </div>
);

const Toggle = ({ label, field, description, form, setForm }) => (
  <label className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-2xl cursor-pointer hover:border-indigo-300 dark:hover:border-brand-amatista/50 transition-all">
    <div>
      <p className="text-sm font-bold text-slate-800 dark:text-brand-nacar">
        {label}
      </p>
      {description && (
        <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted mt-0.5">
          {description}
        </p>
      )}
    </div>
    <div
      onClick={() => setForm((f) => ({ ...f, [field]: !f[field] }))}
      className={`w-12 h-6 rounded-full relative transition-all duration-300 ${form[field] ? 'bg-indigo-500 dark:bg-brand-amatista' : 'bg-slate-200 dark:bg-ui-border'}`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${form[field] ? 'left-7' : 'left-1'}`}
      />
    </div>
  </label>
);

export default function ConfiguracionScreen() {
  const { configuracion, updateConfiguracion, showToast } = useAppStore();
  const { user } = useAuthStore();

  const conf = configuracion || {};
  const [tab, setTab] = useState('restaurante');

  // Roles excluidos del reparto de propinas (columna real roles_sin_propina).
  // (Proyecto L) Lista VIVA desde roles_permisos: los roles que cree el tenant
  // aparecen solos; fallback a los 6 base en primera sesión sin fetch.
  const { roles_permisos } = useAppStore();
  const ROLES_STAFF = roles_permisos?.length
    ? roles_permisos.map((r) => r.rol)
    : ['Admin', 'Gerente', 'Cajero', 'Mesero', 'Chef', 'Barista'];
  const [rolesSinPropina, setRolesSinPropina] = useState(
    Array.isArray(conf.roles_sin_propina)
      ? conf.roles_sin_propina
      : ['Admin', 'Gerente'],
  );
  const toggleRolSinPropina = (rol) =>
    setRolesSinPropina((prev) =>
      prev.includes(rol) ? prev.filter((r) => r !== rol) : [...prev, rol],
    );

  // Jornada mínima antes de poder checar salida (0 = sin restricción).
  // SOLO la cuenta del dueño (Admin) puede modificarla; Gerente la ve
  // deshabilitada. El candado vive en el checador y en el logout.
  const esAdminSesion = tieneFlag(
    getCapacidades(user?.rol || user?.puesto, roles_permisos),
    'admin_config',
  );
  const [horasJornada, setHorasJornada] = useState(
    Number(conf.horas_jornada) || 0,
  );

  // Programa de puntos del CRM: cuántos pesos gastados otorgan 1 punto
  // (ej. 10 = 1 pto por cada $10). 0 = programa apagado. La regla la define
  // el DUEÑO (misma restricción que horas_jornada: solo Admin edita); los
  // puntos los calcula el SERVIDOR en la RPC registrar_visita_cliente.
  const [pesosPorPunto, setPesosPorPunto] = useState(
    Number(conf.pesos_por_punto) || 0,
  );

  // Catálogo de recompensas del programa de lealtad (lealtad LIBRE: el dueño
  // define lo que quiera — postre gratis, 2x1, merch...). Se canjean en el
  // cobro vía RPC atómica; aquí solo se administra el catálogo (solo Admin).
  const [recompensas, setRecompensas] = useState(
    Array.isArray(conf.recompensas) ? conf.recompensas : [],
  );
  // tipo: 'cortesia' (informativa: el mesero entrega el premio) |
  //       'descuento_pct' (valor = % de descuento sobre el total a pagar) |
  //       'descuento_monto' (valor = $ de descuento).
  // Los descuentos SÍ se aplican al total en el cobro; el canje es la
  // autorización (no pasa por pinpad).
  const [nuevaRecompensa, setNuevaRecompensa] = useState({
    nombre: '',
    costo: '',
    tipo: 'cortesia',
    valor: '',
  });

  const agregarRecompensa = () => {
    const nombre = nuevaRecompensa.nombre.trim();
    const costo = Number(nuevaRecompensa.costo) || 0;
    const tipo = nuevaRecompensa.tipo || 'cortesia';
    const valor = Number(nuevaRecompensa.valor) || 0;
    if (!nombre || costo <= 0) return;
    if (tipo !== 'cortesia' && valor <= 0)
      return showToast('Un descuento necesita valor mayor a 0.', 'error');
    if (tipo === 'descuento_pct' && valor > 100)
      return showToast('El porcentaje no puede exceder 100.', 'error');
    setRecompensas((prev) => [
      ...prev,
      {
        id: Date.now(),
        nombre,
        costo_puntos: costo,
        tipo,
        valor: tipo === 'cortesia' ? null : valor,
        activo: true,
      },
    ]);
    setNuevaRecompensa({ nombre: '', costo: '', tipo: 'cortesia', valor: '' });
  };

  const etiquetaRecompensa = (r) =>
    r.tipo === 'descuento_pct'
      ? `${Number(r.valor) || 0}% de descuento`
      : r.tipo === 'descuento_monto'
        ? `$${Number(r.valor) || 0} de descuento`
        : 'Cortesía';

  const toggleRecompensa = (id) =>
    setRecompensas((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, activo: r.activo === false } : r,
      ),
    );

  const quitarRecompensa = (id) =>
    setRecompensas((prev) => prev.filter((r) => r.id !== id));

  // Parsear cfdi_config jsonb (donde guardamos los campos extra)
  const cfdiConf = (() => {
    try {
      return typeof conf.cfdi_config === 'string'
        ? JSON.parse(conf.cfdi_config)
        : conf.cfdi_config || {};
    } catch {
      return {};
    }
  })();

  const [form, setForm] = useState({
    nombre_empresa: conf.nombre_empresa || '',
    rfc: conf.rfc || '',
    telefono: conf.telefono || '',
    direccion: conf.direccion || '',
    logo_url: conf.logo_url || '',
    iva: conf.iva !== undefined ? conf.iva * 100 : 16,
    mensaje_ticket: conf.mensaje_ticket || '¡Gracias por su preferencia!',
    // Desde cfdi_config jsonb
    encabezado_ticket: cfdiConf.encabezado_ticket || '',
    mostrar_propinas: cfdiConf.mostrar_propinas ?? true,
    hora_apertura_default: cfdiConf.hora_apertura_default || '08:00',
    hora_cierre_default: cfdiConf.hora_cierre_default || '23:00',
    requiere_fondo_caja: cfdiConf.requiere_fondo_caja ?? true,
    fondo_caja_default: cfdiConf.fondo_caja_default || 500,
  });

  const parseJsonb = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  const [categorias, setCategorias] = useState(parseJsonb(conf.categorias));
  const [unidades, setUnidades] = useState(parseJsonb(conf.unidades));
  const [impresoras, setImpresoras] = useState(parseJsonb(cfdiConf.impresoras));
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaUni, setNuevaUni] = useState('');

  // ── Nueva impresora ─────────────────────────────────────────────────────────
  const [nuevaImp, setNuevaImp] = useState({
    nombre: '',
    tipo: 'termica',
    ip: '',
    puerto: '9100',
    zona: 'cocina',
  });

  const guardar = (e) => {
    e.preventDefault();

    // Mapeamos al schema real de tabla 'configuracion'
    // Los campos extra (impresoras, tickets, turnos) van en cfdi_config jsonb
    // REGLA JSONB: categorias / unidades / cfdi_config son columnas jsonb.
    // supabase-js serializa solo. NUNCA aplicar JSON.stringify aquí (doble-encoding).
    const payload = {
      ...conf,
      // Campos directos en BD
      nombre_empresa: form.nombre_empresa,
      rfc: form.rfc,
      telefono: form.telefono,
      direccion: form.direccion,
      logo_url: form.logo_url,
      iva: parseFloat(form.iva) / 100,
      mensaje_ticket: form.mensaje_ticket,
      categorias: categorias,
      unidades: unidades,
      printer_baud: nuevaImp.puerto || conf.printer_baud || '9100',
      // Campos que no existen en BD → cfdi_config jsonb como contenedor
      cfdi_config: {
        encabezado_ticket: form.encabezado_ticket,
        mostrar_propinas: form.mostrar_propinas,
        hora_apertura_default: form.hora_apertura_default,
        hora_cierre_default: form.hora_cierre_default,
        requiere_fondo_caja: form.requiere_fondo_caja,
        fondo_caja_default: form.fondo_caja_default,
        impresoras,
      },
      roles_sin_propina: rolesSinPropina,
      horas_jornada: esAdminSesion
        ? Number(horasJornada) || 0
        : Number(conf.horas_jornada) || 0,
      pesos_por_punto: esAdminSesion
        ? Math.max(0, Number(pesosPorPunto) || 0)
        : Number(conf.pesos_por_punto) || 0,
      recompensas: esAdminSesion
        ? recompensas
        : Array.isArray(conf.recompensas)
          ? conf.recompensas
          : [],
      restaurante_id: user?.restaurante_id || conf.restaurante_id,
      id: conf.id,
    };

    updateConfiguracion(payload);
    showToast('Configuración guardada', 'success');
  };

  const agregarCat = () => {
    if (!nuevaCat.trim() || categorias.includes(nuevaCat.trim())) return;
    setCategorias([...categorias, nuevaCat.trim()]);
    setNuevaCat('');
  };
  const quitarCat = (c) => setCategorias(categorias.filter((x) => x !== c));

  const agregarUni = () => {
    if (!nuevaUni.trim() || unidades.includes(nuevaUni.trim())) return;
    setUnidades([...unidades, nuevaUni.trim()]);
    setNuevaUni('');
  };
  const quitarUni = (u) => setUnidades(unidades.filter((x) => x !== u));

  const agregarImpresora = () => {
    if (!nuevaImp.nombre.trim() || !nuevaImp.ip.trim()) {
      showToast('Nombre e IP son obligatorios', 'error');
      return;
    }
    setImpresoras([...impresoras, { ...nuevaImp, id: Date.now() }]);
    setNuevaImp({
      nombre: '',
      tipo: 'termica',
      ip: '',
      puerto: '9100',
      zona: 'cocina',
    });
  };
  const quitarImpresora = (id) =>
    setImpresoras(impresoras.filter((i) => i.id !== id));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ui-obsidiana p-4 md:p-8 font-sans transition-colors duration-500">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* CABECERA */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-200 dark:bg-ui-humo p-3.5 rounded-2xl border-2 border-slate-300 dark:border-ui-border">
            <Settings className="w-7 h-7 text-indigo-600 dark:text-brand-amatista" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar">
              Configuración Global
            </h1>
            <p className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mt-0.5">
              Datos del restaurante · Fiscal · Impresoras · Turnos
            </p>
          </div>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[600px] transition-colors">
          {/* SIDEBAR TABS */}
          <div className="w-full md:w-56 bg-slate-50 dark:bg-ui-obsidiana border-r-2 border-slate-100 dark:border-ui-border p-4 space-y-1 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl transition-all ${
                  tab === t.id
                    ? 'bg-indigo-600 dark:bg-brand-amatista text-white shadow-md'
                    : 'text-slate-500 dark:text-ui-muted hover:bg-slate-200 dark:hover:bg-ui-border hover:text-slate-800 dark:hover:text-brand-nacar'
                }`}
              >
                <t.icon className="w-4 h-4 shrink-0" /> {t.label}
              </button>
            ))}
          </div>

          {/* ÁREA DE FORMULARIO */}
          <form onSubmit={guardar} className="flex-1 p-6 md:p-8 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {/* ── RESTAURANTE ── */}
              {tab === 'restaurante' && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                  <Field
                    label="Nombre del restaurante *"
                    field="nombre_empresa"
                    placeholder="AZUL Restaurante"
                    form={form}
                    setForm={setForm}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field
                      label="RFC"
                      field="rfc"
                      placeholder="XAXX010101000"
                      form={form}
                      setForm={setForm}
                    />
                    <Field
                      label="Teléfono"
                      field="telefono"
                      placeholder="(81) 1234-5678"
                      form={form}
                      setForm={setForm}
                    />
                  </div>
                  <Field
                    label="Dirección"
                    field="direccion"
                    placeholder="Calle, Número, Ciudad"
                    form={form}
                    setForm={setForm}
                  />

                  {/* Logo URL */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
                      URL del Logo
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="url"
                        value={form.logo_url}
                        onChange={(e) =>
                          setForm({ ...form, logo_url: e.target.value })
                        }
                        placeholder="https://..."
                        className="flex-1 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      />
                      {form.logo_url && (
                        <img
                          src={form.logo_url}
                          alt="logo preview"
                          className="w-12 h-12 object-contain rounded-xl border-2 border-slate-200 dark:border-ui-border bg-slate-50 dark:bg-ui-obsidiana"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted mt-1">
                      Aparece en tickets y reportes. Sube a Supabase Storage o
                      usa un CDN externo.
                    </p>
                  </div>
                </div>
              )}

              {/* ── FISCAL ── */}
              {tab === 'fiscal' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-brand-ambar/10 border-2 border-amber-200 dark:border-brand-ambar/30 rounded-2xl">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-brand-ambar shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-amber-700 dark:text-brand-ambar leading-snug">
                      Cambiar el IVA afecta todos los cálculos de ventas nuevas.
                      Las ventas históricas conservan el impuesto con el que
                      fueron cerradas.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-3">
                      Tasa de IVA
                    </label>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={form.iva}
                          onChange={(e) =>
                            setForm({ ...form, iva: e.target.value })
                          }
                          className="w-28 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-black text-2xl text-center text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                        />
                        <span className="font-black text-2xl text-slate-600 dark:text-ui-muted">
                          %
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {[0, 8, 16].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setForm({ ...form, iva: v })}
                            className={`px-4 py-2.5 rounded-xl text-sm font-black transition-all ${
                              Number(form.iva) === v
                                ? 'bg-indigo-600 dark:bg-brand-amatista text-white shadow-md'
                                : 'bg-slate-100 dark:bg-ui-border text-slate-600 dark:text-ui-muted hover:bg-slate-200 dark:hover:bg-ui-border/70'
                            }`}
                          >
                            {v}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-3">
                      Por cada $100.00 base cobrarás $
                      {(100 * (1 + Number(form.iva) / 100)).toLocaleString(
                        'es-MX',
                        { minimumFractionDigits: 2 },
                      )}
                      .
                    </p>
                  </div>
                </div>
              )}

              {/* ── CATEGORÍAS ── */}
              {tab === 'categorias' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Categorías */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-3">
                      Categorías del menú POS
                    </label>
                    <div className="flex gap-3 mb-4">
                      <input
                        value={nuevaCat}
                        onChange={(e) => setNuevaCat(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          (e.preventDefault(), agregarCat())
                        }
                        placeholder="Ej. Bebidas, Postres..."
                        className="flex-1 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      />
                      <button
                        type="button"
                        onClick={agregarCat}
                        className="px-5 py-3 bg-indigo-600 dark:bg-brand-amatista hover:bg-indigo-700 text-white rounded-xl font-black shadow-md transition-all active:scale-95"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {categorias.map((c) => (
                        <span
                          key={c}
                          className="bg-slate-100 dark:bg-ui-border text-slate-700 dark:text-brand-nacar font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-2 border-2 border-slate-200 dark:border-ui-border"
                        >
                          {c}
                          <button
                            type="button"
                            onClick={() => quitarCat(c)}
                            className="text-slate-400 hover:text-rose-500 dark:hover:text-brand-arrecife transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="border-t-2 border-slate-100 dark:border-ui-border pt-8">
                    <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-3">
                      Unidades de medida (Inventario)
                    </label>
                    <div className="flex gap-3 mb-4">
                      <input
                        value={nuevaUni}
                        onChange={(e) => setNuevaUni(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          (e.preventDefault(), agregarUni())
                        }
                        placeholder="Ej. Kgs, Lts, Pzas..."
                        className="flex-1 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      />
                      <button
                        type="button"
                        onClick={agregarUni}
                        className="px-5 py-3 bg-indigo-600 dark:bg-brand-amatista hover:bg-indigo-700 text-white rounded-xl font-black shadow-md transition-all active:scale-95"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {unidades.map((u) => (
                        <span
                          key={u}
                          className="bg-slate-100 dark:bg-ui-border text-slate-700 dark:text-brand-nacar font-bold text-sm px-4 py-2 rounded-xl flex items-center gap-2 border-2 border-slate-200 dark:border-ui-border"
                        >
                          {u}
                          <button
                            type="button"
                            onClick={() => quitarUni(u)}
                            className="text-slate-400 hover:text-rose-500 dark:hover:text-brand-arrecife transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TICKETS ── */}
              {tab === 'tickets' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
                        Encabezado / Subtítulo
                      </label>
                      <textarea
                        value={form.encabezado_ticket}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            encabezado_ticket: e.target.value,
                          })
                        }
                        rows={2}
                        placeholder={
                          'Sucursal Centro\nSíguenos en IG @restaurante'
                        }
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista resize-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
                        Pie de ticket / Cortesía
                      </label>
                      <textarea
                        value={form.mensaje_ticket}
                        onChange={(e) =>
                          setForm({ ...form, mensaje_ticket: e.target.value })
                        }
                        rows={2}
                        placeholder="¡Gracias por su preferencia!"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista resize-none transition-all"
                      />
                    </div>
                    <Toggle
                      field="mostrar_propinas"
                      label="Imprimir sugerencia de propina"
                      description="Muestra 10%, 15% y 20% al pie del ticket"
                      form={form}
                      setForm={setForm}
                    />

                    {/* Reparto de propinas: roles EXCLUIDOS por defecto */}
                    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-ui-border">
                      <p className="text-sm font-black text-slate-800 dark:text-brand-nacar">
                        Roles sin propina
                      </p>
                      <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mb-3">
                        Estos roles quedan fuera del reparto en el Propinero (se
                        puede reincluir manualmente en un reparto puntual).
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ROLES_STAFF.map((rol) => {
                          const excluido = rolesSinPropina.includes(rol);
                          return (
                            <button
                              key={rol}
                              type="button"
                              onClick={() => toggleRolSinPropina(rol)}
                              className={`px-4 py-2 rounded-xl text-xs font-black border-2 transition-all ${
                                excluido
                                  ? 'border-rose-300 bg-rose-50 text-rose-600 dark:bg-brand-arrecife/10 dark:border-brand-arrecife/50 dark:text-brand-arrecife'
                                  : 'border-slate-100 bg-slate-50 text-slate-500 dark:border-ui-border dark:bg-ui-obsidiana dark:text-ui-muted'
                              }`}
                            >
                              {rol} {excluido ? '· sin propina' : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Jornada laboral mínima (solo Admin) */}
                    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-ui-border">
                      <p className="text-sm font-black text-slate-800 dark:text-brand-nacar">
                        Jornada mínima para checar salida
                      </p>
                      <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mb-3">
                        Horas que deben cumplirse desde la entrada para poder
                        registrar salida y cerrar sesión. 0 = sin restricción.
                        Salidas antes de tiempo requieren PIN del Admin.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          disabled={!esAdminSesion}
                          value={horasJornada}
                          onChange={(e) => setHorasJornada(e.target.value)}
                          className="w-24 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-4 py-2.5 font-black text-center text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        />
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted">
                          horas
                        </span>
                        {!esAdminSesion && (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-brand-ambar">
                            Solo el Admin puede modificarla
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Programa de puntos del CRM (solo Admin) */}
                    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-ui-border">
                      <p className="text-sm font-black text-slate-800 dark:text-brand-nacar">
                        Puntos de lealtad
                      </p>
                      <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mb-3">
                        Pesos gastados que otorgan 1 punto al cliente asociado a
                        la venta (ej. 10 = 1 punto por cada $10). 0 = programa
                        apagado.
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={!esAdminSesion}
                          value={pesosPorPunto}
                          onChange={(e) => setPesosPorPunto(e.target.value)}
                          className="w-24 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-4 py-2.5 font-black text-center text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        />
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-ui-muted">
                          = 1 punto
                        </span>
                        {!esAdminSesion && (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-brand-ambar">
                            Solo el Admin puede modificarla
                          </span>
                        )}
                      </div>

                      {/* Catálogo de recompensas (lealtad libre) */}
                      <div className="mt-5">
                        <p className="text-sm font-black text-slate-800 dark:text-brand-nacar">
                          Recompensas canjeables
                        </p>
                        <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mb-3">
                          Define lo que tus clientes pueden canjear con sus
                          puntos (postre gratis, 2x1, lo que decidas). El canje
                          se hace al cobrar en el POS.
                        </p>
                        <div className="space-y-2 mb-3">
                          {recompensas.length === 0 && (
                            <p className="text-xs font-bold text-slate-400 dark:text-ui-muted bg-slate-50 dark:bg-ui-obsidiana border border-dashed border-slate-200 dark:border-ui-border rounded-xl p-4 text-center">
                              Sin recompensas todavía.
                            </p>
                          )}
                          {recompensas.map((r) => (
                            <div
                              key={r.id}
                              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 transition-colors ${
                                r.activo === false
                                  ? 'bg-slate-50/60 dark:bg-ui-obsidiana/50 border-slate-100 dark:border-ui-border opacity-60'
                                  : 'bg-amber-50/60 dark:bg-brand-ambar/5 border-amber-100 dark:border-brand-ambar/20'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-black text-slate-800 dark:text-brand-nacar text-sm truncate">
                                  {r.nombre}
                                </p>
                                <p className="text-[10px] font-black text-amber-500">
                                  {Number(r.costo_puntos) || 0} pts ·{' '}
                                  <span className="text-slate-400 dark:text-ui-muted">
                                    {etiquetaRecompensa(r)}
                                  </span>
                                </p>
                              </div>
                              {esAdminSesion && (
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleRecompensa(r.id)}
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-500 dark:text-ui-muted hover:text-indigo-500"
                                  >
                                    {r.activo === false ? 'Activar' : 'Pausar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => quitarRecompensa(r.id)}
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white dark:bg-ui-humo border border-slate-200 dark:border-ui-border text-slate-400 hover:text-rose-500"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {esAdminSesion && (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Ej. Postre gratis"
                                value={nuevaRecompensa.nombre}
                                onChange={(e) =>
                                  setNuevaRecompensa((p) => ({
                                    ...p,
                                    nombre: e.target.value,
                                  }))
                                }
                                className="flex-1 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-4 py-2.5 font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                              />
                              <input
                                type="number"
                                min="1"
                                placeholder="Pts"
                                value={nuevaRecompensa.costo}
                                onChange={(e) =>
                                  setNuevaRecompensa((p) => ({
                                    ...p,
                                    costo: e.target.value,
                                  }))
                                }
                                className="w-24 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-3 py-2.5 font-black text-center text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                              />
                            </div>
                            <div className="flex gap-2">
                              <select
                                value={nuevaRecompensa.tipo}
                                onChange={(e) =>
                                  setNuevaRecompensa((p) => ({
                                    ...p,
                                    tipo: e.target.value,
                                  }))
                                }
                                className="flex-1 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-4 py-2.5 font-bold text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                              >
                                <option value="cortesia">
                                  Cortesía (se entrega, no descuenta)
                                </option>
                                <option value="descuento_pct">
                                  Descuento % sobre el total
                                </option>
                                <option value="descuento_monto">
                                  Descuento $ fijo
                                </option>
                              </select>
                              {nuevaRecompensa.tipo !== 'cortesia' && (
                                <input
                                  type="number"
                                  min="1"
                                  placeholder={
                                    nuevaRecompensa.tipo === 'descuento_pct'
                                      ? '%'
                                      : '$'
                                  }
                                  value={nuevaRecompensa.valor}
                                  onChange={(e) =>
                                    setNuevaRecompensa((p) => ({
                                      ...p,
                                      valor: e.target.value,
                                    }))
                                  }
                                  className="w-24 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl px-3 py-2.5 font-black text-center text-slate-900 dark:text-brand-nacar outline-none focus:border-indigo-500 transition-colors"
                                />
                              )}
                              <button
                                type="button"
                                onClick={agregarRecompensa}
                                disabled={
                                  !nuevaRecompensa.nombre.trim() ||
                                  (Number(nuevaRecompensa.costo) || 0) <= 0 ||
                                  (nuevaRecompensa.tipo !== 'cortesia' &&
                                    (Number(nuevaRecompensa.valor) || 0) <= 0)
                                }
                                className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-900 dark:bg-brand-arrecife text-white dark:text-ui-obsidiana disabled:opacity-40 active:scale-95 transition-all"
                              >
                                Agregar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Vista previa ticket */}
                  <div className="bg-slate-100 dark:bg-ui-obsidiana rounded-2xl p-6 border-2 border-dashed border-slate-300 dark:border-ui-border flex justify-center items-start">
                    <div className="bg-white p-5 w-full max-w-[260px] shadow-sm font-mono text-[11px] text-slate-800 space-y-1 text-center rounded-lg">
                      <p className="font-black text-sm uppercase">
                        {form.nombre_empresa || 'MI RESTAURANTE'}
                      </p>
                      {form.encabezado_ticket && (
                        <p className="whitespace-pre-wrap text-[10px]">
                          {form.encabezado_ticket}
                        </p>
                      )}
                      {form.rfc && <p>RFC: {form.rfc}</p>}
                      <p className="border-t border-dashed border-slate-300 pt-1 mt-1">
                        - - - - - - - - - - - -
                      </p>
                      <div className="text-left">
                        <p>Mesa: 05 | #0012</p>
                        <p>Mesero: Carlos</p>
                      </div>
                      <p className="border-t border-dashed border-slate-300 pt-1 mt-1">
                        - - - - - - - - - - - -
                      </p>
                      <div className="flex justify-between">
                        <p>1x Flat White</p>
                        <p>$55</p>
                      </div>
                      <div className="flex justify-between">
                        <p>1x Chilaquiles</p>
                        <p>$110</p>
                      </div>
                      <p className="border-t border-dashed border-slate-300 pt-1 mt-1">
                        - - - - - - - - - - - -
                      </p>
                      <div className="flex justify-between font-black">
                        <p>TOTAL:</p>
                        <p>$165</p>
                      </div>
                      {form.mostrar_propinas && (
                        <div className="text-left mt-2 pt-2 border-t border-slate-200 text-[10px]">
                          <p className="font-bold text-center mb-1">
                            Propina sugerida:
                          </p>
                          <div className="flex justify-between">
                            <p>10%</p>
                            <p>$16.50</p>
                          </div>
                          <div className="flex justify-between">
                            <p>15%</p>
                            <p>$24.75</p>
                          </div>
                        </div>
                      )}
                      <p className="border-t border-dashed border-slate-300 pt-2 mt-2 text-slate-500 italic text-[10px] whitespace-pre-wrap">
                        {form.mensaje_ticket}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── IMPRESORAS ── */}
              {tab === 'impresoras' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-start gap-3 px-4 py-3 bg-indigo-50 dark:bg-brand-amatista/10 border-2 border-indigo-200 dark:border-brand-amatista/30 rounded-2xl">
                    <Printer className="w-4 h-4 text-indigo-600 dark:text-brand-amatista shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-indigo-700 dark:text-brand-amatista leading-snug">
                      Impresoras ESC/POS conectadas por red local (TCP/IP). Cada
                      zona puede tener su propia impresora.
                    </p>
                  </div>

                  {/* Form nueva impresora */}
                  <div className="bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-2xl p-5 space-y-4">
                    <p className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest">
                      Agregar impresora
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={nuevaImp.nombre}
                        onChange={(e) =>
                          setNuevaImp({ ...nuevaImp, nombre: e.target.value })
                        }
                        placeholder="Nombre (ej. Cocina Principal)"
                        className="col-span-2 px-4 py-3 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      />
                      <input
                        value={nuevaImp.ip}
                        onChange={(e) =>
                          setNuevaImp({ ...nuevaImp, ip: e.target.value })
                        }
                        placeholder="IP (ej. 192.168.1.100)"
                        className="px-4 py-3 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      />
                      <input
                        value={nuevaImp.puerto}
                        onChange={(e) =>
                          setNuevaImp({ ...nuevaImp, puerto: e.target.value })
                        }
                        placeholder="Puerto (9100)"
                        className="px-4 py-3 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      />
                      <select
                        value={nuevaImp.zona}
                        onChange={(e) =>
                          setNuevaImp({ ...nuevaImp, zona: e.target.value })
                        }
                        className="px-4 py-3 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                      >
                        <option value="cocina">Cocina</option>
                        <option value="barra">Barra / Bar</option>
                        <option value="caja">Caja</option>
                        <option value="general">General</option>
                      </select>
                      <button
                        type="button"
                        onClick={agregarImpresora}
                        className="col-span-2 py-3 bg-indigo-600 dark:bg-brand-amatista hover:bg-indigo-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" /> Agregar impresora
                      </button>
                    </div>
                  </div>

                  {/* Lista de impresoras */}
                  <div className="space-y-3">
                    {impresoras.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 dark:text-ui-muted">
                        <Printer className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p className="font-bold text-sm">
                          Sin impresoras configuradas
                        </p>
                      </div>
                    ) : (
                      impresoras.map((imp) => (
                        <div
                          key={imp.id}
                          className="flex items-center justify-between p-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-2xl"
                        >
                          <div className="flex items-center gap-4">
                            <div className="bg-indigo-100 dark:bg-brand-amatista/20 p-2.5 rounded-xl">
                              <Printer className="w-5 h-5 text-indigo-600 dark:text-brand-amatista" />
                            </div>
                            <div>
                              <p className="font-black text-sm text-slate-800 dark:text-brand-nacar">
                                {imp.nombre}
                              </p>
                              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                                {imp.ip}:{imp.puerto} · Zona: {imp.zona}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => quitarImpresora(imp.id)}
                            className="p-2 text-slate-400 hover:text-rose-500 dark:hover:text-brand-arrecife rounded-xl hover:bg-rose-50 dark:hover:bg-brand-arrecife/10 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ── TURNOS ── */}
              {tab === 'turnos' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <p className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest">
                    Configuración de apertura y cierre de caja
                  </p>
                  <div className="grid grid-cols-2 gap-5">
                    <Field
                      label="Hora apertura default"
                      field="hora_apertura_default"
                      type="time"
                      form={form}
                      setForm={setForm}
                    />
                    <Field
                      label="Hora cierre default"
                      field="hora_cierre_default"
                      type="time"
                      form={form}
                      setForm={setForm}
                    />
                  </div>
                  <Toggle
                    field="requiere_fondo_caja"
                    label="Requerir fondo de caja al abrir turno"
                    description="El gerente deberá ingresar el monto del fondo inicial"
                    form={form}
                    setForm={setForm}
                  />
                  {form.requiere_fondo_caja && (
                    <div>
                      <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
                        Fondo de caja default (MXN)
                      </label>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-500 dark:text-ui-muted">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={form.fondo_caja_default}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              fondo_caja_default: e.target.value,
                            })
                          }
                          className="w-40 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-black text-lg text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* BOTÓN GUARDAR */}
            <div className="mt-8 pt-6 border-t-2 border-slate-100 dark:border-ui-border flex justify-end shrink-0">
              <button
                type="submit"
                className="bg-slate-900 dark:bg-brand-amatista hover:bg-black dark:hover:bg-indigo-600 text-white font-black px-8 py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-3"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400 dark:text-brand-cesped" />
                Guardar configuración
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
