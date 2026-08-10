// ─── Diagnóstico del hub de impresión (fase 3) ───────────────────────────────
// Esta pantalla existe para el día que haya hardware delante. Todo lo que puede
// fallar en una prueba con impresora real —el nombre de la impresora, la ruta
// de los bytes, la cola atascada, el maquetado del ticket— se ve y se acciona
// desde aquí, sin abrir una terminal ni recompilar.
//
// La lección que la hereda: el panel dead-letter de la fase 2.5. Un contador de
// errores que no lleva a ningún sitio es peor que no mostrar el número. Aquí
// cada fallo trae su motivo y sus dos salidas: reintentar o descartar.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Play,
  Eye,
  Server,
  AlertTriangle,
  CheckCircle2,
  QrCode,
  Smartphone,
  Ban,
} from 'lucide-react';

import {
  PageShell,
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  Input,
  Select,
  Chip,
  EmptyState,
} from '../../components/ui';
import { useAppStore } from '../../store/useAppStore';
import { documentoDePrueba } from '../../lib/Comanda';
import {
  useConectividad,
  motivoSinImpresion,
} from '../../hooks/useConectividad';
import {
  estado as leerEstado,
  cola as leerCola,
  imprimir,
  previsualizar,
  reintentarFallidos,
  descartarFallidos,
  configurarImpresora,
  listarDispositivos,
  revocarDispositivo,
  enlacePairing,
  enTauri,
} from '../../lib/Hub';
import { generar, aSvg } from '../../lib/QR';

/**
 * Estado + detalle de la cola en una sola lectura.
 *
 * Van juntos porque `/salud` trae el RESUMEN (tres contadores) pero no la lista
 * de trabajos fallidos, y una pantalla que dice "2 fallidos" sin decir cuáles
 * es exactamente el contador-que-no-lleva-a-ningún-lado que se corrigió en la
 * fase 2.5 con el panel dead-letter. Desde la caja el detalle llegaba por IPC;
 * desde un teléfono habría faltado, y eso se habría descubierto en mitad de la
 * prueba con hardware.
 */
async function leerTodo() {
  const [salud, detalle, equipos] = await Promise.all([
    leerEstado(),
    leerCola(),
    listarDispositivos(),
  ]);
  return {
    ...salud,
    fallidos: detalle?.fallidos || [],
    cola: detalle?.resumen || salud?.cola || salud?.resumen || {},
    dispositivos: equipos?.dispositivos || [],
  };
}

/** "hace 3 min" en vez de una marca de tiempo que hay que traducir a mano. */
function hace(ms) {
  if (!ms) return '—';
  const seg = Math.max(0, Math.floor((Date.now() - Number(ms)) / 1000));
  if (seg < 60) return 'ahora mismo';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return `hace ${Math.floor(seg / 86400)} d`;
}

