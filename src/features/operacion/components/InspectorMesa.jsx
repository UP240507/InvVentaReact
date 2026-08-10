// ─── INSPECTOR CONTEXTUAL DE MESA (Proyecto D · tanda 4) ─────────────────────
// Todo lo de la mesa seleccionada sin salir del mapa. Antes había que entrar al
// POS solo para ver qué llevaba consumido.
//
// Superficie INDUSTRIAL (obsidiana/cesped/arrecife, targets grandes): esto es
// operación, no admin. Del mock se toma la ESTRUCTURA —inspector a la derecha,
// atajos al pie—, no la paleta editorial.
//
// Es un componente tonto: recibe la mesa y los callbacks ya resueltos. Las
// reglas (quién puede cobrar, si hay rondas sin entregar) viven en la pantalla
// y en los handlers, no aquí.
//
// ── NO TRAE FIGURA (roadmap 3.10) ───────────────────────────────────────────
// Antes era un `<aside className="hidden xl:flex w-80 …">`: se ponía a sí mismo
// el ancho, el borde y —lo importante— su propia condición de existir. Por
// debajo de 1280 px no se pintaba, así que el mesero con la tablet en la mano,
// que es justo quien no puede acercarse a la caja a mirar, era el único que se
// quedaba sin él.
//
// Ahora la figura la pone `PanelAcoplable` —columna acoplada o hoja desde
// abajo— y esto es sólo el contenido. Un componente que decide dónde vive es un
// componente que hay que convencer cada vez que se quiere en otro sitio.

import {
  Users,
  Clock,
  MapPin,
  UserCheck,
  BookMarked,
  ChefHat,
  BellRing,
  CreditCard,
  ArrowRightLeft,
  Link2,
  Edit2,
  MousePointerClick,
} from 'lucide-react';

const dinero = (n) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const ESTADO_UI = {
  libre: { texto: 'Libre', clase: 'text-ops-ok' },
  ocupada: { texto: 'Ocupada', clase: 'text-ops-danger' },
  por_cobrar: {
    texto: 'Pidió la cuenta',
    clase: 'text-ops-warn',
  },
  reservada: {
    texto: 'Reservada',
    clase: 'text-ops-accent',
  },
};

