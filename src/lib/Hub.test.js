import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parsearPairing,
  enlacePairing,
  capturarTokenDeUrl,
  nombreDeEsteDispositivo,
  guardarToken,
  leerToken,
  baseHub,
  imprimir,
  imprimirVarios,
  enTauri,
} from './Hub';

describe('parsearPairing', () => {
  it('lee el esquema propio del QR', () => {
    const r = parsearPairing(
      'invventa://hub?url=http%3A%2F%2F192.168.1.7%3A3000&token=abc123',
    );
    expect(r).toEqual({ url: 'http://192.168.1.7:3000', token: 'abc123' });
  });

  it('acepta también una URL suelta con el token en el query', () => {
    // Un mesero con prisa pega lo que sea; si se puede entender, se entiende.
    const r = parsearPairing('http://192.168.1.7:3000/?token=abc123');
    expect(r).toEqual({ url: 'http://192.168.1.7:3000', token: 'abc123' });
  });

  it('quita la barra final para que la URL no acabe con doble barra', () => {
    const r = parsearPairing(
      'invventa://hub?url=http%3A%2F%2Fcaja%3A3000%2F&token=t',
    );
    expect(r.url).toBe('http://caja:3000');
  });

  it('devuelve null ante basura en vez de reventar', () => {
    expect(parsearPairing('')).toBeNull();
    expect(parsearPairing(null)).toBeNull();
    expect(parsearPairing('hola qué tal')).toBeNull();
  });

  it('sin token no hay emparejamiento: una URL sola no autoriza nada', () => {
    expect(parsearPairing('http://192.168.1.7:3000')).toBeNull();
  });
});

describe('enlacePairing', () => {
  it('es una URL http normal, NO un esquema propio', () => {
    // Con `invventa://` el teléfono no sabría qué abrir: no hay app instalada,
    // la app ES la web que sirve la caja. El mesero vería un error del sistema.
    const e = enlacePairing({
      url: 'http://192.168.1.7:3000',
      token: 'abc123',
    });
    expect(e).toBe('http://192.168.1.7:3000/?token=abc123');
  });

  it('un solo escaneo lleva al hub Y empareja', () => {
    const datos = { url: 'http://192.168.1.7:3000', token: 'abc123' };
    expect(parsearPairing(enlacePairing(datos))).toEqual(datos);
  });

  it('no duplica la barra si la URL ya la trae', () => {
    expect(enlacePairing({ url: 'http://caja:3000/', token: 't' })).toBe(
      'http://caja:3000/?token=t',
    );
  });

  it('escapa el token: podría traer caracteres de query', () => {
    expect(enlacePairing({ url: 'http://x:3000', token: 'a&b=c' })).toContain(
      'token=a%26b%3Dc',
    );
  });

  it('sin datos devuelve cadena vacía, no un QR que no lleva a nada', () => {
    expect(enlacePairing({})).toBe('');
    expect(enlacePairing({ url: 'http://x' })).toBe('');
  });
});

