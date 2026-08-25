// ─── GASTOS Y COSTOS FIJOS (Fase 2.5) ────────────────────────────────────────
// La mitad que le faltaba al P&L. Hasta ahora el sistema solo conocía el costo
// de los INSUMOS, así que podía dar margen bruto pero no utilidad.
//
// Tres orígenes de gasto conviven aquí y NO se tratan igual:
//   · manual      — lo captura el dueño. Se edita y se borra.
//   · recurrente  — lo genera una plantilla. Nace PENDIENTE y no suma hasta que
//                   se confirma el importe real del recibo.
//   · nómina      — DERIVADO de las nóminas procesadas, de solo lectura. Se
//                   corrige en Nóminas, no aquí: si se pudiera capturar además
//                   a mano, se contaría dos veces y la utilidad mentiría.
//
// Toda la matemática vive en lib/Gastos.js. Esta pantalla solo pinta y captura.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  Wallet,
  Plus,
  Search,
  Edit3,
  Trash2,
  Repeat,
  Lock,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import {
  PageShell,
  PageHeader,
  Card,
  CardBody,
  Button,
  Chip,
  EmptyState,
  SearchField,
  SegmentedControl,
  IconButton,
  Field,
  Input,
  Select,
  Modal,
  ConfirmModal,
  DataTable,
} from '../../components/ui';
import { PERIODOS, rangoDePeriodo } from '../../lib/Metricas';
import {
  resumenGastos,
  ESCALAS,
  escalaDeGasto,
  sinClasificar,
  filtrarPorEscala,
  cuantosSinClasificar,
  generarRecurrentes,
  fechaDeGasto,
} from '../../lib/Gastos';
import { hoyLocalISO } from '../../lib/Fechas';
import { franjaAlEscribir } from '../../lib/Franjas';

const dinero = (n) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fecha LOCAL, no UTC. Con toISOString() un gasto capturado después de las 18:00
// en México se sellaba con el día siguiente y desaparecía del periodo: el filtro
// compara contra "ahora", y mañana todavía no ha llegado. Ver lib/Fechas.js.
const hoyISO = () => hoyLocalISO();

const VACIO = {
  categoria_id: 'servicios',
  concepto: '',
  monto: '',
  fecha: hoyISO(),
  proveedor: '',
  nota: '',
  // Arranca en «del turno» porque es el que se captura con prisa y con gente
  // esperando. El fuerte se registra sentado, y ahí un clic de más no duele.
  escala: 'turno',
};

// Una plantilla NO es un gasto: es la regla que propone uno cada mes. Por eso
// lleva `monto_estimado` y no `monto`, y no tiene fecha sino día del mes.
const VACIA_REC = {
  categoria_id: 'servicios',
  concepto: '',
  monto_estimado: '',
  dia_del_mes: '1',
};

// El tope de 28 no es estético: es la misma restricción que la BD. Si fuera un
// input libre, el día 30 dejaría a febrero sin generar y nadie sabría por qué.
const DIAS_DEL_MES = Array.from({ length: 28 }, (_, i) => i + 1);

