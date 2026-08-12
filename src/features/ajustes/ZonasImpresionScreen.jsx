import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PageShell, PageHeader, Button } from '../../components/ui';
import { useSyncStore } from '../../store/useSyncStore';
import {
  Printer,
  Plus,
  X,
  Save,
  ArrowRight,
  Tag,
  Server,
  Coffee,
  UtensilsCrossed,
} from 'lucide-react';

const iconoEstacion = (nombre) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('barra') || n.includes('bar')) return Coffee;
  return UtensilsCrossed;
};

export default function ZonasImpresionScreen() {
  const { configuracion, recetas, updateConfiguracion, showToast } =
    useAppStore();
  const { enqueueAction } = useSyncStore();

  const [zonas, setZonas] = useState(['Cocina', 'Barra']);
  const [nuevaZona, setNuevaZona] = useState('');
  const [enrutamiento, setEnrutamiento] = useState({});

  // Cuándo sale papel de cocina. Vive en esta pantalla y no en Configuración
  // porque es la misma decisión que el enrutamiento: cómo se entera cocina.
  //
  // `siempre` de fábrica y no `sin_nube`: una cocina SIN pantalla que deja de
  // recibir papel no prepara el pedido, y eso se descubre con el cliente
  // esperando. Gastar rollo de más se descubre mirando el rollo.
  const [imprimirComandas, setImprimirComandas] = useState('siempre');

  // Categorías REALES: las del menú (recetas activas), no solo config.categorias.
  // Es la fuente de verdad de qué se enruta. Une ambas por si acaso.
  const categoriasMenu = useMemo(() => {
    const deRecetas = (recetas || [])
      .filter((r) => r.activo !== false)
      .map((r) => r.categoria || 'Sin Categoría');

    // Defensa contra datos corruptos: configuracion.categorias DEBE ser array,
    // pero a veces llega como string JSON doble-codificado ('["A","B"]') que, al
    // hacer spread, se explota carácter por carácter ('[', '"', 'A'...). Aquí lo
    // normalizamos a array pase lo que pase.
    let deConfig = configuracion?.categorias ?? [];
    if (typeof deConfig === 'string') {
      try {
        const parsed = JSON.parse(deConfig);
        deConfig = Array.isArray(parsed) ? parsed : [];
      } catch {
        deConfig = [];
      }
    }
    if (!Array.isArray(deConfig)) deConfig = [];

    return [...new Set([...deRecetas, ...deConfig])].filter(Boolean).sort();
  }, [recetas, configuracion]);

  useEffect(() => {
    if (configuracion) {
      if (configuracion.zonas_produccion?.length > 0) {
        setZonas(configuracion.zonas_produccion);
      }
      if (configuracion.imprimir_comandas) {
        setImprimirComandas(configuracion.imprimir_comandas);
      }
      if (configuracion.enrutamiento) {
        setEnrutamiento(configuracion.enrutamiento);
      }
    }
  }, [configuracion]);

  const agregarZona = (e) => {
    e.preventDefault();
    const z = nuevaZona.trim();
    if (!z || zonas.includes(z)) return;
    setZonas([...zonas, z]);
    setNuevaZona('');
  };

  const quitarZona = (zonaEliminar) => {
    if (zonas.length <= 1)
      return showToast('Debe quedar al menos una estación', 'error');
    const nuevasZonas = zonas.filter((z) => z !== zonaEliminar);
    setZonas(nuevasZonas);
    // Reasignar categorías huérfanas a la primera zona disponible.
    const fallback = nuevasZonas[0] || '';
    const nuevoEnr = { ...enrutamiento };
    Object.keys(nuevoEnr).forEach((cat) => {
      if (nuevoEnr[cat] === zonaEliminar) nuevoEnr[cat] = fallback;
    });
    setEnrutamiento(nuevoEnr);
  };

  const asignarCategoria = (categoria, zona) => {
    setEnrutamiento((prev) => ({ ...prev, [categoria]: zona }));
  };

  const guardar = () => {
    // Un solo camino de guardado: updateConfiguracion ya persiste (optimista +
    // Supabase/cola). NO duplicar con enqueueAction (causaba doble escritura).
    updateConfiguracion({
      ...configuracion,
      zonas_produccion: zonas,
      enrutamiento,
      imprimir_comandas: imprimirComandas,
    });
    showToast('Enrutamiento de KDS actualizado', 'success');
  };

  return (
    <PageShell ancho="max-w-5xl">
      <PageHeader
        icono={Printer}
        titulo="Zonas de Producción"
        descripcion="Enruta los platillos al KDS de cocina o barra"
        acciones={
          <Button icono={Save} onClick={guardar}>
            Guardar reglas
          </Button>
        }
      />

      {/* CUÁNDO SALE PAPEL ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm mb-8">
        <h3 className="text-xs font-black text-adm-muted uppercase tracking-widest mb-2 flex items-center gap-2">
          <Printer className="w-4 h-4" /> Cuándo imprimir las comandas
        </h3>
        <p className="text-sm text-adm-muted font-medium mb-4">
          El KDS es el canal principal. El papel existe para que cocina se
          entere cuando la pantalla no puede.
        </p>

        {imprimirComandas !==
          (configuracion?.imprimir_comandas || 'siempre') && (
          <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-ui border-2 border-adm-accent bg-adm-accent/5">
            <p className="text-xs font-black text-adm-ink">
              Cambiado — falta guardar para que aplique.
            </p>
            <Button icono={Save} onClick={guardar}>
              Guardar
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {[
            {
              v: 'siempre',
              t: 'Siempre',
              d: 'La cocina no tiene pantalla, o se quiere papel de todos modos.',
            },
            {
              v: 'sin_nube',
              t: 'Sólo cuando no llegó a la nube',
              d: 'Con pantallas de KDS: el papel sale únicamente si la comanda no pudo sincronizarse y nadie la vio.',
            },
            {
              v: 'nunca',
              t: 'Nunca',
              d: 'Se confía en las pantallas incluso sin internet.',
            },
          ].map((o) => (
            <label
              key={o.v}
              className={`flex gap-3 p-3 rounded-ui border-2 cursor-pointer transition-colors ${
                imprimirComandas === o.v
                  ? 'border-adm-accent bg-adm-accent/5'
                  : 'border-adm-border hover:border-adm-muted'
              }`}
            >
              <input
                type="radio"
                name="imprimir_comandas"
                value={o.v}
                checked={imprimirComandas === o.v}
                onChange={(e) => setImprimirComandas(e.target.value)}
                className="mt-1"
              />
              <span>
                <span className="block font-black text-adm-ink text-sm">
                  {o.t}
                </span>
                <span className="block text-xs text-adm-muted font-medium">
                  {o.d}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* PANEL IZQUIERDO: ESTACIONES */}
        <div className="w-full lg:w-1/3 space-y-6">
          <div className="bg-white dark:bg-adm-panel p-6 rounded-ui-lg border-2 border-adm-border shadow-sm">
            <h3 className="text-xs font-black text-adm-muted uppercase tracking-widest mb-4 flex items-center gap-2">
              <Server className="w-4 h-4" /> Estaciones Activas
            </h3>

            <form onSubmit={agregarZona} className="flex gap-2 mb-6">
              <input
                type="text"
                value={nuevaZona}
                onChange={(e) => setNuevaZona(e.target.value)}
                placeholder="Ej. Parrilla, Postres..."
                className="flex-1 px-4 py-3 bg-adm-bg border-2 border-adm-field rounded-ui font-bold text-adm-ink outline-none focus:border-adm-info dark:focus:border-adm-info transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-3 bg-adm-info text-adm-info-fg rounded-ui font-black hover:bg-adm-info transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </form>

            <div className="space-y-3">
              {zonas.map((zona) => {
                const Icon = iconoEstacion(zona);
                return (
                  <div
                    key={zona}
                    className="flex justify-between items-center bg-adm-bg border-2 border-adm-border px-4 py-3 rounded-ui group"
                  >
                    <span className="font-black text-adm-ink flex items-center gap-3">
                      <Icon className="w-4 h-4 text-adm-muted" /> {zona}
                    </span>
                    <button
                      onClick={() => quitarZona(zona)}
                      className="text-adm-muted hover:text-adm-danger dark:hover:text-adm-danger opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {zonas.length === 0 && (
                <p className="text-sm font-bold text-adm-muted text-center py-4">
                  No hay zonas configuradas.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: ENRUTAMIENTO */}
        <div className="w-full lg:w-2/3 bg-white dark:bg-adm-panel rounded-ui-lg border-2 border-adm-border shadow-sm p-6 lg:p-8 flex flex-col h-full">
          <h3 className="text-xl font-black text-adm-ink mb-2">
            Mapa de Enrutamiento
          </h3>
          <p className="text-sm font-bold text-adm-muted mb-8">
            Cada categoría del menú se envía a la estación que elijas cuando el
            mesero toma la orden.
          </p>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {categoriasMenu.length === 0 ? (
              <div className="bg-adm-bg border-2 border-dashed border-adm-border rounded-ui p-10 text-center">
                <Tag className="w-10 h-10 text-adm-muted mx-auto mb-3" />
                <h4 className="font-black text-adm-muted dark:text-adm-ink">
                  No hay categorías
                </h4>
                <p className="text-xs font-bold text-adm-muted mt-1">
                  Crea recetas con categorías para poder enrutarlas.
                </p>
              </div>
            ) : (
              categoriasMenu.map((cat) => {
                const zonaAsignada = enrutamiento[cat] || zonas[0] || '';
                return (
                  <div
                    key={cat}
                    className="flex flex-col sm:flex-row justify-between items-center p-4 bg-adm-bg border-2 border-adm-border rounded-ui gap-4 hover:border-adm-info/30 dark:hover:border-adm-info/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 w-full sm:w-1/2">
                      <div className="bg-white dark:bg-adm-panel p-2.5 rounded-ui shadow-sm border border-adm-border">
                        <Tag className="w-4 h-4 text-adm-info" />
                      </div>
                      <span className="font-black text-adm-ink text-lg">
                        {cat}
                      </span>
                    </div>

                    <ArrowRight className="w-5 h-5 text-adm-muted hidden sm:block shrink-0" />

                    <div className="w-full sm:w-1/2">
                      <select
                        value={zonaAsignada}
                        onChange={(e) => asignarCategoria(cat, e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-adm-panel border-2 border-adm-field rounded-ui font-black text-adm-info outline-none focus:border-adm-info dark:focus:border-adm-info cursor-pointer shadow-sm transition-all"
                      >
                        {zonas.length === 0 && (
                          <option value="">Sin Zonas</option>
                        )}
                        {zonas.map((z) => (
                          <option key={z} value={z}>
                            Enviar a {z}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
