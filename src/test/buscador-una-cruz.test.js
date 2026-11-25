// src/test/buscador-una-cruz.test.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// **Un campo de búsqueda tiene una sola cruz para borrar: la nuestra.**
// Chromium, y por tanto el WebView de la caja, le pinta su propia cruz a todo
// `<input type="search">`. En el POS de la 0.3.3 salían dos juntas, una azul y
// chica y la nuestra de 44 px (D3, `DECISION_13-NOV_DISENO_VISUAL.md` §9).
//
// No se cambia el tipo de campo: en el teléfono, `type="search"` es lo que pone
// la tecla «Buscar» en el teclado. Se esconde la cruz del navegador con la
// clase `sin-cruz-nativa`, definida en `index.css`.
//
// jsdom no pinta pseudo-elementos, así que esto no puede «ver» la cruz. Lo que
// sí comprueba: que la regla existe y que ningún campo de búsqueda de `src/` se
// queda sin la clase.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ficheros(dir = RAIZ, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (/\.jsx$/.test(e.name) && !/\.test\.jsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe('una sola cruz en los campos de búsqueda', () => {
  it('index.css esconde la cruz del navegador con `sin-cruz-nativa`', () => {
    const css = fs.readFileSync(path.join(RAIZ, 'index.css'), 'utf8');
    expect(css).toMatch(
      /\.sin-cruz-nativa::-webkit-search-cancel-button\s*\{[^}]*display:\s*none/,
    );
  });

  it('todo `type="search"` de src/ lleva la clase', () => {
    const sinClase = [];
    let vistos = 0;
    for (const f of ficheros()) {
      const texto = fs.readFileSync(f, 'utf8');
      // Hasta el `/>` que cierra el campo, no hasta el primer `>`: las
      // flechas de los manejadores (`(e) => …`) tienen uno antes.
      for (const m of texto.matchAll(/<input\b[\s\S]*?\/>/g)) {
        if (!/type="search"/.test(m[0])) continue;
        vistos++;
        if (!/sin-cruz-nativa/.test(m[0])) {
          sinClase.push(path.relative(RAIZ, f));
        }
      }
    }
    // Si no encuentra ninguno, la prueba no está mirando nada.
    expect(vistos).toBeGreaterThan(0);
    expect(sinClase).toEqual([]);
  });
});
