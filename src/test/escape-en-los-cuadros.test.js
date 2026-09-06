// src/test/escape-en-los-cuadros.test.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// **Todo cuadro que se abre encima de la pantalla se cierra con Escape.** Es la
// tecla que pulsa cualquiera cuando quiere salir de algo, y hasta el 28-ago
// ningún modal del proyecto la escuchaba. En dos sitios era peor que «no
// cierra»: los atajos de pantalla usan Escape para SALIR, así que con un cuadro
// abierto te sacaba del KDS o del POS con la operación a medias.
//
// ── POR QUÉ UN CENSO Y NO UNA PRUEBA POR COMPONENTE ─────────────────────────
// El mismo argumento que `modales-teclado.test.js`: el fallo no vive en un
// componente, vive en los treinta sitios que pintan su propio `div` a mano. Una
// prueba por componente cubre los que alguien recordó cubrir, que son justo los
// que no fallan.
//
// Y no se puede contar automáticamente «cuántos están cubiertos», porque hay
// CUATRO mecanismos legítimos y ninguno se parece a otro:
//
//   1. Los componentes base (`Modal`, `ConfirmModal`, `OpsModal`), que llaman
//      al hook por dentro y se lo dan a todo lo que cuelga de ellos.
//   2. `useCierreConEscape` puesto a mano en la pantalla.
//   3. Un `if (e.key === 'Escape')` propio, anterior al hook.
//   4. El scope de atajos `pos-modal` del POS, donde Escape cierra «lo que esté
//      abierto» en un orden explícito.
//
// Así que esto es un CENSO: cada fichero con overlays crudos, cuántos tiene, y
// cómo se cubre cada uno. Si aparece un overlay nuevo —o un fichero nuevo con
// overlays— la prueba falla y obliga a decidir. No comprueba que el cierre
// funcione (eso es `useCierreConEscape.test.jsx`, con sus diez pruebas y sus
// dos controles negativos): comprueba que nadie añada un cuadro y se olvide.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

/** Censo verificado a mano el 04-sep-2026. Clave: ruta relativa a `src/`. */
const CENSO = {
  // ── No son cuadros de diálogo ─────────────────────────────────────────
  'App.jsx': [
    1,
    'pantalla de carga a pantalla completa; no hay nada que cerrar',
  ],
  'features/kds/KdsScreen.jsx': [
    1,
    'textura decorativa con `pointer-events-none`; ni siquiera recibe clics',
  ],

  // ── Los componentes base: llaman al hook por dentro ───────────────────
  'components/ui/Adm.jsx': [2, 'definición de `Modal` y `ConfirmModal`'],
  'components/ui/Ops.jsx': [1, 'definición de `OpsModal`'],

  // ── Manejador propio, anterior al hook ────────────────────────────────
  'components/CommandPalette.jsx': [1, 'su propio `if (e.key === Escape)`'],
  'components/PanelAcoplable.jsx': [1, 'su propio `if (e.key === Escape)`'],

  // ── El scope `pos-modal` del POS ──────────────────────────────────────
  'features/pos/PosScreen.jsx': [
    3,
    'scope `pos-modal`: Escape cierra lo que esté abierto, en orden. La cuenta parcial lleva además el hook a mano',
  ],
  'features/pos/components/TicketImpresion.jsx': [
    1,
    'lo cierra el scope `pos-modal` por `ticketGenerado`',
  ],

  // ── Con el hook puesto a mano ─────────────────────────────────────────
  'components/AyudaAtajos.jsx': [1, 'hook'],
  'components/BarraPestanas.jsx': [1, 'hook'],
  'components/SidebarLayout.jsx': [2, 'hook'],
  'features/analisis/FacturasScreen.jsx': [1, 'hook'],
  'features/auth/PerfilScreen.jsx': [3, 'hook'],
  'features/catalogos/IngredientesScreen.jsx': [2, 'hook'],
  'features/catalogos/ModificadoresScreen.jsx': [2, 'hook'],
  'features/catalogos/RecetasScreen.jsx': [2, 'hook'],
  'features/compras/ComprasScreen.jsx': [1, 'hook'],
  'features/compras/RecepcionScreen.jsx': [1, 'hook'],
  'features/crm/ClientesScreen.jsx': [3, 'hook'],
  'features/dashboard/AbrirTurnoModal.jsx': [1, 'hook'],
  'features/dashboard/CierreTurnoModal.jsx': [1, 'hook'],
  'features/inventario/MermasScreen.jsx': [1, 'hook'],
  'features/operacion/MesasScreen.jsx': [6, 'hook'],
  'features/operacion/PanelRondas.jsx': [1, 'hook'],
  'features/operacion/TurnoWidget.jsx': [2, 'hook'],
  'features/operacion/components/ModalCobro.jsx': [
    3,
    'el cobro lo cierra el scope `pos-modal`; el pinpad y el diálogo del excedente llevan el hook',
  ],
  'features/pos/components/ConfirmacionStockModal.jsx': [
    1,
    'hook, a `onCancel`: nunca confirma',
  ],
  'features/rh/EmpleadosScreen.jsx': [1, 'hook, por `handleCloseModal`'],
  'features/rh/PermisosScreen.jsx': [3, 'hook'],
  'features/rh/RelojChecadorScreen.jsx': [
    4,
    'tres con el hook; el PIN de la plantilla tenía el suyo escrito a mano',
  ],
};

