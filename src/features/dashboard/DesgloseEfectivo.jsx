// src/features/dashboard/DesgloseEfectivo.jsx
//
// Contar el efectivo por denominaciones, en la apertura y en el cierre.
//
// ── LA REGLA QUE DECIDE SI ESTO FUNCIONA ─────────────────────────────────────
//
// **El desglose SUSTITUYE al campo del total. No se pone al lado.**
//
// Si se piden las dos cosas, la gente teclea el total e inventa el desglose, y
// habríamos añadido trabajo para ganar una mentira mejor escrita. Por eso aquí
// no hay ningún campo donde escribir una cifra: el total es un resultado, y se
// enseña para que quien cuenta lo vea cuadrar.
//
// ── LO QUE SE GANA, QUE NO ES «MÁS DATOS» ────────────────────────────────────
//
// Cuando algo falta, hoy sólo se sabe «faltan 500». Con desglose se sabe si
// falta UN BILLETE de 500 o si son 500 EN MONEDAS DE DIEZ: uno huele a robo y
// el otro a cambio mal dado durante seis horas. Y caza el error más común
// contando efectivo, que es transponer cifras: 1,250 por 1,520.
//
// En la apertura vale más de lo que parece: un fondo de $1,000 en un solo
// billete no puede dar cambio, y la pantalla vieja decía «1000» y escondía
// justo ese dato.
//
// Ver `docs/DISENO_ARQUEO_Y_CAJON.md` §4.
import { arqueoDeDesglose } from '../../lib/Arqueo';

const dinero = (n) =>
  `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «1000» → «$1,000»; «0.5» → «50¢», que es como lo llama quien cuenta. */
const etiqueta = (den) =>
  den < 1 ? `${Math.round(den * 100)}¢` : dinero(den).replace('.00', '');

function Fila({ den, piezas, onPiezas }) {
  const subtotal = (Number(piezas) || 0) * den;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-right font-black text-adm-ink tabular-nums">
        {etiqueta(den)}
      </span>
      <span className="text-adm-muted font-bold">×</span>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        aria-label={`Piezas de ${etiqueta(den)}`}
        value={piezas === undefined ? '' : piezas}
        onChange={(e) => onPiezas(e.target.value)}
        placeholder="0"
        className="w-20 bg-adm-bg border-2 border-adm-field focus:border-adm-ok rounded-ui px-3 py-2 font-black text-adm-ink text-center outline-none transition-colors tabular-nums"
      />
      <span className="flex-1 text-right font-bold text-adm-muted tabular-nums">
        {subtotal > 0 ? dinero(subtotal) : ''}
      </span>
    </div>
  );
}

/**
 * @param {object} p
 * @param {{billetes:number[], monedas:number[]}} p.denominaciones
 * @param {object} p.valor   el desglose, `{ "500": 3 }`
 * @param {Function} p.onChange  recibe el desglose nuevo
 */
export default function DesgloseEfectivo({
  denominaciones,
  valor = {},
  onChange,
}) {
  const { contado, piezas } = arqueoDeDesglose(valor);

  const cambiar = (den) => (bruto) => {
    const n = Math.trunc(Number(bruto));
    const siguiente = { ...valor };
    // Vaciar o poner cero QUITA la clave. Así, un desglose donde no hay nada de
    // una denominación no guarda un `0` que luego habría que interpretar: el
    // conteo dice lo que hay, no lo que no hay.
    if (!Number.isFinite(n) || n <= 0) delete siguiente[String(den)];
    else siguiente[String(den)] = n;
    onChange?.(siguiente);
  };

  const grupo = (titulo, lista) =>
    lista.length > 0 && (
      <div>
        <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest mb-2">
          {titulo}
        </p>
        <div className="space-y-2">
          {lista.map((den) => (
            <Fila
              key={den}
              den={den}
              piezas={valor?.[String(den)]}
              onPiezas={cambiar(den)}
            />
          ))}
        </div>
      </div>
    );

  return (
    // ── DOS COLUMNAS CUANDO CABEN, Y NO ANTES ────────────────────────────
    // Doce renglones en fila son mucha altura: en el cierre empujaban el
    // resto del cuadro fuera de la pantalla y dejaban media pantalla en
    // blanco al lado. Billetes y monedas caben uno junto al otro cuando hay
    // ancho.
    //
    // La consulta es de CONTENEDOR (`@container`), no de ventana: el mismo
    // componente vive en el cierre -ancho- y en la apertura -estrecho-, y lo
    // que decide es el hueco que le toca, no el monitor.
    <div className="@container space-y-5">
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-x-8 gap-y-5 items-start">
        {grupo('Billetes', denominaciones?.billetes || [])}
        {grupo('Monedas', denominaciones?.monedas || [])}
      </div>

      {/* El total es un RESULTADO. No hay dónde escribirlo, y eso es el diseño
          entero: si se pudiera teclear, se teclearía y el desglose se
          inventaría para que cuadrara. */}
      <div className="flex items-end justify-between border-t-2 border-adm-border pt-4">
        <div>
          <p className="text-[10px] font-black text-adm-muted uppercase tracking-widest">
            Total contado
          </p>
          <p className="text-xs font-bold text-adm-muted">
            {piezas} {piezas === 1 ? 'pieza' : 'piezas'}
          </p>
        </div>
        <p
          className="text-3xl font-black font-syne text-adm-ink tabular-nums"
          aria-label="Total contado"
        >
          {dinero(contado)}
        </p>
      </div>
    </div>
  );
}
