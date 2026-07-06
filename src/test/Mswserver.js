// src/test/msw/server.js
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Base del REST de Supabase (PostgREST). Ajusta VITE_SUPABASE_URL en .env.test.
const SUPABASE_URL =
  (import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  'https://test.supabase.co';
const REST = `${SUPABASE_URL}/rest/v1`;

// Handlers por defecto: catálogos vacíos, inserts ecoan el body, RPC vacía.
// Cada test puede sobreescribir con server.use(...) para escenarios concretos
// (p.ej. RPC decrementar_stock devolviendo insuficiente=true).
export const handlers = [
  http.get(`${REST}/:tabla`, () => HttpResponse.json([])),
  http.post(`${REST}/:tabla`, async ({ request }) => {
    const body = await request.json().catch(() => []);
    return HttpResponse.json(Array.isArray(body) ? body : [body], {
      status: 201,
    });
  }),
  http.patch(`${REST}/:tabla`, async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return HttpResponse.json([body]);
  }),
  http.delete(`${REST}/:tabla`, () => HttpResponse.json([])),
  // RPC atómicas (decrementar_stock, etc.)
  http.post(`${REST}/rpc/:fn`, () => HttpResponse.json([])),
];

export const server = setupServer(...handlers);
