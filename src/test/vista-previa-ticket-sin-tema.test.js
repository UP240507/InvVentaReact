// src/test/vista-previa-ticket-sin-tema.test.js
//
// ── LA REGLA QUE ESTO DEFIENDE ──────────────────────────────────────────────
// **La vista previa del ticket es papel, y el papel no sigue el tema.** En
// Configuración → Tickets la hoja es blanca fija, pero el texto usaba los
// colores del tema (`text-adm-ink`, `text-adm-muted`, `border-adm-border`).
// En modo oscuro `adm-ink` es un color claro: blanco sobre blanco, y el dueño
// no podía leer cómo sale su ticket (D1, `DECISION_13-NOV_DISENO_VISUAL.md`
// §9, captura de Chris del 25-nov).
//
// La convención es la del ticket en pantalla (`TicketImpresion.jsx`): tinta
// negra y grises fijos. Esta prueba lee el código de la hoja, desde su
// `bg-white` hasta la pestaña siguiente, y falla si aparece un color del tema.
// El marco alrededor de la hoja sí sigue el tema, y no se mira.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARCHIVO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../features/ajustes/ConfiguracionScreen.jsx',
);

describe('la vista previa del ticket no sigue el tema', () => {
  const src = fs.readFileSync(ARCHIVO, 'utf8');
  const inicio = src.indexOf('{/* Vista previa ticket');
  const hoja = src.indexOf('bg-white', inicio);
  const fin = src.indexOf('{/* ── PERSONAL ── */}', hoja);
  const papel = src.slice(hoja, fin);

  it('encuentra la hoja (si no, la prueba no mira nada)', () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(hoja).toBeGreaterThan(inicio);
    expect(fin).toBeGreaterThan(hoja);
    expect(papel).toMatch(/TOTAL/);
  });

  it('dentro de la hoja no hay colores del tema', () => {
    const delTema = [
      ...papel.matchAll(/\b(?:text|border|bg)-adm-[a-z-]+/g),
    ].map((m) => m[0]);
    expect(delTema).toEqual([]);
  });
});
