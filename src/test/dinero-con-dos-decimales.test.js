// src/test/dinero-con-dos-decimales.test.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// **El dinero se enseña con dos decimales. Nunca con tres.**
//
// `Intl.NumberFormat` tiene un valor por omisión que muerde en silencio:
// cuando se pide `minimumFractionDigits: 2` y NO se pide el máximo, el máximo
// no se queda en 2 — se va a 3. Así que
//
//     (160.008).toLocaleString('es-MX', { minimumFractionDigits: 2 })
//
// devuelve «160.008», y el IVA de una orden aparece en la pantalla con tres
// decimales. Es un error de los que este proyecto llama caros: el código está
// bien escrito de los dos lados, no lanza ninguna excepción, y sólo se nota
// mirando la pantalla en el caso raro.
//
// ── POR QUÉ NO SE VEÍA ANTES ────────────────────────────────────────────────
// Porque casi todo el dinero del sistema venía de precios tecleados con dos
// decimales, y 2 + 2 decimales sigue dando 2. La 0.3.0 lo destapó: el precio
// unitario derivado de un empaque —una arpilla de 30 kg a $100— es 3.3333…, y
// a partir de ahí los subtotales y el IVA dejan de ser redondos.
//
// El fallo estaba en 57 sitios desde antes; el empaque sólo hizo que se viera.
//
// ── POR QUÉ UNA REGLA Y NO UN CENSO ─────────────────────────────────────────
// A diferencia de `escape-en-los-cuadros`, aquí no hay varios mecanismos
// legítimos entre los que elegir: si se fija el mínimo, hay que fijar el
// máximo. Así que esto no cuenta sitios, exige la pareja. Un sitio nuevo que
// se olvide del máximo falla, sin que haya que actualizar ninguna lista.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `__dirname` no existe en un modulo ESM, y aunque vitest lo tolere, eslint lo
// marca. `import.meta.url` es la forma que no depende de eso.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Todos los `.js` y `.jsx` de `src/`, sin las propias pruebas. */
function ficheros(dir = RAIZ, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name))
      acc.push(p);
  }
  return acc;
}

describe('el dinero nunca se enseña con tres decimales', () => {
  it('todo minimumFractionDigits viaja con su maximumFractionDigits', () => {
    const huerfanos = [];

    for (const fichero of ficheros()) {
      const lineas = fs.readFileSync(fichero, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (!linea.includes('minimumFractionDigits')) return;
        // El objeto de opciones cabe de sobra en esta ventana: en el proyecto
        // se escribe o en una línea, o en un `toLocaleString` de tres o cuatro.
        const ventana = lineas.slice(Math.max(0, i - 4), i + 4).join('\n');
        if (!ventana.includes('maximumFractionDigits')) {
          huerfanos.push(`${path.relative(RAIZ, fichero)}:${i + 1}`);
        }
      });
    }

    expect(huerfanos).toEqual([]);
  });

  it('y el valor por omisión de Intl es el que justifica la regla', () => {
    // Si algún día `Intl` cambiara esto, la regla de arriba dejaría de hacer
    // falta. Mientras esta prueba pase, hace falta.
    expect(
      (160.008).toLocaleString('es-MX', { minimumFractionDigits: 2 }),
    ).toBe('160.008');
    expect(
      (160.008).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe('160.01');
  });
});
