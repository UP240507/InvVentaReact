// ─── VERIFICADOR DE CONTRASTE WCAG AA ────────────────────────────────────────
// Lee los tokens de color de src/index.css y comprueba cada par texto/fondo que
// la app realmente usa, en los 3 temas × claro/oscuro (12 bloques).
//
// Por qué un script y no una revisión a ojo: son ~250 pares. A ojo se revisa el
// tema por defecto en claro, que es el que uno tiene abierto, y los otros once
// bloques se rompen sin que nadie lo note. Este script ya encontró 10 fallos
// que llevaban meses en la paleta de admin.
//
// Uso:  node scripts/verificar-contraste.mjs
// Sale con código 1 si algún par obligatorio falla.

import { readFileSync } from 'node:fs';

const AA_NORMAL = 4.5; // texto < 18.66px (la mayoría de la UI)
const AA_GRANDE = 3.0; // texto ≥ 18.66px en negrita, o ≥ 24px
const AA_NO_TEXTO = 3.0; // bordes, iconos, indicadores de estado

// ── Color ────────────────────────────────────────────────────────────────────
function aRGB(css) {
  const s = css.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('');
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

// Un token con alfa (los bordes lo tienen) no se juzga solo: se compone contra
// el fondo sobre el que se pinta. Ignorarlo daría un contraste inventado.
const componer = (frente, fondo) => {
  const a = frente[3];
  return [
    frente[0] * a + fondo[0] * (1 - a),
    frente[1] * a + fondo[1] * (1 - a),
    frente[2] * a + fondo[2] * (1 - a),
    1,
  ];
};

const luminancia = ([r, g, b]) => {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (frente, fondo) => {
  const f = frente[3] < 1 ? componer(frente, fondo) : frente;
  const L1 = luminancia(f);
  const L2 = luminancia(fondo);
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
};

// ── Extraer los bloques de tema de index.css ─────────────────────────────────
function leerBloques(css) {
  const bloques = new Map();
  const re = /(:root(?:\[data-tema='[^']+'\])?(?:\.dark)?)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1];
    const tema = sel.match(/data-tema='([^']+)'/)?.[1] ?? 'terracota';
    const modo = sel.includes('.dark') ? 'oscuro' : 'claro';
    const clave = `${tema} · ${modo}`;
    const vars = bloques.get(clave) ?? {};
    for (const línea of m[2].split('\n')) {
      const v = línea.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
      if (v) vars[v[1]] = v[2].trim();
    }
    bloques.set(clave, vars);
  }
  return bloques;
}

// ── Los pares que la app realmente pinta ─────────────────────────────────────
// [texto, fondo, umbral, descripción, nivel?]. Si un par no está aquí es que no
// existe en la UI: la lista se mantiene a mano a propósito, para que agregar un
// rol de color obligue a decidir sobre qué fondo vive.
//
// `nivel: 'aviso'` = se reporta pero no rompe la verificación. Los bordes van
// así porque el mismo token hace dos trabajos distintos: separar una tarjeta
// —decoración, que WCAG 1.4.11 no exige— y dibujar el contorno de un input
// —eso SÍ es un componente de interfaz y exige 3:1—. Subir el token de golpe
// pondría líneas pesadas alrededor de cada tarjeta. La salida separa ambos
// casos para poder decidir; ver la nota al pie del reporte.
const PARES = [
  // ── Superficie ADMIN ──
  ['--adm-ink', '--adm-bg', AA_NORMAL, 'texto sobre el lienzo'],
  ['--adm-ink', '--adm-panel', AA_NORMAL, 'texto sobre tarjeta'],
  ['--adm-muted', '--adm-bg', AA_NORMAL, 'texto secundario sobre lienzo'],
  ['--adm-muted', '--adm-panel', AA_NORMAL, 'texto secundario en tarjeta'],
  ['--adm-accent', '--adm-bg', AA_GRANDE, 'acento sobre lienzo'],
  ['--adm-accent', '--adm-panel', AA_GRANDE, 'acento en tarjeta'],
  ['--adm-accent-fg', '--adm-accent', AA_NORMAL, 'botón primario'],
  ['--adm-ok', '--adm-panel', AA_GRANDE, 'éxito en tarjeta'],
  ['--adm-ok-fg', '--adm-ok', AA_NORMAL, 'chip de éxito'],
  ['--adm-danger', '--adm-panel', AA_GRANDE, 'peligro en tarjeta'],
  ['--adm-danger', '--adm-bg', AA_GRANDE, 'peligro sobre lienzo'],
  ['--adm-danger-fg', '--adm-danger', AA_NORMAL, 'botón destructivo'],
  ['--adm-warn', '--adm-panel', AA_GRANDE, 'aviso en tarjeta'],
  ['--adm-warn-fg', '--adm-warn', AA_NORMAL, 'chip de aviso'],
  ['--adm-info', '--adm-panel', AA_GRANDE, 'info en tarjeta'],
  ['--adm-info-fg', '--adm-info', AA_NORMAL, 'botón informativo'],
  ['--adm-cobro-fg', '--adm-cobro', AA_NORMAL, 'CTA de dinero'],
  ['--adm-chip-fg', '--adm-chip', AA_NORMAL, 'chip neutro'],
  // Separador: decoración, se reporta pero no bloquea (ver nota arriba).
  ['--adm-border', '--adm-panel', AA_NO_TEXTO, 'separador en tarjeta', 'aviso'],
  ['--adm-border', '--adm-bg', AA_NO_TEXTO, 'separador sobre lienzo', 'aviso'],
  // Contorno de control: SÍ es obligatorio (WCAG 1.4.11).
  ['--adm-field', '--adm-panel', AA_NO_TEXTO, 'input sobre tarjeta'],
  ['--adm-field', '--adm-bg', AA_NO_TEXTO, 'input sobre lienzo'],
  // Sidebar: fondo propio, siempre oscuro, no sigue el modo.
  ['--adm-sidebar-fg', '--adm-sidebar', AA_NORMAL, 'menú lateral'],
  ['--adm-sidebar-muted', '--adm-sidebar', AA_NORMAL, 'menú lateral atenuado'],
  ['--adm-sidebar-fg', '--adm-sidebar-2', AA_NORMAL, 'menú lateral activo'],

  // ── Superficie OPERACIÓN ──
  ['--ops-ink', '--ops-bg', AA_NORMAL, 'texto sobre el lienzo'],
  ['--ops-ink', '--ops-panel', AA_NORMAL, 'texto sobre panel'],
  ['--ops-ink', '--ops-panel-2', AA_NORMAL, 'texto sobre panel 2'],
  ['--ops-muted', '--ops-panel', AA_NORMAL, 'texto secundario'],
  ['--ops-muted', '--ops-panel-2', AA_NORMAL, 'texto secundario en panel 2'],
  ['--ops-accent', '--ops-panel', AA_GRANDE, 'acento en panel'],
  ['--ops-accent-fg', '--ops-accent', AA_NORMAL, 'botón primario'],
  ['--ops-ok', '--ops-panel', AA_GRANDE, 'mesa libre'],
  ['--ops-ok-fg', '--ops-ok', AA_NORMAL, 'botón de éxito'],
  ['--ops-danger', '--ops-panel', AA_GRANDE, 'mesa ocupada'],
  ['--ops-danger-fg', '--ops-danger', AA_NORMAL, 'botón destructivo'],
  ['--ops-warn', '--ops-panel', AA_GRANDE, 'en espera'],
  ['--ops-info', '--ops-panel', AA_GRANDE, 'informativo'],
  ['--ops-cobro-fg', '--ops-cobro', AA_NORMAL, 'botón de cobro'],
  ['--ops-border', '--ops-panel', AA_NO_TEXTO, 'separador en panel', 'aviso'],
  [
    '--ops-border',
    '--ops-panel-2',
    AA_NO_TEXTO,
    'separador en panel 2',
    'aviso',
  ],
  ['--ops-field', '--ops-panel', AA_NO_TEXTO, 'input sobre panel'],
  ['--ops-field', '--ops-panel-2', AA_NO_TEXTO, 'input sobre panel 2'],
  ['--ops-field', '--ops-bg', AA_NO_TEXTO, 'input sobre lienzo'],
];

// ── Ejecutar ─────────────────────────────────────────────────────────────────
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const bloques = leerBloques(css);

let total = 0;
const fallos = [];
const avisos = [];

for (const [nombre, vars] of bloques) {
  for (const [tokFg, tokBg, umbral, desc, nivel] of PARES) {
    const fg = vars[tokFg] && aRGB(vars[tokFg]);
    const bg = vars[tokBg] && aRGB(vars[tokBg]);
    if (!fg || !bg) continue; // el bloque no define ese rol
    total += 1;
    const r = ratio(fg, bg);
    if (r < umbral) {
      const línea =
        `  ${nivel === 'aviso' ? '·' : '✗'} ${nombre.padEnd(22)}` +
        ` ${tokFg} sobre ${tokBg} → ${r.toFixed(2)}:1` +
        ` (mínimo ${umbral}) · ${desc}`;
      (nivel === 'aviso' ? avisos : fallos).push(línea);
    }
  }
}

console.log(`Contraste WCAG AA · ${bloques.size} bloques · ${total} pares`);

if (fallos.length === 0) {
  console.log('  Texto y componentes: todos cumplen ✓');
} else {
  console.log(`  ${fallos.length} par(es) por debajo del mínimo:\n`);
  console.log(fallos.join('\n'));
  process.exitCode = 1;
}

if (avisos.length > 0) {
  console.log(`\n  ${avisos.length} aviso(s) — bordes por debajo de 3:1:`);
  console.log(avisos.slice(0, 4).join('\n'));
  if (avisos.length > 4) console.log(`  … y ${avisos.length - 4} más.`);
  console.log(
    '\n  Esperado: como SEPARADOR de tarjetas, WCAG 1.4.11 no exige contraste\n' +
      '  a la decoración, y un borde al 3:1 alrededor de cada tarjeta\n' +
      '  convertiría la interfaz en una rejilla. Los controles (inputs, selects,\n' +
      '  textareas) NO usan este token: tienen --adm-field / --ops-field, que sí\n' +
      '  se verifica arriba como obligatorio.',
  );
}
