// ─── DESCUENTO POR PRODUCTO (25-jul) ─────────────────────────────────────────
// Se aplica sobre UNA línea del carrito, mientras se toma o edita la orden.
// Ahí es donde ocurre el caso real: "este platillo salió mal / llegó tarde /
// no era lo que pidió" lo decide el mesero en la mesa, no el cajero al cobrar.
//
// Tres modos: porcentaje, monto fijo y CORTESÍA (el platillo va sin costo).
// La cortesía es un modo aparte y no un "100%" disfrazado porque en auditoría
// se lee distinto: un 100% parece un error de dedo; "Cortesía" es una decisión.
//
// CANDADO: exactamente el mismo que el descuento de ticket (lib/Descuentos).
// Es la misma fuga de dinero, así que no puede tener una puerta más floja.

import { useState } from 'react';
import { Percent, DollarSign, Gift, ShieldCheck } from 'lucide-react';
import { OpsModal, OpsButton } from '../../../components/ui';
import { importeDeLinea } from '../../../lib/Fiscal';
import { puedeAutorizar, normalizarDescuento } from '../../../lib/Descuentos';
import { formatoDinero } from '../../../lib/Dinero';
import { autorizar } from '../../../api/autorizar';

const MODOS = [
  { id: 'pct', label: 'Porcentaje', icono: Percent },
  { id: 'monto', label: 'Monto', icono: DollarSign },
  { id: 'cortesia', label: 'Cortesía', icono: Gift },
];

