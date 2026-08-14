import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Field,
  Input,
  Select,
  PageShell,
  PageHeader,
  Button,
  EmptyState,
  SearchField,
  IconButton,
  DataTable,
} from '../../components/ui';
import { useAuthStore } from '../auth/useAuthStore';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Download,
  AlertTriangle,
  X,
  Building2,
  Hash,
  Receipt,
} from 'lucide-react';

// Usos de CFDI válidos en México
const USOS_CFDI = [
  { clave: 'G01', desc: 'Adquisición de mercancias' },
  { clave: 'G03', desc: 'Gastos en general' },
  { clave: 'D01', desc: 'Honorarios médicos y dentales' },
  { clave: 'S01', desc: 'Sin efectos fiscales' },
  { clave: 'CP01', desc: 'Pagos' },
];

const REGIMENES = [
  { clave: '601', desc: 'General de Ley Personas Morales' },
  { clave: '612', desc: 'Personas Físicas con Actividades Empresariales' },
  { clave: '626', desc: 'Régimen Simplificado de Confianza' },
];

const METODOS_PAGO_CFDI = [
  { clave: 'PUE', desc: 'Pago en una sola exhibición' },
  { clave: 'PPD', desc: 'Pago en parcialidades o diferido' },
];

const FORMAS_PAGO = [
  { clave: '01', desc: 'Efectivo' },
  { clave: '04', desc: 'Tarjeta de crédito' },
  { clave: '28', desc: 'Tarjeta de débito' },
  { clave: '03', desc: 'Transferencia electrónica' },
];

function Badge({ estado }) {
  const map = {
    vigente: 'bg-adm-ok/15 text-adm-ok border-adm-ok/30',
    pendiente: 'bg-adm-warn/15 text-adm-warn border-adm-warn/30',
    cancelada: 'bg-adm-danger/15 text-adm-danger border-adm-danger/30',
  };
  return (
    <span
      className={`px-3 py-1 rounded-ui text-[10px] font-black uppercase tracking-widest border ${map[estado] || map.pendiente}`}
    >
      {estado}
    </span>
  );
}

