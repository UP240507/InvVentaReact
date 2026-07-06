import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSyncStore } from '../../store/useSyncStore';
import {
  Printer,
  Plus,
  X,
  Save,
  ChefHat,
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
    });
    showToast('Enrutamiento de KDS actualizado', 'success');
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto flex flex-col h-full animate-in fade-in duration-500 text-slate-800 dark:text-ui-text">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-ui-humo p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-ui-border shadow-xl shadow-slate-200/50 dark:shadow-none mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 bg-indigo-50 dark:bg-brand-amatista/5 rounded-full -mr-12 -mt-12 opacity-50 pointer-events-none" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-indigo-600 dark:bg-brand-amatista p-4 rounded-3xl shadow-lg shadow-indigo-600/40 dark:shadow-brand-amatista/30">
            <Printer className="w-8 h-8 text-white dark:text-ui-obsidiana" />
          </div>
          <div>
            <h1 className="text-3xl font-black font-syne text-slate-900 dark:text-brand-nacar tracking-tight">
              Zonas de Producción
            </h1>
            <p className="text-slate-500 dark:text-ui-muted font-bold mt-1">
              Enruta los platillos al KDS de cocina o barra
            </p>
          </div>
        </div>
        <button
          onClick={guardar}
          className="w-full sm:w-auto bg-slate-900 dark:bg-brand-cesped hover:bg-black dark:hover:bg-[#00c98c] text-white dark:text-ui-obsidiana px-8 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl transition-all hover:scale-105 active:scale-95 relative z-10"
        >
          <Save className="w-5 h-5" /> Guardar Reglas
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* PANEL IZQUIERDO: ESTACIONES */}
        <div className="w-full lg:w-1/3 space-y-6">
          <div className="bg-white dark:bg-ui-humo p-6 rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm">
            <h3 className="text-xs font-black text-slate-400 dark:text-ui-muted uppercase tracking-widest mb-4 flex items-center gap-2">
              <Server className="w-4 h-4" /> Estaciones Activas
            </h3>

            <form onSubmit={agregarZona} className="flex gap-2 mb-6">
              <input
                type="text"
                value={nuevaZona}
                onChange={(e) => setNuevaZona(e.target.value)}
                placeholder="Ej. Parrilla, Postres..."
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-xl font-bold text-slate-800 dark:text-brand-nacar outline-none focus:border-indigo-500 dark:focus:border-brand-amatista transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-3 bg-indigo-600 dark:bg-brand-amatista text-white dark:text-ui-obsidiana rounded-xl font-black hover:bg-indigo-700 transition-colors"
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
                    className="flex justify-between items-center bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border px-4 py-3 rounded-xl group"
                  >
                    <span className="font-black text-slate-700 dark:text-brand-nacar flex items-center gap-3">
                      <Icon className="w-4 h-4 text-slate-400 dark:text-ui-muted" />{' '}
                      {zona}
                    </span>
                    <button
                      onClick={() => quitarZona(zona)}
                      className="text-slate-400 dark:text-ui-muted hover:text-rose-500 dark:hover:text-brand-arrecife opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {zonas.length === 0 && (
                <p className="text-sm font-bold text-slate-400 dark:text-ui-muted text-center py-4">
                  No hay zonas configuradas.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: ENRUTAMIENTO */}
        <div className="w-full lg:w-2/3 bg-white dark:bg-ui-humo rounded-[2rem] border-2 border-slate-100 dark:border-ui-border shadow-sm p-6 lg:p-8 flex flex-col h-full">
          <h3 className="text-xl font-black text-slate-900 dark:text-brand-nacar mb-2">
            Mapa de Enrutamiento
          </h3>
          <p className="text-sm font-bold text-slate-500 dark:text-ui-muted mb-8">
            Cada categoría del menú se envía a la estación que elijas cuando el
            mesero toma la orden.
          </p>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {categoriasMenu.length === 0 ? (
              <div className="bg-slate-50 dark:bg-ui-obsidiana border-2 border-dashed border-slate-200 dark:border-ui-border rounded-2xl p-10 text-center">
                <Tag className="w-10 h-10 text-slate-300 dark:text-ui-muted mx-auto mb-3" />
                <h4 className="font-black text-slate-500 dark:text-brand-nacar">
                  No hay categorías
                </h4>
                <p className="text-xs font-bold text-slate-400 dark:text-ui-muted mt-1">
                  Crea recetas con categorías para poder enrutarlas.
                </p>
              </div>
            ) : (
              categoriasMenu.map((cat) => {
                const zonaAsignada = enrutamiento[cat] || zonas[0] || '';
                return (
                  <div
                    key={cat}
                    className="flex flex-col sm:flex-row justify-between items-center p-4 bg-slate-50 dark:bg-ui-obsidiana border-2 border-slate-100 dark:border-ui-border rounded-2xl gap-4 hover:border-indigo-200 dark:hover:border-brand-amatista/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 w-full sm:w-1/2">
                      <div className="bg-white dark:bg-ui-humo p-2.5 rounded-xl shadow-sm border border-slate-200 dark:border-ui-border">
                        <Tag className="w-4 h-4 text-indigo-500 dark:text-brand-amatista" />
                      </div>
                      <span className="font-black text-slate-800 dark:text-brand-nacar text-lg">
                        {cat}
                      </span>
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-300 dark:text-ui-muted hidden sm:block shrink-0" />

                    <div className="w-full sm:w-1/2">
                      <select
                        value={zonaAsignada}
                        onChange={(e) => asignarCategoria(cat, e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-ui-humo border-2 border-slate-200 dark:border-ui-border rounded-xl font-black text-indigo-700 dark:text-brand-amatista outline-none focus:border-indigo-500 dark:focus:border-brand-amatista cursor-pointer shadow-sm transition-all"
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
    </div>
  );
}
