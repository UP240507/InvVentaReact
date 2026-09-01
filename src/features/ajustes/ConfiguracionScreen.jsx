import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { PageShell, PageHeader, Card } from '../../components/ui';
import { getCapacidades, tieneFlag } from '../../lib/Permisos';
import { useAuthStore } from '../auth/useAuthStore';
import { usePlan } from '../../hooks/usePlan';
import { desdeArchivo, aVistaPrevia } from '../../lib/LogoTermico';
import { cargarCatalogo, precioMXN } from '../suscripciones/checkout';
import { supabase } from '../../api/supabase';
import {
  Settings,
  Building2,
  Receipt,
  Percent,
  Clock,
  Tag,
  Printer,
  Plus,
  X,
  CheckCircle,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  Copy,
  Users,
  HeartHandshake,
} from 'lucide-react';

// (Proyecto D) Temas de color por tenant — swatches para el selector.
const TEMAS_COLOR = [
  {
    id: 'terracota',
    nombre: 'Terracota',
    desc: 'Editorial cálido (de fábrica)',
    colores: ['#F5F1EA', '#0D1B35', '#C8442A', '#1A5C38'],
  },
  {
    id: 'vino-cesped',
    nombre: 'Vino × Cesped',
    desc: 'Vino profundo con el verde de la marca',
    colores: ['#F7F3EE', '#2A1218', '#0E8A63', '#8C2F39'],
  },
  {
    id: 'fenix',
    nombre: 'Fénix',
    desc: 'La paleta del pajarito',
    colores: ['#F9F3EC', '#171A15', '#D55A2B', '#A82877', '#178A5E'],
  },
];

// El tab "Tickets" acumulaba TRES dominios (Chris, 25-jul): el ticket, la
// jornada laboral —que es RH— y el programa de lealtad —que es CRM—. Además de
// mezclar temas, la lealtad quedaba apretada en media columna y el catálogo de
// recompensas se cortaba: un formulario de tres campos y un selector largo no
// cabe al lado de la vista previa del ticket.
//
// Ahora cada dominio tiene su tab. El criterio no es "cuánto ocupa" sino "qué
// pregunta responde": Tickets responde *cómo se ve lo que imprimo*, Personal
// *qué reglas rigen a mi equipo*, y Lealtad *cómo premio a mis clientes*.
const TABS = [
  { id: 'restaurante', label: 'Restaurante', icon: Building2 },
  { id: 'plan', label: 'Mi plan', icon: CreditCard },
  { id: 'fiscal', label: 'Fiscal / IVA', icon: Percent },
  { id: 'categorias', label: 'Categorías', icon: Tag },
  { id: 'tickets', label: 'Tickets', icon: Receipt },
  { id: 'personal', label: 'Personal', icon: Users },
  // Es el add-on que se vende aparte, así que se ve como módulo: sin el plan
  // contratado el tab no aparece, igual que /clientes en el menú lateral.
  { id: 'lealtad', label: 'Lealtad', icon: HeartHandshake, modulo: 'lealtad' },
  // ── «Impresoras» está QUITADO A PROPÓSITO (Chris, 13-ago) ──────────────────
  // El tab existe más abajo (`tab === 'impresoras'`) y guarda una lista en
  // `cfdi_config.impresoras`. **Nadie lee esa lista.** Y no es que falte
  // conectarla: el hub tiene UN solo `transporte` (`hub/mod.rs`), así que la
  // promesa del propio letrero —«cada zona puede tener su propia impresora»— no
  // la puede cumplir la arquitectura de hoy.
  //
  // Se quita en vez de dejarlo porque el fallo no sería un error sino un
  // silencio: el dueño captura la IP de la impresora de la barra, guarda, y no
  // pasa nada. Concluye que el sistema está roto, o —peor— da por hecho que la
  // barra ya imprime. Una pantalla que promete algo que no ocurre es peor que
  // su ausencia.
  //
  // Para devolverlo hacen falta las dos mitades: `HashMap<zona, Transporte>` en
  // el hub y que la cola elija por `documento.zona` (que ya viene puesto desde
  // `lib/Comanda.js`). Mientras tanto la impresora real se configura en
  // Ajustes → Hub e impresora, que sí manda.
  // ── «Turnos» está QUITADO A PROPÓSITO (Chris, 22-ago) ─────────────────────
  // Mismo caso que Impresoras, y comprobado igual: grep de los consumidores.
  // El tab existe más abajo (`tab === 'turnos'`) y guarda cuatro ajustes en
  // `cfdi_config` — `hora_apertura_default`, `hora_cierre_default`,
  // `requiere_fondo_caja` y `fondo_caja_default`—. **Ninguno lo lee nadie**:
  // cero referencias fuera de esta pantalla.
  //
  // Y uno de ellos miente en voz alta: el interruptor «Requerir fondo de caja
  // al abrir turno» promete un candado que no existe. Quien lo activa da por
  // hecho que ya nadie puede abrir caja sin declarar el fondo, y no es verdad.
  // Es el fallo de esta casa: no da error, da silencio.
  //
  // Se quita en vez de cablearlo porque los turnos matutino/vespertino van a
  // rehacer esta pantalla entera (ver `docs/DISENO_TURNOS.md`), y consolidar
  // ahora cuatro ajustes que van a cambiar de sitio es trabajo que se tira.
  //
  // Para devolverlo: que `EsperaScreen` lea `fondo_caja_default` al prerellenar
  // y que la apertura se niegue si `requiere_fondo_caja` está puesto y el monto
  // viene vacío. Las dos mitades, o ninguna.
  //
  // ── «Turnos» VUELVE, pero significando otra cosa ──────────────────────────
  // Ya no son los cuatro ajustes de apertura de caja que nadie leía: es la
  // franja del día (matutino / vespertino), que sí tiene consumidores —el POS
  // al cobrar, el inventario al mover, los gastos al capturar y el filtro de
  // Reportes—. Se pone la pestaña **al final** de la implementación y no al
  // principio, a propósito: hasta que existían los consumidores, activar esto
  // no habría hecho nada, que es justo el fallo que se acaba de describir.
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
    <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-1.5">
      {label}
    </label>
    <input
      type={type}
      value={form[field] || ''}
      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
      placeholder={placeholder}
      className="w-full px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
    />
    {note && (
      <p className="text-[10px] font-bold text-adm-muted mt-1">{note}</p>
    )}
  </div>
);

