// src/utils/parseUTC.js
// Supabase a veces devuelve timestamps sin sufijo 'Z' (ej. '2025-05-30T23:00:00')
// JavaScript los interpreta como hora LOCAL en lugar de UTC → bugs de duración negativa.
// Este helper garantiza interpretación UTC siempre.
export const parseUTC = (str) => {
  if (!str) return null;
  const s = str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str) ? str : str + 'Z';
  return new Date(s);
};
