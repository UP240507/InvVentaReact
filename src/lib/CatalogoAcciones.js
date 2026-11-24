/**
 * CatalogoAcciones.js — el catálogo de lo que el sistema hace y deja en Auditoría.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El principio de Chris del 21-oct: todo se puede deshacer; lo OPERATIVO con la
 * menor fricción posible, lo ADMINISTRATIVO estricto (quién, motivo, rastro).
 * El censo de ese día (`CENSO_21-OCT_OPERATIVO_CONTRA_ADMINISTRATIVO.md`)
 * clasificó cada acción a mano. Hasta aquí esa clasificación vivía en un
 * documento y cada tipo de Auditoría era un texto suelto en su pantalla.
 *
 * Este archivo la pone en el código, y `src/test/acciones-registradas.test.js`
 * la hace cumplir: un tipo que se escribe en Auditoría y no está aquí, o una
 * administrativa que no dice qué la autoriza, tumban la suite. Así una acción
 * nueva no entra sin decidir de qué clase es.
 *
 * ── LOS CAMPOS ──────────────────────────────────────────────────────────────
 * - `clase`: `operativa` o `administrativa`.
 * - `autoriza`: qué la permite. `flag:<capacidad>` (PIN o sesión con esa
 *   capacidad, `lib/Permisos.js`) o `ruta:<pantalla>` (llegar a la pantalla ya
 *   la permite). Sólo administrativas.
 * - `motivo`: si pide motivo escrito.
 * - `audita`: si deja fila en Auditoría. Las que hoy NO la dejan están aquí
 *   igual, con `audita: false`, para que la deuda se vea en un solo sitio
 *   (censo §4.7) y no se olvide.
 * - `deuda`: lo que todavía no cumple su regla y en qué fase se arregla. Una
 *   administrativa sin `autoriza` tiene que decirlo aquí.
 *
 * No confundir con `lib/Acciones.js`: ése es lo que se puede hacer desde la
 * paleta Ctrl+K. Éste es lo que queda escrito en Auditoría.
 *
 * Los nombres con y sin acento (`EMISIÓN_OC`, `CANCELACION_COMANDA`) se quedan
 * como están: hay filas viejas en Auditoría con esos textos y los reportes las
 * buscan así.
 *
 * Puro: sin React, sin stores, sin red.
 */

