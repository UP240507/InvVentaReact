import { useState } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Calculator,
  Users,
  Receipt,
  HeartHandshake,
  Landmark,
  Percent,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useAuthStore } from '../../auth/useAuthStore';

// HELPERS ORIGINALES (Intactos)
const safeNumber = (val, fallback = 0) => {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

const safePriceString = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'string') {
    val = val.replace(',', '.');
  }
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const getPrecio = (item) => {
  // Lectura canónica de precio. El catálogo (recetas) usa 'precio_venta'.
  // Los ítems del carrito llevan 'precio' (campo interno normalizado al
  // agregar) → compat hacia atrás con órdenes de mesa ya persistidas.
  // Se elimina el fallback a 'costo'/'price'/'valor' (devolvía el COSTO
  // como precio: bug latente).
  const v = item?.precio_venta ?? item?.precio ?? item?.precioVenta;
  return safePriceString(v);
};

const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

export default function ModalCobro({
  total,
  comensales,
  carrito,
  onClose,
  onProcesarPago,
}) {
  // ─── LÓGICA ORIGINAL INTACTA ───
  const totalSanitizado = round2(safePriceString(total));
  const comensalesSanitizado = safeNumber(comensales, 1);
  const carritoSanitizado = Array.isArray(carrito) ? carrito : [];

  const [pagos, setPagos] = useState([]);
  const [metodoActivo, setMetodoActivo] = useState('Efectivo');
  const [montoInput, setMontoInput] = useState('');

  const [propinaSeleccionada, setPropinaSeleccionada] = useState(0);
  const [propinaManual, setPropinaManual] = useState('');

  // Propina proveniente de sobrepagos en tarjeta/transferencia. Se "congela"
  // como monto fijo (no porcentaje) para no entrar en el bucle
  // más-propina → más-total → más-excedente. Se suma a la propina elegida.
  const [propinaExtra, setPropinaExtra] = useState(0);

  // Pago pendiente de confirmar cuando tarjeta/transferencia exceden el saldo.
  // null = sin diálogo. { metodo, monto, excedente } = mostrar confirmación.
  const [dialogoExcedente, setDialogoExcedente] = useState(null);

  // ─── DESCUENTO (autorizado) ────────────────────────────────────────────────
  // Cualquiera puede ABRIR la opción, pero aplicarla exige rol alto:
  //  - Sesión Admin/Administrador/Gerente → aplica directo, sin fricción.
  //  - Cualquier otra sesión → pinpad de autorización: un Gerente/Admin teclea
  //    SU PIN (staff, 4-6 dígitos) y queda registrado como autorizador.
  const ROLES_AUTORIZAN_DESCUENTO = ['Admin', 'Administrador', 'Gerente'];
  const { staff } = useAppStore();
  const { user } = useAuthStore();
  const sesionAutoriza = ROLES_AUTORIZAN_DESCUENTO.includes(
    user?.rol || user?.puesto,
  );

  const [mostrarDescuento, setMostrarDescuento] = useState(false);
  const [descTipo, setDescTipo] = useState('pct'); // 'pct' | 'monto'
  const [descValor, setDescValor] = useState('');
  // { tipo, valor, autorizadoPor } — solo existe cuando ya fue autorizado.
  const [descuentoAplicado, setDescuentoAplicado] = useState(null);
  const [pinAuthAbierto, setPinAuthAbierto] = useState(false);
  const [pinAuth, setPinAuth] = useState('');
  const [pinAuthError, setPinAuthError] = useState('');

  const intentarAplicarDescuento = () => {
    const v = safeNumber(descValor, 0);
    if (v <= 0) return;
    if (descTipo === 'pct' && v > 100) return;
    if (sesionAutoriza) {
      setDescuentoAplicado({
        tipo: descTipo,
        valor: v,
        autorizadoPor: user?.nombre || 'Gestión',
      });
      setMostrarDescuento(false);
    } else {
      setPinAuthError('');
      setPinAuth('');
      setPinAuthAbierto(true);
    }
  };

  const autorizarDescuentoConPin = () => {
    const p = String(pinAuth).trim();
    if (p.length < 4) {
      setPinAuthError('PIN incompleto.');
      return;
    }
    const autorizador = (staff || []).find((s) => {
      const rolS = s.rol || s.puesto || '';
      const activo =
        s.activo !== false && s.activo !== 'false' && s.activo !== 0;
      const p1 = String(s.pin ?? '').trim();
      const p2 = String(s.pin_acceso ?? '').trim();
      return (
        ROLES_AUTORIZAN_DESCUENTO.includes(rolS) &&
        activo &&
        ((p1 === p && p1 !== '') || (p2 === p && p2 !== ''))
      );
    });
    if (!autorizador) {
      setPinAuthError('PIN inválido o sin permiso para autorizar.');
      setPinAuth('');
      return;
    }
    setDescuentoAplicado({
      tipo: descTipo,
      valor: safeNumber(descValor, 0),
      autorizadoPor: autorizador.nombre,
    });
    setPinAuthAbierto(false);
    setMostrarDescuento(false);
  };

  const quitarDescuento = () => {
    setDescuentoAplicado(null);
    setDescValor('');
  };

  const [tipoDivision, setTipoDivision] = useState('monto');
  const [divisorPersonas, setDivisorPersonas] = useState(comensalesSanitizado);
  const [seleccionPlatillos, setSeleccionPlatillos] = useState({});

  const subtotalSeleccion = round2(
    Object.entries(seleccionPlatillos).reduce((acc, [id, qty]) => {
      const item = carritoSanitizado.find((i) => String(i.id) === String(id));
      if (!item) return acc;
      const precio = getPrecio(item);
      const cantidad = safeNumber(qty, 0);
      return acc + precio * cantidad;
    }, 0),
  );

  const isCobroParcial = tipoDivision === 'platillos' && subtotalSeleccion > 0;
  const totalBase = isCobroParcial ? subtotalSeleccion : totalSanitizado;

  // Descuento → SIEMPRE se normaliza a % del total. Un % escala base e IVA por
  // igual, así que el % sobre el total mostrado es idéntico al descuentoPct
  // sobre la base que espera calcularVenta (el motor recalcula IVA sobre la
  // base neta). Un monto fijo se convierte a su % equivalente del total.
  const pctDescuento = descuentoAplicado
    ? descuentoAplicado.tipo === 'pct'
      ? Math.min(100, Math.max(0, safeNumber(descuentoAplicado.valor, 0)))
      : Math.min(
          100,
          (Math.min(safeNumber(descuentoAplicado.valor, 0), totalBase) /
            (totalBase || 1)) *
            100,
        )
    : 0;
  const montoDescuento = round2(totalBase * (pctDescuento / 100));
  const totalConDescuento = round2(totalBase - montoDescuento);

  const propinaCalculada = round2(
    propinaSeleccionada !== 'manual'
      ? totalConDescuento * (safeNumber(propinaSeleccionada, 0) / 100)
      : safeNumber(propinaManual, 0),
  );

  // Propina total = la elegida (botones/manual) + la que entró por sobrepago.
  const propinaTotal = round2(propinaCalculada + safeNumber(propinaExtra, 0));

  const granTotal = round2(totalConDescuento + propinaTotal);
  const totalPagado = round2(
    pagos.reduce((acc, p) => acc + safeNumber(p?.monto, 0), 0),
  );
  const saldoPendiente = round2(granTotal - totalPagado);

  // El cambio SOLO existe por sobrepago en efectivo. La tarjeta/transferencia
  // cobran el monto exacto: nunca devuelven cambio. Por eso acotamos el excedente
  // a cuánto efectivo se recibió (no se devuelve cambio de un sobrepago de tarjeta).
  const totalEfectivoRecibido = round2(
    pagos
      .filter((p) => (p?.metodo || '').toLowerCase() === 'efectivo')
      .reduce((acc, p) => acc + safeNumber(p?.monto, 0), 0),
  );
  const excedente = saldoPendiente < 0 ? Math.abs(saldoPendiente) : 0;
  const cambio = round2(Math.min(excedente, totalEfectivoRecibido));

  const estaPagado = saldoPendiente <= 0 && totalPagado > 0;

  const UMBRAL_EXCEDENTE = 1; // < $1 = redondeo, no dispara diálogo

  const registrarPago = (metodo, monto) => {
    setPagos((prev) => [
      ...prev,
      { id: Date.now().toString(), metodo, monto: round2(monto) },
    ]);
  };

  const agregarPago = (montoEspecifico = null) => {
    let montoAAgregar =
      montoEspecifico !== null
        ? safeNumber(montoEspecifico)
        : safePriceString(montoInput);

    montoAAgregar = round2(montoAAgregar);

    if (isNaN(montoAAgregar) || montoAAgregar <= 0) return;

    // ¿Este pago de tarjeta/transferencia hace que se supere el saldo?
    // Solo entonces preguntamos si el excedente es propina. Efectivo NO entra
    // (su sobrante es cambio, ya manejado). Excedente < $1 = redondeo, se ignora.
    const metodoLower = metodoActivo.toLowerCase();
    const esDigital =
      metodoLower === 'tarjeta' || metodoLower === 'transferencia';
    const nuevoSaldo = round2(saldoPendiente - montoAAgregar);
    const excedentePago = nuevoSaldo < 0 ? round2(Math.abs(nuevoSaldo)) : 0;

    if (esDigital && excedentePago >= UMBRAL_EXCEDENTE) {
      // No registramos aún: pedimos confirmación.
      setDialogoExcedente({
        metodo: metodoActivo,
        monto: montoAAgregar,
        excedente: excedentePago,
      });
      return;
    }

    // Caso normal (sin excedente digital): registrar directo, venta ágil.
    registrarPago(metodoActivo, montoAAgregar);
    setMontoInput('');
  };

  // El cajero confirmó que el excedente ES propina.
  const confirmarExcedenteComoPropina = () => {
    if (!dialogoExcedente) return;
    registrarPago(dialogoExcedente.metodo, dialogoExcedente.monto);
    setPropinaExtra((prev) =>
      round2(safeNumber(prev) + dialogoExcedente.excedente),
    );
    setDialogoExcedente(null);
    setMontoInput('');
  };

  // El cajero dice que fue error: no registramos el pago, dejamos re-teclear.
  const corregirExcedente = () => {
    setDialogoExcedente(null);
    // montoInput se conserva para que pueda ajustarlo.
  };

  const removerPago = (id) => setPagos(pagos.filter((p) => p.id !== id));

  const sugerencias = [50, 100, 200, 500];

  const handleSugerencia = (valorBillete) => {
    const actual = safePriceString(montoInput);
    setMontoInput(round2(actual + valorBillete).toString());
  };

  const montoPorPersona = round2(granTotal / safeNumber(divisorPersonas, 1));

  // ─── INTERFAZ REDISEÑADA (TEMA DÍA/NOCHE) ───
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-ui-obsidiana/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-white dark:bg-ui-humo rounded-[3rem] w-full max-w-5xl shadow-2xl flex flex-col md:flex-row overflow-hidden max-h-[90vh] border-2 border-slate-100 dark:border-ui-border">
        {/* LADO IZQUIERDO: CONTROLES DE PAGO */}
        <div className="w-full md:w-1/2 bg-slate-50 dark:bg-ui-obsidiana/50 p-6 md:p-8 flex flex-col border-r border-slate-200 dark:border-ui-border overflow-y-auto custom-scrollbar transition-colors">
          <h2 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-6 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-500 dark:text-brand-amatista" />{' '}
            Opciones de Cobro
          </h2>

          {/* SECCIÓN DE DESCUENTO (autorizado) */}
          <div className="mb-6 bg-white dark:bg-ui-humo p-5 rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted flex items-center gap-2">
                <Percent className="w-4 h-4 text-indigo-500 dark:text-brand-amatista" />{' '}
                Descuento
              </p>
              {!descuentoAplicado && (
                <button
                  onClick={() => setMostrarDescuento((v) => !v)}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-brand-amatista hover:underline"
                >
                  {mostrarDescuento ? 'Cancelar' : 'Agregar'}
                </button>
              )}
            </div>

            {descuentoAplicado ? (
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-brand-amatista/10 border border-indigo-200 dark:border-brand-amatista/30 rounded-xl px-4 py-3 mt-2">
                <div>
                  <p className="font-black text-indigo-600 dark:text-brand-amatista">
                    −$
                    {montoDescuento.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    ({round2(pctDescuento)}%)
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-ui-muted flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3" /> Autorizó:{' '}
                    {descuentoAplicado.autorizadoPor}
                  </p>
                </div>
                <button
                  onClick={quitarDescuento}
                  className="p-2 text-slate-400 dark:text-ui-muted hover:text-rose-500 dark:hover:text-brand-arrecife rounded-lg"
                  title="Quitar descuento"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              mostrarDescuento && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDescTipo('pct')}
                      className={`flex-1 py-2.5 rounded-xl font-bold border-2 transition-all ${descTipo === 'pct' ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-brand-amatista/10 dark:border-brand-amatista dark:text-brand-amatista' : 'border-slate-100 bg-slate-50 text-slate-500 dark:border-ui-border dark:bg-ui-obsidiana dark:text-ui-muted'}`}
                    >
                      %
                    </button>
                    <button
                      onClick={() => setDescTipo('monto')}
                      className={`flex-1 py-2.5 rounded-xl font-bold border-2 transition-all ${descTipo === 'monto' ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-brand-amatista/10 dark:border-brand-amatista dark:text-brand-amatista' : 'border-slate-100 bg-slate-50 text-slate-500 dark:border-ui-border dark:bg-ui-obsidiana dark:text-ui-muted'}`}
                    >
                      $
                    </button>
                  </div>
                  <div className="flex items-center bg-slate-50 dark:bg-ui-obsidiana p-3 rounded-xl border border-slate-200 dark:border-ui-border">
                    <span className="text-slate-400 dark:text-ui-muted font-black px-3 text-lg">
                      {descTipo === 'pct' ? '%' : '$'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      placeholder={
                        descTipo === 'pct' ? 'Porcentaje...' : 'Monto...'
                      }
                      value={descValor}
                      onChange={(e) => setDescValor(e.target.value)}
                      className="w-full bg-transparent font-black text-slate-900 dark:text-brand-nacar outline-none text-lg"
                    />
                  </div>
                  <button
                    onClick={intentarAplicarDescuento}
                    disabled={safeNumber(descValor, 0) <= 0}
                    className="w-full py-3 rounded-xl font-black bg-indigo-500 dark:bg-brand-amatista text-white dark:text-ui-obsidiana disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {sesionAutoriza
                      ? 'Aplicar descuento'
                      : 'Solicitar autorización'}
                  </button>
                </div>
              )
            )}
          </div>

          {/* SECCIÓN DE PROPINA */}
          <div className="mb-6 bg-white dark:bg-ui-humo p-5 rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm transition-colors">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted mb-3 flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-orange-500 dark:text-brand-arrecife" />{' '}
              Servicio / Propina
            </p>
            <div className="flex gap-2 mb-2">
              {[0, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    setPropinaSeleccionada(pct);
                    setPropinaManual('');
                  }}
                  className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${propinaSeleccionada === pct ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-brand-arrecife/10 dark:border-brand-arrecife dark:text-brand-arrecife shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300 dark:border-ui-border dark:bg-ui-obsidiana dark:text-ui-muted dark:hover:border-ui-muted'}`}
                >
                  {pct}%
                </button>
              ))}
              <button
                onClick={() => setPropinaSeleccionada('manual')}
                className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${propinaSeleccionada === 'manual' ? 'border-orange-500 bg-orange-50 text-orange-600 dark:bg-brand-arrecife/10 dark:border-brand-arrecife dark:text-brand-arrecife shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300 dark:border-ui-border dark:bg-ui-obsidiana dark:text-ui-muted dark:hover:border-ui-muted'}`}
              >
                Otro
              </button>
            </div>
            {propinaSeleccionada === 'manual' && (
              <div className="flex items-center bg-slate-50 dark:bg-ui-obsidiana p-3 rounded-xl border border-slate-200 dark:border-ui-border mt-3 transition-colors">
                <span className="text-slate-400 dark:text-ui-muted font-black px-3 text-lg">
                  $
                </span>
                <input
                  type="number"
                  placeholder="Monto exacto..."
                  value={propinaManual}
                  onChange={(e) => setPropinaManual(e.target.value)}
                  className="w-full bg-transparent font-black text-slate-900 dark:text-brand-nacar outline-none text-lg"
                />
              </div>
            )}
          </div>

          {/* Selector de División */}
          <div className="flex bg-slate-200/50 dark:bg-ui-obsidiana p-1.5 rounded-2xl mb-6 shrink-0 transition-colors">
            <button
              onClick={() => {
                setTipoDivision('monto');
                setSeleccionPlatillos({});
              }}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition-all ${tipoDivision === 'monto' ? 'bg-white dark:bg-ui-humo shadow-sm text-slate-900 dark:text-brand-nacar' : 'text-slate-500 dark:text-ui-muted hover:text-slate-700 dark:hover:text-brand-nacar'}`}
            >
              Total
            </button>
            <button
              onClick={() => {
                setTipoDivision('personas');
                setSeleccionPlatillos({});
              }}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition-all ${tipoDivision === 'personas' ? 'bg-white dark:bg-ui-humo shadow-sm text-slate-900 dark:text-brand-nacar' : 'text-slate-500 dark:text-ui-muted hover:text-slate-700 dark:hover:text-brand-nacar'}`}
            >
              Personas
            </button>
            <button
              onClick={() => setTipoDivision('platillos')}
              className={`flex-1 py-3 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${tipoDivision === 'platillos' ? 'bg-white dark:bg-ui-humo shadow-sm text-indigo-600 dark:text-brand-amatista' : 'text-slate-500 dark:text-ui-muted hover:text-slate-700 dark:hover:text-brand-nacar'}`}
            >
              <Receipt className="w-4 h-4" /> Platillos
            </button>
          </div>

          {/* PANEL: POR PLATILLOS */}
          {tipoDivision === 'platillos' && (
            <div className="mb-6 bg-white dark:bg-ui-humo p-5 rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm animate-in slide-in-from-left-2 transition-colors">
              <p className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-4">
                1. Selecciona qué se va a cobrar ahorita:
              </p>

              <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2 mb-4">
                {carritoSanitizado.map((item) => {
                  const maxQty = safeNumber(item?.cantidad, 0);
                  const selQty = safeNumber(seleccionPlatillos[item.id], 0);
                  const precioDisplay = getPrecio(item);

                  return (
                    <div
                      key={item.id}
                      className={`flex justify-between items-center p-3 rounded-xl border-2 transition-colors ${selQty > 0 ? 'bg-indigo-50 border-indigo-200 dark:bg-brand-amatista/10 dark:border-brand-amatista/30' : 'bg-slate-50 border-slate-100 dark:bg-ui-obsidiana dark:border-ui-border'}`}
                    >
                      <div className="flex-1">
                        <p
                          className={`font-bold text-sm leading-tight ${selQty > 0 ? 'text-indigo-900 dark:text-brand-nacar' : 'text-slate-700 dark:text-ui-text'}`}
                        >
                          {item.nombre || 'Sin nombre'}
                        </p>
                        <p className="text-xs font-black text-indigo-500 dark:text-brand-amatista mt-0.5">
                          $
                          {precioDisplay.toLocaleString('es-MX', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 bg-white dark:bg-ui-humo rounded-lg border border-slate-200 dark:border-ui-border p-1 shadow-sm">
                        <button
                          onClick={() =>
                            setSeleccionPlatillos((prev) => ({
                              ...prev,
                              [item.id]: Math.max(
                                0,
                                safeNumber(prev[item.id], 0) - 1,
                              ),
                            }))
                          }
                          className="w-7 h-7 bg-slate-100 dark:bg-ui-obsidiana rounded text-slate-600 dark:text-brand-nacar font-black hover:bg-slate-200 dark:hover:bg-ui-border transition-colors"
                        >
                          -
                        </button>
                        <span className="font-black text-slate-900 dark:text-brand-nacar w-5 text-center text-sm">
                          {selQty}
                        </span>
                        <button
                          onClick={() =>
                            setSeleccionPlatillos((prev) => ({
                              ...prev,
                              [item.id]: Math.min(
                                maxQty,
                                safeNumber(prev[item.id], 0) + 1,
                              ),
                            }))
                          }
                          className="w-7 h-7 bg-slate-100 dark:bg-ui-obsidiana rounded text-slate-600 dark:text-brand-nacar font-black hover:bg-slate-200 dark:hover:bg-ui-border transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t-2 border-slate-100 dark:border-ui-border pt-4 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                    Subtotal seleccionado
                  </span>
                  <span className="font-black text-indigo-600 dark:text-brand-amatista text-xl">
                    $
                    {subtotalSeleccion.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PANEL: POR PERSONAS */}
          {tipoDivision === 'personas' && (
            <div className="mb-6 bg-white dark:bg-ui-humo p-6 rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm text-center animate-in slide-in-from-left-2 transition-colors">
              <p className="text-[10px] font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest mb-4">
                Dividir $
                {granTotal.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}{' '}
                entre:
              </p>
              <div className="flex items-center justify-center gap-6 mb-6">
                <button
                  onClick={() =>
                    setDivisorPersonas(
                      Math.max(2, safeNumber(divisorPersonas, 2) - 1),
                    )
                  }
                  className="w-14 h-14 bg-slate-100 dark:bg-ui-obsidiana rounded-2xl font-black text-2xl text-slate-700 dark:text-brand-nacar hover:bg-slate-200 dark:hover:bg-ui-border transition-colors"
                >
                  -
                </button>
                <div className="text-5xl font-black font-syne text-slate-900 dark:text-brand-nacar w-24">
                  <Users className="w-8 h-8 inline mr-2 text-indigo-500 dark:text-brand-amatista opacity-50" />
                  {divisorPersonas}
                </div>
                <button
                  onClick={() =>
                    setDivisorPersonas(safeNumber(divisorPersonas, 2) + 1)
                  }
                  className="w-14 h-14 bg-slate-100 dark:bg-ui-obsidiana rounded-2xl font-black text-2xl text-slate-700 dark:text-brand-nacar hover:bg-slate-200 dark:hover:bg-ui-border transition-colors"
                >
                  +
                </button>
              </div>
              <p className="text-xl font-black text-indigo-600 dark:text-brand-amatista mb-6">
                Toca de $
                {montoPorPersona.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </p>
              <button
                onClick={() => agregarPago(montoPorPersona)}
                disabled={estaPagado}
                className="w-full py-4 bg-indigo-50 dark:bg-brand-amatista/10 hover:bg-indigo-100 dark:hover:bg-brand-amatista/20 text-indigo-600 dark:text-brand-amatista font-black rounded-xl transition-colors disabled:opacity-50"
              >
                Cobrar Parte (1/{divisorPersonas})
              </button>
            </div>
          )}

          {/* PANEL BASE: METODO DE PAGO */}
          <div className="flex-1 flex flex-col pt-2 border-t border-slate-200 dark:border-ui-border">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-ui-muted mb-3 mt-4">
              Método de Ingreso
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <button
                onClick={() => setMetodoActivo('Efectivo')}
                className={`py-4 rounded-2xl border-2 font-black flex flex-col justify-center items-center gap-1 transition-all active:scale-95 ${metodoActivo === 'Efectivo' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-brand-cesped/10 dark:border-brand-cesped dark:text-brand-cesped shadow-sm' : 'border-slate-200 bg-white dark:bg-ui-humo dark:border-ui-border text-slate-500 dark:text-ui-muted hover:border-slate-300 dark:hover:border-ui-muted'}`}
              >
                <Banknote className="w-5 h-5" />{' '}
                <span className="text-xs">Efectivo</span>
              </button>
              <button
                onClick={() => setMetodoActivo('Tarjeta')}
                className={`py-4 rounded-2xl border-2 font-black flex flex-col justify-center items-center gap-1 transition-all active:scale-95 ${metodoActivo === 'Tarjeta' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-brand-arrecife/10 dark:border-brand-arrecife dark:text-brand-arrecife shadow-sm' : 'border-slate-200 bg-white dark:bg-ui-humo dark:border-ui-border text-slate-500 dark:text-ui-muted hover:border-slate-300 dark:hover:border-ui-muted'}`}
              >
                <CreditCard className="w-5 h-5" />{' '}
                <span className="text-xs">Tarjeta</span>
              </button>
              <button
                onClick={() => setMetodoActivo('Transferencia')}
                className={`py-4 rounded-2xl border-2 font-black flex flex-col justify-center items-center gap-1 transition-all active:scale-95 ${metodoActivo === 'Transferencia' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-brand-amatista/10 dark:border-brand-amatista dark:text-brand-amatista shadow-sm' : 'border-slate-200 bg-white dark:bg-ui-humo dark:border-ui-border text-slate-500 dark:text-ui-muted hover:border-slate-300 dark:hover:border-ui-muted'}`}
              >
                <Landmark className="w-5 h-5" />{' '}
                <span className="text-xs">Transfer.</span>
              </button>
            </div>

            <div className="bg-white dark:bg-ui-humo p-3 rounded-2xl border-2 border-slate-200 dark:border-ui-border shadow-sm flex items-center mb-4 transition-colors focus-within:border-emerald-500 dark:focus-within:border-brand-cesped">
              <span className="text-slate-400 dark:text-ui-muted font-black text-2xl pl-4">
                $
              </span>
              <input
                type="number"
                value={montoInput}
                onChange={(e) => setMontoInput(e.target.value)}
                placeholder={
                  saldoPendiente > 0 ? saldoPendiente.toFixed(2) : '0.00'
                }
                className="w-full bg-transparent text-3xl font-black text-slate-900 dark:text-brand-nacar p-2 outline-none"
              />
            </div>

            <div className="grid grid-cols-4 gap-2 mb-6">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSugerencia(s)}
                  className="py-3 bg-white dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-xl font-black text-slate-600 dark:text-brand-nacar hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-brand-cesped/50 dark:hover:text-brand-cesped transition-colors"
                >
                  +${s}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-auto">
              <button
                onClick={() =>
                  agregarPago(saldoPendiente > 0 ? saldoPendiente : 0)
                }
                disabled={estaPagado}
                className="py-4 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border border border-transparent dark:border-ui-border text-slate-700 dark:text-brand-nacar font-black rounded-xl transition-colors disabled:opacity-50"
              >
                Pagar Restante
              </button>
              <button
                onClick={() => agregarPago()}
                disabled={!montoInput || estaPagado}
                className="py-4 bg-slate-900 hover:bg-slate-800 dark:bg-brand-amatista dark:hover:bg-indigo-600 text-white dark:text-brand-nacar font-black rounded-xl shadow-lg transition-colors disabled:opacity-50"
              >
                Añadir Pago
              </button>
            </div>
          </div>
        </div>

        {/* LADO DERECHO: TICKET Y TOTALES */}
        <div className="w-full md:w-1/2 bg-white dark:bg-ui-humo flex flex-col relative transition-colors">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-ui-obsidiana hover:bg-slate-200 dark:hover:bg-ui-border text-slate-500 dark:text-ui-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-8 pb-6 border-b-2 border-slate-100 dark:border-ui-border">
            <p className="text-[10px] font-black text-slate-400 dark:text-ui-muted uppercase tracking-[0.2em] mb-4">
              {isCobroParcial
                ? 'Desglose Parcial (Separado)'
                : 'Desglose de la Cuenta'}
            </p>
            <div className="flex justify-between items-center text-slate-500 dark:text-ui-muted font-bold mb-3">
              <span>Subtotal (Consumo)</span>
              <span>
                $
                {totalBase.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            {montoDescuento > 0 && (
              <div className="flex justify-between items-center text-indigo-500 dark:text-brand-amatista font-bold mb-3">
                <span>Descuento ({round2(pctDescuento)}%)</span>
                <span>
                  −$
                  {montoDescuento.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
            {propinaTotal > 0 && (
              <div className="flex justify-between items-center text-orange-500 dark:text-brand-arrecife font-bold mb-3">
                <span>
                  Propina{propinaExtra > 0 ? ' (incl. excedente)' : ''}
                </span>
                <span>
                  $
                  {propinaTotal.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-end mt-6 pt-6 border-t-2 border-slate-100 dark:border-ui-border border-dashed">
              <span className="text-slate-900 dark:text-brand-nacar font-black text-xl">
                Total Final
              </span>
              <h2 className="text-5xl font-black font-syne text-slate-900 dark:text-brand-nacar">
                $
                {granTotal.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </h2>
            </div>
          </div>

          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-ui-obsidiana/30">
            <h3 className="font-black text-slate-800 dark:text-brand-nacar mb-4 text-sm uppercase tracking-widest">
              Pagos Registrados
            </h3>
            {pagos.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-ui-border rounded-2xl">
                <p className="text-slate-400 dark:text-ui-muted font-bold text-sm">
                  Aún no se han registrado pagos.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pagos.map((pago, idx) => (
                  <div
                    key={pago.id}
                    className="flex justify-between items-center bg-white dark:bg-ui-obsidiana p-4 rounded-2xl border border-slate-200 dark:border-ui-border shadow-sm animate-in slide-in-from-right-4 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-3 rounded-xl ${pago.metodo === 'Efectivo' ? 'bg-emerald-50 text-emerald-600 dark:bg-brand-cesped/10 dark:text-brand-cesped' : pago.metodo === 'Transferencia' ? 'bg-indigo-50 text-indigo-600 dark:bg-brand-amatista/10 dark:text-brand-amatista' : 'bg-blue-50 text-blue-600 dark:bg-brand-arrecife/10 dark:text-brand-arrecife'}`}
                      >
                        {pago.metodo === 'Efectivo' ? (
                          <Banknote className="w-6 h-6" />
                        ) : pago.metodo === 'Transferencia' ? (
                          <Landmark className="w-6 h-6" />
                        ) : (
                          <CreditCard className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 dark:text-brand-nacar">
                          Abono {idx + 1}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-ui-muted uppercase tracking-widest">
                          {pago.metodo}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-black text-xl text-slate-900 dark:text-brand-nacar">
                        $
                        {safeNumber(pago.monto).toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      <button
                        onClick={() => removerPago(pago.id)}
                        className="text-slate-300 hover:text-rose-500 dark:text-ui-border dark:hover:text-brand-arrecife transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-8 bg-white dark:bg-ui-humo border-t-2 border-slate-100 dark:border-ui-border shadow-[0_-10px_20px_rgba(0,0,0,0.02)] transition-colors z-10">
            <div className="flex justify-between items-center mb-3">
              <span className="font-black text-slate-500 dark:text-ui-muted uppercase tracking-widest text-xs">
                Saldo Pendiente
              </span>
              <span
                className={`font-black text-2xl ${saldoPendiente > 0 ? 'text-rose-500 dark:text-brand-arrecife' : 'text-emerald-500 dark:text-brand-cesped'}`}
              >
                $
                {Math.max(0, saldoPendiente).toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            {cambio > 0 && (
              <div className="flex justify-between items-center mb-4 p-4 bg-emerald-50 dark:bg-brand-cesped/10 rounded-2xl border-2 border-emerald-100 dark:border-brand-cesped/30">
                <span className="font-black text-emerald-700 dark:text-brand-cesped uppercase tracking-widest text-xs">
                  Cambio a entregar
                </span>
                <span className="font-black text-3xl text-emerald-600 dark:text-brand-cesped">
                  $
                  {cambio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <button
              onClick={() =>
                onProcesarPago({
                  pagosDetalle: pagos,
                  totalPagado,
                  cambio,
                  propina: propinaTotal,
                  totalConPropina: granTotal,
                  isCobroParcial,
                  seleccion: seleccionPlatillos,
                  descuentoPct: pctDescuento,
                  descuentoMonto: montoDescuento,
                  descuentoAutorizadoPor:
                    descuentoAplicado?.autorizadoPor || null,
                })
              }
              disabled={!estaPagado}
              className={`w-full mt-4 text-white dark:text-ui-obsidiana font-black py-6 rounded-2xl shadow-xl transition-all text-xl flex justify-center items-center gap-3 ${
                isCobroParcial
                  ? 'bg-blue-600 hover:bg-blue-700 dark:bg-brand-amatista dark:hover:bg-indigo-600 shadow-blue-500/30 dark:shadow-brand-amatista/30'
                  : 'bg-emerald-500 hover:bg-emerald-600 dark:bg-brand-cesped dark:hover:bg-[#00c98c] shadow-emerald-500/30 dark:shadow-brand-cesped/30'
              } disabled:bg-slate-200 disabled:dark:bg-ui-border disabled:text-slate-400 disabled:dark:text-ui-muted disabled:shadow-none hover:scale-[1.02] active:scale-95`}
            >
              {isCobroParcial
                ? 'Cobrar Selección (Mesa Abierta)'
                : 'Confirmar y Cerrar Cuenta'}
            </button>
          </div>
        </div>
      </div>

      {/* PINPAD DE AUTORIZACIÓN DE DESCUENTO (Gerente/Admin) */}
      {pinAuthAbierto && (
        <div className="fixed inset-0 bg-slate-900/70 dark:bg-ui-obsidiana/85 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] p-7 max-w-xs w-full shadow-2xl border-2 border-slate-100 dark:border-ui-border text-center animate-in zoom-in-95">
            <div className="w-14 h-14 bg-indigo-100 dark:bg-brand-amatista/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7 text-indigo-500 dark:text-brand-amatista" />
            </div>
            <h3 className="font-black text-slate-900 dark:text-brand-nacar text-xl font-syne mb-1">
              Autorización requerida
            </h3>
            <p className="text-slate-500 dark:text-ui-muted text-xs font-bold mb-5">
              Un Gerente o Admin debe teclear su PIN para aplicar el descuento.
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pinAuth}
              onChange={(e) => {
                setPinAuth(e.target.value.replace(/\D/g, ''));
                setPinAuthError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') autorizarDescuentoConPin();
              }}
              placeholder="••••••"
              className="w-full text-center text-3xl tracking-[0.5em] font-black bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-200 dark:border-ui-border focus:border-indigo-500 dark:focus:border-brand-amatista rounded-2xl py-4 outline-none text-slate-900 dark:text-brand-nacar transition-colors mb-3"
            />
            {pinAuthError && (
              <p className="text-rose-500 dark:text-brand-arrecife text-xs font-bold mb-3">
                {pinAuthError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setPinAuthAbierto(false)}
                className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 dark:border-ui-border font-bold text-slate-500 dark:text-ui-muted hover:bg-slate-50 dark:hover:bg-ui-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={autorizarDescuentoConPin}
                disabled={pinAuth.length < 4}
                className="flex-1 py-3.5 rounded-xl bg-indigo-500 dark:bg-brand-amatista text-white dark:text-ui-obsidiana font-black disabled:opacity-40 active:scale-95 transition-all"
              >
                Autorizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MINI-DIÁLOGO: ¿el excedente es propina? (solo tarjeta/transferencia) */}
      {dialogoExcedente && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 dark:bg-ui-obsidiana/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-ui-humo rounded-[2rem] w-full max-w-md shadow-2xl border-2 border-slate-100 dark:border-ui-border overflow-hidden animate-in zoom-in-95">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-orange-100 dark:bg-brand-arrecife/20 text-orange-500 dark:text-brand-arrecife rounded-full flex items-center justify-center mx-auto mb-4">
                <HeartHandshake className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black font-syne text-slate-900 dark:text-brand-nacar mb-2">
                Pago mayor al total
              </h3>
              <p className="text-slate-500 dark:text-ui-muted font-medium mb-1">
                El pago con {dialogoExcedente.metodo.toLowerCase()} de{' '}
                <span className="font-black text-slate-700 dark:text-brand-nacar">
                  $
                  {dialogoExcedente.monto.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                  })}
                </span>{' '}
                excede el saldo por:
              </p>
              <p className="text-4xl font-black font-syne text-orange-500 dark:text-brand-arrecife my-3">
                $
                {dialogoExcedente.excedente.toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-sm text-slate-400 dark:text-ui-muted font-bold">
                {propinaCalculada > 0
                  ? 'Se sumará a la propina actual.'
                  : '¿Este excedente es propina?'}
              </p>
            </div>
            <div className="px-8 pb-8 grid grid-cols-2 gap-3">
              <button
                onClick={corregirExcedente}
                className="py-4 rounded-2xl border-2 border-slate-200 dark:border-ui-border font-black text-slate-600 dark:text-brand-nacar hover:bg-slate-50 dark:hover:bg-ui-border transition-colors active:scale-95"
              >
                Fue error
              </button>
              <button
                onClick={confirmarExcedenteComoPropina}
                className="py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 dark:bg-brand-arrecife font-black text-white shadow-lg shadow-orange-500/30 transition-transform active:scale-95"
              >
                Sí, es propina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
