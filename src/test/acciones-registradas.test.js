// src/test/acciones-registradas.test.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// **Toda acción que deja rastro en Auditoría está en `lib/CatalogoAcciones.js`, con su
// clase.** Lo operativo, con la menor fricción; lo administrativo, estricto
// (principio del 21-oct). Una acción nueva no entra sin decir de qué clase es
// y qué la autoriza.
//
// ── CÓMO ────────────────────────────────────────────────────────────────────
// Lee `src/` y junta los textos que se escriben en el campo `accion` de
// `registrarAuditoria` (incluidos los que salen de una condición, como
// `olvidado ? 'CIERRE_REGISTRO_OLVIDADO' : ...`). El mismo nombre de campo lo
// usan los atajos de teclado (`accion: () => ...`); esos se reconocen porque son
// funciones o variables, nunca un texto en mayúsculas.
//
// No comprueba que la pantalla de verdad pida el PIN: eso llega con
// `ejecutarAccion` en las fases 2 y 3 (DISENO_FASE_1_CIMIENTOS.md §3). Lo que sí
// hace es que la lista exista, esté completa y diga la verdad sobre sí misma.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCIONES } from '../lib/CatalogoAcciones';
import { CAPACIDADES_BASE } from '../lib/Permisos';
import { MENU_ITEMS } from '../lib/Navegacion';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// El valor por omisión de `registrarAuditoria` cuando alguien no manda acción.
// No es una acción: es el aviso de que falta una.
const NO_ES_ACCION = new Set(['ACCIÓN_DESCONOCIDA']);

function ficheros(dir = RAIZ, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name))
      acc.push(p);
  }
  return acc;
}

/** { CODIGO: ['ruta/archivo.jsx', ...] } de lo que se escribe en Auditoría. */
function accionesEscritas() {
  const escritas = {};
  for (const fichero of ficheros()) {
    const texto = fs.readFileSync(fichero, 'utf8');
    const rel = path.relative(RAIZ, fichero).split(path.sep).join('/');
    for (const m of texto.matchAll(/accion:\s*/g)) {
      // La expresión del campo: hasta la coma que cierra la propiedad.
      const expr = texto.slice(m.index + m[0].length).split(/,\s*\n/)[0];
      for (const [, codigo] of expr.matchAll(
        /['"`]([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ_]{3,})['"`]/g,
      )) {
        if (NO_ES_ACCION.has(codigo)) continue;
        (escritas[codigo] ||= []).push(rel);
      }
    }
  }
  return escritas;
}

const FLAGS = new Set(
  Object.values(CAPACIDADES_BASE).flatMap((cap) => Object.keys(cap)),
);
const RUTAS = new Set(MENU_ITEMS.map((i) => i.path.replace(/^\//, '')));

describe('el registro de acciones', () => {
  const escritas = accionesEscritas();

  it('lo que se escribe en Auditoría está en el catálogo', () => {
    const fuera = Object.keys(escritas).filter((c) => !ACCIONES[c]);
    expect(fuera).toEqual([]);
  });

  it('y lo que el catálogo dice que audita, alguien lo escribe', () => {
    const huerfanas = Object.entries(ACCIONES)
      .filter(([, a]) => a.audita)
      .map(([c]) => c)
      .filter((c) => !escritas[c]);
    expect(huerfanas).toEqual([]);
  });

  it('lo que el catálogo dice que NO audita, de verdad no se escribe', () => {
    // Si alguien agrega el rastro, el catálogo tiene que enterarse: se cambia a
    // `audita: true` y se quita la deuda.
    const yaAuditan = Object.entries(ACCIONES)
      .filter(([, a]) => !a.audita)
      .map(([c]) => c)
      .filter((c) => escritas[c]);
    expect(yaAuditan).toEqual([]);
  });

  it('cada acción es operativa o administrativa', () => {
    const malas = Object.entries(ACCIONES)
      .filter(([, a]) => !['operativa', 'administrativa'].includes(a.clase))
      .map(([c]) => c);
    expect(malas).toEqual([]);
  });

  it('una administrativa dice qué la autoriza, o confiesa que todavía no', () => {
    const sinDueno = Object.entries(ACCIONES)
      .filter(([, a]) => a.clase === 'administrativa')
      .filter(([, a]) => !a.autoriza && !a.deuda)
      .map(([c]) => c);
    expect(sinDueno).toEqual([]);
  });

  it('lo que autoriza existe: la capacidad en Permisos o la pantalla en el menú', () => {
    const inventadas = [];
    for (const [codigo, a] of Object.entries(ACCIONES)) {
      if (!a.autoriza) continue;
      const [tipo, valor] = a.autoriza.split(':');
      const existe =
        (tipo === 'flag' && FLAGS.has(valor)) ||
        (tipo === 'ruta' && RUTAS.has(valor));
      if (!existe) inventadas.push(`${codigo} → ${a.autoriza}`);
    }
    expect(inventadas).toEqual([]);
  });

  it('una operativa no lleva autorización', () => {
    const conPin = Object.entries(ACCIONES)
      .filter(([, a]) => a.clase === 'operativa' && a.autoriza)
      .map(([c]) => c);
    expect(conPin).toEqual([]);
  });
});
