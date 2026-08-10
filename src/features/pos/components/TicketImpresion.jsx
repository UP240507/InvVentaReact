import { X, Printer, Receipt } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { construirTicket, MARCA } from '../../../lib/Comanda';

/**
 * Ticket en pantalla — y en el navegador al darle a Imprimir.
 *
 * NO calcula nada. Pinta el mismo documento que `construirTicket` le manda al
 * hub para la impresora térmica. Antes esta pantalla rehacía por su cuenta el
 * neto de cada línea, los totales y el pie, y esa duplicación ya estaba
 * cobrando: la fila de Descuento nunca se mostraba aunque el ticket de papel sí
 * la llevaba, el IVA decía "(16%)" escrito a mano aunque el motor fiscal
 * calculara otra tasa, y una reimpresión no salía marcada como copia.
 *
 * Papel y pantalla no pueden divergir si sólo hay un documento. Lo que cambia
 * entre los dos es el renderizador, no el contenido.
 *
 * El cuerpo se queda en negro sobre crema a propósito, en claro y en oscuro: se
 * imprime en papel, donde el tema del tenant no existe. Sólo el chrome del
 * modal se tematiza con tokens `ops-*`.
 */
export default function TicketImpresion({ venta, onClose }) {
  const { configuracion } = useAppStore();

  const doc = venta ? construirTicket(venta, { configuracion }) : null;
  if (!doc) return null;

  const handleImprimir = () => window.print();

  // La misma regla que en la térmica: lo que viene después del total
  // enfatizado ya no es desglose de la cuenta, es la liquidación —lo recibido
  // y el cambio—. Se separa con una regla para que nadie lea "Cambio" como un
  // cargo más.
  const corteTotales = (() => {
    const i = doc.totales.findIndex((t) => t.enfasis);
    return i >= 0 && i < doc.totales.length - 1 ? i : -1;
  })();

  return (
    <div className="fixed inset-0 bg-ops-ink/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
      <div className="flex flex-col max-h-[95vh] w-full max-w-sm animate-in slide-in-from-bottom-10">
        {/* BOTONERA SUPERIOR */}
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-ops-bg font-black font-syne tracking-widest uppercase text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Visualización de Ticket
          </h3>
          <button
            onClick={onClose}
            className="bg-ops-bg/10 hover:bg-ops-bg/20 text-ops-bg p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENEDOR DEL TICKET (apariencia de papel térmico) */}
        <div
          id="area-impresion"
          className="flex-1 overflow-y-auto bg-[#fffdf9] px-8 pt-8 pb-6 rounded-t-ui shadow-2xl relative"
        >
          {/* Borde dentado arriba */}
          <div
            className="absolute top-0 left-0 right-0 h-2"
            style={{
              backgroundImage:
                'radial-gradient(circle at 4px 0, transparent 4px, #fffdf9 4px)',
              backgroundSize: '10px 100%',
            }}
          ></div>

          {/* ── Encabezado ── */}
          <div className="text-center mb-5">
            <h2 className="font-black text-xl text-black uppercase tracking-widest font-mono leading-tight">
              {doc.titulo}
            </h2>
            {doc.subtitulo && (
              <p className="text-xs text-black font-mono mt-1">
                {doc.subtitulo}
              </p>
            )}
            {/* Datos fiscales del emisor: razón social, RFC, domicilio y
                teléfono. Una línea por dato, igual que en el papel.

                Se pinta aquí y no se omite porque pantalla y papel tienen que
                enseñar el MISMO documento — es la regla que se arregló el
                5-ago, cuando este componente rehacía los cálculos por su cuenta
                y ya divergía del papel. Al subir los datos fiscales de `pie` a
                `emisor`, no pintar el campo nuevo habría vuelto a abrir esa
                brecha, sólo que al revés. */}
            {(doc.emisor || []).map((dato, i) => (
              <p key={i} className="text-xs text-black font-mono leading-tight">
                {dato}
              </p>
            ))}
          </div>

          {/* ── Avisos (reimpresión) ── */}
          {doc.avisos.length > 0 && (
            <div className="border-2 border-black py-1.5 px-2 mb-4 text-center">
              {doc.avisos.map((aviso, i) => (
                <p
                  key={i}
                  className="text-[10px] font-mono font-black text-black uppercase leading-tight"
                >
                  {aviso}
                </p>
              ))}
            </div>
          )}

          {/* ── Meta ── */}
          <div className="border-y-2 border-dashed border-gray-300 py-3 mb-4 text-xs font-mono text-black space-y-1">
            {doc.meta
              .filter((m) => m.valor)
              .map((m) => (
                <div key={m.etiqueta} className="flex justify-between gap-2">
                  <span>{m.etiqueta}:</span>
                  <span className="font-bold text-right">{m.valor}</span>
                </div>
              ))}
          </div>

          {/* ── Cuerpo ── */}
          <table className="w-full text-xs font-mono text-black mb-4">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left pb-1 font-bold">CANT</th>
                <th className="text-left pb-1 font-bold">DESCRIPCIÓN</th>
                <th className="text-right pb-1 font-bold">IMPORTE</th>
              </tr>
            </thead>
            <tbody>
              {doc.cuerpo.map((linea, i) => (
                <tr key={i}>
                  <td className="py-1 align-top whitespace-nowrap">
                    {linea.cantidad}
                  </td>
                  <td className="py-1 align-top px-1">
                    {linea.nombre}
                    {linea.sublineas.length > 0 && (
                      <div className="text-[9px] leading-tight text-gray-600">
                        {linea.sublineas.map((s, j) => (
                          <div key={j}>{s.trim()}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-1 align-top text-right whitespace-nowrap">
                    {linea.importe}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Totales ── */}
          <div className="border-t-2 border-dashed border-gray-300 pt-3 text-xs font-mono text-black">
            {doc.totales.map((t, i) => (
              <div
                key={t.etiqueta}
                className={
                  t.enfasis
                    ? 'flex justify-between text-base font-black mt-2'
                    : 'flex justify-between py-0.5' +
                      (i === corteTotales + 1
                        ? ' mt-2 pt-2 border-t border-dashed border-gray-300'
                        : '')
                }
              >
                <span>{t.etiqueta}:</span>
                <span>{t.valor}</span>
              </div>
            ))}
          </div>

          {/* ── Pie ── */}
          <div className="border-t border-gray-300 mt-4 pt-4 text-[10px] font-mono text-center text-black leading-relaxed">
            {doc.pie.map((p, i) =>
              p ? <p key={i}>{p}</p> : <div key={i} className="h-2" />,
            )}
          </div>

          {/*
            ── Marca ──
            No sale del documento ni de `configuracion`: no hay condición que
            consultar. Ver el comentario de MARCA en lib/Comanda.js.
          */}
          <p
            data-testid="marca"
            className="mt-5 text-center text-[11px] font-mono tracking-[0.25em] text-black"
          >
            {MARCA}
          </p>
        </div>

        {/* ACCIONES — sólo el chrome se tematiza */}
        <div className="bg-ops-panel-2 p-4 rounded-b-ui border-t border-ops-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-ops-muted font-bold rounded-ui hover:bg-ops-panel transition-colors"
          >
            Cerrar Venta
          </button>
          <button
            onClick={handleImprimir}
            className="flex-1 py-3 bg-ops-cobro text-ops-cobro-fg font-black rounded-ui shadow-lg shadow-ops-cobro/20 transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