const Toggle = ({ label, field, description, form, setForm }) => (
  <label className="flex items-center justify-between gap-4 p-4 bg-adm-bg border-2 border-adm-border rounded-ui cursor-pointer hover:border-adm-info/30 dark:hover:border-adm-info/50 transition-all">
    <div>
      <p className="text-sm font-bold text-adm-ink">{label}</p>
      {description && (
        <p className="text-[10px] font-bold text-adm-muted mt-0.5">
          {description}
        </p>
      )}
    </div>
    <div
      onClick={() => setForm((f) => ({ ...f, [field]: !f[field] }))}
      className={`w-12 h-6 rounded-full relative transition-all duration-media ${form[field] ? 'bg-adm-info' : 'bg-adm-chip dark:bg-adm-border'}`}
    >
      <div
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-media ${form[field] ? 'left-7' : 'left-1'}`}
      />
    </div>
  </label>
);

export default function ConfiguracionScreen() {
  const {
    configuracion,
    updateConfiguracion,
    showToast,
    temaColor,
    aplicarTemaColor,
  } = useAppStore();
  const { user } = useAuthStore();

  const conf = configuracion || {};
  const [tab, setTab] = useState('restaurante');

  // ── Fase 1: tab "Mi plan" — plan activo + catálogo (solo lectura aquí;
  //    las acciones de pago viven en /mi-plan). ──
  const navigate = useNavigate();
  const planInfo = usePlan();

  // Los tabs de módulo solo existen si el plan los incluye. Se deriva del plan
  // en vez de guardarse en estado: así, al contratar el add-on, el tab aparece
  // sin recargar y sin un efecto que sincronice dos copias de la misma verdad.
  const tabsVisibles = useMemo(
    () => TABS.filter((t) => !t.modulo || planInfo.tieneModulo(t.modulo)),
    [planInfo],
  );
  const staffLista = useAppStore((s) => s.staff);
  const [catalogoPlanes, setCatalogoPlanes] = useState([]);
  useEffect(() => {
    if (tab === 'plan' && catalogoPlanes.length === 0) {
      cargarCatalogo()
        .then(({ planes }) => setCatalogoPlanes(planes))
        .catch(() => {});
    }
  }, [tab, catalogoPlanes.length]);

  // Código corto del restaurante (restaurantes.codigo): la llave que el staff
  // teclea junto con su PIN al estrenar un dispositivo. RLS: fila propia.
  const restauranteIdSesion = useAuthStore.getState().restauranteId;
  const [codigoRestaurante, setCodigoRestaurante] = useState('');
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  useEffect(() => {
    if (!restauranteIdSesion) return;
    supabase
      .from('restaurantes')
      .select('codigo')
      .eq('id', restauranteIdSesion)
      .maybeSingle()
      .then(({ data }) => setCodigoRestaurante(data?.codigo || ''));
  }, [restauranteIdSesion]);
  const copiarCodigoRestaurante = async () => {
    try {
      await navigator.clipboard.writeText(codigoRestaurante);
      setCodigoCopiado(true);
      setTimeout(() => setCodigoCopiado(false), 2000);
    } catch {
      /* noop */
    }
  };

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
      prev.map((r) => (r.id === id ? { ...r, activo: r.activo === false } : r)),
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
    razon_social: conf.razon_social || '',
    rfc: conf.rfc || '',
    telefono: conf.telefono || '',
    direccion: conf.direccion || '',
    logo_url: conf.logo_url || '',
    iva: conf.iva !== undefined ? conf.iva * 100 : 16,
    mensaje_ticket: conf.mensaje_ticket || '¡Gracias por su preferencia!',
    // Columnas reales de `configuracion`, no `cfdi_config`: las lee el POS al
    // cobrar y el inventario al mover, así que tienen que ser consultables.
    franjas_activas: conf.franjas_activas ?? false,
    franja_corte: (conf.franja_corte || '16:00').slice(0, 5),
    // El logo, ya en puntos de impresora. Ver `lib/LogoTermico.js`.
    logo_bitmap: conf.logo_bitmap || '',
    logo_ancho: conf.logo_ancho || 0,
    logo_alto: conf.logo_alto || 0,
    // Desde cfdi_config jsonb
    encabezado_ticket: cfdiConf.encabezado_ticket || '',
    mostrar_propinas: cfdiConf.mostrar_propinas ?? true,
    hora_apertura_default: cfdiConf.hora_apertura_default || '08:00',
    hora_cierre_default: cfdiConf.hora_cierre_default || '23:00',
    requiere_fondo_caja: cfdiConf.requiere_fondo_caja ?? true,
    fondo_caja_default: cfdiConf.fondo_caja_default || 500,
  });

  // ── El logo, en puntos ──────────────────────────────────────────────────────
  // `vistaLogo` es el bitmap pintado de vuelta, no el archivo elegido: lo que
  // se ve tiene que ser lo que sale por la impresora.
  const [vistaLogo, setVistaLogo] = useState(() =>
    aVistaPrevia(
      {
        bitmap: conf.logo_bitmap || '',
        ancho: conf.logo_ancho || 0,
        alto: conf.logo_alto || 0,
      },
      { escala: 2 },
    ),
  );
  const [errorLogo, setErrorLogo] = useState('');
  // El nombre del archivo elegido, para poder ENSEÑARLO.
  //
  // El control nativo pinta su propia etiqueta desde `input.files`, y como
  // abajo se limpia el input con `e.target.value = ''`, esa etiqueta volvia
  // SIEMPRE a «No se eligió ningún archivo» aunque la imagen se hubiera
  // guardado bien. Reportado en campo el 28-ago: el dueño elige su logo, lee
  // que no eligió nada y concluye que el programa no sirve.
  const [nombreLogo, setNombreLogo] = useState('');

  const alElegirLogo = async (e) => {
    const archivo = e.target.files?.[0];
    // El input se limpia siempre: sin esto, elegir el mismo archivo dos veces
    // seguidas —después de un error, que es justo cuando se reintenta— no
    // dispara `change` y parece que la pantalla se quedó colgada.
    e.target.value = '';
    if (!archivo) return;
    setErrorLogo('');
    setNombreLogo(archivo.name);

    const logo = await desdeArchivo(archivo, { cols: 32 });
    if (!logo) {
      setErrorLogo('No se pudo leer esa imagen. Prueba con un PNG o un JPG.');
      setNombreLogo('');
      return;
    }
    setForm((f) => ({
      ...f,
      logo_bitmap: logo.bitmap,
      logo_ancho: logo.ancho,
      logo_alto: logo.alto,
    }));
    setVistaLogo(aVistaPrevia(logo, { escala: 2 }));
  };

  const quitarLogo = () => {
    setForm((f) => ({ ...f, logo_bitmap: '', logo_ancho: 0, logo_alto: 0 }));
    setVistaLogo(null);
    setErrorLogo('');
    setNombreLogo('');
  };

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
      razon_social: form.razon_social,
      rfc: form.rfc,
      telefono: form.telefono,
      direccion: form.direccion,
      logo_url: form.logo_url,
      iva: parseFloat(form.iva) / 100,
      mensaje_ticket: form.mensaje_ticket,
      franjas_activas: !!form.franjas_activas,
      franja_corte: form.franja_corte || '16:00',
      // Los tres van juntos o no van: un bitmap sin sus medidas es basura que
      // el hub descartaría, y unas medidas sin bitmap no imprimen nada.
      logo_bitmap: form.logo_bitmap || null,
      logo_ancho: form.logo_bitmap ? form.logo_ancho : null,
      logo_alto: form.logo_bitmap ? form.logo_alto : null,
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
    <PageShell ancho="max-w-5xl" className="overflow-y-auto">
      <PageHeader
        icono={Settings}
        titulo="Configuración Global"
        descripcion="Datos del restaurante · fiscal · impresoras · turnos"
      />

      {/* CONTENEDOR PRINCIPAL */}
      <Card className="overflow-hidden flex flex-col md:flex-row min-h-[70vh]">
        {/* SIDEBAR TABS */}
        <div className="w-full md:w-56 bg-adm-bg border-r-2 border-adm-border p-4 space-y-1 shrink-0">
          {tabsVisibles.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-ui transition-all ${
                tab === t.id
                  ? 'bg-adm-info text-adm-info-fg shadow-md'
                  : 'text-adm-muted hover:bg-adm-chip dark:hover:bg-adm-border hover:text-adm-ink dark:hover:text-adm-ink'
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
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-media">
                {/* ── APARIENCIA (Proyecto D): tema de color del tenant ── */}
                <div className="p-5 rounded-ui border-2 border-adm-border bg-adm-bg/50">
                  <h4 className="font-black text-adm-ink text-sm">
                    Tema de color
                  </h4>
                  <p className="text-xs font-bold text-adm-muted mb-4">
                    Aplica a todos los dispositivos del restaurante. El modo
                    claro/oscuro se elige en cada equipo.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {TEMAS_COLOR.map((t) => {
                      const activo = (temaColor || 'terracota') === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={!esAdminSesion}
                          onClick={() => {
                            if (!esAdminSesion) return;
                            aplicarTemaColor(t.id);
                            updateConfiguracion({
                              ...conf,
                              tema_color: t.id,
                            });
                            showToast(
                              `Tema "${t.nombre}" aplicado al restaurante.`,
                              'success',
                            );
                          }}
                          className={`p-4 rounded-ui border-2 text-left transition-all ${
                            activo
                              ? 'border-adm-info dark:border-adm-ok bg-white dark:bg-adm-bg shadow-md'
                              : 'border-adm-border bg-white dark:bg-adm-bg hover:border-adm-border'
                          } ${!esAdminSesion ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className="flex gap-1.5 mb-3">
                            {t.colores.map((c) => (
                              <span
                                key={c}
                                className="w-6 h-6 rounded-full border border-black/10"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <div className="font-black text-sm text-adm-ink flex items-center gap-2">
                            {t.nombre}
                            {activo && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-adm-info dark:text-adm-ok">
                                Activo
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-adm-muted">
                            {t.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!esAdminSesion && (
                    <p className="text-[11px] font-bold text-adm-muted mt-3">
                      Solo el Admin puede cambiar el tema del restaurante.
                    </p>
                  )}
                </div>

                {/* ── Código del restaurante (Fase 1.6) ── */}
                <div className="p-5 rounded-ui border-2 border-adm-border bg-adm-bg/50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-black text-adm-ink text-sm">
                        Código del restaurante
                      </h4>
                      <p className="text-xs font-bold text-adm-muted mt-0.5">
                        Tu equipo lo teclea junto con su PIN al estrenar un
                        dispositivo (tablet, caja nueva).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={copiarCodigoRestaurante}
                      disabled={!codigoRestaurante}
                      title="Copiar código"
                      className="shrink-0 flex items-center gap-2.5 px-5 py-3 rounded-ui border-2 border-adm-border bg-white dark:bg-adm-bg font-black text-xl tracking-widest tabular-nums text-adm-ink hover:border-adm-info dark:hover:border-adm-ok transition-colors"
                    >
                      {codigoRestaurante || '····-····'}
                      <Copy className="w-4 h-4 text-adm-muted" />
                    </button>
                  </div>
                  {codigoCopiado && (
                    <p className="text-[11px] font-black text-adm-ok mt-2 text-right">
                      Copiado ✓
                    </p>
                  )}
                </div>

                <Field
                  label="Nombre del restaurante *"
                  field="nombre_empresa"
                  placeholder="AZUL Restaurante"
                  form={form}
                  setForm={setForm}
                />
                {/* El nombre FISCAL, que casi nunca coincide con el comercial:
                    el local se llama «AZUL Restaurante» y quien factura es una
                    persona física con su nombre completo. Va en el ticket bajo
                    el nombre comercial, junto al RFC. Si se deja vacío, esa
                    línea simplemente no se imprime — mejor omitirla que
                    afirmar un dato fiscal que nadie ha capturado. */}
                <Field
                  label="Razón social (nombre fiscal del dueño o la empresa)"
                  field="razon_social"
                  placeholder="ALBERTO DE JESUS CHAVEZ FERNANDEZ"
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

                {/* ── LOGO DEL TICKET ────────────────────────────────────────
                    Aquí había un campo «URL del Logo» que decía «Aparece en
                    tickets y reportes». No aparecía en ninguna parte: la
                    columna `logo_url` existía desde hacía meses y no la leía
                    nadie. Es el fallo de esta casa —no da error, da ausencia—,
                    y encima el dueño concluía que el sistema estaba roto.

                    Se sustituye por lo que sí imprime. `logo_url` se queda en
                    la base sin tocar; se limpiará aparte, cuando el logo en
                    papel esté verificado. */}
                <div>
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-1.5">
                    Logo del ticket
                  </label>

                  <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Etiqueta propia y el input escondido: la del control
                          nativo no se puede cambiar y contradecia a la
                          pantalla. Sigue siendo un `label` con el input dentro,
                          asi que el clic y el lector de pantalla funcionan
                          igual que antes. */}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <span className="px-4 py-2 rounded-ui bg-adm-chip text-adm-chip-fg font-black text-xs shrink-0">
                          {form.logo_bitmap
                            ? 'Cambiar imagen'
                            : 'Elegir imagen'}
                        </span>
                        <span className="text-xs font-bold text-adm-muted truncate min-w-0">
                          {nombreLogo ||
                            (form.logo_bitmap
                              ? 'Logo guardado'
                              : 'Ningun archivo elegido')}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={alElegirLogo}
                          className="sr-only"
                        />
                      </label>
                      {form.logo_bitmap ? (
                        <div className="flex items-center gap-3">
                          <p className="text-[10px] font-bold text-adm-muted">
                            {form.logo_ancho} × {form.logo_alto} puntos
                          </p>
                          <button
                            type="button"
                            onClick={quitarLogo}
                            className="text-[10px] font-black uppercase tracking-widest text-adm-danger"
                          >
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] font-bold text-adm-muted">
                          Sin logo. El ticket sale con el nombre del local.
                        </p>
                      )}
                      {errorLogo && (
                        <p className="text-[10px] font-bold text-adm-danger">
                          {errorLogo}
                        </p>
                      )}
                    </div>

                    {/* La vista previa son LOS PUNTOS QUE SE VAN A IMPRIMIR, no
                        la imagen que se eligió: blanco y negro puro, al tamaño
                        real del papel. Si enseñáramos el PNG original con sus
                        grises, «se ve bien» no querría decir nada. */}
                    {vistaLogo && (
                      <div className="shrink-0 text-center">
                        <img
                          src={vistaLogo}
                          alt="Cómo saldrá en el papel"
                          className="border-2 border-adm-border rounded-ui bg-white p-1"
                          style={{ imageRendering: 'pixelated', width: 120 }}
                        />
                        <p className="text-[9px] font-black text-adm-muted uppercase tracking-widest mt-1">
                          Así saldrá en papel
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] font-bold text-adm-muted mt-2">
                    Se guarda la imagen convertida a puntos, no un enlace: la
                    caja imprime sin internet y el papel tiene que salir igual
                    aunque la red esté caída.
                  </p>
                </div>
              </div>
            )}

            {/* ── FISCAL ── */}
            {/* ── MI PLAN (Fase 1) ── */}
            {tab === 'plan' && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-media">
                {/* Plan activo */}
                <div className="p-5 rounded-ui border-2 border-adm-border bg-adm-bg/50">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-1">
                        Plan activo
                      </p>
                      <h4 className="text-2xl font-black font-syne text-adm-ink">
                        {planInfo.planNombre ?? 'Sin plan'}
                      </h4>
                    </div>
                    <span
                      className={`px-3 py-1.5 rounded-ui text-[10px] font-black uppercase tracking-widest border-2 ${
                        planInfo.vigente
                          ? 'bg-adm-ok/10 text-adm-ok border-adm-ok/30'
                          : 'bg-adm-danger/10 text-adm-danger border-adm-danger/30'
                      }`}
                    >
                      {planInfo.estado === 'trial'
                        ? 'Prueba'
                        : planInfo.vigente
                          ? 'Activa'
                          : 'No vigente'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                        {planInfo.estado === 'trial'
                          ? 'Prueba termina'
                          : 'Vence'}
                      </p>
                      <p className="font-bold text-adm-ink tabular-nums">
                        {(
                          planInfo.estado === 'trial'
                            ? planInfo.suscripcion?.trial_hasta
                            : planInfo.suscripcion?.fecha_vencimiento
                        )
                          ? new Date(
                              planInfo.estado === 'trial'
                                ? planInfo.suscripcion.trial_hasta
                                : planInfo.suscripcion.fecha_vencimiento,
                            ).toLocaleDateString('es-MX', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                        Empleados activos
                      </p>
                      <p className="font-bold text-adm-ink tabular-nums">
                        {
                          (staffLista || []).filter((s) => s.activo !== false)
                            .length
                        }{' '}
                        / {planInfo.limiteEmpleados || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                        Módulos premium
                      </p>
                      <p className="font-bold text-adm-ink">
                        {planInfo.modulos.length
                          ? planInfo.modulos.join(' · ')
                          : 'Ninguno'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Catálogo (solo lectura) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {catalogoPlanes
                    .filter(
                      (p) => p.activo || p.id === planInfo.suscripcion?.plan,
                    )
                    .map((p) => {
                      const esActual = p.id === planInfo.suscripcion?.plan;
                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-ui border-2 bg-white dark:bg-adm-bg transition-colors ${
                            esActual
                              ? 'border-adm-info dark:border-adm-ok'
                              : 'border-adm-border'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-black text-adm-ink">
                              {p.nombre}
                            </h5>
                            {esActual && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-adm-info dark:text-adm-ok">
                                Actual
                              </span>
                            )}
                          </div>
                          <p className="font-black text-lg text-adm-ink tabular-nums">
                            {precioMXN(p.precio_anual_centavos)}
                            <span className="text-xs font-bold text-adm-muted">
                              {' '}
                              /año más IVA
                            </span>
                          </p>
                          <p className="text-[11px] font-bold text-adm-muted mt-1">
                            Hasta {p.limites?.empleados ?? '—'} empleados
                            {(p.limites?.modulos ?? []).length > 0 &&
                              ` · ${p.limites.modulos.join(', ')}`}
                          </p>
                        </div>
                      );
                    })}
                </div>

                {/* CTA a la pantalla de facturación */}
                <button
                  type="button"
                  onClick={() => navigate('/mi-plan')}
                  className="w-full sm:w-auto bg-adm-info dark:bg-adm-ok hover:opacity-90 text-adm-ok-fg px-6 py-3.5 rounded-ui font-black flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  Administrar plan y facturación{' '}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] font-bold text-adm-muted">
                  Cambios de plan, pagos y facturas se gestionan en la pantalla
                  de facturación (Stripe).
                </p>
              </div>
            )}

            {tab === 'fiscal' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-media">
                <div className="flex items-start gap-3 px-4 py-3 bg-adm-warn/10 border-2 border-adm-warn/30 rounded-ui">
                  <AlertTriangle className="w-4 h-4 text-adm-warn shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-adm-warn leading-snug">
                    Cambiar el IVA afecta todos los cálculos de ventas nuevas.
                    Las ventas históricas conservan el impuesto con el que
                    fueron cerradas.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-3">
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
                        className="w-28 px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-black text-2xl text-center text-adm-ink outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                      />
                      <span className="font-black text-2xl text-adm-muted">
                        %
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {[0, 8, 16].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setForm({ ...form, iva: v })}
                          className={`px-4 py-2.5 rounded-ui text-sm font-black transition-all ${
                            Number(form.iva) === v
                              ? 'bg-adm-info text-adm-info-fg shadow-md'
                              : 'bg-adm-chip dark:bg-adm-border text-adm-muted hover:bg-adm-chip dark:hover:bg-adm-border/70'
                          }`}
                        >
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs font-bold text-adm-muted mt-3">
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
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-media">
                {/* Categorías */}
                <div>
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-3">
                    Categorías del menú POS
                  </label>
                  <div className="flex gap-3 mb-4">
                    <input
                      value={nuevaCat}
                      onChange={(e) => setNuevaCat(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && (e.preventDefault(), agregarCat())
                      }
                      placeholder="Ej. Bebidas, Postres..."
                      className="flex-1 px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                    />
                    <button
                      type="button"
                      onClick={agregarCat}
                      className="px-5 py-3 bg-adm-info hover:bg-adm-info text-adm-info-fg rounded-ui font-black shadow-md transition-all active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categorias.map((c) => (
                      <span
                        key={c}
                        className="bg-adm-chip dark:bg-adm-border text-adm-ink font-bold text-sm px-4 py-2 rounded-ui flex items-center gap-2 border-2 border-adm-border"
                      >
                        {c}
                        <button
                          type="button"
                          onClick={() => quitarCat(c)}
                          className="text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-t-2 border-adm-border pt-8">
                  <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-3">
                    Unidades de medida (Inventario)
                  </label>
                  <div className="flex gap-3 mb-4">
                    <input
                      value={nuevaUni}
                      onChange={(e) => setNuevaUni(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && (e.preventDefault(), agregarUni())
                      }
                      placeholder="Ej. Kgs, Lts, Pzas..."
                      className="flex-1 px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                    />
                    <button
                      type="button"
                      onClick={agregarUni}
                      className="px-5 py-3 bg-adm-info hover:bg-adm-info text-adm-info-fg rounded-ui font-black shadow-md transition-all active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unidades.map((u) => (
                      <span
                        key={u}
                        className="bg-adm-chip dark:bg-adm-border text-adm-ink font-bold text-sm px-4 py-2 rounded-ui flex items-center gap-2 border-2 border-adm-border"
                      >
                        {u}
                        <button
                          type="button"
                          onClick={() => quitarUni(u)}
                          className="text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger transition-colors"
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-4 duration-media">
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-1.5">
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
                      className="w-full px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info resize-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-adm-muted uppercase tracking-widest block mb-1.5">
                      Pie de ticket / Cortesía
                    </label>
                    <textarea
                      value={form.mensaje_ticket}
                      onChange={(e) =>
                        setForm({ ...form, mensaje_ticket: e.target.value })
                      }
                      rows={2}
                      placeholder="¡Gracias por su preferencia!"
                      className="w-full px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info resize-none transition-all"
                    />
                  </div>
                  <Toggle
                    field="mostrar_propinas"
                    label="Imprimir sugerencia de propina"
                    description="Muestra 10%, 15% y 20% al pie del ticket"
                    form={form}
                    setForm={setForm}
                  />
                </div>

                {/* Vista previa ticket */}
                <div className="bg-adm-chip dark:bg-adm-bg rounded-ui p-6 border-2 border-dashed border-adm-border flex justify-center items-start">
                  <div className="bg-white p-5 w-full max-w-[260px] shadow-sm font-mono text-[11px] text-adm-ink space-y-1 text-center rounded-ui">
                    <p className="font-black text-sm uppercase">
                      {form.nombre_empresa || 'MI RESTAURANTE'}
                    </p>
                    {form.encabezado_ticket && (
                      <p className="whitespace-pre-wrap text-[10px]">
                        {form.encabezado_ticket}
                      </p>
                    )}
                    {form.rfc && <p>RFC: {form.rfc}</p>}
                    <p className="border-t border-dashed border-adm-border pt-1 mt-1">
                      - - - - - - - - - - - -
                    </p>
                    <div className="text-left">
                      <p>Mesa: 05 | #0012</p>
                      <p>Mesero: Carlos</p>
                    </div>
                    <p className="border-t border-dashed border-adm-border pt-1 mt-1">
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
                    <p className="border-t border-dashed border-adm-border pt-1 mt-1">
                      - - - - - - - - - - - -
                    </p>
                    <div className="flex justify-between font-black">
                      <p>TOTAL:</p>
                      <p>$165</p>
                    </div>
                    {form.mostrar_propinas && (
                      <div className="text-left mt-2 pt-2 border-t border-adm-border text-[10px]">
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
                    <p className="border-t border-dashed border-adm-border pt-2 mt-2 text-adm-muted italic text-[10px] whitespace-pre-wrap">
                      {form.mensaje_ticket}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── PERSONAL ── */}
            {/* Reglas que rigen al EQUIPO. Vivían bajo "Tickets" porque la
                  palabra "propina" aparece en el ticket, pero ni la jornada ni
                  quién cobra propina tienen que ver con lo que se imprime. */}
            {tab === 'personal' && (
              <div className="max-w-2xl space-y-5 animate-in fade-in slide-in-from-right-4 duration-media">
                {/* Jornada laboral mínima (solo Admin) */}
                <div className="bg-adm-bg border-2 border-adm-border rounded-ui p-5">
                  <p className="text-sm font-black text-adm-ink">
                    Jornada mínima para checar salida
                  </p>
                  <p className="text-xs font-bold text-adm-muted mb-3">
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
                      className="w-24 bg-adm-bg border-2 border-adm-field rounded-ui px-4 py-2.5 font-black text-center text-adm-ink outline-none focus:border-adm-info disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    />
                    <span className="text-xs font-black uppercase tracking-widest text-adm-muted">
                      horas
                    </span>
                    {!esAdminSesion && (
                      <span className="text-[10px] font-bold text-adm-warn">
                        Solo el Admin puede modificarla
                      </span>
                    )}
                  </div>
                </div>

                {/* Reparto de propinas: roles EXCLUIDOS por defecto */}
                <div className="bg-adm-bg border-2 border-adm-border rounded-ui p-5">
                  <p className="text-sm font-black text-adm-ink">
                    Roles sin propina
                  </p>
                  <p className="text-xs font-bold text-adm-muted mb-3">
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
                          className={`px-4 py-2 rounded-ui text-xs font-black border-2 transition-all ${
                            excluido
                              ? 'border-adm-danger/30 bg-adm-danger/10 text-adm-danger'
                              : 'border-adm-border bg-adm-bg text-adm-muted'
                          }`}
                        >
                          {rol} {excluido ? '· sin propina' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── LEALTAD ── */}
            {/* A ancho completo: el catálogo de recompensas tiene un
                  formulario de cuatro controles en línea y, apretado en media
                  columna al lado de la vista previa del ticket, se cortaba. */}
            {tab === 'lealtad' && (
              <div className="max-w-3xl space-y-5 animate-in fade-in slide-in-from-right-4 duration-media">
                {/* Programa de puntos del CRM (solo Admin) */}
                <div className="bg-adm-bg border-2 border-adm-border rounded-ui p-5">
                  <p className="text-sm font-black text-adm-ink">
                    Puntos de lealtad
                  </p>
                  <p className="text-xs font-bold text-adm-muted mb-3">
                    Pesos gastados que otorgan 1 punto al cliente asociado a la
                    venta (ej. 10 = 1 punto por cada $10). 0 = programa apagado.
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-widest text-adm-muted">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      disabled={!esAdminSesion}
                      value={pesosPorPunto}
                      onChange={(e) => setPesosPorPunto(e.target.value)}
                      className="w-24 bg-adm-bg border-2 border-adm-field rounded-ui px-4 py-2.5 font-black text-center text-adm-ink outline-none focus:border-adm-info disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    />
                    <span className="text-xs font-black uppercase tracking-widest text-adm-muted">
                      = 1 punto
                    </span>
                    {!esAdminSesion && (
                      <span className="text-[10px] font-bold text-adm-warn">
                        Solo el Admin puede modificarla
                      </span>
                    )}
                  </div>

                  {/* Catálogo de recompensas (lealtad libre) */}
                  <div className="mt-5">
                    <p className="text-sm font-black text-adm-ink">
                      Recompensas canjeables
                    </p>
                    <p className="text-xs font-bold text-adm-muted mb-3">
                      Define lo que tus clientes pueden canjear con sus puntos
                      (postre gratis, 2x1, lo que decidas). El canje se hace al
                      cobrar en el POS.
                    </p>
                    <div className="space-y-2 mb-3">
                      {recompensas.length === 0 && (
                        <p className="text-xs font-bold text-adm-muted bg-adm-bg border border-dashed border-adm-border rounded-ui p-4 text-center">
                          Sin recompensas todavía.
                        </p>
                      )}
                      {recompensas.map((r) => (
                        <div
                          key={r.id}
                          className={`flex items-center justify-between gap-3 rounded-ui border px-4 py-2.5 transition-colors ${
                            r.activo === false
                              ? 'bg-adm-bg/60 border-adm-border opacity-60'
                              : 'bg-adm-warn/60 border-adm-warn/30'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-black text-adm-ink text-sm truncate">
                              {r.nombre}
                            </p>
                            <p className="text-[10px] font-black text-adm-warn">
                              {Number(r.costo_puntos) || 0} pts ·{' '}
                              <span className="text-adm-muted">
                                {etiquetaRecompensa(r)}
                              </span>
                            </p>
                          </div>
                          {esAdminSesion && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleRecompensa(r.id)}
                                className="px-3 py-1.5 rounded-ui text-[10px] font-black uppercase tracking-widest bg-white dark:bg-adm-panel border border-adm-border text-adm-muted hover:text-adm-info"
                              >
                                {r.activo === false ? 'Activar' : 'Pausar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => quitarRecompensa(r.id)}
                                className="px-3 py-1.5 rounded-ui text-[10px] font-black uppercase tracking-widest bg-white dark:bg-adm-panel border border-adm-border text-adm-muted hover:text-adm-danger"
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
                            className="flex-1 bg-adm-bg border-2 border-adm-field rounded-ui px-4 py-2.5 font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
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
                            className="w-24 bg-adm-bg border-2 border-adm-field rounded-ui px-3 py-2.5 font-black text-center text-adm-ink outline-none focus:border-adm-info transition-colors"
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
                            className="flex-1 bg-adm-bg border-2 border-adm-field rounded-ui px-4 py-2.5 font-bold text-adm-ink outline-none focus:border-adm-info transition-colors"
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
                              className="w-24 bg-adm-bg border-2 border-adm-field rounded-ui px-3 py-2.5 font-black text-center text-adm-ink outline-none focus:border-adm-info transition-colors"
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
                            className="px-5 py-2.5 rounded-ui font-black text-xs uppercase tracking-widest bg-adm-ink dark:bg-adm-danger text-adm-danger-fg disabled:opacity-40 active:scale-95 transition-all"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── IMPRESORAS ── */}
            {tab === 'impresoras' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-media">
                <div className="flex items-start gap-3 px-4 py-3 bg-adm-info/10 border-2 border-adm-info/30 rounded-ui">
                  <Printer className="w-4 h-4 text-adm-info shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-adm-info leading-snug">
                    Impresoras ESC/POS conectadas por red local (TCP/IP). Cada
                    zona puede tener su propia impresora.
                  </p>
                </div>

                {/* Form nueva impresora */}
                <div className="bg-adm-bg border-2 border-adm-border rounded-ui p-5 space-y-4">
                  <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                    Agregar impresora
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={nuevaImp.nombre}
                      onChange={(e) =>
                        setNuevaImp({ ...nuevaImp, nombre: e.target.value })
                      }
                      placeholder="Nombre (ej. Cocina Principal)"
                      className="col-span-2 px-4 py-3 bg-white dark:bg-adm-panel border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                    />
                    <input
                      value={nuevaImp.ip}
                      onChange={(e) =>
                        setNuevaImp({ ...nuevaImp, ip: e.target.value })
                      }
                      placeholder="IP (ej. 192.168.1.100)"
                      className="px-4 py-3 bg-white dark:bg-adm-panel border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                    />
                    <input
                      value={nuevaImp.puerto}
                      onChange={(e) =>
                        setNuevaImp({ ...nuevaImp, puerto: e.target.value })
                      }
                      placeholder="Puerto (9100)"
                      className="px-4 py-3 bg-white dark:bg-adm-panel border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink placeholder:text-adm-muted dark:placeholder:text-adm-muted/50 outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                    />
                    <select
                      value={nuevaImp.zona}
                      onChange={(e) =>
                        setNuevaImp({ ...nuevaImp, zona: e.target.value })
                      }
                      className="px-4 py-3 bg-white dark:bg-adm-panel border-2 border-adm-field rounded-ui font-bold text-sm text-adm-ink outline-none focus:border-adm-info dark:focus:border-adm-info transition-all"
                    >
                      <option value="cocina">Cocina</option>
                      <option value="barra">Barra / Bar</option>
                      <option value="caja">Caja</option>
                      <option value="general">General</option>
                    </select>
                    <button
                      type="button"
                      onClick={agregarImpresora}
                      className="col-span-2 py-3 bg-adm-info hover:bg-adm-info text-adm-info-fg rounded-ui font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" /> Agregar impresora
                    </button>
                  </div>
                </div>

                {/* Lista de impresoras */}
                <div className="space-y-3">
                  {impresoras.length === 0 ? (
                    <div className="text-center py-10 text-adm-muted">
                      <Printer className="w-10 h-10 mx-auto mb-2 opacity-20" />
                      <p className="font-bold text-sm">
                        Sin impresoras configuradas
                      </p>
                    </div>
                  ) : (
                    impresoras.map((imp) => (
                      <div
                        key={imp.id}
                        className="flex items-center justify-between p-4 bg-adm-bg border-2 border-adm-border rounded-ui"
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-adm-info/15 p-2.5 rounded-ui">
                            <Printer className="w-5 h-5 text-adm-info" />
                          </div>
                          <div>
                            <p className="font-black text-sm text-adm-ink">
                              {imp.nombre}
                            </p>
                            <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                              {imp.ip}:{imp.puerto} · Zona: {imp.zona}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarImpresora(imp.id)}
                          className="p-2 text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger rounded-ui hover:bg-adm-danger/10 dark:hover:bg-adm-danger/10 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── TURNOS: LA FRANJA DEL DÍA ── */}
            {tab === 'turnos' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-media">
                <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
                  Separar la mañana de la tarde en los reportes
                </p>

                <Toggle
                  field="franjas_activas"
                  label="Separar turnos matutino y vespertino"
                  description="Cada venta, movimiento de inventario y gasto queda marcado con el turno en que ocurrió. Apagado, el sistema funciona exactamente como hasta ahora."
                  form={form}
                  setForm={setForm}
                />

                {form.franjas_activas && (
                  <>
                    <div className="grid grid-cols-2 gap-5">
                      <Field
                        label="Hora en que empieza la tarde"
                        field="franja_corte"
                        type="time"
                        form={form}
                        setForm={setForm}
                      />
                    </div>

                    {/* Lo que este ajuste NO hace, dicho aquí y no en un
                        documento que nadie abre. Un letrero que promete de más
                        es el fallo que se quitó de esta misma pantalla. */}
                    <div className="text-xs text-adm-muted leading-relaxed border-l-2 border-adm-border pl-4 space-y-2">
                      <p>
                        <strong className="text-adm-ink">
                          Una venta cuenta en el turno en que se COBRÓ
                        </strong>
                        , no en el que se abrió la mesa. Si el billete entró en
                        el cajón de la tarde, cuenta para la tarde: si no, el
                        arqueo de los dos turnos saldría mal a la vez.
                      </p>
                      <p>
                        <strong className="text-adm-ink">
                          El inventario sigue siendo uno.
                        </strong>{' '}
                        Se puede ver qué consumió cada turno, pero no hay un
                        almacén de la mañana y otro de la tarde — el
                        refrigerador es uno solo.
                      </p>
                      <p>
                        Cambiar la hora de corte{' '}
                        <strong className="text-adm-ink">
                          no reclasifica lo ya cobrado
                        </strong>
                        : el turno se graba en cada venta al guardarla, así que
                        un mes cerrado sigue diciendo lo mismo dentro de un año.
                      </p>
                      <p>
                        Lo registrado antes de encender esto se queda{' '}
                        <strong className="text-adm-ink">sin clasificar</strong>
                        , y en los reportes se dice cuánto es. No se le inventa
                        un turno a lo que se capturó cuando el turno no existía.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* BOTÓN GUARDAR */}
          <div className="mt-8 pt-6 border-t-2 border-adm-border flex justify-end shrink-0">
            <button
              type="submit"
              className="bg-adm-ink dark:bg-adm-info hover:bg-black dark:hover:bg-adm-info text-adm-info-fg font-black px-8 py-4 rounded-ui shadow-lg transition-all active:scale-95 flex items-center gap-3"
            >
              <CheckCircle className="w-5 h-5 text-adm-ok" />
              Guardar configuración
            </button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
