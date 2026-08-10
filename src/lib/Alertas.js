// ─── ALERTAS ACCIONABLES (Proyecto D · tanda 4) ──────────────────────────────
// El Dashboard viejo tenía una tarjeta "Sin Alertas · Módulo de Alertas" al 60%
// de opacidad: un placeholder que llevaba meses mintiendo. Esto lo sustituye.
//
// Criterio de diseño: una alerta que no se puede ACCIONAR es ruido. Cada una
// trae su ruta de destino y su gate de capacidad — si el rol no puede hacer
// nada al respecto, ni siquiera la ve. Un mesero no necesita enterarse de que
// la cola de sincronización tiene registros muertos.
//
// Puro y testeable: recibe datos, devuelve alertas.

import {
  PackageX,
  CloudOff,
  Clock,
  CreditCard,
  AlertOctagon,
} from 'lucide-react';

// severidad: 'critica' > 'aviso' > 'info'. Ordena la lista y elige el tono.
const PESO = { critica: 0, aviso: 1, info: 2 };

// Minutos que una mesa puede estar pidiendo la cuenta antes de que sea un
// problema de servicio y no un trámite normal.
const MINUTOS_COBRO_ESTANCADO = 15;

/**
 * @param {object} datos
 * @param {Array}  datos.productos      insumos con stock y mínimo
 * @param {Array}  datos.mesas
 * @param {Array}  datos.asistencias
 * @param {Array}  datos.staff
 * @param {number} datos.deadTasks      dead-letter del sync store
 * @param {number} datos.pendingTasks
 * @param {object} opciones
 * @param {(flag:string)=>boolean} opciones.flag        capacidades del rol
 * @param {(ruta:string)=>boolean} opciones.puedeVerRuta
 * @param {Date}   opciones.ahora
 * @returns {Array} alertas ordenadas por severidad
 */