export default function GastosScreen() {
  const {
    gastos,
    categorias_gasto: categorias,
    gastos_recurrentes: recurrentes,
    nominas,
    configuracion,
    showToast,
  } = useAppStore();
  const { enqueueAction } = useSyncStore();

  const [periodo, setPeriodo] = useState('mes');
  // Del turno · Fuertes · Todos. Arranca en «turno» a propósito (ver ESCALAS).
  const [escala, setEscala] = useState('turno');
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(VACIO);
  const [editId, setEditId] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);
  const [confirmarMonto, setConfirmarMonto] = useState(null); // gasto pendiente
  const [montoReal, setMontoReal] = useState('');

  // Plantillas recurrentes (viven en su propio panel: son reglas, no gastos).
  const [panelRec, setPanelRec] = useState(false);
  const [formRec, setFormRec] = useState(VACIA_REC);
  const [editRecId, setEditRecId] = useState(null);
  const [aEliminarRec, setAEliminarRec] = useState(null);

  const rango = useMemo(() => rangoDePeriodo(periodo), [periodo]);

  const resumen = useMemo(
    () =>
      resumenGastos({
        gastos,
        nominas,
        categorias,
        desde: rango.desde,
        hasta: rango.hasta,
      }),
    [gastos, nominas, categorias, rango],
  );

  const pendientesDeClasificar = useMemo(
    () => cuantosSinClasificar(resumen.gastos),
    [resumen.gastos],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    // El filtro de escala va ANTES que el de texto y no toca los totales: la
    // tarjeta de «Total del periodo» sigue sumando todo, así que una pestaña
    // nunca hace que el periodo parezca más barato de lo que fue.
    return filtrarPorEscala([...resumen.gastos], escala)
      .filter(
        (g) =>
          !q ||
          (g.concepto || '').toLowerCase().includes(q) ||
          (g.proveedor || '').toLowerCase().includes(q),
      )
      .sort((a, b) => (fechaDeGasto(b) ?? 0) - (fechaDeGasto(a) ?? 0));
  }, [resumen.gastos, busqueda, escala]);

  // ── Plantillas recurrentes: generar lo que toque ──────────────────────────
  // Se dispara al abrir la pantalla y al cerrar el panel de plantillas, no en un
  // intervalo de fondo: si se generara sin que nadie mire, el dueño se
  // encontraría gastos que no recuerda haber creado. `generarRecurrentes` es
  // idempotente, así que llamarlo de más no duplica nada.
  //
  // Lee el estado con getState() en vez de la variable del render: al llamarse
  // justo después de guardar una plantilla, el closure aún tendría la lista
  // vieja y la plantilla recién creada no generaría hasta la próxima visita.
  const generarPendientes = useCallback(() => {
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId) return;
    const plantillas = useAppStore.getState().gastos_recurrentes || [];
    const nuevos = generarRecurrentes(plantillas, new Date());
    if (nuevos.length === 0) return;

    // Base + índice, no Date.now() + azar: dos plantillas generando en el mismo
    // milisegundo podían chocar de id, y con la PK igual el segundo upsert PISA
    // al primero en silencio — un gasto desaparecido, no un error.
    const baseId = Date.now();
    for (const [i, g] of nuevos.entries()) {
      const fila = {
        ...g,
        id: baseId + i,
        restaurante_id: restauranteId,
      };
      delete fila._plantillaId;
      enqueueAction('gastos', 'upsert', fila);
      useAppStore.setState((prev) => ({
        gastos: [fila, ...(prev.gastos || [])],
      }));
      // La plantilla marca su última generación para no repetir el mes.
      const plantilla = plantillas.find((p) => p.id === g._plantillaId);
      if (plantilla) {
        const actualizada = { ...plantilla, ultima_generacion: g.fecha };
        enqueueAction('gastos_recurrentes', 'upsert', actualizada);
        useAppStore.setState((prev) => ({
          gastos_recurrentes: (prev.gastos_recurrentes || []).map((p) =>
            p.id === plantilla.id ? actualizada : p,
          ),
        }));
      }
    }
    showToast?.(
      `${nuevos.length} gasto${nuevos.length !== 1 ? 's' : ''} recurrente${nuevos.length !== 1 ? 's' : ''} por confirmar`,
      'info',
    );
  }, [enqueueAction, showToast]);

  useEffect(() => {
    generarPendientes();
    // Solo al montar: el resto de disparos son explícitos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cerrarPanelRec = () => {
    setPanelRec(false);
    setFormRec(VACIA_REC);
    setEditRecId(null);
    // Una plantilla creada hoy con día 1 ya venció: aplica sus reglas al salir
    // en vez de hacer que el dueño vuelva a entrar mañana para verla.
    generarPendientes();
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const abrirNuevo = () => {
    setForm(VACIO);
    setEditId(null);
    setModalAbierto(true);
  };

  const abrirEditar = (g) => {
    // Los derivados de nómina no se editan aquí (ver cabecera).
    if (g.origen === 'nomina') {
      showToast?.('La nómina se corrige en su propia pantalla.', 'info');
      return;
    }
    setForm({
      categoria_id: g.categoria_id,
      concepto: g.concepto || '',
      monto: String(g.monto ?? ''),
      fecha: g.fecha || hoyISO(),
      proveedor: g.proveedor || '',
      nota: g.nota || '',
    });
    setEditId(g.id);
    setModalAbierto(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    const monto = Number(form.monto);
    if (!form.concepto.trim())
      return showToast?.('Falta el concepto.', 'error');
    if (!Number.isFinite(monto) || monto <= 0)
      return showToast?.('El monto debe ser mayor que cero.', 'error');

    // CRÍTICO (RLS estricta): sin restaurante_id el insert se rechaza.
    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast?.('No se identificó el restaurante. Recarga.', 'error');

    // Al EDITAR se preserva la fila anterior (mismo patrón que guardarPlantilla).
    // Sin esto, editar un recurrente lo reclasificaba como 'manual': la fila
    // salía de la protección del índice único (que es parcial, solo cubre
    // origen <> 'manual'), el estado local perdía `origen_ref` mientras la nube
    // lo conservaba —local y nube divergiendo, la clase de fallo del caso
    // `_costo`—, y un PENDIENTE editado se volvía 'pagado' sin pasar por
    // "Confirmar importe". Editar corrige datos; no confirma ni reclasifica.
    const anterior = editId
      ? (gastos || []).find((g) => g.id === editId)
      : null;
    const capturadoEn = new Date();
    const fila = {
      ...(anterior || {}),
      ...form,
      monto: Math.round(monto * 100) / 100,
      id: editId || Date.now(),
      // Al editar una fila vieja sin escala, si el formulario no la trae se
      // deja en null: no se le inventa una. Que siga «sin clasificar» es
      // información; ponerle «turno» porque sí sería una afirmación falsa.
      escala: escalaDeGasto(form) ?? escalaDeGasto(anterior),
      // ── LA FRANJA DE UN GASTO SALE DEL RELOJ, NO DE SU FECHA ─────────────
      // `gastos.fecha` es un `date` sin hora: un gasto no puede saber su franja
      // a partir de su propio dato de negocio. Al capturarlo se estampa el
      // momento en que alguien lo registró, que en la práctica es cuando
      // ocurrió —los gastos del turno se capturan en el turno—.
      //
      // Al EDITAR se preserva lo que hubiera, incluido `null`. Deducirle una
      // franja a una fila de hace tres meses sería inventar un dato: su
      // `created_at` dice cuándo se tecleó, no cuándo se gastó. Mismo criterio
      // que la escala, tres líneas más arriba.
      franja: anterior
        ? (anterior.franja ?? null)
        : franjaAlEscribir(configuracion, capturadoEn),
      origen: anterior?.origen ?? 'manual',
      origen_ref: anterior?.origen_ref ?? null,
      estado: anterior?.estado ?? 'pagado',
      activo: true,
      restaurante_id: restauranteId,
      usuario: useAuthStore.getState().user?.nombre ?? null,
    };

    enqueueAction('gastos', 'upsert', fila);
    useAppStore.setState((prev) => ({
      gastos: [fila, ...(prev.gastos || []).filter((g) => g.id !== fila.id)],
    }));
    setModalAbierto(false);
    showToast?.(editId ? 'Gasto actualizado' : 'Gasto registrado', 'success');
  };

  const eliminar = () => {
    if (!aEliminar) return;
    // Baja lógica, como el resto del sistema: un gasto borrado de verdad
    // cambiaría la utilidad de un mes ya cerrado sin dejar rastro.
    const fila = { ...aEliminar, activo: false };
    enqueueAction('gastos', 'upsert', fila);
    useAppStore.setState((prev) => ({
      gastos: (prev.gastos || []).map((g) => (g.id === fila.id ? fila : g)),
    }));
    setAEliminar(null);
    showToast?.('Gasto dado de baja', 'success');
  };

  const confirmarPendiente = () => {
    const monto = Number(montoReal);
    if (!Number.isFinite(monto) || monto <= 0)
      return showToast?.('Escribe el importe del recibo.', 'error');
    const fila = {
      ...confirmarMonto,
      monto: Math.round(monto * 100) / 100,
      estado: 'pagado',
      // Un recurrente nace pendiente cuando alguien abre la pantalla, así que
      // el momento de generarlo no dice nada. El de confirmarlo sí: ahí hay
      // una persona con el recibo delante. Si ya traía franja, se respeta.
      franja:
        (confirmarMonto?.franja ?? null) ||
        franjaAlEscribir(configuracion, new Date()),
    };
    delete fila._derivado;
    enqueueAction('gastos', 'upsert', fila);
    useAppStore.setState((prev) => ({
      gastos: (prev.gastos || []).map((g) => (g.id === fila.id ? fila : g)),
    }));
    setConfirmarMonto(null);
    setMontoReal('');
    showToast?.('Gasto confirmado', 'success');
  };

  // ── Plantillas recurrentes: CRUD ──────────────────────────────────────────
  const editarPlantilla = (p) => {
    setFormRec({
      categoria_id: p.categoria_id,
      concepto: p.concepto || '',
      monto_estimado: String(p.monto_estimado ?? ''),
      dia_del_mes: String(p.dia_del_mes ?? 1),
    });
    setEditRecId(p.id);
  };

  const guardarPlantilla = (e) => {
    e.preventDefault();
    const monto = Number(formRec.monto_estimado);
    if (!formRec.concepto.trim())
      return showToast?.('Falta el concepto.', 'error');
    if (!Number.isFinite(monto) || monto < 0)
      return showToast?.('El estimado no puede ser negativo.', 'error');

    const restauranteId = useAuthStore.getState().restauranteId;
    if (!restauranteId)
      return showToast?.('No se identificó el restaurante. Recarga.', 'error');

    const anterior = (recurrentes || []).find((p) => p.id === editRecId);
    const fila = {
      ...(anterior || {}),
      categoria_id: formRec.categoria_id,
      concepto: formRec.concepto.trim(),
      monto_estimado: Math.round(monto * 100) / 100,
      dia_del_mes: Number(formRec.dia_del_mes) || 1,
      id: editRecId || Date.now(),
      activo: anterior ? anterior.activo !== false : true,
      restaurante_id: restauranteId,
    };

    enqueueAction('gastos_recurrentes', 'upsert', fila);
    useAppStore.setState((prev) => ({
      gastos_recurrentes: [
        fila,
        ...(prev.gastos_recurrentes || []).filter((p) => p.id !== fila.id),
      ],
    }));
    setFormRec(VACIA_REC);
    setEditRecId(null);
    showToast?.(
      editRecId ? 'Plantilla actualizada' : 'Plantilla creada',
      'success',
    );
  };

  // Pausar ≠ eliminar. Un negocio que cierra dos meses en temporada baja quiere
  // dejar de generar la renta sin perder la plantilla ni su historial.
  const alternarPlantilla = (p) => {
    const fila = { ...p, activo: p.activo === false };
    enqueueAction('gastos_recurrentes', 'upsert', fila);
    useAppStore.setState((prev) => ({
      gastos_recurrentes: (prev.gastos_recurrentes || []).map((x) =>
        x.id === fila.id ? fila : x,
      ),
    }));
    showToast?.(
      fila.activo ? 'Plantilla reanudada' : 'Plantilla pausada',
      'success',
    );
  };

  // Aquí SÍ es borrado real, a diferencia de los gastos: una plantilla es una
  // regla a futuro, no un asiento. Borrarla no altera ninguna cifra pasada —
  // los gastos que ya generó son filas propias y se quedan donde están.
  const eliminarPlantilla = () => {
    if (!aEliminarRec) return;
    enqueueAction('gastos_recurrentes', 'delete', aEliminarRec);
    useAppStore.setState((prev) => ({
      gastos_recurrentes: (prev.gastos_recurrentes || []).filter(
        (p) => p.id !== aEliminarRec.id,
      ),
    }));
    if (editRecId === aEliminarRec.id) {
      setFormRec(VACIA_REC);
      setEditRecId(null);
    }
    setAEliminarRec(null);
    showToast?.('Plantilla eliminada', 'success');
  };

  // ── Columnas ──────────────────────────────────────────────────────────────
  const nombreCat = (id) =>
    (categorias || []).find((c) => String(c.id) === String(id))?.nombre || id;

  const columnas = [
    {
      id: 'fecha',
      titulo: 'Fecha',
      ancho: '1%',
      celda: (g) => (
        <span className="text-adm-muted whitespace-nowrap">
          {fechaDeGasto(g)?.toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
          }) ?? '—'}
        </span>
      ),
    },
    {
      id: 'concepto',
      titulo: 'Concepto',
      celda: (g) => (
        <div className="min-w-0">
          <p className="font-bold text-adm-ink truncate flex items-center gap-2">
            {g.concepto}
            {g.origen === 'nomina' && (
              <Lock className="w-3 h-3 text-adm-muted shrink-0" />
            )}
            {g.origen === 'recurrente' && (
              <Repeat className="w-3 h-3 text-adm-muted shrink-0" />
            )}
            {/* Sale en las dos pestañas a propósito —esconder dinero es el
                fallo caro aquí— así que hay que decir POR QUÉ está en las dos.
                Sin esta marca parecería un gasto duplicado. */}
            {sinClasificar(g) && (
              <span className="text-[10px] font-black uppercase tracking-wider text-adm-warn border border-adm-warn/40 rounded px-1.5 py-0.5 shrink-0">
                Sin clasificar
              </span>
            )}
          </p>
          {g.proveedor && (
            <p className="text-xs text-adm-muted truncate">{g.proveedor}</p>
          )}
        </div>
      ),
    },
    {
      id: 'categoria',
      titulo: 'Categoría',
      ancho: '1%',
      celda: (g) => <Chip>{nombreCat(g.categoria_id)}</Chip>,
    },
    {
      id: 'estado',
      titulo: '',
      ancho: '1%',
      celda: (g) =>
        g.estado === 'pendiente' ? (
          <Chip tono="alerta">Por confirmar</Chip>
        ) : null,
    },
    {
      id: 'monto',
      titulo: 'Monto',
      alinear: 'der',
      ancho: '1%',
      celda: (g) => (
        <span
          className={`font-bold ${g.estado === 'pendiente' ? 'text-adm-muted italic' : 'text-adm-ink'}`}
        >
          {dinero(g.monto)}
        </span>
      ),
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'der',
      ancho: '1%',
      celda: (g) => (
        <div className="flex justify-end gap-1">
          {g.estado === 'pendiente' && (
            <IconButton
              icono={CheckCircle2}
              titulo="Confirmar importe real"
              className="hover:text-adm-ok"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmarMonto(g);
                setMontoReal(String(g.monto ?? ''));
              }}
            />
          )}
          {g.origen !== 'nomina' && (
            <>
              <IconButton
                icono={Edit3}
                titulo="Editar"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirEditar(g);
                }}
              />
              <IconButton
                icono={Trash2}
                titulo="Dar de baja"
                className="hover:text-adm-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setAEliminar(g);
                }}
              />
            </>
          )}
        </div>
      ),
    },
  ];

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  return (
    <PageShell>
      <PageHeader
        icono={Wallet}
        titulo="Gastos y Costos Fijos"
        descripcion="Luz, agua, renta, nómina y todo lo que no es insumo"
        scopeAtajos="tabla-gastos"
        acciones={
          <>
            <SegmentedControl
              opciones={ESCALAS}
              valor={escala}
              onChange={setEscala}
            />
            <SegmentedControl
              opciones={PERIODOS}
              valor={periodo}
              onChange={setPeriodo}
            />
            <Button
              variante="secundario"
              icono={Repeat}
              onClick={() => {
                setFormRec(VACIA_REC);
                setEditRecId(null);
                setPanelRec(true);
              }}
            >
              Recurrentes
              {(recurrentes || []).filter((p) => p.activo !== false).length >
                0 && (
                <span className="ml-1 tabular-nums opacity-70">
                  {(recurrentes || []).filter((p) => p.activo !== false).length}
                </span>
              )}
            </Button>
            <Button icono={Plus} onClick={abrirNuevo}>
              Nuevo gasto
            </Button>
          </>
        }
      />

      {/* ── LOS QUE SIGUEN SIN CLASIFICAR ────────────────────────────────
          Las filas anteriores al 22-ago no tienen escala, y no se les inventó
          una: nadie sabe hoy si aquella renta fue del turno o fuerte, y un
          defecto las habría etiquetado a todas igual de mal. Salen en las dos
          pestañas para que no desaparezca dinero de la vista, y este aviso
          dice cuántas quedan para que la lista se vacíe algún día en vez de
          convertirse en ruido permanente. */}
      {pendientesDeClasificar > 0 && (
        <Card className="mb-5 border-adm-warn">
          <CardBody className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-adm-warn border border-adm-warn/40 rounded px-1.5 py-0.5">
              Sin clasificar
            </span>
            <p className="text-sm font-bold text-adm-ink">
              {pendientesDeClasificar}{' '}
              {pendientesDeClasificar === 1 ? 'gasto' : 'gastos'} de antes de
              esta pantalla siguen sin escala.
            </p>
            <p className="text-xs text-adm-muted">
              Salen en las dos pestañas para que no se pierdan de vista. Ábrelos
              y elige «del turno» o «fuerte» para que dejen de repetirse.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── Totales del periodo ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Card>
          <CardBody>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
              Total del periodo
            </p>
            <p className="font-fraunces font-bold text-adm-ink text-3xl tabular-nums leading-tight">
              {dinero(resumen.total)}
            </p>
            {resumen.pendientes > 0 && (
              <p className="text-xs text-adm-warn mt-1">
                + {dinero(resumen.pendientes)} por confirmar
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
              Fijos
            </p>
            <p className="font-fraunces font-bold text-adm-ink text-3xl tabular-nums leading-tight">
              {dinero(resumen.fijos)}
            </p>
            <p className="text-xs text-adm-muted mt-1">
              Se pagan haya o no venta
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted">
              Variables
            </p>
            <p className="font-fraunces font-bold text-adm-ink text-3xl tabular-nums leading-tight">
              {dinero(resumen.variables)}
            </p>
            <p className="text-xs text-adm-muted mt-1">
              Escalan con la operación
            </p>
          </CardBody>
        </Card>
      </div>

      <SearchField
        icono={Search}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por concepto o proveedor…"
        className="mb-4 max-w-md"
      />

      <DataTable
        scope="tabla-gastos"
        titulo="Gastos"
        columnas={columnas}
        filas={lista}
        onEditar={abrirEditar}
        onNuevo={abrirNuevo}
        activo={!modalAbierto && !aEliminar && !confirmarMonto && !panelRec}
        vacio={
          <EmptyState
            icono={Wallet}
            titulo="Sin gastos en este periodo"
            descripcion="Registra la renta, los servicios o el mantenimiento para que la utilidad neta del Dashboard sea real."
            accion={
              <Button icono={Plus} onClick={abrirNuevo}>
                Registrar el primero
              </Button>
            }
          />
        }
      />

      {/* ── Alta / edición ── */}
      {modalAbierto && (
        <Modal
          as="form"
          onSubmit={guardar}
          titulo={editId ? 'Editar gasto' : 'Nuevo gasto'}
          onClose={() => setModalAbierto(false)}
          pie={
            <>
              <Button
                variante="secundario"
                className="flex-1"
                onClick={() => setModalAbierto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                {editId ? 'Guardar cambios' : 'Registrar gasto'}
              </Button>
            </>
          }
        >
          <Field label="Concepto" requerido>
            <Input
              value={form.concepto}
              onChange={set('concepto')}
              placeholder="Ej. Recibo de luz de julio"
              required
            />
          </Field>
          {/* ── DE QUÉ ESCALA ES ─────────────────────────────────────────
              Va arriba y no al final: es la decisión que separa las dos
              pestañas, y quien captura con prisa la contesta sin pensar. La
              ayuda dice lo que es y —más importante— lo que NO es, para que
              nadie espere aquí un saldo de caja chica. */}
          <Field label="¿De qué escala?" requerido>
            <SegmentedControl
              opciones={ESCALAS.filter((e) => e.id !== 'todos')}
              valor={form.escala || 'turno'}
              onChange={(v) => setForm({ ...form, escala: v })}
            />
            <p className="text-xs text-adm-muted mt-1.5">
              «Del turno» es el gasto chico del servicio; «fuerte», el grande y
              planificado. Es una etiqueta para separar y filtrar —no lleva
              saldo ni reposiciones.
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoría" requerido>
              <Select value={form.categoria_id} onChange={set('categoria_id')}>
                {(categorias || [])
                  // La nómina no se captura a mano: es derivada.
                  .filter((c) => c.id !== 'nomina')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Monto" requerido>
              <Input
                type="number"
                step="0.01"
                value={form.monto}
                onChange={set('monto')}
                placeholder="0.00"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha" requerido>
              <Input type="date" value={form.fecha} onChange={set('fecha')} />
            </Field>
            <Field label="Proveedor">
              <Input
                value={form.proveedor}
                onChange={set('proveedor')}
                placeholder="CFE, arrendador…"
              />
            </Field>
          </div>
          <Field label="Nota">
            <Input
              value={form.nota}
              onChange={set('nota')}
              placeholder="Referencia, folio del recibo…"
            />
          </Field>
        </Modal>
      )}

      {/* ── Confirmar el importe real de un recurrente ── */}
      {confirmarMonto && (
        <Modal
          titulo="Confirmar importe"
          onClose={() => setConfirmarMonto(null)}
          ancho="max-w-sm"
          pie={
            <>
              <Button
                variante="secundario"
                className="flex-1"
                onClick={() => setConfirmarMonto(null)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={confirmarPendiente}>
                Confirmar
              </Button>
            </>
          }
        >
          <p className="text-sm text-adm-muted mb-4">
            <strong className="text-adm-ink">{confirmarMonto.concepto}</strong>{' '}
            se generó con un estimado de {dinero(confirmarMonto.monto)}. Escribe
            lo que dice el recibo: hasta entonces no cuenta en la utilidad.
          </p>
          <Field label="Importe real" requerido>
            <Input
              type="number"
              step="0.01"
              autoFocus
              value={montoReal}
              onChange={(e) => setMontoReal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarPendiente()}
            />
          </Field>
        </Modal>
      )}

      {/* ── Plantillas recurrentes ── */}
      {panelRec && (
        <Modal
          titulo="Gastos recurrentes"
          onClose={cerrarPanelRec}
          ancho="max-w-2xl"
          pie={
            <Button
              variante="secundario"
              className="flex-1"
              onClick={cerrarPanelRec}
            >
              Cerrar
            </Button>
          }
        >
          <p className="text-sm text-adm-muted mb-4">
            Una plantilla no es un gasto: es la regla que{' '}
            <strong className="text-adm-ink">propone</strong> uno cada mes en su
            día. El gasto nace{' '}
            <strong className="text-adm-ink">pendiente</strong> con el estimado
            y no cuenta en la utilidad hasta que confirmas lo que dice el
            recibo.
          </p>

          {(recurrentes || []).length === 0 ? (
            <div className="border border-adm-border rounded-ui p-6 text-center mb-5">
              <Repeat className="w-6 h-6 text-adm-muted mx-auto mb-2" />
              <p className="text-sm text-adm-muted">
                Sin plantillas. La renta, la luz y el internet llegan cada mes:
                capturarlos doce veces es la razón por la que se deja de usar
                esta pantalla.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-adm-border border border-adm-border rounded-ui mb-5">
              {[...(recurrentes || [])]
                .sort((a, b) => (a.dia_del_mes || 1) - (b.dia_del_mes || 1))
                .map((p) => {
                  const pausada = p.activo === false;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 ${pausada ? 'opacity-55' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-adm-ink truncate flex items-center gap-2">
                          {p.concepto}
                          {pausada && <Chip>Pausada</Chip>}
                        </p>
                        <p className="text-xs text-adm-muted">
                          Día {p.dia_del_mes || 1} de cada mes ·{' '}
                          {nombreCat(p.categoria_id)} ·{' '}
                          {p.ultima_generacion
                            ? `último ${String(p.ultima_generacion).slice(0, 7)}`
                            : 'aún sin generar'}
                        </p>
                      </div>
                      <span className="font-bold text-adm-ink tabular-nums whitespace-nowrap">
                        {dinero(p.monto_estimado)}
                      </span>
                      <div className="flex gap-1 shrink-0">
                        <IconButton
                          icono={Edit3}
                          titulo="Editar"
                          onClick={() => editarPlantilla(p)}
                        />
                        <IconButton
                          icono={pausada ? PlayCircle : PauseCircle}
                          titulo={pausada ? 'Reanudar' : 'Pausar'}
                          onClick={() => alternarPlantilla(p)}
                        />
                        <IconButton
                          icono={Trash2}
                          titulo="Eliminar"
                          className="hover:text-adm-danger"
                          onClick={() => setAEliminarRec(p)}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}

          <form onSubmit={guardarPlantilla}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-adm-muted mb-3">
              {editRecId ? 'Editar plantilla' : 'Nueva plantilla'}
            </p>
            <Field label="Concepto" requerido>
              <Input
                value={formRec.concepto}
                onChange={(e) =>
                  setFormRec({ ...formRec, concepto: e.target.value })
                }
                placeholder="Ej. Renta del local"
                required
              />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Categoría" requerido>
                <Select
                  value={formRec.categoria_id}
                  onChange={(e) =>
                    setFormRec({ ...formRec, categoria_id: e.target.value })
                  }
                >
                  {(categorias || [])
                    .filter((c) => c.id !== 'nomina')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Estimado" requerido>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formRec.monto_estimado}
                  onChange={(e) =>
                    setFormRec({ ...formRec, monto_estimado: e.target.value })
                  }
                  placeholder="0.00"
                  required
                />
              </Field>
              <Field label="Día del mes" requerido>
                <Select
                  value={formRec.dia_del_mes}
                  onChange={(e) =>
                    setFormRec({ ...formRec, dia_del_mes: e.target.value })
                  }
                >
                  {DIAS_DEL_MES.map((d) => (
                    <option key={d} value={String(d)}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex gap-2">
              {editRecId && (
                <Button
                  variante="secundario"
                  className="flex-1"
                  onClick={() => {
                    setFormRec(VACIA_REC);
                    setEditRecId(null);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button
                type="submit"
                icono={editRecId ? undefined : Plus}
                className="flex-1"
              >
                {editRecId ? 'Guardar cambios' : 'Añadir plantilla'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {aEliminarRec && (
        <ConfirmModal
          icono={AlertTriangle}
          titulo="¿Eliminar la plantilla?"
          textoConfirmar="Eliminar"
          onCancelar={() => setAEliminarRec(null)}
          onConfirmar={eliminarPlantilla}
          mensaje={
            <>
              <strong className="text-adm-ink">{aEliminarRec.concepto}</strong>{' '}
              dejará de generarse. Los gastos que ya creó se quedan como están:
              esto no cambia ninguna cifra pasada. Si solo quieres detenerla
              unos meses, <strong className="text-adm-ink">pausarla</strong>{' '}
              conserva el historial.
            </>
          }
        />
      )}

      {aEliminar && (
        <ConfirmModal
          icono={AlertTriangle}
          titulo="¿Dar de baja el gasto?"
          textoConfirmar="Dar de baja"
          onCancelar={() => setAEliminar(null)}
          onConfirmar={eliminar}
          mensaje={
            <>
              <strong className="text-adm-ink">{aEliminar.concepto}</strong>{' '}
              dejará de contar en la utilidad del periodo. Queda registrado, no
              se borra.
            </>
          }
        />
      )}
    </PageShell>
  );
}