describe('capturarTokenDeUrl', () => {
  const original = window.location;

  const fingirUrl = (href) => {
    delete window.location;
    window.location = new URL(href);
    window.history.replaceState = vi.fn();
  };

  afterEach(() => {
    window.location = original;
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
  });

  const hubResponde = (cuerpo, ok = true) =>
    vi.fn(() =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 401,
        json: () => Promise.resolve(cuerpo),
      }),
    );

  it('CANJEA el token del QR por uno propio y guarda ESE', async () => {
    // Sin el canje, cada teléfono se quedaría con el token de la caja: no
    // aparecería en la lista, no habría nada que revocar y todos tendrían
    // permisos de administración.
    const fetchFalso = hubResponde({
      ok: true,
      id: 'dev-1',
      nombre: 'Android · Chrome',
      token: 'propio-999',
    });
    vi.stubGlobal('fetch', fetchFalso);
    fingirUrl('http://192.168.1.7:3000/?token=emparejamiento-abc');

    const r = await capturarTokenDeUrl();

    expect(r.emparejado).toBe(true);
    expect(leerToken()).toBe('propio-999');
    expect(leerToken()).not.toBe('emparejamiento-abc');

    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toBe('http://192.168.1.7:3000/hub/emparejar');
    expect(opciones.headers['x-invventa-token']).toBe('emparejamiento-abc');
  });

  it('si el canje FALLA no guarda nada: no se degrada a token de admin', async () => {
    vi.stubGlobal('fetch', hubResponde({ ok: false }, false));
    fingirUrl('http://192.168.1.7:3000/?token=emparejamiento-abc');

    const r = await capturarTokenDeUrl();

    expect(r.emparejado).toBe(false);
    expect(leerToken()).toBe('');
  });

  it('un hub caído tampoco deja el token de emparejamiento guardado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    fingirUrl('http://192.168.1.7:3000/?token=emparejamiento-abc');

    expect((await capturarTokenDeUrl()).emparejado).toBe(false);
    expect(leerToken()).toBe('');
  });

  it('BORRA el token de la barra de direcciones', async () => {
    // Un token en la URL acaba en el historial, en la lista de pestañas y en
    // cualquier captura que alguien mande por WhatsApp.
    vi.stubGlobal('fetch', hubResponde({ ok: true, token: 't' }));
    fingirUrl('http://192.168.1.7:3000/?token=abc123');

    await capturarTokenDeUrl();

    expect(window.history.replaceState).toHaveBeenCalled();
    const [, , nuevaUrl] = window.history.replaceState.mock.calls[0];
    expect(nuevaUrl).not.toContain('token');
  });

  it('limpia la URL aunque el canje falle: el token no se queda a la vista', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('sin red'))),
    );
    fingirUrl('http://192.168.1.7:3000/?token=abc123');

    await capturarTokenDeUrl();

    const [, , nuevaUrl] = window.history.replaceState.mock.calls[0];
    expect(nuevaUrl).not.toContain('abc123');
  });

  it('conserva el resto de los parámetros al limpiar', async () => {
    vi.stubGlobal('fetch', hubResponde({ ok: true, token: 't' }));
    fingirUrl('http://caja:3000/mesas?token=abc&area=terraza');

    await capturarTokenDeUrl();

    const [, , nuevaUrl] = window.history.replaceState.mock.calls[0];
    expect(nuevaUrl).toContain('area=terraza');
    expect(nuevaUrl).toContain('/mesas');
    expect(nuevaUrl).not.toContain('abc');
  });

  it('sin token en la URL no hace nada y no borra el que ya había', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    guardarToken('previo');
    fingirUrl('http://caja:3000/mesas');

    expect((await capturarTokenDeUrl()).emparejado).toBe(false);
    expect(leerToken()).toBe('previo');
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('en la ventana de la caja no empareja: ahí se habla por IPC', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    window.__TAURI_INTERNALS__ = {};
    fingirUrl('http://localhost:3000/?token=abc');

    expect((await capturarTokenDeUrl()).emparejado).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();

    delete window.__TAURI_INTERNALS__;
  });
});

describe('nombreDeEsteDispositivo', () => {
  it('distingue los casos que se van a ver sobre la barra', () => {
    expect(
      nombreDeEsteDispositivo(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      ),
    ).toBe('Android · Chrome');

    expect(
      nombreDeEsteDispositivo(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1 Version/17.0 Safari/604.1',
      ),
    ).toBe('iOS · Safari');
  });

  it('Edge y Chrome no se confunden: ambos dicen ser Safari', () => {
    const edge =
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120';
    expect(nombreDeEsteDispositivo(edge)).toBe('Windows · Edge');
  });

  it('un user agent desconocido no deja el nombre vacío', () => {
    expect(nombreDeEsteDispositivo('')).toBe('Dispositivo');
    expect(nombreDeEsteDispositivo('algo-raro/1.0')).toBe('Dispositivo');
  });
});

describe('baseHub', () => {
  const location = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: location,
      writable: true,
    });
  });

  const fingirOrigen = (protocol, host) => {
    Object.defineProperty(window, 'location', {
      value: { protocol, host },
      writable: true,
    });
  };

  it('por defecto es el propio origen: el hub es quien sirvió la app', () => {
    fingirOrigen('http:', '192.168.1.7:3000');
    expect(baseHub()).toBe('http://192.168.1.7:3000');
  });

  it('un origen explícito gana y se le quita la barra final', () => {
    fingirOrigen('http:', '192.168.1.7:3000');
    expect(baseHub({ origen: 'http://otra:3000/' })).toBe('http://otra:3000');
  });

  it('bajo un esquema no-http cae a localhost', () => {
    // En la ventana de Tauri el origen es `tauri://localhost`, que no sirve
    // como dirección de red.
    fingirOrigen('tauri:', 'localhost');
    expect(baseHub()).toBe('http://localhost:3000');
  });
});

