// src/lib/Escape.test.js
//
// La prueba que le importa a Chris no es «¿funciona para el barista?» sino
// «¿puede volver a pasarle a alguien?». Por eso el grueso de este archivo es una
// MATRIZ: todos los roles × todas las pantallas sin riel, más roles inventados
// —incluidos los rotos— para cubrir los que cada restaurante creará después.
import { describe, it, expect } from 'vitest';
import { rutaDeEscape, escapeEsPerfil, RUTA_ULTIMO_RECURSO } from './Escape';
import { CAPACIDADES_BASE, puedeVerRuta } from './Permisos';
import { RUTAS_PANTALLA_COMPLETA } from './Navegacion';

// Roles que no existen hoy y que alguien creará desde Ajustes → Permisos. Son
// los que de verdad ponen a prueba la regla: el código no los conoce.
const ROLES_FUTUROS = {
  'Parrillero (sólo KDS, sin perfil)': {
    rutas: ['kds'],
    ruta_inicial: '/kds',
  },
  'Cajero de barra (sólo POS)': {
    rutas: ['pos'],
    ruta_inicial: '/pos',
  },
  'Runner (perfil y nada más)': {
    rutas: ['perfil'],
    ruta_inicial: '/perfil',
  },
  'Rol vacío': { rutas: [], ruta_inicial: '' },
  'Rol con capacidades corruptas': { rutas: 'kds', ruta_inicial: 42 },
};

const TODOS = { ...CAPACIDADES_BASE, ...ROLES_FUTUROS };

describe('rutaDeEscape · la garantía, para todo rol y toda pantalla', () => {
  // Sin riel lateral, la pantalla es la ÚNICA que puede ofrecer salida. Si
  // mañana se agrega una tercera ruta a pantalla completa, entra sola en esta
  // matriz y hay que resolverle la salida antes de que la suite pase.
  const pantallas = [...RUTAS_PANTALLA_COMPLETA, '/perfil', '/mesas'];

  Object.entries(TODOS).forEach(([nombre, cap]) => {
    pantallas.forEach((pantalla) => {
      it(`${nombre} en ${pantalla}: sale a algún lado, y no es donde ya está`, () => {
        const destino = rutaDeEscape({ cap, rutaActual: pantalla });

        // Las tres condiciones que definen «no quedarse encerrado».
        expect(destino).toBeTruthy();
        expect(destino).not.toBe(pantalla);
        expect(
          puedeVerRuta(cap, destino) || destino === RUTA_ULTIMO_RECURSO,
        ).toBe(true);
      });
    });
  });
});

describe('rutaDeEscape · a dónde manda a cada quien', () => {
  it('EL CASO DEL 12-ago: Barista en el KDS va a su perfil', () => {
    // Su ruta_inicial ES /kds. Antes se navegaba ahí y el botón no hacía nada.
    const destino = rutaDeEscape({
      cap: CAPACIDADES_BASE.Barista,
      rutaActual: '/kds',
    });
    expect(destino).toBe('/perfil');
    expect(escapeEsPerfil(destino)).toBe(true);
  });

  it('Chef igual que Barista', () => {
    expect(
      rutaDeEscape({ cap: CAPACIDADES_BASE.Chef, rutaActual: '/kds' }),
    ).toBe('/perfil');
  });

  it('Admin en el KDS sigue cayendo en su tablero, como siempre', () => {
    // El arreglo NO debe cambiarle el hábito a quien ya tenía salida buena.
    expect(
      rutaDeEscape({ cap: CAPACIDADES_BASE.Admin, rutaActual: '/kds' }),
    ).toBe('/dashboard');
  });

  it('Gerente en el KDS, al tablero', () => {
    expect(
      rutaDeEscape({ cap: CAPACIDADES_BASE.Gerente, rutaActual: '/kds' }),
    ).toBe('/dashboard');
  });

  it('Mesero en el POS vuelve al mapa de mesas', () => {
    expect(
      rutaDeEscape({ cap: CAPACIDADES_BASE.Mesero, rutaActual: '/pos' }),
    ).toBe('/mesas');
  });

  it('Mesero en Mesas —su propia ruta inicial— cae en perfil', () => {
    // Mismo encierro que el del KDS, sólo que Mesas sí lleva riel y por eso
    // nunca se notó. La regla lo cubre igual.
    expect(
      rutaDeEscape({ cap: CAPACIDADES_BASE.Mesero, rutaActual: '/mesas' }),
    ).toBe('/perfil');
  });
});