export default function FacturasScreen() {
  const { ventas, facturas, clientes, showToast, configuracion } =
    useAppStore();

  // CRM → CFDI: si la venta trae cliente_id y el cliente tiene RFC/razón
  // social capturados (siembra hecha en ClientesScreen), el receptor se
  // precarga solo. El cajero puede sobreescribir lo que haga falta.
  const precargarReceptorDesdeCRM = (venta, setFormFn) => {
    if (!venta?.cliente_id) return;
    const cli = (clientes || []).find(
      (c) => String(c.id) === String(venta.cliente_id),
    );
    if (!cli) return;
    setFormFn((prev) => ({
      ...prev,
      rfc: (cli.rfc || prev.rfc || '').toUpperCase(),
      nombre: cli.razon_social || prev.nombre || cli.nombre || '',
      email: cli.email || prev.email || '',
    }));
  };
  const { user } = useAuthStore();

  const [busqueda, setBusqueda] = useState('');
  const [modalNueva, setModalNueva] = useState(false);
  const [ventaRef, setVentaRef] = useState(null);

  const [form, setForm] = useState({
    rfc: '',
    nombre: '',
    email: '',
    uso_cfdi: 'G03',
    regimen: '626',
    metodo_pago: 'PUE',
    forma_pago: '01',
    cp_receptor: '',
  });

  // Facturas locales (mock hasta integrar PAC)
  const [facturasLocales, setFacturasLocales] = useState(facturas || []);

  const ventasFacturables = (ventas || []).filter(
    (v) =>
      v.estado !== 'Cancelada' &&
      !facturasLocales.find((f) => f.folio_venta === v.folio),
  );

  const facturasFiltradas = facturasLocales.filter(
    (f) =>
      !busqueda ||
      f.folio?.toLowerCase().includes(busqueda.toLowerCase()) ||
      f.rfc_receptor?.toLowerCase().includes(busqueda.toLowerCase()) ||
      f.nombre_receptor?.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const handleEmitir = () => {
    if (!ventaRef) {
      showToast('Selecciona una venta para facturar', 'error');
      return;
    }
    if (!form.rfc || !form.nombre || !form.cp_receptor) {
      showToast('RFC, nombre y código postal son obligatorios', 'error');
      return;
    }
    if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(form.rfc.toUpperCase())) {
      showToast('Formato de RFC inválido', 'error');
      return;
    }

    // MOCK: genera factura local — el UUID del CFDI lo dará el PAC real
    // Campos reales de tabla 'facturas' en Supabase
    const subtotal =
      Number(ventaRef.subtotal) ||
      Number(ventaRef.total) / (1 + (Number(configuracion?.iva) || 0.16));
    const ivaAmt = Number(ventaRef.total) - subtotal;

    const nuevaFactura = {
      // id es GENERATED — Supabase lo asigna
      folio_venta: ventaRef.folio,
      folio_fiscal: null, // El PAC devuelve el UUID fiscal real
      serie: 'A',
      folio: `MOCK-${Date.now().toString().slice(-6)}`,
      fecha_emision: new Date().toISOString(),
      rfc_emisor: configuracion?.rfc || 'XAXX010101000',
      rfc_receptor: form.rfc.toUpperCase(),
      nombre_receptor: form.nombre,
      uso_cfdi: form.uso_cfdi,
      subtotal: parseFloat(subtotal.toFixed(2)),
      iva: parseFloat(ivaAmt.toFixed(2)),
      total: Number(ventaRef.total),
      estado: 'vigente', // CHECK: 'vigente' | 'cancelado'
      facturama_id: null, // ID del PAC (Facturama/Diverza/SW)
      pac_response: null,
      usuario: user?.nombre || user?.username || 'Sistema',
      restaurante_id: configuracion?.restaurante_id,
      // Extra local (no va a BD, solo para UI)
      _email_receptor: form.email,
      _regimen: form.regimen,
      _metodo_pago: form.metodo_pago,
      _forma_pago: form.forma_pago,
      _cp_receptor: form.cp_receptor,
    };

    setFacturasLocales((prev) => [nuevaFactura, ...prev]);
    showToast(
      `Factura ${nuevaFactura.folio_factura} emitida (modo simulación)`,
      'success',
    );
    setModalNueva(false);
    setVentaRef(null);
    setForm({
      rfc: '',
      nombre: '',
      email: '',
      uso_cfdi: 'G03',
      regimen: '626',
      metodo_pago: 'PUE',
      forma_pago: '01',
      cp_receptor: '',
    });
  };

  const descargarMock = (f) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- CFDI SIMULADO — NO VÁLIDO ANTE EL SAT -->
<!-- Integrar PAC para producción: Diverza, Facturapi o SW Sapien -->
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  Folio="${f.folio}"
  UUID="${f.folio_fiscal || 'MOCK'}"
  Fecha="${f.fecha_emision}"
  Total="${f.total}"
  MetodoPago="${f.metodo_pago}"
  FormaPago="${f.forma_pago}">
  <cfdi:Emisor Rfc="${f.rfc_emisor}" Nombre="${f.emisor_nombre}" />
  <cfdi:Receptor
    Rfc="${f.rfc_receptor}"
    Nombre="${f.nombre_receptor}"
    UsoCFDI="${f.uso_cfdi}"
    RegimenFiscalReceptor="${f.regimen_receptor}"
    DomicilioFiscalReceptor="${f.cp_receptor}" />
</cfdi:Comprobante>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.folio}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columnas = [
    {
      id: 'folio',
      titulo: 'Folio',
      celda: (f) => (
        <>
          <p className="font-bold text-adm-ink">{f.folio}</p>
          <p className="text-[10px] font-mono text-adm-muted truncate max-w-[140px]">
            {f.folio_fiscal || 'MOCK'}
          </p>
        </>
      ),
    },
    {
      id: 'venta',
      titulo: 'Venta ref.',
      ancho: '1%',
      celda: (f) => <span className="text-adm-muted">{f.folio_venta}</span>,
    },
    {
      id: 'receptor',
      titulo: 'Receptor',
      celda: (f) => (
        <>
          <p className="font-bold text-adm-ink">{f.rfc_receptor}</p>
          <p className="text-xs text-adm-muted truncate">{f.nombre_receptor}</p>
        </>
      ),
    },
    {
      id: 'uso',
      titulo: 'Uso CFDI',
      ancho: '1%',
      celda: (f) => (
        <span className="text-xs text-adm-muted whitespace-nowrap">
          {f.uso_cfdi}
        </span>
      ),
    },
    {
      id: 'total',
      titulo: 'Total',
      alinear: 'der',
      ancho: '1%',
      celda: (f) => (
        <span className="font-bold text-adm-ink">
          $
          {Number(f.total).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      id: 'estado',
      titulo: 'Estado',
      alinear: 'centro',
      ancho: '1%',
      celda: (f) => <Badge estado={f.estado} />,
    },
    {
      id: 'acciones',
      titulo: '',
      alinear: 'der',
      ancho: '1%',
      celda: (f) => (
        <IconButton
          icono={Download}
          titulo="Descargar XML"
          onClick={(e) => {
            e.stopPropagation();
            descargarMock(f);
          }}
        />
      ),
    },
  ];

  return (
    <PageShell ancho="max-w-6xl" className="overflow-y-auto">
      <PageHeader
        icono={FileText}
        titulo="Facturación CFDI 4.0"
        descripcion="Modo simulación · listo para integrar PAC"
        acciones={
          <Button icono={Plus} onClick={() => setModalNueva(true)}>
            Nueva factura
          </Button>
        }
      />

      {/* Aviso de simulación: es lo PRIMERO que debe leerse. Un CFDI que no
          vale ante el SAT y parece que sí es un problema fiscal, no cosmético. */}
      <div className="flex items-start gap-3 px-5 py-4 bg-adm-warn/10 border border-adm-warn/30 rounded-ui mb-4">
        <AlertTriangle className="w-5 h-5 text-adm-warn shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-adm-warn text-sm">
            Sistema en modo simulación
          </p>
          <p className="text-xs text-adm-warn/80 mt-0.5">
            Los CFDIs generados no son válidos ante el SAT. Para producción,
            integra un PAC certificado: <strong>Facturapi</strong>,{' '}
            <strong>Diverza</strong> o <strong>SW Sapien</strong>. El flujo y
            los formularios ya están listos — solo se sustituye el mock por la
            llamada a la API del PAC.
          </p>
        </div>
      </div>

      <SearchField
        icono={Search}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por folio, RFC o nombre…"
        className="mb-4 max-w-md"
      />

      <DataTable
        scope="tabla-facturas"
        titulo="Facturas emitidas"
        columnas={columnas}
        filas={facturasFiltradas}
        onNuevo={() => setModalNueva(true)}
        // Un CFDI timbrado NO se edita ni se borra: se cancela ante el SAT.
        // Por eso la tabla no ofrece ni Enter ni Supr.
        activo={!modalNueva}
        vacio={
          <EmptyState
            icono={Receipt}
            titulo="Sin facturas emitidas"
            descripcion="Usa “Nueva factura” para comenzar."
            accion={
              <Button icono={Plus} onClick={() => setModalNueva(true)}>
                Nueva factura
              </Button>
            }
          />
        }
      />

      {/* MODAL NUEVA FACTURA */}
      {modalNueva && (
        <div className="fixed inset-0 bg-adm-ink/60 dark:bg-adm-bg/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto animate-in zoom-in-95">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black font-syne text-adm-ink">
                    Nueva Factura CFDI
                  </h3>
                  <p className="text-xs font-bold text-adm-muted mt-0.5">
                    Modo simulación — CFDI 4.0
                  </p>
                </div>
                <button
                  onClick={() => setModalNueva(false)}
                  className="p-2 text-adm-muted hover:text-adm-muted dark:hover:text-adm-ink rounded-ui hover:bg-adm-chip dark:hover:bg-adm-border transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* PASO 1: Selección de venta */}
              <div className="mb-6">
                <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" /> Paso 1 — Selecciona la venta
                  a facturar
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {ventasFacturables.length === 0 ? (
                    <p className="text-center py-6 text-sm font-bold text-adm-muted">
                      No hay ventas pendientes de facturar.
                    </p>
                  ) : (
                    ventasFacturables.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setVentaRef(v);
                          precargarReceptorDesdeCRM(v, setForm);
                        }}
                        className={`w-full text-left p-4 rounded-ui border-2 transition-all flex justify-between items-center ${
                          ventaRef?.id === v.id
                            ? 'border-adm-info bg-adm-info/10'
                            : 'border-adm-border hover:border-adm-border dark:hover:border-adm-muted/40 bg-adm-bg'
                        }`}
                      >
                        <div>
                          <p className="font-black text-sm text-adm-ink">
                            {v.folio}
                          </p>
                          <p className="text-xs font-bold text-adm-muted">
                            {new Date(
                              v.fecha || v.created_at,
                            ).toLocaleDateString('es-MX')}{' '}
                            · {v.metodo_pago}
                          </p>
                        </div>
                        <span className="font-black text-adm-ok">
                          $
                          {Number(v.total).toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* PASO 2: Datos del receptor */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" /> Paso 2 — Datos del
                  receptor
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="RFC" requerido>
                    <Input
                      type="text"
                      value={form.rfc}
                      onChange={(e) =>
                        setForm({ ...form, rfc: e.target.value })
                      }
                      placeholder="XAXX010101000"
                    />
                  </Field>
                  <Field label="Código Postal" requerido>
                    <Input
                      type="text"
                      value={form.cp_receptor}
                      onChange={(e) =>
                        setForm({ ...form, cp_receptor: e.target.value })
                      }
                      placeholder="64000"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Nombre o Razón Social" requerido>
                      <Input
                        type="text"
                        value={form.nombre}
                        onChange={(e) =>
                          setForm({ ...form, nombre: e.target.value })
                        }
                        placeholder="Mi Empresa SA de CV"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Email (para envío)">
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        placeholder="facturacion@empresa.com"
                      />
                    </Field>
                  </div>
                  <Field label="Uso de CFDI">
                    <Select
                      value={form.uso_cfdi}
                      onChange={(e) =>
                        setForm({ ...form, uso_cfdi: e.target.value })
                      }
                    >
                      {USOS_CFDI.map((o) => (
                        <option key={o.clave} value={o.clave}>
                          {o.clave} — {o.desc}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Régimen Fiscal">
                    <Select
                      value={form.regimen}
                      onChange={(e) =>
                        setForm({ ...form, regimen: e.target.value })
                      }
                    >
                      {REGIMENES.map((o) => (
                        <option key={o.clave} value={o.clave}>
                          {o.clave} — {o.desc}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Método de Pago">
                    <Select
                      value={form.metodo_pago}
                      onChange={(e) =>
                        setForm({ ...form, metodo_pago: e.target.value })
                      }
                    >
                      {METODOS_PAGO_CFDI.map((o) => (
                        <option key={o.clave} value={o.clave}>
                          {o.clave} — {o.desc}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Forma de Pago">
                    <Select
                      value={form.forma_pago}
                      onChange={(e) =>
                        setForm({ ...form, forma_pago: e.target.value })
                      }
                    >
                      {FORMAS_PAGO.map((o) => (
                        <option key={o.clave} value={o.clave}>
                          {o.clave} — {o.desc}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setModalNueva(false)}
                  className="flex-1 py-4 rounded-ui border-2 border-adm-border font-bold text-adm-muted hover:bg-adm-bg dark:hover:bg-adm-border transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEmitir}
                  className="flex-[2] py-4 rounded-ui bg-adm-info hover:bg-adm-info font-black text-adm-info-fg shadow-lg shadow-adm-info/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Emitir factura (mock)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
