// ─── BUSCADOR GLOBAL (Proyecto D · tanda 2) ──────────────────────────────────
// Motor PURO del buscador del topbar. Sin React, sin store, sin red: recibe los
// datos ya en memoria y devuelve resultados ordenados. Así se testea solo y en
// la tanda 3 el Ctrl+K lo reutiliza tal cual (la paleta agrega ACCIONES encima,
// no vuelve a implementar la búsqueda).
//
// Regla de oro: NO consulta Supabase. Solo indexa lo que el store ya trajo
// (Dexie hidrata offline), así el buscador funciona sin conexión igual que el
// resto de la app.

import {
  Utensils,
  Package,
  ChefHat,
  ListPlus,
  Truck,
  HeartHandshake,
  Users,
  ShoppingCart,
  Compass,
} from 'lucide-react';

/** minúsculas + sin acentos, para que "jitomate" encuentre "Jitomaté". */
export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ── Recursos indexables ──────────────────────────────────────────────────────
// Cada recurso dice: de qué colección sale, a qué ruta lleva, cómo se titula y
// qué campos son buscables. Agregar un recurso nuevo = agregar un bloque.
// `ruta` DEBE existir en el catálogo de navegación: el filtro de permisos y el
// gate de módulo se aplican sobre ella, no sobre el recurso.
export const RECURSOS = [
  {
    tipo: 'mesa',
    etiqueta: 'Mesas',
    coleccion: 'mesas',
    ruta: '/mesas',
    icono: Utensils,
    titulo: (m) => m.nombre || `Mesa ${m.numero ?? m.id}`,
    subtitulo: (m) => (m.estado ? `Estado: ${m.estado}` : ''),
    campos: ['nombre', 'numero', 'zona', 'estado'],
  },
  {
    tipo: 'ingrediente',
    etiqueta: 'Ingredientes',
    coleccion: 'productos',
    ruta: '/ingredientes',
    icono: Package,
    titulo: (p) => p.nombre,
    subtitulo: (p) =>
      p.stock !== undefined ? `${p.stock} ${p.unidad || ''}`.trim() : '',
    campos: ['nombre', 'categoria', 'sku', 'codigo'],
  },
  {
    tipo: 'receta',
    etiqueta: 'Recetas',
    coleccion: 'recetas',
    ruta: '/recetas',
    icono: ChefHat,
    titulo: (r) => r.nombre,
    subtitulo: (r) => r.categoria || '',
    campos: ['nombre', 'categoria', 'descripcion'],
  },
  {
    tipo: 'modificador',
    etiqueta: 'Modificadores',
    coleccion: 'modificadores',
    ruta: '/modificadores',
    icono: ListPlus,
    titulo: (m) => m.nombre,
    subtitulo: (m) => m.grupo || m.categoria || '',
    campos: ['nombre', 'grupo', 'categoria'],
  },
  {
    tipo: 'proveedor',
    etiqueta: 'Proveedores',
    coleccion: 'proveedores',
    ruta: '/proveedores',
    icono: Truck,
    titulo: (p) => p.nombre,
    subtitulo: (p) => p.contacto || p.rfc || '',
    campos: ['nombre', 'rfc', 'contacto', 'email', 'telefono'],
    // Los ocultos (activo === false) no estorban en la búsqueda.
    incluir: (p) => p.activo !== false,
  },
  {
    tipo: 'cliente',
    etiqueta: 'Clientes',
    coleccion: 'clientes',
    ruta: '/clientes',
    icono: HeartHandshake,
    titulo: (c) => c.nombre,
    subtitulo: (c) => c.telefono || c.email || '',
    campos: ['nombre', 'telefono', 'email', 'rfc'],
  },
  {
    tipo: 'empleado',
    etiqueta: 'Staff',
    coleccion: 'staff',
    ruta: '/empleados',
    icono: Users,
    titulo: (s) => s.nombre,
    subtitulo: (s) => s.rol || s.puesto || '',
    campos: ['nombre', 'username', 'rol', 'puesto'],
    incluir: (s) => s.activo !== false,
  },
  {
    tipo: 'orden',
    etiqueta: 'Órdenes de compra',
    coleccion: 'ordenesCompra',
    ruta: '/compras',
    icono: ShoppingCart,
    titulo: (o) => `Orden ${o.numero || o.folio || o.id}`,
    subtitulo: (o) =>
      [o.proveedor_nombre || o.proveedor, o.estado].filter(Boolean).join(' · '),
    campos: ['numero', 'folio', 'proveedor_nombre', 'proveedor', 'estado'],
  },
];