export default function HubScreen() {
  const { configuracion, showToast } = useAppStore();

  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('');
  const [tipoTransporte, setTipoTransporte] = useState('simulador');
  const [impresora, setImpresora] = useState('');
  const [host, setHost] = useState('');
  const [puerto, setPuerto] = useState('9100');

  const refrescar = useCallback(async () => {
    setCargando(true);
    const r = await leerTodo();
    setInfo(r);
    setCargando(false);
  }, []);

  useEffect(() => {
    // El sondeo es una SUSCRIPCIÓN a un sistema externo (el hub), no un
    // cálculo derivado del estado: por eso vive en un efecto y por eso el
    // setState ocurre después del `await`, nunca en el cuerpo síncrono.
    //
    // 5 segundos: la cola cambia sola cuando la impresora vuelve, y durante
    // una prueba con hardware hay que ver ese cambio sin estar pulsando
    // "Actualizar" con la otra mano.
    let vivo = true;

    const sondear = async () => {
      const r = await leerTodo();
      // Sin esta guarda, salir de la pantalla mientras vuela una petición deja
      // un setState sobre un componente ya desmontado.
      if (!vivo) return;
      setInfo(r);
      setCargando(false);
    };

    sondear();
    const t = setInterval(sondear, 5000);

    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  const activo = info?.activo;
  const resumen = info?.cola || info?.resumen || {};
  const fallidos = info?.fallidos || [];
  const dispositivos = info?.dispositivos || [];

  // El QR se recalcula solo cuando cambian la URL o el token, no en cada
  // sondeo de 5 segundos: generarlo es aritmética barata pero no gratis, y
  // repintarlo cada pocos segundos haría parpadear la imagen justo cuando
  // alguien intenta enfocarla con la cámara.
  const url = info?.url || '';
  const token = info?.token || '';

  const svgQr = useMemo(() => {
    if (!activo || !url || !token) return '';
    const matriz = generar(enlacePairing({ url, token }));
    return matriz ? aSvg(matriz, { tamano: 220 }) : '';
  }, [activo, url, token]);

  const alRevocar = async (d) => {
    const r = await revocarDispositivo(d.id);
    if (r.ok) {
      showToast(`«${d.nombre}» ya no puede imprimir`, 'success');
      refrescar();
    } else {
      showToast(r.error, 'error');
    }
  };

  const alPrevisualizar = async () => {
    const r = await previsualizar(documentoDePrueba({ configuracion }));
    if (r.ok) setVista(r.texto);
    else showToast(`No se pudo previsualizar: ${r.error}`, 'error');
  };

  // Sin hub no hay papel. Se pregunta ANTES de ofrecer el botón, en vez de
  // dejar que falle al pulsarlo: `Hub.estado()` existía para esto y no lo
  // llamaba nadie.
  const { local, comprobandoLocal } = useConectividad();
  const motivoSinPapel = motivoSinImpresion({ local, comprobandoLocal });

  const alImprimirPrueba = async () => {
    const r = await imprimir(documentoDePrueba({ configuracion }));
    if (r.ok) {
      showToast(
        r.estado === 'duplicado'
          ? 'Ya estaba en la cola'
          : 'Enviado a la cola de impresión',
        'success',
      );
      refrescar();
    } else {
      showToast(`No se pudo encolar: ${r.error}`, 'error');
    }
  };

  const alGuardarImpresora = async () => {
    let transporte;
    if (tipoTransporte === 'windows') {
      if (!impresora.trim())
        return showToast('Elige una impresora de la lista', 'error');
      transporte = { tipo: 'windows', impresora: impresora.trim() };
    } else if (tipoTransporte === 'tcp') {
      if (!host.trim())
        return showToast('Falta la IP de la impresora', 'error');
      transporte = {
        tipo: 'tcp',
        host: host.trim(),
        puerto: Number(puerto) || 9100,
      };
    } else {
      transporte = { tipo: 'simulador', carpeta: null };
    }

    const r = await configurarImpresora(transporte);
    if (r.ok) {
      showToast(`Impresora: ${r.transporte}`, 'success');
      refrescar();
    } else {
      showToast(r.error, 'error');
    }
  };

  const alReintentar = async () => {
    const r = await reintentarFallidos();
    if (r.ok) {
      showToast(`${r.reencolados} trabajo(s) de vuelta en la cola`, 'success');
      refrescar();
    } else showToast(r.error, 'error');
  };

  const alDescartar = async () => {
    const r = await descartarFallidos();
    if (r.ok) {
      showToast(`${r.descartados} trabajo(s) descartado(s)`, 'info');
      refrescar();
    } else showToast(r.error, 'error');
  };

  return (
    <PageShell>
      <PageHeader
        titulo="Hub de impresión"
        descripcion="Estado del servidor local de la caja, la impresora y la cola."
        icono={Server}
        acciones={
          <Button
            variante="secundario"
            onClick={refrescar}
            disabled={cargando}
            icono={RefreshCw}
          >
            Actualizar
          </Button>
        }
      />

      {/* ── Estado ───────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-start gap-4">
            {activo ? (
              <Wifi className="w-6 h-6 text-adm-ok shrink-0 mt-0.5" />
            ) : (
              <WifiOff className="w-6 h-6 text-adm-danger shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-fraunces font-bold text-lg">
                {activo ? 'Hub activo' : 'Hub inactivo'}
              </p>
              {activo ? (
                <>
                  <p className="text-sm text-adm-muted mt-1">
                    Los dispositivos del local abren esta dirección para usar la
                    app e imprimir.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Dato etiqueta="Dirección" valor={info.url} mono />
                    <Dato etiqueta="Transporte" valor={resumen.transporte} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-adm-muted mt-1">
                  {/* Que el hub no esté no es fatal: la app cobra y guarda igual.
                      Se dice para que nadie interprete el silencio como que todo
                      va bien. */}
                  {info?.motivo ||
                    info?.error ||
                    'Esta pantalla se usa desde la caja. La app sigue cobrando y guardando sin hub; lo que no puede es imprimir.'}
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── Emparejamiento ───────────────────────────────────────────────── */}
      {activo && (
        <Card className="mb-6">
          <CardBody>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="shrink-0 mx-auto md:mx-0">
                {svgQr ? (
                  // Fondo blanco fijo, también en tema oscuro: un QR sobre
                  // superficie oscura no se escanea. El SVG ya trae su propio
                  // `rect` blanco, pero el marco lo hace evidente al montarlo.
                  <div
                    className="bg-white p-3 rounded-ui border border-adm-border"
                    // El SVG lo genera lib/QR.js, no viene de fuera.
                    dangerouslySetInnerHTML={{ __html: svgQr }}
                  />
                ) : (
                  <div className="w-[220px] h-[220px] rounded-ui border border-dashed border-adm-border flex items-center justify-center text-xs text-adm-muted text-center p-4">
                    Sin dirección de red: el hub no encontró la IP del equipo en
                    la LAN.
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-fraunces font-bold text-lg mb-1 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-adm-muted" />
                  Emparejar un dispositivo
                </h2>
                <p className="text-sm text-adm-muted mb-4">
                  Escanéalo con la cámara del teléfono. Un solo escaneo abre la
                  app y lo empareja: no hay que teclear la dirección ni copiar
                  ningún código.
                </p>

                <ul className="text-sm text-adm-muted space-y-1.5 mb-4 list-disc pl-5">
                  <li>El teléfono debe estar en el mismo wifi que la caja.</li>
                  <li>
                    {/* Se dice porque es la duda inmediata al ver un QR con un
                        token dentro. */}
                    El código del QR no da acceso permanente: sirve para
                    canjearlo por uno propio, y cada dispositivo aparece abajo
                    con su hora de alta.
                  </li>
                </ul>

                {/* La fecha del build que reciben los teléfonos.
                    En `tauri dev` esta ventana carga desde Vite —siempre al
                    día— pero la LAN recibe `dist/`. Cuando las dos se separan,
                    el móvil corre código viejo SIN dar ningún error: la app
                    abre, funciona, y las cosas nuevas simplemente no están.
                    Pasó el 5-ago y costó una vuelta de diagnóstico. */}
                {info?.web_ms ? (
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-wide text-adm-muted">
                      App que reciben los dispositivos
                    </p>
                    <p className="text-sm">
                      Compilada el{' '}
                      <span className="font-semibold">
                        {new Date(Number(info.web_ms)).toLocaleString('es-MX')}
                      </span>
                    </p>
                    <p className="text-xs text-adm-muted mt-1">
                      Si es anterior a tu último cambio, corre{' '}
                      <code className="font-mono">npm run build</code> y
                      reinicia: los teléfonos están viendo esa versión, no la de
                      esta ventana.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-adm-danger mb-3">
                    El hub no encontró el build de la app: los dispositivos no
                    van a poder cargarla. Corre <code>npm run build</code>.
                  </p>
                )}

                <Dato
                  etiqueta="Enlace que contiene el QR"
                  valor={enlacePairing({ url, token })}
                  mono
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Dispositivos emparejados ─────────────────────────────────────── */}
      {activo && (
        <Card className="mb-6">
          <CardBody>
            <h2 className="font-fraunces font-bold text-lg mb-1">
              Dispositivos emparejados
            </h2>
            <p className="text-sm text-adm-muted mb-4">
              Revocar uno lo deja sin imprimir de inmediato, sin tocar a los
              demás ni reiniciar la caja.
            </p>

            {dispositivos.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-adm-muted">
                <Smartphone className="w-4 h-4" />
                Todavía no hay ninguno. Escanea el QR desde un teléfono.
              </div>
            ) : (
              <ul className="space-y-2">
                {dispositivos.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 border border-adm-border rounded-ui p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">
                          {d.nombre}
                        </span>
                        <Chip>{d.rol}</Chip>
                      </div>
                      <p className="text-xs text-adm-muted mt-1">
                        Activo {hace(d.visto_ms)}
                      </p>
                    </div>
                    <Button
                      variante="peligro"
                      tamano="sm"
                      onClick={() => alRevocar(d)}
                      disabled={!enTauri()}
                      icono={Ban}
                    >
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {!enTauri() && dispositivos.length > 0 && (
              <p className="text-xs text-adm-muted mt-3">
                Los dispositivos se revocan desde la caja. Un teléfono puede
                imprimir, pero no echar del local a los demás.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Impresora ──────────────────────────────────────────────────── */}
        <Card>
          <CardBody>
            <h2 className="font-fraunces font-bold text-lg mb-1">Impresora</h2>
            <p className="text-sm text-adm-muted mb-4">
              El simulador escribe los tickets a disco: sirve para probar todo
              el circuito sin hardware.
            </p>

            <Field label="Cómo se conecta">
              <Select
                value={tipoTransporte}
                onChange={(e) => setTipoTransporte(e.target.value)}
              >
                <option value="simulador">Simulador (a disco)</option>
                <option value="windows">USB / Windows</option>
                <option value="tcp">Red (IP, puerto 9100)</option>
              </Select>
            </Field>

            {tipoTransporte === 'windows' && (
              <Field label="Impresora instalada" className="mt-4">
                {/* Se elige de la lista y no se teclea: en Windows suelen
                    llamarse "POS-58 Printer(1)" y un espacio de más deja la
                    caja sin imprimir sin decir por qué. */}
                <Select
                  value={impresora}
                  onChange={(e) => setImpresora(e.target.value)}
                >
                  <option value="">— elegir —</option>
                  {(info?.impresoras || []).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
                {(info?.impresoras || []).length === 0 && (
                  <p className="text-xs text-adm-muted mt-2">
                    No se detectaron impresoras. Conéctala e instala su driver,
                    luego pulsa Actualizar.
                  </p>
                )}
              </Field>
            )}

            {tipoTransporte === 'tcp' && (
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Field label="IP" className="col-span-2">
                  <Input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.50"
                  />
                </Field>
                <Field label="Puerto">
                  <Input
                    value={puerto}
                    onChange={(e) => setPuerto(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-5">
              <Button onClick={alGuardarImpresora} disabled={!enTauri()}>
                Guardar
              </Button>
              {/* El ÚNICO botón de la app que sólo sirve para imprimir. Los
                  demás —Pedir Cuenta, A Producción, cobrar— hacen trabajo de
                  negocio además del papel, así que apagarlos por no haber hub
                  bloquearía la operación en vez de degradarla: la venta tiene
                  que registrarse aunque no salga el ticket.

                  Aquí sí: sin caja al otro lado no hay nada que hacer, y un
                  botón que no puede funcionar debe decir por qué en vez de
                  fallar al pulsarlo. */}
              <Button
                variante="secundario"
                onClick={alImprimirPrueba}
                icono={Play}
                disabled={!!motivoSinPapel}
                title={motivoSinPapel || undefined}
              >
                {motivoSinPapel
                  ? `Imprimir prueba — ${motivoSinPapel}`
                  : 'Imprimir prueba'}
              </Button>
              <Button variante="fantasma" onClick={alPrevisualizar} icono={Eye}>
                Ver sin imprimir
              </Button>
            </div>

            {!enTauri() && (
              <p className="text-xs text-adm-muted mt-3">
                La impresora solo se configura desde la caja. Desde un teléfono
                sí se puede enviar a imprimir.
              </p>
            )}
          </CardBody>
        </Card>

        {/* ── Cola ───────────────────────────────────────────────────────── */}
        <Card>
          <CardBody>
            <h2 className="font-fraunces font-bold text-lg mb-1">
              Cola de impresión
            </h2>
            <p className="text-sm text-adm-muted mb-4">
              Si la impresora no responde, el ticket espera aquí. El cobro nunca
              se bloquea por papel.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <Metrica etiqueta="Pendientes" valor={resumen.pendientes ?? 0} />
              <Metrica
                etiqueta="Fallidos"
                valor={resumen.fallidos ?? 0}
                alerta={(resumen.fallidos ?? 0) > 0}
              />
              <Metrica etiqueta="Impresos" valor={resumen.impresos ?? 0} />
            </div>

            {resumen.ultimo_error && (
              <div className="flex items-start gap-2 text-sm text-adm-danger mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">
                  {resumen.ultimo_error}
                </span>
              </div>
            )}

            {fallidos.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-adm-muted">
                <CheckCircle2 className="w-4 h-4 text-adm-ok" />
                Sin trabajos fallidos.
              </div>
            ) : (
              <>
                <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {fallidos.map((t, i) => (
                    <li
                      key={t.documento?.id || i}
                      className="text-sm border border-adm-border rounded-ui p-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Chip tono="neutro">
                          {t.documento?.tipo || 'documento'}
                        </Chip>
                        {t.documento?.zona && <Chip>{t.documento.zona}</Chip>}
                        <span className="font-mono text-xs text-adm-muted truncate">
                          {t.documento?.id}
                        </span>
                      </div>
                      <p className="text-xs text-adm-muted mt-2 break-words">
                        {t.intentos} intento(s) · {t.ultimo_error}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button onClick={alReintentar} icono={RefreshCw}>
                    Reintentar
                  </Button>
                  {/* "Descartar" y no "Limpiar": reconoce la pérdida, no la
                      repara, y el botón debe decir lo que hace. */}
                  <Button
                    variante="peligro"
                    onClick={alDescartar}
                    icono={Trash2}
                  >
                    Descartar
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Vista previa ─────────────────────────────────────────────────── */}
      {vista && (
        <Card className="mt-6">
          <CardBody>
            <h2 className="font-fraunces font-bold text-lg mb-1">
              Vista previa
            </h2>
            <p className="text-sm text-adm-muted mb-4">
              Así queda maquetado en 32 columnas. Si algo se sale por la derecha
              aquí, en papel también.
            </p>
            <pre className="bg-adm-bg border border-adm-border rounded-ui p-4 text-xs font-mono overflow-x-auto whitespace-pre">
              {vista}
            </pre>
          </CardBody>
        </Card>
      )}

      {!activo && !cargando && (
        <div className="mt-6">
          <EmptyState
            icono={Printer}
            titulo="Sin hub"
            descripcion="Abre InvVenta desde la caja para configurar la impresión, o conéctate a la dirección que muestra la caja."
          />
        </div>
      )}
    </PageShell>
  );
}

function Dato({ etiqueta, valor, mono = false }) {
  if (!valor) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-adm-muted">
        {etiqueta}
      </p>
      <p className={`text-sm break-all ${mono ? 'font-mono' : ''}`}>{valor}</p>
    </div>
  );
}

function Metrica({ etiqueta, valor, alerta = false }) {
  return (
    <div className="border border-adm-border rounded-ui p-3">
      <p className="text-xs uppercase tracking-wide text-adm-muted">
        {etiqueta}
      </p>
      <p
        className={`font-fraunces font-bold text-2xl ${
          alerta ? 'text-adm-danger' : 'text-adm-ink'
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
