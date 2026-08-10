import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import {
  marcarEntrarComoAdmin,
  olvidarEntrarComoAdmin,
} from '../../lib/Puerta';

/**
 * La marca de cada login, que además es la puerta a la otra.
 *
 * ── POR QUÉ EL LOGO Y NO UN ENLACE ──────────────────────────────────────────
 * Idea de Chris. Un enlace de texto en cada pantalla —«Soy el administrador»,
 * «Soy empleado»— resuelve lo mismo pero deja permanentemente a la vista una
 * salida que se usa una vez cada mucho, y en la pantalla donde menos conviene
 * el ruido: la primera que ve alguien cada día.
 *
 * El logo ya está ahí, ya es el elemento con el que la gente se orienta, y
 * tocarlo para «cambiar de sitio» es un gesto que no hay que enseñar dos veces.
 * Además es SIMÉTRICO, y eso cerró un hueco: la versión con enlace sólo iba de
 * la pantalla de personal a la de correo. De `/login` a la de personal no había
 * ningún camino, así que una tablet que perdiera su token —o el navegador del
 * dueño queriendo abrir turno como mesero— se quedaba sin forma de llegar.
 *
 * ── PERO NO PUEDE SER UN SECRETO ────────────────────────────────────────────
 * Con la redirección de `lib/Puerta.js` en marcha, **este botón es la única
 * salida**: un dispositivo emparejado que teclee `/login` rebota. Una única
 * salida sin nombre deja encerrado de verdad a quien use lector de pantalla, y
 * «discreto» no puede significar «invisible para quien no ve».
 *
 * Por eso lleva `aria-label` y `title` —que no son enlaces de texto: uno lo lee
 * el lector de pantalla y el otro aparece sólo al posar el cursor— y una pista
 * visual que entra al pasar por encima. Descubrible cuando se busca, callado
 * cuando no.
 *
 * ── LA MARCA DE SESIÓN VA AQUÍ Y NO EN QUIEN LLAMA ──────────────────────────
 * Ir hacia el correo desde un dispositivo emparejado exige avisar a la
 * redirección, o `/login` devolvería al dueño a la pantalla de la que acaba de
 * salir. Ir hacia personal exige lo contrario: olvidar esa marca. Son dos mitades
 * de la misma regla y separarlas entre dos pantallas es pedir que una de las dos
 * se olvide.
 *
 * @param {object} props
 * @param {'correo'|'personal'} props.hacia  a qué login lleva el toque
 * @param {React.ReactNode} props.children   la marca: logo, isotipo, lo que sea
 * @param {string} [props.className]         layout del contenedor original
 */
export default function MarcaConmutador({ hacia, children, className = '' }) {
  const navigate = useNavigate();

  const etiqueta =
    hacia === 'correo'
      ? 'Cambiar a acceso de administrador'
      : 'Cambiar a acceso de personal';

  const alPulsar = () => {
    if (hacia === 'correo') {
      // Sin esto, `/login` ve un dispositivo emparejado y rebota de vuelta.
      marcarEntrarComoAdmin();
      navigate('/login', { replace: true });
    } else {
      // Al volver a personal, el dispositivo vuelve a ser lo que es.
      olvidarEntrarComoAdmin();
      navigate('/loginempleados', { replace: true });
    }
  };

  return (
    <button
      type="button"
      onClick={alPulsar}
      aria-label={etiqueta}
      title={etiqueta}
      data-conmutador={hacia}
      // `group` para que la pista reaccione al hover del conjunto y no de sí
      // misma: si dependiera de su propio hover habría que atinarle a un icono
      // de 12 px que además está medio transparente.
      className={`group relative cursor-pointer rounded-ui transition-transform duration-rapida hover:scale-[1.03] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-accent focus-visible:ring-offset-2 ${className}`}
    >
      {children}

      {/* La pista. Aparece al posar el cursor y al enfocar con el tabulador —
          en táctil no hay hover, pero ahí tampoco hay un puntero que dude: se
          toca y se ve qué pasa, y el gesto es reversible tocando otra vez. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-adm-accent text-adm-accent-fg opacity-0 shadow-md transition-opacity duration-rapida group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <ArrowLeftRight className="h-3 w-3" />
      </span>
    </button>
  );
}
