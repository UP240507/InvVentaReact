import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  PageShell,
  PageHeader,
  Button,
  Chip,
  EmptyState,
  SearchField,
  SegmentedControl,
  IconButton,
  DataTable,
} from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import { copiaDeReceta } from '../../lib/Recetas';
import {
  ChefHat,
  Plus,
  Search,
  Edit3,
  Copy,
  Trash2,
  X,
  UtensilsCrossed,
  Calculator,
  PackageMinus,
  TrendingDown,
  TrendingUp,
  ArchiveRestore,
  ListPlus,
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
    es_paquete: false,
    componentes: [],
  });

  const [inputNuevaCat, setInputNuevaCat] = useState('');
  const [insumoSeleccionado, setInsumoSeleccionado] = useState('');
  const [cantidadInsumo, setCantidadInsumo] = useState('');
  const [mermaInsumo, setMermaInsumo] = useState(0);
  // PAQUETES: selector de recetas componentes (combo fijo a precio de paquete).
  const [componenteSel, setComponenteSel] = useState('');
  const [cantidadComponente, setCantidadComponente] = useState('1');
  // PAQUETES fase 2: grupos de elección ("elige 1 de N"), ej. "Bebida caliente:
  // café de olla o americano". Se arma el grupo y se agrega al paquete.
  const [grupoNombre, setGrupoNombre] = useState('');
  const [grupoOpciones, setGrupoOpciones] = useState([]); // [{recetaId, nombre}]
  const [grupoOpcionSel, setGrupoOpcionSel] = useState('');

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

  // Costo del paquete = fijos al costo de su receta + grupos de elección al
  // costo de su opción MÁS CARA (peor caso: nunca subestima la rentabilidad).
  const costoPaquete = (form.componentes || []).reduce((acc, comp) => {
    if (Array.isArray(comp?.opciones) && comp.opciones.length > 0) {
      const maxCosto = comp.opciones.reduce((mx, op) => {
        const r = (recetas || []).find(
          (x) => String(x.id) === String(op.recetaId),
        );
        return Math.max(mx, Number(r?.costo) || 0);
      }, 0);
      return acc + maxCosto * (Number(comp.cantidad) || 1);
    }
    const r = (recetas || []).find(
      (x) => String(x.id) === String(comp.recetaId),
    );
    return acc + (Number(r?.costo) || 0) * (Number(comp.cantidad) || 0);
  }, 0);

  const costoActual = form.es_paquete
    ? Math.round(costoPaquete * 100) / 100
    : calcularCostoReceta(form.insumos || []);
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
    setComponenteSel('');
    setCantidadComponente('1');
    setGrupoNombre('');
    setGrupoOpciones([]);
    setGrupoOpcionSel('');
  };

  const abrirEditar = (item) => {
    const insumosNorm = (item.insumos || item.ingredientes || []).map((i) => ({
      productoId: Number(i.productoId ?? i.id_producto),
      cantidad: Number(i.cantidad) || 0,
      merma: Number(i.merma) || 0,
    }));
    // Componentes: fijos {recetaId, cantidad, nombre} y grupos de elección
    // {grupo, cantidad, opciones:[{recetaId, nombre}]} conviven en el arreglo.
    const componentesNorm = (item.componentes || []).map((c) =>
      Array.isArray(c?.opciones) && c.opciones.length > 0
        ? {
            grupo: c.grupo || 'Elección',
            cantidad: Number(c.cantidad) || 1,
            opciones: c.opciones.map((o) => ({
              recetaId: Number(o.recetaId),
              nombre: o.nombre || '',
            })),
          }
        : {
            recetaId: Number(c.recetaId),
            cantidad: Number(c.cantidad) || 1,
            nombre: c.nombre || '',
          },
    );
    setForm({
      ...item,
      precio_venta: item.precio_venta || '',
      insumos: insumosNorm,
      grupos_modificadores: item.grupos_modificadores || [],
      es_paquete: componentesNorm.length > 0,
      componentes: componentesNorm,
    });
    setEditId(item.id);
    setModalTab('general');
    setShowModal(true);
  };

  /**
   * Duplicar una receta: abre el formulario con TODO relleno, sin guardar.
   *
   * ── POR QUÉ ES LO PRIMERO DE LA CAPTURA RÁPIDA ────────────────────────────
   * Porque el catálogo de un restaurante son variantes: la misma base con otra
   * proteína, otro tamaño, otra guarnición. Sin duplicar, cada variante se
   * teclea entera —insumos, cantidades, mermas, modificadores— y eso es lo que
   * hace que cargar el menú se abandone a la mitad.
   *
   * Reusa `abrirEditar` para no repetir la normalización de insumos y
   * componentes, que es la parte con formas legadas dentro, y después suelta el
   * `editId`: eso es lo que convierte «editar esto» en «crear otra cosa». Si se
   * quedara puesto, guardar pisaría el original.
   *
   * Qué se copia y qué no —y por qué `codigo_pos` se queda fuera— está en
   * `lib/Recetas.js`, con sus pruebas.
   */
  const duplicarReceta = (item) => {
    abrirEditar(item);
    const copia = copiaDeReceta(item, recetas || []);
    if (!copia) return;
    setForm((prev) => ({ ...prev, ...copia }));
    setEditId(null);
    showToast?.(
      'Copia lista. Revisa el nombre y el código POS antes de guardar.',
      'info',
    );
  };

  // ── PAQUETES: manejo de componentes ────────────────────────────────────────
  const agregarComponente = () => {
    const receta = (recetas || []).find(
      (r) => String(r.id) === String(componenteSel),
    );
    const veces = Number(cantidadComponente) || 0;
    if (!receta || veces <= 0)
      return showToast('Elige una receta y cantidad válida.', 'error');
    setForm((prev) => {
      const clone = [...(prev.componentes || [])];
      const idx = clone.findIndex(
        (c) => String(c.recetaId) === String(receta.id),
      );
      if (idx !== -1) {
        clone[idx] = { ...clone[idx], cantidad: clone[idx].cantidad + veces };
      } else {
        clone.push({
          recetaId: Number(receta.id),
          cantidad: veces,
          nombre: receta.nombre,
        });
      }
      return { ...prev, componentes: clone };
    });
    setComponenteSel('');
    setCantidadComponente('1');
  };

  const quitarComponente = (recetaId) =>
    setForm((prev) => ({
      ...prev,
      componentes: (prev.componentes || []).filter(
        (c) =>
          Array.isArray(c?.opciones) || String(c.recetaId) !== String(recetaId),
      ),
    }));

  // ── Grupos de elección ("elige 1 de N") ────────────────────────────────────
  const agregarOpcionAlGrupo = () => {
    const receta = (recetas || []).find(
      (r) => String(r.id) === String(grupoOpcionSel),
    );
    if (!receta) return;
    setGrupoOpciones((prev) =>
      prev.some((o) => String(o.recetaId) === String(receta.id))
        ? prev
        : [...prev, { recetaId: Number(receta.id), nombre: receta.nombre }],
    );
    setGrupoOpcionSel('');
  };

  const agregarGrupoEleccion = () => {
    const nombre = grupoNombre.trim();
    if (!nombre)
      return showToast('Ponle nombre al grupo (ej. Bebida caliente).', 'error');
    if (grupoOpciones.length < 2)
      return showToast(
        'Un grupo de elección necesita al menos 2 opciones.',
        'error',
      );
    if (
      (form.componentes || []).some(
        (c) => Array.isArray(c?.opciones) && c.grupo === nombre,
      )
    )
      return showToast('Ya existe un grupo con ese nombre.', 'error');
    setForm((prev) => ({
      ...prev,
      componentes: [
        ...(prev.componentes || []),
        { grupo: nombre, cantidad: 1, opciones: grupoOpciones },
      ],
    }));
    setGrupoNombre('');
    setGrupoOpciones([]);
    setGrupoOpcionSel('');
  };

  const quitarGrupoEleccion = (nombre) =>
    setForm((prev) => ({
      ...prev,
      componentes: (prev.componentes || []).filter(
        (c) => !(Array.isArray(c?.opciones) && c.grupo === nombre),
      ),
    }));

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
    if (form.es_paquete) {
      if ((form.componentes || []).length === 0)
        return showToast('Agrega al menos 1 receta al paquete.', 'error');
    } else if ((form.insumos || []).length === 0) {
      return showToast('Agrega al menos 1 ingrediente.', 'error');
    }
    const categoriaFinal =
      form.categoria === '__nueva__' ? inputNuevaCat.trim() : form.categoria;
    // Payload CANÓNICO: solo columnas vivas de 'recetas' (precio_venta, costo,
    // insumos, componentes). PAQUETE: insumos vacíos — se expanden AL VUELO en
    // el POS desde las recetas componentes vivas (nunca desnormalizados).
    const payload = {
      id: editId || Date.now(),
      nombre: form.nombre.trim(),
      codigo_pos: (form.codigo_pos || '').toUpperCase(),
      categoria: categoriaFinal,
      precio_venta: Number(form.precio_venta) || 0,
      costo: Number(costoActual.toFixed(2)),
      insumos: form.es_paquete
        ? []
        : (form.insumos || []).map((i) => ({
            productoId: Number(i.productoId ?? i.id_producto),
            cantidad: Number(i.cantidad) || 0,
            merma: Number(i.merma) || 0,
          })),
      componentes: form.es_paquete
        ? (form.componentes || []).map((c) =>
            Array.isArray(c?.opciones) && c.opciones.length > 0
              ? {
                  grupo: c.grupo || 'Elección',
                  cantidad: Number(c.cantidad) || 1,
                  opciones: c.opciones.map((o) => ({
                    recetaId: Number(o.recetaId),
                    nombre: o.nombre || '',
                  })),
                }
              : {
                  recetaId: Number(c.recetaId),
                  cantidad: Number(c.cantidad) || 1,
                  nombre: c.nombre || '',
                },
          )
        : null,
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

  // ── Nueva receta: mismo estado inicial para el botón y para el atajo N ──
  const abrirNuevo = () => {
    setForm({
      nombre: '',
      codigo_pos: '',
      categoria: categoriasExistentes[0] || 'Platos Fuertes',
      precio_venta: '',
      insumos: [],
      grupos_modificadores: [],
      es_paquete: false,
      componentes: [],
    });
    setEditId(null);
    setModalTab('general');
    setShowModal(true);
  };

  // ── Columnas ────────────────────────────────────────────────────────────
  // Aquí SÍ manda la tabla, al revés que en Modificadores: "ingeniería de menú"
  // es comparar costo, precio y margen ENTRE platillos, y eso en una rejilla de
  // tarjetas obliga a recorrer la pantalla en zigzag. En tabla, la columna de
  // rentabilidad se lee de arriba abajo de un vistazo.
  const filas = useMemo(
    () =>
      recetasFiltradas.map((r) => {
        const costo = calcularCostoReceta(r.insumos || r.ingredientes || []);
        const precio = Number(r.precio_venta) || 0;
        const margen = precio > 0 ? ((precio - costo) / precio) * 100 : 0;
        return { ...r, _costo: costo, _precio: precio, _margen: margen };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recetasFiltradas, productos],
  );

  const columnas = [
    {
      id: 'platillo',
      titulo: 'Platillo',
      celda: (r) => (
        <div className="min-w-0">
          <p className="font-bold text-adm-ink leading-tight truncate">
            {r.nombre}
            {r.activo === false && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.14em] text-adm-danger">
                oculto
              </span>
            )}
          </p>
          <p className="text-[10px] font-mono text-adm-muted mt-0.5">
            {r.codigo_pos || 'NO-POS'}
            {Array.isArray(r.componentes) && r.componentes.length > 0 && (
              <span className="ml-2 text-adm-info">
                paquete · {r.componentes.length}
              </span>
            )}
          </p>
        </div>
      ),
    },
    {
      id: 'categoria',
      titulo: 'Categoría',
      ancho: '1%',
      celda: (r) => <Chip>{r.categoria}</Chip>,
    },
    {
      id: 'composicion',
      titulo: 'Composición',
      ancho: '1%',
      celda: (r) => (
        <span className="text-xs text-adm-muted whitespace-nowrap">
          {(r.insumos || r.ingredientes || []).length} insumos ·{' '}
          {(r.grupos_modificadores || []).length} mods
        </span>
      ),
    },
    {
      id: 'costo',
      titulo: 'Costo',
      alinear: 'der',
      ancho: '1%',
      celda: (r) => (
        <span className="text-adm-muted">
          ${r._costo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      id: 'precio',
      titulo: 'Venta',
      alinear: 'der',
      ancho: '1%',
      celda: (r) => (
        <span className="font-bold text-adm-ink">
          ${r._precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      id: 'margen',
      titulo: 'Rentabilidad',
      alinear: 'der',
      ancho: '1%',
      celda: (r) => {
        // Umbral de 30%: por debajo el platillo no paga su parte de los costos
        // fijos. Es el mismo criterio que usaba la barra de la tarjeta vieja.
        const tono =
          r._margen <= 0
            ? 'text-adm-danger'
            : r._margen < 30
              ? 'text-adm-warn'
              : 'text-adm-ok';
        return (
          <span className={`font-bold tabular-nums ${tono}`}>
            {r._margen.toFixed(1)}%
          </span>
        );
      },
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'der',
      ancho: '1%',
      celda: (r) => (
        <div className="flex justify-end gap-1">
          {r.activo === false ? (
            <IconButton
              icono={ArchiveRestore}
              titulo="Reactivar"
              onClick={(e) => {
                e.stopPropagation();
                reactivarReceta(r);
              }}
            />
          ) : (
            <>
              <IconButton
                icono={EyeOff}
                titulo="Ocultar del menú"
                onClick={(e) => {
                  e.stopPropagation();
                  desactivarReceta(r);
                }}
              />
              <IconButton
                icono={Copy}
                titulo="Duplicar"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicarReceta(r);
                }}
              />
              <IconButton
                icono={Edit3}
                titulo="Editar"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirEditar(r);
                }}
              />
            </>
          )}
          <IconButton
            icono={Trash2}
            titulo="Eliminar permanentemente"
            className="hover:text-adm-danger"
            onClick={(e) => {
              e.stopPropagation();
              setRecetaAEliminar(r);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell className="overflow-y-auto">
      <PageHeader
        icono={ChefHat}
        titulo="Menú Maestro"
        descripcion="Ingeniería de menú y costos"
        scopeAtajos="tabla-recetas"
        acciones={
          <Button icono={Plus} onClick={abrirNuevo}>
            Nuevo platillo
          </Button>
        }
      />

      {/* ─── FILTROS ─── */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <SearchField
          icono={Search}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código POS…"
          className="flex-1 max-w-md"
        />
        <SegmentedControl
          opciones={['Activos', 'Inactivos']}
          valor={filtroEstado}
          onChange={setFiltroEstado}
        />
      </div>

      {/* ─── TABLA DE PLATILLOS ─── */}
      <DataTable
        scope="tabla-recetas"
        titulo="Menú maestro"
        columnas={columnas}
        filas={filas}
        onEditar={abrirEditar}
        onNuevo={abrirNuevo}
        onEliminar={setRecetaAEliminar}
        activo={!showModal && !recetaAEliminar}
        vacio={
          <EmptyState
            icono={UtensilsCrossed}
            titulo={`Sin platillos ${filtroEstado.toLowerCase()}`}
            descripcion="No hay recetas que coincidan con tu búsqueda."
            accion={
              filtroEstado === 'Activos' ? (
                <Button icono={Plus} onClick={abrirNuevo}>
                  Crear el primero
                </Button>
              ) : null
            }
          />
        }
      />

      {/* ─── MODAL EXPLOSIÓN DE RECETA ─── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-adm-ink/80 dark:bg-adm-bg/90 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border p-8 md:p-10 max-w-5xl w-full shadow-2xl flex flex-col h-[90vh] animate-in zoom-in-95 duration-media">
            {/* HEADER MODAL */}
            <div className="flex justify-between items-start mb-6 shrink-0">
              <div>
                <h2 className="text-3xl font-black font-syne text-adm-ink tracking-tight">
                  {editId ? 'Ajustar Platillo' : 'Nuevo en el Menú'}
                </h2>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs font-black text-adm-ok flex items-center gap-1 bg-adm-ok/10 px-3 py-1 rounded-ui">
                    <Calculator className="w-3.5 h-3.5" /> Costo: $
                    {costoActual.toFixed(2)}
                  </span>
                  <span className="text-xs font-black text-adm-danger flex items-center gap-1 bg-adm-danger/10 px-3 py-1 rounded-ui">
                    <PackageMinus className="w-3.5 h-3.5" /> Insumos:{' '}
                    {(form.insumos || []).length}
                  </span>
                </div>
              </div>
              <button
                onClick={cerrarModal}
                className="p-2 bg-adm-chip dark:bg-adm-bg rounded-full text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* TABS */}
            <div className="flex gap-6 mb-6 border-b-2 border-adm-border shrink-0">
              {['general', 'ingredientes', 'modificadores'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setModalTab(tab)}
                  className={`pb-4 text-xs font-black uppercase tracking-widest border-b-4 transition-all ${modalTab === tab ? 'border-adm-danger text-adm-danger' : 'border-transparent text-adm-muted hover:text-adm-ink dark:hover:text-adm-ink'}`}
                >
                  {tab === 'general'
                    ? 'Información Base'
                    : tab === 'ingredientes'
                      ? form.es_paquete
                        ? 'Recetas del Paquete'
                        : 'Explosión de Insumos'
                      : 'Extras y Modificadores'}
                </button>
              ))}
            </div>

            {/* FORMULARIO CONTENIDO */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-10">
              <form id="formReceta" onSubmit={guardar}>
                {/* TAB: GENERAL */}
                {modalTab === 'general' && (
                  <div className="space-y-8 animate-in slide-in-from-right-4 duration-media max-w-2xl">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-adm-muted uppercase px-2 tracking-widest">
                        Nombre Público *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.nombre}
                        onChange={(e) =>
                          setForm({ ...form, nombre: e.target.value })
                        }
                        className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui font-black text-adm-ink focus:border-adm-danger outline-none"
                        placeholder="Ej: Hamburguesa Azul"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-adm-muted uppercase px-2 tracking-widest">
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
                          className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui font-mono font-black text-adm-ink focus:border-adm-danger outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-adm-muted uppercase px-2 tracking-widest">
                          Categoría Menú *
                        </label>
                        <select
                          value={form.categoria}
                          onChange={(e) =>
                            setForm({ ...form, categoria: e.target.value })
                          }
                          className="w-full px-6 py-4 bg-adm-bg border-2 border-adm-field rounded-ui font-black text-adm-ink focus:border-adm-danger outline-none"
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
                        className="w-full border-2 border-adm-danger bg-adm-bg p-4 rounded-ui font-black text-adm-ink outline-none"
                        autoFocus
                      />
                    )}

                    {/* PAQUETE: combo fijo a precio de paquete */}
                    <div
                      className={`p-5 rounded-ui border-2 transition-colors ${form.es_paquete ? 'bg-adm-info/10 border-adm-info/30' : 'bg-adm-bg border-adm-border'}`}
                    >
                      <label className="flex items-center justify-between cursor-pointer select-none">
                        <div>
                          <p className="font-black text-adm-ink text-sm">
                            Este platillo es un PAQUETE
                          </p>
                          <p className="text-xs font-bold text-adm-muted mt-0.5">
                            Combo de recetas existentes a precio fijo. El
                            inventario se descuenta por cada componente y cocina
                            ve el desglose en el KDS.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              es_paquete: !p.es_paquete,
                            }))
                          }
                          className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ml-4 ${form.es_paquete ? 'bg-adm-info' : 'bg-adm-bg dark:bg-adm-border'}`}
                        >
                          <span
                            className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${form.es_paquete ? 'left-7' : 'left-1'}`}
                          />
                        </button>
                      </label>
                    </div>
                  </div>
                )}

                {/* TAB: RECETAS DEL PAQUETE (solo paquetes) */}
                {modalTab === 'ingredientes' && form.es_paquete && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-media">
                    <div className="p-6 bg-adm-ink dark:bg-adm-bg border-2 border-adm-border rounded-ui-lg shadow-xl">
                      <label className="text-xs font-black text-adm-info uppercase mb-4 flex items-center gap-2">
                        <PlusCircle className="w-4 h-4" /> Añadir Receta al
                        Paquete
                      </label>
                      <div className="flex flex-col lg:flex-row gap-4">
                        <select
                          value={componenteSel}
                          onChange={(e) => setComponenteSel(e.target.value)}
                          className="flex-1 bg-adm-ink dark:bg-adm-panel border border-adm-field text-adm-bg font-black px-6 py-4 rounded-ui outline-none focus:border-adm-info transition-colors"
                        >
                          <option value="">Buscar platillo del menú...</option>
                          {(recetas || [])
                            .filter(
                              (r) =>
                                r.activo !== false &&
                                String(r.id) !== String(editId) &&
                                !(
                                  Array.isArray(r.componentes) &&
                                  r.componentes.length > 0
                                ),
                            )
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nombre} (${Number(r.precio_venta) || 0})
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-4">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={cantidadComponente}
                            onChange={(e) =>
                              setCantidadComponente(e.target.value)
                            }
                            placeholder="Cant."
                            className="w-24 bg-adm-ink dark:bg-adm-panel border border-adm-field text-adm-bg font-black px-4 py-4 rounded-ui outline-none text-center focus:border-adm-info transition-colors"
                          />
                          <button
                            type="button"
                            onClick={agregarComponente}
                            className="bg-adm-info hover:bg-adm-info text-adm-info-fg font-black px-6 py-4 rounded-ui active:scale-95 transition-all"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-adm-muted mt-3">
                        Los paquetes no pueden contener otros paquetes. El
                        inventario se descuenta expandiendo cada receta al
                        momento de la venta.
                      </p>
                    </div>

                    {/* GRUPO DE ELECCIÓN: "elige 1 de N" (ej. café de olla o
                        americano). El POS pregunta la elección al vender. */}
                    <div className="p-6 bg-adm-info/10 border-2 border-adm-info/30 rounded-ui-lg">
                      <label className="text-xs font-black text-adm-info uppercase mb-4 flex items-center gap-2">
                        <PlusCircle className="w-4 h-4" /> Añadir Grupo de
                        Elección (elige 1 de N)
                      </label>
                      <div className="flex flex-col gap-3">
                        <input
                          type="text"
                          value={grupoNombre}
                          onChange={(e) => setGrupoNombre(e.target.value)}
                          placeholder='Nombre del grupo, ej. "Bebida caliente"'
                          className="w-full bg-white dark:bg-adm-bg border-2 border-adm-info/30 rounded-ui px-5 py-3.5 font-black text-adm-ink outline-none focus:border-adm-info"
                        />
                        <div className="flex flex-col lg:flex-row gap-3">
                          <select
                            value={grupoOpcionSel}
                            onChange={(e) => setGrupoOpcionSel(e.target.value)}
                            className="flex-1 bg-white dark:bg-adm-bg border-2 border-adm-info/30 rounded-ui px-5 py-3.5 font-black text-adm-ink outline-none focus:border-adm-info"
                          >
                            <option value="">Agregar opción al grupo...</option>
                            {(recetas || [])
                              .filter(
                                (r) =>
                                  r.activo !== false &&
                                  String(r.id) !== String(editId) &&
                                  !(
                                    Array.isArray(r.componentes) &&
                                    r.componentes.length > 0
                                  ) &&
                                  !grupoOpciones.some(
                                    (o) => String(o.recetaId) === String(r.id),
                                  ),
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nombre}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={agregarOpcionAlGrupo}
                            disabled={!grupoOpcionSel}
                            className="bg-white dark:bg-adm-bg border-2 border-adm-info/30 text-adm-info font-black px-6 py-3.5 rounded-ui active:scale-95 transition-all disabled:opacity-40"
                          >
                            + Opción
                          </button>
                        </div>
                        {grupoOpciones.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {grupoOpciones.map((o) => (
                              <span
                                key={o.recetaId}
                                className="inline-flex items-center gap-2 bg-white dark:bg-adm-bg border border-adm-info/30 text-adm-ink font-black text-xs px-3 py-1.5 rounded-ui"
                              >
                                {o.nombre}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGrupoOpciones((prev) =>
                                      prev.filter(
                                        (x) =>
                                          String(x.recetaId) !==
                                          String(o.recetaId),
                                      ),
                                    )
                                  }
                                  className="text-adm-muted hover:text-adm-danger"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={agregarGrupoEleccion}
                          disabled={
                            !grupoNombre.trim() || grupoOpciones.length < 2
                          }
                          className="bg-adm-info hover:bg-adm-info text-adm-info-fg font-black px-6 py-3.5 rounded-ui active:scale-95 transition-all disabled:opacity-40"
                        >
                          Agregar grupo al paquete
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(form.componentes || []).length === 0 ? (
                        <p className="text-sm font-bold text-adm-muted bg-adm-bg border border-dashed border-adm-border rounded-ui p-8 text-center">
                          Sin recetas todavía. Un paquete necesita al menos una.
                        </p>
                      ) : (
                        (form.componentes || []).map((comp) => {
                          // GRUPO DE ELECCIÓN: "elige 1 de N"
                          if (
                            Array.isArray(comp?.opciones) &&
                            comp.opciones.length > 0
                          ) {
                            return (
                              <div
                                key={`grupo-${comp.grupo}`}
                                className="flex items-center justify-between bg-adm-info/60 border-2 border-adm-info/30 rounded-ui px-5 py-3.5"
                              >
                                <div className="min-w-0">
                                  <p className="font-black text-adm-ink truncate">
                                    <span className="text-adm-info mr-2">
                                      {comp.cantidad}x
                                    </span>
                                    {comp.grupo}
                                    <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-adm-info bg-white dark:bg-adm-bg border border-adm-info/30 px-2 py-0.5 rounded-ui">
                                      Elige 1
                                    </span>
                                  </p>
                                  <p className="text-[10px] font-bold text-adm-muted truncate">
                                    {comp.opciones
                                      .map((o) => o.nombre)
                                      .join(' · ')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    quitarGrupoEleccion(comp.grupo)
                                  }
                                  className="p-2 text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger shrink-0"
                                  title="Quitar grupo"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          }
                          // COMPONENTE FIJO
                          const rComp = (recetas || []).find(
                            (x) => String(x.id) === String(comp.recetaId),
                          );
                          return (
                            <div
                              key={comp.recetaId}
                              className="flex items-center justify-between bg-white dark:bg-adm-bg border-2 border-adm-border rounded-ui px-5 py-3.5"
                            >
                              <div className="min-w-0">
                                <p className="font-black text-adm-ink truncate">
                                  <span className="text-adm-info mr-2">
                                    {comp.cantidad}x
                                  </span>
                                  {rComp?.nombre ||
                                    comp.nombre ||
                                    `#${comp.recetaId}`}
                                </p>
                                <p className="text-[10px] font-bold text-adm-muted">
                                  Costo: $
                                  {(
                                    (Number(rComp?.costo) || 0) *
                                    (Number(comp.cantidad) || 0)
                                  ).toFixed(2)}
                                  {!rComp || rComp.activo === false
                                    ? ' · ⚠️ receta inactiva o inexistente'
                                    : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => quitarComponente(comp.recetaId)}
                                className="p-2 text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger shrink-0"
                                title="Quitar del paquete"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-5 bg-adm-info/10 border-2 border-adm-info/30 rounded-ui flex justify-between items-center">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-adm-muted">
                          Costo del paquete
                        </p>
                        <p className="text-2xl font-black text-adm-ink">
                          ${costoActual.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-adm-muted">
                          Precio del paquete
                        </p>
                        <input
                          type="number"
                          min="0"
                          value={form.precio_venta}
                          onChange={(e) =>
                            setForm({ ...form, precio_venta: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-32 bg-white dark:bg-adm-bg border-2 border-adm-info/30 rounded-ui px-3 py-2 font-black text-right text-adm-ink outline-none focus:border-adm-info"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: INGREDIENTES */}
                {modalTab === 'ingredientes' && !form.es_paquete && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-media">
                    <div className="p-6 bg-adm-ink dark:bg-adm-bg border-2 border-adm-border rounded-ui-lg shadow-xl">
                      <label className="text-xs font-black text-adm-warn uppercase mb-4 flex items-center gap-2">
                        <PlusCircle className="w-4 h-4" /> Añadir Materia Prima
                        a la Receta
                      </label>
                      <div className="flex flex-col lg:flex-row gap-4">
                        <select
                          value={insumoSeleccionado}
                          onChange={(e) =>
                            setInsumoSeleccionado(e.target.value)
                          }
                          className="flex-1 bg-adm-ink dark:bg-adm-panel border border-adm-field text-adm-bg font-black px-6 py-4 rounded-ui outline-none focus:border-adm-warn transition-colors"
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
                            className="w-24 bg-adm-ink dark:bg-adm-panel border border-adm-field font-black text-adm-bg rounded-ui text-center outline-none focus:border-adm-warn"
                          />
                          <div className="bg-adm-ink dark:bg-adm-panel border border-adm-border rounded-ui flex items-center px-4 focus-within:border-adm-warn transition-colors">
                            <input
                              type="number"
                              step="0.01"
                              value={mermaInsumo}
                              onChange={(e) => setMermaInsumo(e.target.value)}
                              className="w-16 bg-transparent font-black text-adm-bg dark:text-adm-ink text-center pr-2 outline-none"
                              placeholder="0"
                            />
                            <span className="text-[10px] font-black text-adm-muted">
                              % Merma
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={agregarIngrediente}
                            className="bg-adm-warn text-adm-ink dark:text-adm-bg px-8 py-4 rounded-ui font-black shadow-lg shadow-adm-warn/30 transition-all hover:scale-105 active:scale-95"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-adm-panel rounded-ui border-2 border-adm-border overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-adm-bg text-adm-muted text-[10px] uppercase tracking-widest border-b border-adm-border">
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
                        <tbody className="divide-y divide-adm-border">
                          {(form.insumos || []).length === 0 && (
                            <tr>
                              <td
                                colSpan="5"
                                className="p-8 text-center text-adm-muted font-bold"
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
                                className="hover:bg-adm-bg dark:hover:bg-adm-bg/30"
                              >
                                <td className="px-6 py-4 font-black text-adm-ink">
                                  {prod.nombre}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="bg-adm-chip dark:bg-adm-bg text-adm-muted dark:text-adm-ink px-3 py-1.5 rounded-ui font-mono text-xs font-black border border-adm-border">
                                    {ing.cantidad} {prod.unidad}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  {Number(mermaVal) > 0 ? (
                                    <span className="bg-adm-danger/10 text-adm-danger px-3 py-1 rounded-ui text-[10px] font-black border border-adm-danger/30">
                                      {mermaVal}%
                                    </span>
                                  ) : (
                                    <span className="text-adm-muted">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right font-black text-adm-ink dark:text-adm-ok">
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
                                    className="p-2 text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger transition-all rounded-ui hover:bg-adm-danger/10 dark:hover:bg-adm-danger/10"
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-right-4 duration-media">
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
                            className={`p-6 rounded-ui border-2 cursor-pointer transition-all flex items-center justify-between ${activo ? 'border-adm-info bg-adm-info/5 shadow-lg shadow-adm-info/10' : 'border-adm-border bg-white dark:bg-adm-bg hover:border-adm-info/50'}`}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`w-10 h-10 rounded-ui flex items-center justify-center transition-colors ${activo ? 'bg-adm-info text-adm-info-fg' : 'bg-adm-chip dark:bg-adm-panel text-adm-muted'}`}
                              >
                                <ListPlus className="w-5 h-5" />
                              </div>
                              <p
                                className={`font-black text-sm ${activo ? 'text-adm-info' : 'text-adm-muted dark:text-adm-ink'}`}
                              >
                                {grupo.nombre}
                              </p>
                            </div>
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${activo ? 'bg-adm-info border-adm-info' : 'border-adm-border'}`}
                            >
                              {activo && (
                                <X className="w-3.5 h-3.5 text-adm-bg" />
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
            <div className="bg-adm-bg p-6 rounded-ui-lg border-2 border-adm-border flex flex-col md:flex-row justify-between items-center gap-6 shadow-inner shrink-0 relative z-20 mt-4">
              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 w-full md:w-auto">
                <div>
                  <p className="text-[10px] text-adm-muted font-black uppercase tracking-[0.2em] mb-1">
                    Costo Producción
                  </p>
                  <p className="text-2xl font-black text-adm-danger leading-none">
                    $
                    {costoActual.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="hidden md:block h-10 w-px bg-adm-chip dark:bg-adm-border" />
                <div className="group relative">
                  <p className="text-[10px] text-adm-muted font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1 group-hover:text-adm-ok dark:group-hover:text-adm-ok transition-colors">
                    <Coins className="w-3 h-3" /> Precio Público *
                  </p>
                  <div className="flex items-center bg-white dark:bg-adm-panel rounded-ui px-5 py-2.5 border-2 border-adm-border focus-within:border-adm-ok dark:focus-within:border-adm-ok transition-all shadow-sm">
                    <span className="text-adm-muted font-black mr-2 text-lg">
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
                      className="w-28 bg-transparent text-adm-ok font-black text-2xl outline-none"
                    />
                  </div>
                </div>
                <div className="hidden md:block h-10 w-px bg-adm-chip dark:bg-adm-border" />
                <div>
                  <p className="text-[10px] text-adm-muted font-black uppercase tracking-[0.2em] mb-1">
                    Rentabilidad
                  </p>
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-2xl font-black leading-none ${margenPorcentaje >= 30 ? 'text-adm-ok' : 'text-adm-danger'}`}
                    >
                      {margenPorcentaje.toFixed(1)}%
                    </p>
                    <div
                      className={`p-1.5 rounded-ui ${margenPorcentaje >= 30 ? 'bg-adm-ok/15 text-adm-ok' : 'bg-adm-danger/15 text-adm-danger'}`}
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
                className="w-full md:w-auto bg-adm-ink hover:bg-adm-ink dark:bg-adm-danger dark:hover:bg-adm-warn text-adm-danger-fg font-black px-10 py-5 rounded-ui-lg shadow-xl shadow-adm-border/20 dark:shadow-adm-danger/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
              >
                <Save className="w-5 h-5" /> Guardar Platillo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ELIMINAR PERMANENTE (HARD DELETE) ─── */}
      {recetaAEliminar && (
        <div className="fixed inset-0 bg-adm-ink/80 dark:bg-adm-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg w-full max-w-md p-10 text-center shadow-2xl border-2 border-adm-border animate-in zoom-in-95">
            <div className="w-20 h-20 bg-adm-danger/10 text-adm-danger rounded-ui-lg flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Trash2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black font-syne text-adm-ink mb-3 tracking-tight">
              ¿Eliminar Permanentemente?
            </h2>
            <p className="text-adm-muted font-bold mb-10 leading-relaxed text-sm">
              Esta acción borrará el platillo de la base de datos de forma
              definitiva. Si solo quieres que no aparezca en el POS, usa el
              botón de "Ocultar".
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmarEliminarRecetaTotal}
                className="w-full py-4 bg-adm-danger dark:hover:bg-adm-warn text-adm-danger-fg font-black rounded-ui shadow-lg transition-all active:scale-95"
              >
                Eliminar de raíz
              </button>
              <button
                onClick={() => setRecetaAEliminar(null)}
                className="w-full py-4 bg-adm-chip dark:bg-adm-bg hover:bg-adm-chip dark:hover:bg-adm-border text-adm-muted dark:text-adm-ink font-bold rounded-ui transition-all border border-transparent hover:border-adm-border dark:hover:border-adm-border"
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