// Tecla + acción, como en el pie del inspector del mock.
function Accion({ tecla, icono: Icono, children, onClick, disabled, tono }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-ui font-bold text-sm border-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${
        tono === 'primario'
          ? 'bg-ops-danger border-ops-danger text-ops-danger-fg hover:opacity-90'
          : 'bg-white dark:bg-ops-bg border-ops-border text-ops-ink hover:border-ops-accent'
      }`}
    >
      <Icono className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-left">{children}</span>
      <kbd
        className={`text-[10px] font-black px-1.5 py-0.5 rounded-ui border ${
          tono === 'primario'
            ? 'border-white/40'
            : 'border-ops-border text-ops-muted'
        }`}
      >
        {tecla}
      </kbd>
    </button>
  );
}

export default function InspectorMesa({
  mesa,
  mesero,
  capacidad,
  minutosAbierta,
  rondasEnProduccion,
  rondaLista,
  onAbrir,
  onReservar,
  onTraspasar,
  onJuntar,
  onEditar,
}) {
  // Sólo se ve en la figura acoplada: la hoja no se abre sin mesa. Es el estado
  // que justifica que la columna esté ahí antes de que haya nada que enseñar.
  if (!mesa) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center">
        <MousePointerClick className="w-10 h-10 text-ops-muted mb-3" />
        <p className="font-bold text-ops-muted text-sm">Selecciona una mesa</p>
        <p className="text-xs text-ops-muted mt-1">
          Con el ratón o moviéndote con las flechas.
        </p>
      </div>
    );
  }

  const estado = ESTADO_UI[mesa.estado] || ESTADO_UI.libre;
  const items = mesa.orden_actual?.items || [];
  const total = Number(mesa.orden_actual?.total || 0);
  const ocupada = ['ocupada', 'por_cobrar'].includes(mesa.estado);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Cabecera */}
      <div className="p-5 border-b border-ops-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-2xl font-black font-syne text-ops-ink leading-none truncate">
            {mesa.nombre}
          </h2>
          <span
            className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${estado.clase}`}
          >
            {estado.texto}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-ops-muted font-bold">
          {mesa.zona && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {mesa.zona}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {ocupada ? `${mesa.comensales_reales || 0}/` : ''}
            {capacidad}
          </span>
        </div>

        {mesero && (
          <p className="mt-2 text-xs text-ops-muted flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> Atiende {mesero.nombre}
          </p>
        )}
      </div>

      {/* Cifra grande: lo que se lee a un metro de distancia */}
      <div className="p-5 border-b border-ops-border shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-1">
          Cuenta actual
        </p>
        <p className="text-4xl font-black font-syne text-ops-ok leading-none tabular-nums">
          {dinero(total)}
        </p>
        {ocupada && minutosAbierta != null && (
          <p className="mt-2 text-xs text-ops-muted flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {minutosAbierta < 60
              ? `${minutosAbierta} min abierta`
              : `${Math.floor(minutosAbierta / 60)}h ${minutosAbierta % 60}m abierta`}
          </p>
        )}
      </div>

      {/* Estado de cocina: lo primero que pregunta el cliente */}
      {(rondaLista || rondasEnProduccion > 0) && (
        <div className="px-5 py-3 border-b border-ops-border shrink-0">
          {rondaLista ? (
            <p className="flex items-center gap-2 text-sm font-black text-ops-ok">
              <BellRing className="w-4 h-4 shrink-0" /> Lista para entregar
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-bold text-ops-muted">
              <ChefHat className="w-4 h-4 shrink-0" />
              {rondasEnProduccion} ronda
              {rondasEnProduccion !== 1 ? 's' : ''} en producción
            </p>
          )}
        </div>
      )}

      {/* Reserva */}
      {mesa.estado === 'reservada' && mesa.reserva && (
        <div className="px-5 py-3 border-b border-ops-border shrink-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ops-accent">
            <BookMarked className="w-4 h-4 shrink-0" />
            {mesa.reserva.nombre || 'Reservada'}
          </p>
          {mesa.reserva.hora && (
            <p className="text-xs text-ops-muted mt-0.5 pl-6">
              Para las {mesa.reserva.hora}
            </p>
          )}
        </div>
      )}

      {/* Líneas de la cuenta */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 min-h-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-ops-muted mb-3">
          {items.length > 0 ? 'Consumo' : 'Sin consumo'}
        </p>
        {items.length === 0 ? (
          <p className="text-xs text-ops-muted">
            {mesa.estado === 'libre'
              ? 'La mesa está libre. Ábrela para tomar la orden.'
              : 'Todavía no se ha mandado nada a producción.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li
                key={it.id ?? i}
                className="flex items-start gap-2 text-sm text-ops-ink"
              >
                <span className="font-black text-ops-muted tabular-nums shrink-0">
                  {Number(it.cantidad) || 1}×
                </span>
                <span className="flex-1 min-w-0 leading-snug">{it.nombre}</span>
                <span className="font-bold tabular-nums shrink-0">
                  {dinero(
                    (Number(it.precio) || 0) * (Number(it.cantidad) || 1),
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Acciones, con sus teclas a la vista (registro de la tanda 3) */}
      <div className="p-4 border-t border-ops-border space-y-2 shrink-0 bg-ops-panel-2">
        <Accion
          tecla="Enter"
          icono={mesa.estado === 'por_cobrar' ? CreditCard : ChefHat}
          tono="primario"
          onClick={onAbrir}
        >
          {mesa.estado === 'por_cobrar' ? 'Cobrar' : 'Abrir en el POS'}
        </Accion>
        <Accion
          tecla="R"
          icono={BookMarked}
          onClick={onReservar}
          disabled={ocupada}
        >
          {mesa.estado === 'reservada' ? 'Liberar reserva' : 'Reservar'}
        </Accion>
        <Accion
          tecla="T"
          icono={ArrowRightLeft}
          onClick={onTraspasar}
          disabled={!ocupada || items.length === 0}
        >
          Traspasar cuenta
        </Accion>
        <div className="grid grid-cols-2 gap-2">
          <Accion tecla="J" icono={Link2} onClick={onJuntar}>
            Juntar
          </Accion>
          <Accion tecla="E" icono={Edit2} onClick={onEditar}>
            Editar
          </Accion>
        </div>
      </div>
    </div>
  );
}
