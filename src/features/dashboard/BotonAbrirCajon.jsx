// src/features/dashboard/BotonAbrirCajon.jsx
//
// Abrir el cajón FUERA de una venta: contar a media tarde, cambiar un billete
// grande, sacar el efectivo al cerrar.
//
// ── POR QUÉ ESTE BOTÓN ES LA PIEZA QUE FALTABA ───────────────────────────────
//
// Hasta hoy **no existía ninguna forma de abrir el cajón sin cobrar**, y ésa es
// exactamente la razón por la que hay una llave en la caja. Mientras no exista,
// quitar la llave no es una decisión que se pueda tomar
// (`docs/DISENO_ARQUEO_Y_CAJON.md` §2).
//
// ── EL PIN NO ES UN CANDADO: ES DE DÓNDE SALE EL NOMBRE ──────────────────────
//
// La tesis del diseño es que el control es el registro. Este cuadro pide un PIN
// para saber QUIÉN abre, no para decidir si puede: `abre_cajon` la tiene el
// cajero porque abrir el cajón es su trabajo. Lo que hace que valga es que cada
// uso queda con su nombre.
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Button, Modal, Input, Field } from '../../components/ui';
import { KeyRound } from 'lucide-react';
import { buscarAutorizador } from '../../lib/Autorizacion';
import { abrirCajonConRegistro, MOTIVOS } from '../../lib/Cajon';
import { abrirCajon } from '../../lib/Hub';

export default function BotonAbrirCajon({ abrir = abrirCajon }) {
  const { staff, roles_permisos, registrarAuditoria, showToast } =
    useAppStore();

  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [pin, setPin] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cerrar = () => {
    setPidiendoPin(false);
    setPin('');
  };

  const confirmar = async (e) => {
    e.preventDefault();
    if (ocupado) return;

    const quien = buscarAutorizador({
      staff,
      roles_permisos,
      pin,
      flag: 'abre_cajon',
    });

    // Un PIN que no corresponde a nadie con la capacidad NO abre y NO registra:
    // registrar un intento fallido como si fuera una apertura ensuciaría
    // justamente el dato que este módulo existe para poder creerse.
    if (!quien) {
      setPin('');
      return showToast('Ese PIN no puede abrir el cajón.', 'error');
    }

    setOcupado(true);
    const r = await abrirCajonConRegistro({
      motivo: MOTIVOS.MANUAL,
      usuario: quien.nombre,
      abrir,
      registrar: registrarAuditoria,
    });
    setOcupado(false);
    cerrar();

    // Se dice la verdad en los dos casos. Que no abra significa que habrá que
    // usar la llave, y eso ya quedó escrito en Auditoría.
    showToast(
      r.ok
        ? `Cajón abierto por ${quien.nombre}.`
        : 'El cajón no respondió. Quedó registrado el intento.',
      r.ok ? 'success' : 'error',
    );
  };

  return (
    <>
      <Button
        variante="secundario"
        icono={KeyRound}
        onClick={() => setPidiendoPin(true)}
      >
        Abrir cajón
      </Button>

      {pidiendoPin && (
        <Modal
          as="form"
          onSubmit={confirmar}
          titulo="Abrir el cajón"
          onClose={cerrar}
          ancho="max-w-sm"
          pie={
            <>
              <Button type="button" variante="fantasma" onClick={cerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={ocupado}>
                {ocupado ? 'Abriendo…' : 'Abrir'}
              </Button>
            </>
          }
        >
          <p className="text-xs font-bold text-adm-muted mb-4">
            Teclea tu PIN. <strong>Queda registrado quién lo abrió</strong>, con
            la hora.
          </p>
          <Field label="PIN" requerido>
            <Input
              aria-label="PIN para abrir el cajón"
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(ev) => setPin(ev.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </Field>
        </Modal>
      )}
    </>
  );
}
