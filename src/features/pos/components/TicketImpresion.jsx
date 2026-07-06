import { X, Printer, Receipt } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';

export default function TicketImpresion({ venta, onClose }) {
  const { configuracion } = useAppStore();
  const esOscuro = document.documentElement.classList.contains('dark');

  const handleImprimir = () => {
    // Si estás usando una app nativa, aquí enviarías el comando a la impresora Bluetooth/Red
    window.print();
  };

  if (!venta) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 dark:bg-ui-obsidiana/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
      <div className="flex flex-col max-h-[95vh] w-full max-w-sm animate-in slide-in-from-bottom-10">
        
        {/* BOTONERA SUPERIOR */}
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-white font-black font-syne tracking-widest uppercase text-sm flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Visualización de Ticket
          </h3>
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"><X className="w-5 h-5"/></button>
        </div>

        {/* CONTENEDOR DEL TICKET (Apariencia de Papel Térmico) */}
        {/* El ticket siempre mantiene un tono claro/crema simulando papel térmico, incluso en dark mode */}
        <div id="area-impresion" className="flex-1 overflow-y-auto bg-[#fffdf9] p-8 rounded-t-xl shadow-2xl relative">
          
          {/* Borde dentado arriba */}
          <div className="absolute top-0 left-0 right-0 h-2" style={{ backgroundImage: 'radial-gradient(circle at 4px 0, transparent 4px, #fffdf9 4px)', backgroundSize: '10px 100%' }}></div>

          <div className="text-center mb-6">
            <h2 className="font-black text-xl text-black uppercase tracking-widest font-mono">{configuracion?.nombre_restaurante || 'AZUL RESTAURANTE'}</h2>
            <p className="text-xs text-black font-mono mt-1">{configuracion?.direccion || 'Centro, Aguascalientes, Ags.'}</p>
            <p className="text-xs text-black font-mono">RFC: {configuracion?.rfc || 'XAXX010101000'}</p>
          </div>

          <div className="border-y-2 border-dashed border-gray-300 py-3 mb-4 text-xs font-mono text-black space-y-1">
            <div className="flex justify-between"><span>Folio:</span> <span className="font-bold">{venta.folio}</span></div>
            <div className="flex justify-between"><span>Fecha:</span> <span>{new Date(venta.fecha).toLocaleDateString('es-MX')}</span></div>
            <div className="flex justify-between"><span>Hora:</span> <span>{new Date(venta.fecha).toLocaleTimeString('es-MX')}</span></div>
            <div className="flex justify-between"><span>Atendió:</span> <span>{venta.usuario || 'Cajero'}</span></div>
            <div className="flex justify-between"><span>Mesa:</span> <span>{venta.mesa_nombre || 'Mostrador'}</span></div>
          </div>

          <div className="mb-4">
            <table className="w-full text-xs font-mono text-black">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left pb-1 font-bold">CANT</th>
                  <th className="text-left pb-1 font-bold">DESCRIPCIÓN</th>
                  <th className="text-right pb-1 font-bold">IMPORTE</th>
                </tr>
              </thead>
              <tbody>
                {(venta.items || []).map((item, index) => (
                  <tr key={index}>
                    <td className="py-1 align-top">{item.cantidad}</td>
                    <td className="py-1 align-top px-1">{item.nombre}</td>
                    <td className="py-1 align-top text-right">${((item.precio || 0) * (item.cantidad || 1)).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t-2 border-dashed border-gray-300 pt-3 space-y-1 text-xs font-mono text-black">
            <div className="flex justify-between"><span>SUBTOTAL:</span> <span>${(venta.subtotal || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span></div>
            <div className="flex justify-between"><span>IVA (16%):</span> <span>${(venta.iva || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span></div>
            {Number(venta.propina) > 0 && (
              <div className="flex justify-between font-bold"><span>PROPINA:</span> <span>${Number(venta.propina).toLocaleString('es-MX', {minimumFractionDigits:2})}</span></div>
            )}
            <div className="flex justify-between text-base font-black mt-2">
              <span>TOTAL:</span> <span>${(venta.total || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
          </div>

          <div className="border-t border-gray-300 mt-4 pt-4 text-[10px] font-mono text-center text-black">
            <p>MÉTODO DE PAGO: <span className="font-bold uppercase">{venta.metodo_pago}</span></p>
            {venta.metodo_pago === 'efectivo' && (
               <div className="flex justify-center gap-4 mt-1">
                 <span>Recibido: ${venta.efectivo?.toLocaleString('es-MX',{minimumFractionDigits:2})}</span>
                 <span>Cambio: ${venta.cambio_entregado?.toLocaleString('es-MX',{minimumFractionDigits:2})}</span>
               </div>
            )}
            <p className="mt-4 font-bold">¡GRACIAS POR SU VISITA!</p>
            <p className="mt-1 text-gray-500">Este no es un comprobante fiscal.</p>
          </div>
          
        </div>

        {/* ACCIONES DEL TICKET */}
        <div className="bg-slate-800 dark:bg-ui-obsidiana p-4 rounded-b-xl border-t border-slate-700 dark:border-ui-border flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-slate-300 dark:text-ui-muted font-bold rounded-xl hover:bg-slate-700 dark:hover:bg-ui-border transition-colors">
            Cerrar Venta
          </button>
          <button onClick={handleImprimir} className="flex-1 py-3 bg-brand-arrecife hover:bg-orange-600 text-white dark:text-ui-obsidiana font-black rounded-xl shadow-lg shadow-brand-arrecife/20 transition-transform active:scale-95 flex items-center justify-center gap-2">
            <Printer className="w-5 h-5" /> Imprimir
          </button>
        </div>

      </div>
    </div>
  );
}