/**
 * Arma el índice buscable.
 *
 * @param {object} datos          colecciones del store (mesas, productos, …)
 * @param {object} opciones
 * @param {(ruta:string)=>boolean} opciones.puedeVerRuta  gate de capacidades
 * @param {Array}  opciones.navItems  itemsVisibles() del catálogo de navegación
 * @param {number} opciones.maxPorRecurso  tope defensivo por colección
 * @returns {Array} entradas planas listas para buscar()
 */
export function construirIndice(datos = {}, opciones = {}) {
  const {
    puedeVerRuta = () => true,
    navItems = [],
    maxPorRecurso = 2000,
  } = opciones;

  const indice = [];

  // 1) Navegación. Ya viene filtrada por permisos Y por módulo premium.
  for (const item of navItems) {
    indice.push({
      id: `nav:${item.path}`,
      tipo: 'navegacion',
      etiqueta: 'Ir a',
      titulo: item.label,
      subtitulo: item.grupo || '',
      ruta: item.path,
      icono: item.icon || Compass,
      texto: normalizar(`${item.label} ${item.grupo || ''} ${item.path}`),
    });
  }

  // 2) Datos. Un recurso solo se indexa si el usuario puede abrir su pantalla:
  // sin eso, el buscador filtraría clientes a un mesero que no tiene CRM.
  const rutasNav = new Set(navItems.map((i) => i.path));
  for (const recurso of RECURSOS) {
    if (!rutasNav.has(recurso.ruta) || !puedeVerRuta(recurso.ruta)) continue;

    const filas = datos[recurso.coleccion];
    if (!Array.isArray(filas)) continue;

    let contador = 0;
    for (const fila of filas) {
      if (!fila) continue;
      if (recurso.incluir && !recurso.incluir(fila)) continue;
      if (contador >= maxPorRecurso) break;

      const titulo = recurso.titulo(fila);
      if (!titulo) continue;

      const buscable = recurso.campos
        .map((c) => fila[c])
        .filter((v) => v !== null && v !== undefined && v !== '')
        .join(' ');

      indice.push({
        id: `${recurso.tipo}:${fila.id ?? titulo}`,
        tipo: recurso.tipo,
        etiqueta: recurso.etiqueta,
        titulo: String(titulo),
        subtitulo: String(recurso.subtitulo?.(fila) || ''),
        ruta: recurso.ruta,
        icono: recurso.icono,
        texto: normalizar(`${titulo} ${buscable}`),
      });
      contador += 1;
    }
  }

  return indice;
}

// Puntaje: coincidencia al inicio del título > al inicio de una palabra >
// en cualquier parte. La navegación empata primero a igualdad de puntaje
// porque "ir a un módulo" es la intención más común al teclear en el topbar.
function puntuar(entrada, q) {
  const titulo = normalizar(entrada.titulo);
  if (titulo === q) return 100;
  if (titulo.startsWith(q)) return 80;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(titulo))
    return 60;
  if (titulo.includes(q)) return 40;
  if (entrada.texto.includes(q)) return 20;
  return 0;
}

/**
 * Busca en el índice. Todos los términos deben coincidir (AND), así "jito rojo"
 * filtra de verdad en vez de traer todo lo que contenga "jito".
 *
 * @returns {Array} entradas ordenadas por relevancia, truncadas a `limite`
 */
export function buscar(indice = [], consulta = '', { limite = 20 } = {}) {
  const q = normalizar(consulta);
  if (q.length < 2) return [];

  const terminos = q.split(/\s+/).filter(Boolean);

  const resultados = [];
  for (const entrada of indice) {
    if (!terminos.every((t) => entrada.texto.includes(t))) continue;
    const puntaje = puntuar(entrada, terminos[0]);
    if (puntaje === 0) continue;
    resultados.push({ ...entrada, puntaje });
  }

  resultados.sort((a, b) => {
    if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
    const aNav = a.tipo === 'navegacion' ? 0 : 1;
    const bNav = b.tipo === 'navegacion' ? 0 : 1;
    if (aNav !== bNav) return aNav - bNav;
    return a.titulo.localeCompare(b.titulo);
  });

  return resultados.slice(0, limite);
}

/** Agrupa los resultados por etiqueta, conservando el orden de relevancia. */
export function agrupar(resultados = []) {
  const grupos = [];
  for (const r of resultados) {
    let g = grupos.find((x) => x.etiqueta === r.etiqueta);
    if (!g) {
      g = { etiqueta: r.etiqueta, items: [] };
      grupos.push(g);
    }
    g.items.push(r);
  }
  return grupos;
}