export const ACCIONES = {
  // ── Operativas ─────────────────────────────────────────────────────────────
  APERTURA_TURNO: { clase: 'operativa', audita: true },
  CUENTA_IMPRESA: { clase: 'operativa', audita: true },
  COBRO_TICKET: { clase: 'operativa', audita: true },
  REIMPRESION_TICKET: { clase: 'operativa', audita: true },
  CANJE_RECOMPENSA: { clase: 'operativa', audita: true },
  MESAS_JUNTADAS: { clase: 'operativa', audita: true },
  TRASPASO_MESA: {
    clase: 'operativa',
    audita: true,
    deuda: 'Pasa por encima de una cuenta impresa sin PIN (H1): fase 3.',
  },
  VALE_PROPINA_IMPRESO: { clase: 'operativa', audita: true },
  // Decidida operativa el 23-oct (censo §3.2): los clientes cambian de idea.
  CUENTA_PARCIAL_DESHECHA: { clase: 'operativa', audita: true },
  // Quitar una cortesía sube lo que se cobra: no abre una puerta de robo.
  DESCUENTO_PRODUCTO_QUITADO: { clase: 'operativa', audita: true },

  // ── Administrativas, con quién las autoriza ────────────────────────────────
  DESCUENTO_PRODUCTO: {
    clase: 'administrativa',
    autoriza: 'flag:autoriza_descuentos',
    audita: true,
    deuda: 'Queda a nombre de «Sistema»; quién autorizó va en el texto (H12).',
  },
  REAPERTURA_CUENTA: {
    clase: 'administrativa',
    autoriza: 'flag:autoriza_descuentos',
    audita: true,
    deuda: 'Sin motivo escrito (censo §2.2).',
  },
  SALIDA_ANTICIPADA: {
    clase: 'administrativa',
    autoriza: 'flag:autoriza_salidas',
    audita: true,
    deuda: 'Sin motivo escrito (censo §2.2).',
  },
  CONSULTA_PLANTILLA_ACTIVA: {
    clase: 'administrativa',
    autoriza: 'flag:gestion',
    audita: true,
  },
  CIERRE_REGISTRO_OLVIDADO: {
    clase: 'administrativa',
    autoriza: 'flag:gestion',
    audita: true,
    deuda: 'Sin motivo escrito (censo §2.2).',
  },
  SALIDA_CERRADA_POR_GESTION: {
    clase: 'administrativa',
    autoriza: 'flag:gestion',
    audita: true,
  },
  ARQUEO_DECLARADO: {
    clase: 'administrativa',
    autoriza: 'flag:autoriza_arqueo',
    audita: true,
  },
  CIERRE_TURNO: {
    clase: 'administrativa',
    autoriza: 'flag:autoriza_arqueo',
    audita: true,
  },
  CAJON_ABIERTO: {
    clase: 'administrativa',
    autoriza: 'flag:abre_cajon',
    audita: true,
    deuda: 'Sin motivo escrito (censo §2.2).',
  },
  KDS_DESBLOQUEADO: {
    clase: 'administrativa',
    autoriza: 'flag:gestion',
    audita: true,
  },
  REPARTO_PROPINAS: {
    clase: 'administrativa',
    autoriza: 'ruta:propinas',
    audita: true,
    deuda: 'Escribe directo, fuera de la cola (censo §4.8): fase 2.',
  },
  EMISIÓN_OC: {
    clase: 'administrativa',
    autoriza: 'ruta:compras',
    audita: true,
  },
  CANCELACIÓN_OC: {
    clase: 'administrativa',
    autoriza: 'ruta:compras',
    audita: true,
    deuda: 'Sin motivo escrito (censo §2.2).',
  },
  ALTA_EMPLEADO: {
    clase: 'administrativa',
    autoriza: 'ruta:empleados',
    audita: true,
  },
  EDICIÓN_EMPLEADO: {
    clase: 'administrativa',
    autoriza: 'ruta:empleados',
    audita: true,
  },

  // ── Administrativas que todavía no piden a nadie ───────────────────────────
  KDS_PURGADO: {
    clase: 'administrativa',
    audita: true,
    deuda:
      'Cualquiera en el KDS la hace; va la capacidad purga_kds por estación (censo §3.7): fase 3.',
  },
  CANCELACION_COMANDA: {
    clase: 'administrativa',
    motivo: true,
    audita: true,
    deuda:
      'Sin PIN pasado el minuto de gracia y no saca de la cuenta (censo §3.1, H2): fase 3.',
  },

  // ── Lo que hoy no deja rastro (censo §4.7) ─────────────────────────────────
  // Están para que la deuda se cuente aquí. Su nombre es el que tendrá en
  // Auditoría cuando lo deje; nadie lo escribe todavía.
  PERMISOS_ROL_GUARDADOS: {
    clase: 'administrativa',
    autoriza: 'ruta:permisos',
    audita: false,
    deuda: 'Cambiar capacidades de un rol no deja rastro.',
  },
  CONFIGURACION_GUARDADA: {
    clase: 'administrativa',
    autoriza: 'ruta:configuracion',
    audita: false,
    deuda: 'Sin rastro y fuera de la cola sin red (censo §4.8).',
  },
  RECETA_GUARDADA: {
    clase: 'administrativa',
    autoriza: 'ruta:recetas',
    audita: false,
    deuda:
      'Crear, editar precio, desactivar o borrar una receta no deja rastro.',
  },
  NOMINA_GUARDADA: {
    clase: 'administrativa',
    autoriza: 'ruta:nominas',
    audita: false,
    deuda: 'Sin rastro.',
  },
  BAJA_EMPLEADO: {
    clase: 'administrativa',
    autoriza: 'ruta:empleados',
    audita: false,
    deuda: 'Dar de baja o reactivar no deja rastro.',
  },
  CLIENTE_BORRADO: {
    clase: 'administrativa',
    autoriza: 'ruta:clientes',
    audita: false,
    deuda: 'Borrar un cliente definitivo no deja rastro.',
  },
  MESA_GUARDADA: {
    clase: 'administrativa',
    autoriza: 'ruta:mesas',
    audita: false,
    deuda: 'Alta y edición de mesas sin rastro.',
  },
  AJUSTE_INVENTARIO: {
    clase: 'administrativa',
    autoriza: 'ruta:mermas',
    motivo: true,
    audita: false,
    deuda: 'El movimiento queda, pero no dice quién (censo §3.6).',
  },
  RECEPCION_MERCANCIA: {
    clase: 'operativa',
    audita: false,
    deuda: 'Cambia costo e inventario sin decir quién recibió (censo §3.4).',
  },
  SE_TERMINO_EN_BARRA: {
    clase: 'operativa',
    audita: false,
    deuda: 'Da de baja una botella sin decir quién (censo §3.6).',
  },
};