function archivosJsx(dir = RAIZ, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules') continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) archivosJsx(ruta, acc);
    else if (entrada.name.endsWith('.jsx') && !entrada.name.includes('.test.'))
      acc.push(ruta);
  }
  return acc;
}

const OVERLAY = /fixed inset-0/g;

/** Ruta relativa a `src/`, siempre con `/`, mida donde mida el sistema. */
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/');

const censoReal = () => {
  const real = {};
  for (const archivo of archivosJsx()) {
    const n = (fs.readFileSync(archivo, 'utf8').match(OVERLAY) || []).length;
    if (n) real[rel(archivo)] = n;
  }
  return real;
};

describe('los cuadros que se abren encima se cierran con Escape', () => {
  it('no hay ningún fichero con overlays fuera del censo', () => {
    const nuevos = Object.keys(censoReal()).filter((f) => !(f in CENSO));

    expect(
      nuevos,
      'Estos ficheros pintan un overlay (`fixed inset-0`) y no están en el\n' +
        'censo de `src/test/escape-en-los-cuadros.test.js`.\n\n' +
        'Si es un cuadro de diálogo, tiene que cerrarse con Escape: úsalo desde\n' +
        '`components/ui` o ponle `useCierreConEscape(cerrar, abierto)` con la\n' +
        'MISMA función que su botón de cancelar. Luego añádelo al censo.\n' +
        'Si no es un cuadro —una capa decorativa, una pantalla de carga—,\n' +
        'añádelo al censo con la razón escrita.\n\n' +
        'Sin cubrir:',
    ).toEqual([]);
  });

  it('ningún fichero del censo ha ganado o perdido overlays', () => {
    const real = censoReal();
    const cambiados = [];

    for (const [archivo, [esperados, como]] of Object.entries(CENSO)) {
      const hay = real[archivo] ?? 0;
      if (hay !== esperados) {
        cambiados.push(`${archivo}: censo ${esperados}, hay ${hay} (${como})`);
      }
    }

    expect(
      cambiados,
      'El número de overlays de estos ficheros cambió.\n\n' +
        'Si añadiste un cuadro: cúbrelo con Escape y sube el número del censo.\n' +
        'Si quitaste uno: baja el número. El censo se actualiza A MANO a\n' +
        'propósito, porque es la única forma de que alguien tenga que MIRAR\n' +
        'qué pasó en vez de que un contador se ajuste solo.\n\n' +
        'Descuadres:',
    ).toEqual([]);
  });

  it('el censo no tiene fantasmas: todo lo que lista existe', () => {
    // Un fichero borrado o renombrado deja su fila en el censo, y esa fila
    // pasaría a defender un overlay que ya no existe.
    const real = censoReal();
    const fantasmas = Object.keys(CENSO).filter((f) => !(f in real));
    expect(fantasmas, 'Ficheros del censo que ya no tienen overlays:').toEqual(
      [],
    );
  });
});