describe('rutaDeEscape · los roles que todavía no existen', () => {
  it('un rol nuevo con SÓLO el KDS y sin perfil no queda encerrado', () => {
    // No puede ver /perfil ni ningún destino del menú. Sin el suelo público, la
    // función devolvería la propia pantalla y el encierro volvería, esta vez
    // para un rol que el código no conoce.
    const destino = rutaDeEscape({
      cap: ROLES_FUTUROS['Parrillero (sólo KDS, sin perfil)'],
      rutaActual: '/kds',
    });
    expect(destino).toBe(RUTA_ULTIMO_RECURSO);
  });

  it('un rol con la lista de rutas vacía tampoco', () => {
    expect(
      rutaDeEscape({ cap: ROLES_FUTUROS['Rol vacío'], rutaActual: '/kds' }),
    ).toBe(RUTA_ULTIMO_RECURSO);
  });

  it('capacidades corruptas caen al suelo en vez de reventar', () => {
    // `rutas` como texto en vez de lista, `ruta_inicial` como número: basura
    // que puede llegar de `roles_permisos` mal editado. Lo que NO puede pasar
    // es que la pantalla se quede sin botón porque la función lanzó.
    expect(
      rutaDeEscape({
        cap: ROLES_FUTUROS['Rol con capacidades corruptas'],
        rutaActual: '/kds',
      }),
    ).toBe(RUTA_ULTIMO_RECURSO);
  });

  it('sin capacidades ninguna, al suelo', () => {
    expect(rutaDeEscape({ cap: null, rutaActual: '/kds' })).toBe(
      RUTA_ULTIMO_RECURSO,
    );
    expect(rutaDeEscape({ rutaActual: '/kds' })).toBe(RUTA_ULTIMO_RECURSO);
  });
});

describe('rutaDeEscape · detalles que se rompen solos', () => {
  it('la barra final no cambia el resultado', () => {
    // `/kds/` y `/kds` son la misma pantalla. Sin normalizar, la comparación
    // fallaría y el botón volvería a apuntar a donde ya estás.
    expect(
      rutaDeEscape({ cap: CAPACIDADES_BASE.Barista, rutaActual: '/kds/' }),
    ).toBe('/perfil');
  });

  it('un módulo premium no contratado no se ofrece como salida', () => {
    // El menú filtra por plan; la salida tiene que usar el MISMO criterio o
    // mandaría a una pantalla que el guard del plan rebota.
    // `/clientes` es del módulo `lealtad`; sin contratarlo, el menú no lo pinta.
    const soloPremium = { rutas: ['kds', 'clientes'], ruta_inicial: '/kds' };
    const destino = rutaDeEscape({
      cap: soloPremium,
      rutaActual: '/kds',
      tieneModulo: () => false,
    });
    expect(destino).toBe(RUTA_ULTIMO_RECURSO);
  });

  it('escapeEsPerfil no se confunde con rutas parecidas', () => {
    expect(escapeEsPerfil('/perfil')).toBe(true);
    expect(escapeEsPerfil('/perfil/')).toBe(true);
    expect(escapeEsPerfil('/perfiles')).toBe(false);
    expect(escapeEsPerfil('/dashboard')).toBe(false);
    expect(escapeEsPerfil(null)).toBe(false);
  });
});
