// Barril de primitivas del Proyecto D. Dos juegos, uno por superficie:
//
//   import { PageShell, Card } from '../../components/ui';   → ADMIN  (adm-*)
//   import { OpsShell, OpsCard } from '../../components/ui'; → OPERACIÓN
//
// No los mezcles en una misma pantalla: la superficie la decide la ruta
// (ver esRutaOperacion en lib/Navegacion.js), no el componente.
export * from './Adm';
export * from './Ops';
export { default as DataTable } from './DataTable';
