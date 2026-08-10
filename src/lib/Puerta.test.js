// src/lib/Puerta.test.js
//
// Qué login le toca a cada dispositivo. Lo que se fija:
//
//   1. El mesero llega a la puerta que FUNCIONA. La de `/login` no le sirve:
//      busca su PIN contra un `staff` que en un teléfono sin sesión está vacío.
//   2. La caja nunca acaba en la puerta de staff, aunque esté emparejada.
//   3. Ante la duda se manda al correo, no al PIN.
//   4. La salida manual no crea un bucle entre las dos pantallas.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./Hub', () => ({ leerToken: () => '' }));

import {
  puertaDelDispositivo,
  estaEmparejado,
  pidioEntrarComoAdmin,
  marcarEntrarComoAdmin,
  olvidarEntrarComoAdmin,
} from './Puerta';

/** sessionStorage de mentira, para no depender del entorno. */
const sesionFalsa = (inicial = {}) => {
  const d = { ...inicial };
  return {
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => {
      d[k] = String(v);
    },
    removeItem: (k) => {
      delete d[k];
    },
  };
};

describe('a qué puerta va cada dispositivo', () => {
  it('la caja va al correo', () => {
    expect(puertaDelDispositivo({ enTauri: true })).toBe('correo');
  });

  it('la caja va al correo AUNQUE esté emparejada', () => {
    // Puede emparejarse consigo misma; sigue siendo la caja. Si esta regla se
    // invirtiera, el dueño se quedaría sin poder entrar en su propio equipo.
    expect(puertaDelDispositivo({ enTauri: true, emparejado: true })).toBe(
      'correo',
    );
  });

  it('un teléfono emparejado va a código + PIN', () => {
    // Es LA corrección: antes veía el formulario de correo y, si usaba el
    // teclado de PIN de `/login`, no encontraba a nadie.
    expect(puertaDelDispositivo({ emparejado: true })).toBe('codigo-pin');
  });

  it('un navegador cualquiera va al correo', () => {
    expect(puertaDelDispositivo({})).toBe('correo');
  });

  it('ante la duda, correo — nunca PIN', () => {
    // Equivocarse hacia el correo cuesta un clic en el enlace de vuelta.
    // Equivocarse hacia el PIN deja fuera a quien no tiene el código.
    expect(puertaDelDispositivo({ enTauri: false, emparejado: false })).toBe(
      'correo',
    );
    expect(puertaDelDispositivo({})).toBe('correo');
  });
});

describe('la salida manual del dueño', () => {
  it('lleva al correo desde un dispositivo emparejado', () => {
    expect(puertaDelDispositivo({ emparejado: true, pidioAdmin: true })).toBe(
      'correo',
    );
  });

  it('sin ella, el mismo dispositivo volvería a la puerta de staff', () => {
    // Ésta es la que garantiza que no hay bucle: si `pidioAdmin` no pesara, la
    // redirección devolvería al dueño a la pantalla de la que acaba de salir.
    expect(puertaDelDispositivo({ emparejado: true, pidioAdmin: false })).toBe(
      'codigo-pin',
    );
  });

  it('se marca y se olvida', () => {
    const sesion = sesionFalsa();
    expect(pidioEntrarComoAdmin({ sesion })).toBe(false);
    marcarEntrarComoAdmin({ sesion });
    expect(pidioEntrarComoAdmin({ sesion })).toBe(true);
    olvidarEntrarComoAdmin({ sesion });
    expect(pidioEntrarComoAdmin({ sesion })).toBe(false);
  });

  it('vive en sessionStorage, no para siempre', () => {
    // La excepción vale para el rato en que el dueño toma la tablet. Cerrada la
    // pestaña vuelve a ser un dispositivo de staff, que es lo que es casi
    // siempre. Se comprueba con una sesión nueva, que es lo que pasa al cerrar.
    const sesion = sesionFalsa();
    marcarEntrarComoAdmin({ sesion });
    expect(pidioEntrarComoAdmin({ sesion: sesionFalsa() })).toBe(false);
  });
});

describe('la señal de emparejamiento', () => {
  it('sin token, no emparejado', () => {
    expect(estaEmparejado({ token: '' })).toBe(false);
  });

  it('con token, emparejado', () => {
    expect(estaEmparejado({ token: 'tok-123' })).toBe(true);
  });

  it('la llave la sabe Hub.js, no este módulo', () => {
    // El primer intento declaraba aquí su propia constante y la escribió mal
    // (`invventa.hubToken` en vez de `invventa.hub.token`). Nada habría
    // fallado: simplemente ningún teléfono se habría considerado emparejado.
    // Sin token inyectado, delega — y el mock de Hub devuelve cadena vacía.
    expect(estaEmparejado({})).toBe(false);
  });
});
