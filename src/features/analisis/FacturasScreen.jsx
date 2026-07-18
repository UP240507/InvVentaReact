import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../auth/useAuthStore';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Download,
  AlertTriangle,
  X,
  Building2,
  Hash,
  Receipt,
  ChevronDown,
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
    vigente:
      'bg-emerald-100 dark:bg-brand-cesped/20 text-emerald-700 dark:text-brand-cesped border-emerald-200 dark:border-brand-cesped/30',
    pendiente:
      'bg-amber-100 dark:bg-brand-ambar/20 text-amber-700 dark:text-brand-ambar border-amber-200 dark:border-brand-ambar/30',
    cancelada:
      'bg-rose-100 dark:bg-brand-arrecife/20 text-rose-600 dark:text-brand-arrecife border-rose-200 dark:border-brand-arrecife/30',
  };
  return (
    <span
      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${map[estado] || map.pendiente}`}
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

  const SelectField = ({ label, field, options }) => (
    <div>
      <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <select
          value={form[field]}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista appearance-none transition-all pr-10"
        >
          {options.map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.clave} — {o.desc}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );

  const TextField = ({ label, field, placeholder, type = 'text' }) => (
    <div>
      <label className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest block mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={form[field]}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border rounded-xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-all"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-ui-obsidiana p-4 md:p-8 font-sans transition-colors duration-500">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* CABECERA */}
        <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm p-6 md:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-100 dark:bg-brand-amatista/20 p-3.5 rounded-2xl">
              <FileText className="w-7 h-7 text-indigo-600 dark:text-brand-amatista" />
            </div>
            <div>
              <h1 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar">
                Facturación CFDI 4.0
              </h1>
              <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mt-0.5">
                Modo simulación · Listo para integrar PAC
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalNueva(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 dark:bg-brand-amatista hover:bg-indigo-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Nueva factura
          </button>
        </div>

        {/* BANNER MOCK */}
        <div className="flex items-start gap-3 px-5 py-4 bg-amber-50 dark:bg-brand-ambar/10 border-2 border-amber-200 dark:border-brand-ambar/30 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-brand-ambar shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-amber-700 dark:text-brand-ambar text-sm">
              Sistema en modo simulación
            </p>
            <p className="text-xs font-bold text-amber-600/80 dark:text-brand-ambar/70 mt-0.5">
              Los CFDIs generados no son válidos ante el SAT. Para producción,
              integra un PAC certificado: <strong>Facturapi</strong>,{' '}
              <strong>Diverza</strong> o <strong>SW Sapien</strong>. El flujo y
              los formularios ya están listos — solo se sustituye el mock por la
              llamada a la API del PAC.
            </p>
          </div>
        </div>

        {/* BÚSQUEDA */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, RFC o nombre..."
            className="w-full pl-11 pr-4 py-4 bg-white dark:bg-ui-humo border-2 border-slate-100 dark:border-ui-border rounded-2xl font-bold text-sm text-slate-800 dark:text-brand-nacar placeholder:text-slate-400 dark:placeholder:text-ui-muted/50 outline-none focus:border-indigo-400 dark:focus:border-brand-amatista transition-all shadow-sm"
          />
        </div>

        {/* TABLA */}
        <div className="bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm overflow-hidden transition-colors">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-ui-obsidiana border-b-2 border-slate-100 dark:border-ui-border">
              <tr className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                <th className="p-5">Folio</th>
                <th className="p-5">Venta Ref.</th>
                <th className="p-5">Receptor</th>
                <th className="p-5">Uso CFDI</th>
                <th className="p-5 text-right">Total</th>
                <th className="p-5 text-center">Estado</th>
                <th className="p-5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ui-border">
              {facturasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-16 text-center">
                    <Receipt className="w-10 h-10 text-slate-200 dark:text-ui-border mx-auto mb-3" />
                    <p className="font-black text-slate-400 dark:text-ui-muted">
                      Sin facturas emitidas aún
                    </p>
                    <p className="text-xs font-bold text-slate-300 dark:text-ui-border mt-1">
                      Usa el botón "Nueva factura" para comenzar
                    </p>
                  </td>
                </tr>
              ) : (
                facturasFiltradas.map((f) => (
                  <tr
                    key={f.id}
                    className="hover:bg-slate-50 dark:hover:bg-ui-obsidiana/50 transition-colors"
                  >
                    <td className="p-5">
                      <p className="font-black text-slate-800 dark:text-brand-nacar text-xs">
                        {f.folio}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-ui-muted truncate max-w-[120px]">
                        {f.folio_fiscal || 'MOCK'?.slice(0, 16)}...
                      </p>
                    </td>
                    <td className="p-5 font-bold text-slate-500 dark:text-ui-muted">
                      {f.folio_venta}
                    </td>
                    <td className="p-5">
                      <p className="font-black text-slate-800 dark:text-brand-nacar text-xs">
                        {f.rfc_receptor}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted">
                        {f.nombre_receptor}
                      </p>
                    </td>
                    <td className="p-5 text-xs font-bold text-slate-500 dark:text-ui-muted">
                      {f.uso_cfdi}
                    </td>
                    <td className="p-5 text-right font-black text-emerald-600 dark:text-brand-cesped">
                      $
                      {Number(f.total).toLocaleString('es-MX', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-5 text-center">
                      <Badge estado={f.estado} />
                    </td>
                    <td className="p-5 text-center">
                      <button
                        onClick={() => descargarMock(f)}
                        className="p-2 text-indigo-600 dark:text-brand-amatista hover:bg-indigo-50 dark:hover:bg-brand-amatista/10 rounded-xl transition-all"
                        title="Descargar XML mock"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA FACTURA */}
      {modalNueva && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black font-syne text-slate-800 dark:text-brand-nacar">
                    Nueva Factura CFDI
                  </h3>
                  <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-0.5">
                    Modo simulación — CFDI 4.0
                  </p>
                </div>
                <button
                  onClick={() => setModalNueva(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-brand-nacar rounded-xl hover:bg-slate-100 dark:hover:bg-ui-border transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* PASO 1: Selección de venta */}
              <div className="mb-6">
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" /> Paso 1 — Selecciona la venta
                  a facturar
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {ventasFacturables.length === 0 ? (
                    <p className="text-center py-6 text-sm font-bold text-slate-400 dark:text-ui-muted">
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
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex justify-between items-center ${
                          ventaRef?.id === v.id
                            ? 'border-indigo-400 dark:border-brand-amatista bg-indigo-50 dark:bg-brand-amatista/10'
                            : 'border-slate-100 dark:border-ui-border hover:border-slate-300 dark:hover:border-ui-muted/40 bg-slate-50 dark:bg-ui-obsidiana'
                        }`}
                      >
                        <div>
                          <p className="font-black text-sm text-slate-800 dark:text-brand-nacar">
                            {v.folio}
                          </p>
                          <p className="text-xs font-bold text-slate-400 dark:text-ui-muted">
                            {new Date(
                              v.fecha || v.created_at,
                            ).toLocaleDateString('es-MX')}{' '}
                            · {v.metodo_pago}
                          </p>
                        </div>
                        <span className="font-black text-emerald-600 dark:text-brand-cesped">
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
                <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" /> Paso 2 — Datos del
                  receptor
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label="RFC *"
                    field="rfc"
                    placeholder="XAXX010101000"
                  />
                  <TextField
                    label="Código Postal *"
                    field="cp_receptor"
                    placeholder="64000"
                  />
                  <div className="sm:col-span-2">
                    <TextField
                      label="Nombre o Razón Social *"
                      field="nombre"
                      placeholder="Mi Empresa SA de CV"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <TextField
                      label="Email (para envío)"
                      field="email"
                      placeholder="facturacion@empresa.com"
                      type="email"
                    />
                  </div>
                  <SelectField
                    label="Uso de CFDI"
                    field="uso_cfdi"
                    options={USOS_CFDI}
                  />
                  <SelectField
                    label="Régimen Fiscal"
                    field="regimen"
                    options={REGIMENES}
                  />
                  <SelectField
                    label="Método de Pago"
                    field="metodo_pago"
                    options={METODOS_PAGO_CFDI}
                  />
                  <SelectField
                    label="Forma de Pago"
                    field="forma_pago"
                    options={FORMAS_PAGO}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setModalNueva(false)}
                  className="flex-1 py-4 rounded-2xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEmitir}
                  className="flex-[2] py-4 rounded-2xl bg-indigo-600 dark:bg-brand-amatista hover:bg-indigo-700 font-black text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Emitir factura (mock)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
