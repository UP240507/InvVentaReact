// ─── DIAGNÓSTICO DE SINCRONIZACIÓN (dead-letter) ─────────────────────────────
// La alerta crítica del Dashboard decía "N cambios sin sincronizar · Diagnosticar"
// y llevaba a /auditoria, donde no había NADA que diagnosticar. El store ya
// exponía listar/reencolar/descartar desde hace tiempo; faltaba la pantalla.
//
// Por qué importa más que otras pantallas: una tarea en dead-letter es un cambio
// que el usuario vio confirmado en la interfaz y que NO está en Supabase. El
// número solo, sin poder abrirlo, es peor que no mostrarlo: informa de una
// pérdida sin decir cuál ni permitir arreglarla.
//
// Las dos acciones son deliberadamente distintas:
//   · Reintentar  — para fallos ya corregidos (una policy, una columna que
//                   faltaba). Vuelve a la cola con los intentos a cero.
//   · Descartar   — reconoce que ese cambio se perdió. No lo "arregla": lo
//                   saca de la lista para que el contador vuelva a significar
//                   algo. Por eso pide confirmación y muestra el payload antes.

import { useState, useEffect, useCallback } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { AlertOctagon, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import {
  Card,
  CardBody,
  Button,
  Chip,
  IconButton,
  ConfirmModal,
} from '../../components/ui';

const fechaLegible = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
};

// Un resumen humano de la fila que se perdió. El payload crudo está a un clic,
// pero para decidir "reintentar o descartar" casi siempre basta con esto.
const resumenFila = (data) => {
  if (!data || typeof data !== 'object') return '';
  const campos = [
    'concepto',
    'nombre',
    'folio',
    'empleado_nombre',
    'total',
    'monto',
  ];
  const partes = campos
    .filter((c) => data[c] != null && data[c] !== '')
    .map((c) => `${c}: ${data[c]}`);
  return partes.slice(0, 3).join(' · ');
};

export default function PanelDeadLetter() {
  const deadTasks = useSyncStore((s) => s.deadTasks);
  const listarDeadLetter = useSyncStore((s) => s.listarDeadLetter);
  const reencolarDeadLetter = useSyncStore((s) => s.reencolarDeadLetter);
  const descartarDeadLetter = useSyncStore((s) => s.descartarDeadLetter);

  const [items, setItems] = useState([]);
  const [abierto, setAbierto] = useState(null); // id con el payload desplegado
  const [aDescartar, setADescartar] = useState(null); // item | 'todas'

  const recargar = useCallback(async () => {
    const filas = await listarDeadLetter();
    setItems(filas);
  }, [listarDeadLetter]);

  // Depende de deadTasks para refrescarse solo cuando el contador cambia (p. ej.
  // al reencolar con éxito), sin sondear la base cada tantos segundos.
  // El flag `vivo` evita escribir estado si la pantalla se cerró mientras Dexie
  // respondía: la cola se procesa en segundo plano y puede tardar.
  useEffect(() => {
    let vivo = true;
    listarDeadLetter().then((filas) => {
      if (vivo) setItems(filas);
    });
    return () => {
      vivo = false;
    };
  }, [listarDeadLetter, deadTasks]);

  if (deadTasks === 0 && items.length === 0) return null;

  const reintentar = async (item) => {
    await reencolarDeadLetter(item.id);
    recargar();
  };

  const confirmarDescarte = async () => {
    if (aDescartar === 'todas') await descartarDeadLetter();
    else if (aDescartar) await descartarDeadLetter(aDescartar.id);
    setADescartar(null);
    recargar();
  };

  return (
    <>
      <Card className="mb-5 border-adm-danger/40">
        <CardBody>
          <div className="flex items-start gap-3 mb-4">
            <AlertOctagon className="w-5 h-5 text-adm-danger shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h2 className="font-fraunces font-bold text-lg text-adm-ink">
                {items.length} cambio{items.length !== 1 ? 's' : ''} sin
                sincronizar
              </h2>
              <p className="text-sm text-adm-muted">
                Fallaron de forma permanente y ya no se reintentan solos. Están
                guardados en este equipo, pero{' '}
                <strong className="text-adm-ink">no en la nube</strong>: si
                borras los datos del navegador, se pierden.
              </p>
            </div>
            {items.length > 1 && (
              <Button
                variante="secundario"
                tamano="sm"
                icono={Trash2}
                className="shrink-0"
                onClick={() => setADescartar('todas')}
              >
                Descartar todas
              </Button>
            )}
          </div>

          <ul className="divide-y divide-adm-border border border-adm-border rounded-ui">
            {items.map((it) => {
              const resumen = resumenFila(it.data);
              return (
                <li key={it.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-adm-ink truncate flex items-center gap-2">
                        {it.tabla}
                        <Chip>{it.metodo}</Chip>
                        <Chip tono="peligro">{it.motivo}</Chip>
                      </p>
                      <p className="text-xs text-adm-muted truncate">
                        {fechaLegible(it.fecha_error)}
                        {resumen && ` · ${resumen}`}
                      </p>
                      <p className="text-xs text-adm-danger mt-0.5 break-words">
                        {it.lastError}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <IconButton
                        icono={ChevronDown}
                        titulo="Ver el dato completo"
                        onClick={() =>
                          setAbierto(abierto === it.id ? null : it.id)
                        }
                      />
                      <IconButton
                        icono={RefreshCw}
                        titulo="Reintentar"
                        onClick={() => reintentar(it)}
                      />
                      <IconButton
                        icono={Trash2}
                        titulo="Descartar"
                        className="hover:text-adm-danger"
                        onClick={() => setADescartar(it)}
                      />
                    </div>
                  </div>
                  {abierto === it.id && (
                    <pre className="mt-2 p-3 bg-adm-bg border border-adm-border rounded-ui text-[11px] text-adm-muted overflow-x-auto custom-scrollbar">
                      {JSON.stringify(it.data, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {aDescartar && (
        <ConfirmModal
          icono={AlertOctagon}
          titulo={
            aDescartar === 'todas'
              ? '¿Descartar todos los cambios?'
              : '¿Descartar el cambio?'
          }
          textoConfirmar="Descartar"
          onCancelar={() => setADescartar(null)}
          onConfirmar={confirmarDescarte}
          mensaje={
            aDescartar === 'todas' ? (
              <>
                Los {items.length} cambios se borran de este equipo y{' '}
                <strong className="text-adm-ink">no llegarán nunca</strong> a la
                nube. Si aún no sabes por qué fallaron, revísalos uno por uno
                antes: descartar no arregla la causa.
              </>
            ) : (
              <>
                El cambio en{' '}
                <strong className="text-adm-ink">{aDescartar.tabla}</strong> se
                borra de este equipo y no llegará a la nube. Esto no arregla la
                causa del fallo: si se repite, volverá a aparecer aquí.
              </>
            )
          }
        />
      )}
    </>
  );
}
