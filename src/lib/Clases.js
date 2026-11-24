/**
 * Clases.js — juntar clases de Tailwind sin dejar huecos.
 *
 * `unir('a', cond && 'b', '')` → `'a b'` cuando `cond` es verdadero y `'a'`
 * cuando no. Los `false`, `null`, `undefined` y textos vacíos se caen; sin eso,
 * el `className` acaba con «false» o con dobles espacios.
 *
 * Vivía copiado en tres componentes base (Adm, Ops y DataTable). Aquí y no en
 * un `.jsx` porque no es un componente: la regla de react-refresh pide que un
 * archivo de componentes sólo exporte componentes.
 */
export const unir = (...clases) => clases.filter(Boolean).join(' ');