describe('imprimir — degradación', () => {
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
    delete window.__TAURI__;
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:', host: 'caja:3000' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un hub caído NO lanza excepción: el cobro no puede depender del papel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const r = await imprimir({ id: 'x', cuerpo: [{ nombre: 'Café' }] });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('manda el token en la cabecera', async () => {
    const fetchFalso = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ ok: true, estado: 'encolado' }),
      }),
    );
    vi.stubGlobal('fetch', fetchFalso);

    await imprimir({ id: 'x' }, { token: 'secreto' });
    const [, opciones] = fetchFalso.mock.calls[0];
    expect(opciones.headers['x-invventa-token']).toBe('secreto');
  });

  it('pega a /hub/imprimir sobre la base correcta', async () => {
    const fetchFalso = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        json: () => Promise.resolve({}),
      }),
    );
    vi.stubGlobal('fetch', fetchFalso);

    await imprimir({ id: 'x' });
    expect(fetchFalso.mock.calls[0][0]).toBe('http://caja:3000/hub/imprimir');
  });

  it('un documento nulo se rechaza sin tocar la red', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    const r = await imprimir(null);
    expect(r.ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('un duplicado se reporta como ok: reintentar fue lo correcto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, estado: 'duplicado' }),
        }),
      ),
    );
    const r = await imprimir({ id: 'x' });
    expect(r.ok).toBe(true);
    expect(r.estado).toBe('duplicado');
  });
});

describe('imprimirVarios', () => {
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:', host: 'caja:3000' },
      writable: true,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('que la barra falle no deja a cocina sin su comanda', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        n += 1;
        if (n === 1) return Promise.reject(new Error('sin papel'));
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () => Promise.resolve({ ok: true, estado: 'encolado' }),
        });
      }),
    );

    const r = await imprimirVarios([{ id: 'barra' }, { id: 'cocina' }]);

    expect(r.ok).toBe(false);
    expect(r.total).toBe(2);
    expect(r.enviados).toBe(1);
    expect(r.resultados[1].ok).toBe(true);
  });

  it('envía en el orden de la lista, no en paralelo', async () => {
    const orden = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url, opciones) => {
        orden.push(JSON.parse(opciones.body).id);
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () => Promise.resolve({ ok: true }),
        });
      }),
    );

    await imprimirVarios([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(orden).toEqual(['a', 'b', 'c']);
  });

  it('una lista vacía es un éxito trivial, no un error', async () => {
    const r = await imprimirVarios([]);
    expect(r.ok).toBe(true);
    expect(r.total).toBe(0);
  });
});

describe('enTauri', () => {
  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    delete window.__TAURI__;
  });

  it('detecta la ventana de la caja', () => {
    window.__TAURI_INTERNALS__ = {};
    expect(enTauri()).toBe(true);
  });

  it('en un navegador normal es falso', () => {
    expect(enTauri()).toBe(false);
  });
});

describe('puente de Tauri (IPC)', () => {
  // Este bloque existe por una regresión real: la primera versión hacía
  // `await import('@tauri-apps/api/core')`, y Vite resuelve los imports
  // dinámicos de cadena literal al transformar. Con el paquete ausente, TODA
  // prueba que tocara este archivo fallaba —incluida la de integración del POS,
  // que no tiene nada que ver con imprimir—. Ahora se usa el puente que Tauri
  // ya inyecta en la ventana: sin paquete, sin import, sin acoplar al resto.

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    delete window.__TAURI__;
    vi.unstubAllGlobals();
  });

  it('en la caja va por IPC y NO toca la red', async () => {
    const invoke = vi.fn(() => Promise.resolve('encolado'));
    window.__TAURI_INTERNALS__ = { invoke };
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);

    const r = await imprimir({ id: 'x' });

    expect(r).toEqual({ ok: true, estado: 'encolado' });
    expect(invoke).toHaveBeenCalledWith('hub_imprimir', {
      documento: { id: 'x' },
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('también acepta el puente global de withGlobalTauri', async () => {
    const invoke = vi.fn(() => Promise.resolve('encolado'));
    window.__TAURI__ = { core: { invoke } };

    const r = await imprimir({ id: 'x' });
    expect(r.ok).toBe(true);
    expect(invoke).toHaveBeenCalled();
  });

  it('una ventana de Tauri SIN puente degrada en vez de lanzar', async () => {
    // `enTauri()` da true por la marca global, pero el puente no está. Antes
    // esto reventaba hacia arriba y podía tumbar un cobro.
    window.__TAURI_INTERNALS__ = {};

    const r = await imprimir({ id: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/puente/i);
  });

  it('un fallo del comando de Rust tampoco lanza', async () => {
    window.__TAURI_INTERNALS__ = {
      invoke: vi.fn(() => Promise.reject(new Error('el hub no está activo'))),
    };

    const r = await imprimir({ id: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('el hub no está activo');
  });
});