export default function DescuentoLineaModal({
  item,
  rolSesion,
  nombreSesion,
  rolesPermisos = [],
  onAplicar,
  onQuitar,
  onCerrar,
}) {
  const [modo, setModo] = useState(item?.descuento?.tipo || 'pct');
  const [valor, setValor] = useState(
    item?.descuento && item.descuento.tipo !== 'cortesia'
      ? String(item.descuento.valor)
      : '',
  );
  const [pin, setPin] = useState('');
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [error, setError] = useState('');

  // ── A CUÁNTAS UNIDADES (0.3.3, Chris 19-nov) ────────────────────────────
  // Con dos jugos en una línea, la cortesía era para los dos. Ahora se escoge
  // a cuántas; si son menos que todas, el POS parte la línea en dos
  // (`aplicarDescuentoEnLineas`). Empieza en todas, que es lo que hacía antes.
  const cantidadLinea = Math.max(1, Math.floor(Number(item?.cantidad) || 1));
  const [unidades, setUnidades] = useState(String(cantidadLinea));
  const unidadesValidas = Math.min(
    cantidadLinea,
    Math.max(0, Math.floor(Number(unidades) || 0)),
  );

  const { bruto } = importeDeLinea({
    ...item,
    cantidad: unidadesValidas,
    descuento: null,
  });
  const sesionAutoriza = puedeAutorizar(rolSesion, rolesPermisos);

  // Vista previa con el valor tecleado: el cajero ve cuánto va a quedar ANTES
  // de aplicar, que es cuando todavía puede rectificar.
  const previo = normalizarDescuento({ tipo: modo, valor }, bruto);
  const preview = previo.ok
    ? importeDeLinea({
        ...item,
        cantidad: unidadesValidas,
        descuento: previo.descuento,
      })
    : null;

  const confirmar = (autorizadoPor) => {
    onAplicar({ ...previo.descuento, autorizadoPor }, unidadesValidas);
    onCerrar();
  };

  const intentar = () => {
    setError('');
    if (unidadesValidas < 1) {
      setError(`Escoge de 1 a ${cantidadLinea} unidades.`);
      return;
    }
    if (!previo.ok) {
      setError(previo.error);
      return;
    }
    if (sesionAutoriza) {
      confirmar(nombreSesion || 'Gestión');
      return;
    }
    setPin('');
    setPidiendoPin(true);
  };

  const autorizarConPin = async () => {
    const autorizador = await autorizar({ pin, flag: 'autoriza_descuentos' });
    if (!autorizador) {
      setError('PIN inválido o sin permiso para autorizar.');
      setPin('');
      return;
    }
    confirmar(autorizador.nombre);
  };

  return (
    <OpsModal
      titulo={pidiendoPin ? 'Autorización requerida' : 'Descuento al producto'}
      icono={pidiendoPin ? ShieldCheck : Percent}
      ancho="max-w-md"
      onClose={onCerrar}
      pie={
        pidiendoPin ? (
          <>
            <OpsButton className="flex-1" onClick={() => setPidiendoPin(false)}>
              Volver
            </OpsButton>
            <OpsButton
              variante="primario"
              className="flex-1"
              onClick={autorizarConPin}
              disabled={pin.length < 4}
            >
              Autorizar
            </OpsButton>
          </>
        ) : (
          <>
            {item?.descuento && (
              <OpsButton
                variante="peligro"
                onClick={() => {
                  onQuitar();
                  onCerrar();
                }}
              >
                Quitar
              </OpsButton>
            )}
            <OpsButton
              variante="primario"
              className="flex-1"
              onClick={intentar}
            >
              Aplicar descuento
            </OpsButton>
          </>
        )
      }
    >
      <div className="mb-5">
        <p className="font-black text-ops-ink text-lg leading-tight">
          {item?.nombre}
        </p>
        <p className="text-sm text-ops-muted">
          {Number(item?.cantidad) || 1} × {formatoDinero(item?.precio)} ={' '}
          <strong className="text-ops-ink">{formatoDinero(bruto)}</strong>
        </p>
      </div>

      {pidiendoPin ? (
        <>
          <p className="text-sm text-ops-muted mb-4">
            Tu sesión no puede autorizar descuentos. Pide a un responsable que
            teclee su PIN; quedará registrado como autorizador en auditoría.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && autorizarConPin()}
            placeholder="PIN"
            className="w-full text-center text-3xl tracking-[0.5em] font-black py-4 bg-ops-panel-2 border-2 border-ops-field rounded-ui text-ops-ink outline-none focus:border-ops-accent"
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {MODOS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setModo(m.id);
                  setError('');
                }}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-ui border-2 font-black text-xs transition-all ${
                  modo === m.id
                    ? 'bg-ops-accent text-ops-accent-fg border-ops-accent'
                    : 'bg-ops-panel-2 text-ops-muted border-ops-border hover:border-ops-accent/50'
                }`}
              >
                <m.icono className="w-5 h-5" />
                {m.label}
              </button>
            ))}
          </div>

          {cantidadLinea > 1 && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <label
                htmlFor="descuento-unidades"
                className="text-sm font-bold text-ops-ink"
              >
                ¿A cuántas de las {cantidadLinea}?
              </label>
              <input
                id="descuento-unidades"
                type="number"
                inputMode="numeric"
                min="1"
                max={cantidadLinea}
                value={unidades}
                onChange={(e) => {
                  setUnidades(e.target.value.replace(/[^0-9]/g, ''));
                  setError('');
                }}
                className="w-20 text-center text-2xl font-black py-2 bg-ops-panel-2 border-2 border-ops-field rounded-ui text-ops-ink outline-none focus:border-ops-accent"
              />
            </div>
          )}

          {modo !== 'cortesia' ? (
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && intentar()}
              placeholder={modo === 'pct' ? '% de descuento' : '$ a descontar'}
              className="w-full text-center text-3xl font-black py-4 bg-ops-panel-2 border-2 border-ops-field rounded-ui text-ops-ink outline-none focus:border-ops-accent"
            />
          ) : (
            <p className="text-sm text-ops-muted bg-ops-panel-2 border border-ops-border rounded-ui p-4">
              El producto se cobra en <strong>cero</strong>. Sigue apareciendo
              en la comanda y en el ticket, y el insumo ya se descontó del
              inventario — una cortesía no devuelve mercancía.
            </p>
          )}

          {preview && (
            <p className="text-center text-sm text-ops-muted mt-4">
              Queda en{' '}
              <strong className="text-ops-ok text-lg">
                {formatoDinero(preview.neto)}
              </strong>{' '}
              <span className="text-ops-danger">
                (−{formatoDinero(preview.descuento)})
              </span>
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-sm font-bold text-ops-danger text-center mt-4">
          {error}
        </p>
      )}
    </OpsModal>
  );
}