export function calcularAlertas(datos = {}, opciones = {}) {
  const { productos = [], mesas = [], asistencias = [], deadTasks = 0 } = datos;
  const {
    flag = () => false,
    puedeVerRuta = () => false,
    ahora = new Date(),
  } = opciones;

  const alertas = [];
  const esGestion = flag('gestion');

  // ── Desabasto ────────────────────────────────────────────────────────────
  // Solo para quien puede comprar: avisarle a un mesero que falta jitomate no
  // cambia nada. Se separa "agotado" de "bajo mínimo": lo primero ya está
  // frenando ventas, lo segundo todavía da margen de reacción.
  if (esGestion && puedeVerRuta('/compras')) {
    const agotados = (productos || []).filter((p) => p && Number(p.stock) <= 0);
    const bajoMinimo = (productos || []).filter(
      (p) => p && Number(p.stock) > 0 && Number(p.stock) <= Number(p.min || 0),
    );

    if (agotados.length > 0) {
      alertas.push({
        id: 'desabasto-agotado',
        severidad: 'critica',
        icono: PackageX,
        titulo: `${agotados.length} insumo${agotados.length !== 1 ? 's' : ''} agotado${agotados.length !== 1 ? 's' : ''}`,
        detalle: agotados
          .slice(0, 3)
          .map((p) => p.nombre)
          .join(', '),
        ruta: '/compras',
        cta: 'Levantar orden',
      });
    }
    if (bajoMinimo.length > 0) {
      alertas.push({
        id: 'desabasto-minimo',
        severidad: 'aviso',
        icono: PackageX,
        titulo: `${bajoMinimo.length} insumo${bajoMinimo.length !== 1 ? 's' : ''} bajo mínimo`,
        detalle: bajoMinimo
          .slice(0, 3)
          .map((p) => `${p.nombre} (${p.stock} ${p.unidad || ''})`.trim())
          .join(', '),
        ruta: '/compras',
        cta: 'Revisar',
      });
    }
  }

  // ── Cola de sincronización muerta ────────────────────────────────────────
  // Crítica siempre: son cambios que el usuario cree guardados y NO están en
  // Supabase. Es el peor fallo posible en una caja.
  if (esGestion && deadTasks > 0) {
    alertas.push({
      id: 'dead-letter',
      severidad: 'critica',
      icono: AlertOctagon,
      titulo: `${deadTasks} cambio${deadTasks !== 1 ? 's' : ''} sin sincronizar`,
      detalle:
        'Fallaron de forma permanente y no se reintentan solos. Requieren revisión.',
      ruta: '/auditoria',
      cta: 'Diagnosticar',
    });
  }

  // ── Mesas estancadas en cobro ────────────────────────────────────────────
  // La ve cualquiera que gestione caja o piso: es un problema de servicio en
  // curso, no un dato administrativo.
  if (esGestion || flag('abre_caja')) {
    const estancadas = (mesas || []).filter((m) => {
      if (m?.estado !== 'por_cobrar') return false;
      const desde = m.cuenta_solicitada_en || m.actualizado_en || m.updated_at;
      if (!desde) return false;
      const mins = (ahora.getTime() - new Date(desde).getTime()) / 60000;
      return Number.isFinite(mins) && mins >= MINUTOS_COBRO_ESTANCADO;
    });
    if (estancadas.length > 0) {
      alertas.push({
        id: 'mesas-estancadas',
        severidad: 'aviso',
        icono: CreditCard,
        titulo: `${estancadas.length} mesa${estancadas.length !== 1 ? 's' : ''} esperando cobro`,
        detalle: `Más de ${MINUTOS_COBRO_ESTANCADO} min desde que pidieron la cuenta: ${estancadas
          .slice(0, 3)
          .map((m) => m.nombre)
          .join(', ')}`,
        ruta: '/mesas',
        cta: 'Ir al mapa',
      });
    }
  }

  // ── Jornadas abiertas ────────────────────────────────────────────────────
  // Entradas sin salida de días anteriores: nómina inflada si nadie las cierra.
  if (esGestion && puedeVerRuta('/asistencias')) {
    const ultimoPorEmpleado = new Map();
    for (const a of asistencias || []) {
      if (!a?.empleado_nombre || !a?.fecha_hora) continue;
      const prev = ultimoPorEmpleado.get(a.empleado_nombre);
      if (!prev || new Date(a.fecha_hora) > new Date(prev.fecha_hora)) {
        ultimoPorEmpleado.set(a.empleado_nombre, a);
      }
    }
    const inicioDeHoy = new Date(ahora);
    inicioDeHoy.setHours(0, 0, 0, 0);

    const colgadas = [...ultimoPorEmpleado.values()].filter(
      (a) => a.tipo === 'entrada' && new Date(a.fecha_hora) < inicioDeHoy,
    );
    if (colgadas.length > 0) {
      alertas.push({
        id: 'jornadas-abiertas',
        severidad: 'aviso',
        icono: Clock,
        titulo: `${colgadas.length} jornada${colgadas.length !== 1 ? 's' : ''} sin cerrar`,
        detalle: `Entrada sin salida de días anteriores: ${colgadas
          .slice(0, 3)
          .map((a) => a.empleado_nombre)
          .join(', ')}`,
        ruta: '/asistencias',
        cta: 'Revisar checador',
      });
    }
  }

  return alertas.sort((a, b) => PESO[a.severidad] - PESO[b.severidad]);
}

/** Alerta informativa de trabajo offline (no es un problema, es un estado). */
export function alertaOffline(pendingTasks = 0) {
  return {
    id: 'offline',
    severidad: 'info',
    icono: CloudOff,
    titulo: 'Trabajando sin conexión',
    detalle: pendingTasks
      ? `${pendingTasks} cambio${pendingTasks !== 1 ? 's' : ''} en cola, se enviarán al volver la red.`
      : 'Los cambios se guardan localmente.',
    ruta: null,
    cta: null,
  };
}
