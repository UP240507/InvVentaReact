import { describe, it, expect } from 'vitest';
import {
  correoValido,
  normalizarCorreo,
  validarPassword,
  urlDeRetorno,
  leerEnlace,
  mensajeDeError,
  mensajeEnviado,
  origenDeRetorno,
  esCorreoSinConfirmar,
  MIN_PASSWORD,
} from './Recuperacion';

describe('correoValido', () => {
  it('acepta correos normales', () => {
    expect(correoValido('chris@azul.mx')).toBe(true);
    expect(correoValido('a.b+etiqueta@sub.dominio.com')).toBe(true);
  });

  it('rechaza los dedazos que no merecen gastar un envío', () => {
    expect(correoValido('chris')).toBe(false);
    expect(correoValido('chris@azul')).toBe(false);
    expect(correoValido('@azul.mx')).toBe(false);
    expect(correoValido('chris azul@x.mx')).toBe(false);
    expect(correoValido('')).toBe(false);
    expect(correoValido(null)).toBe(false);
  });

  it('tolera espacios alrededor: el usuario pega el correo de otro sitio', () => {
    expect(correoValido('  chris@azul.mx  ')).toBe(true);
  });
});

describe('normalizarCorreo', () => {
  it('baja a minúsculas y quita espacios', () => {
    expect(normalizarCorreo('  Chris@Azul.MX ')).toBe('chris@azul.mx');
  });

  it('un valor ausente no revienta', () => {
    expect(normalizarCorreo(undefined)).toBe('');
  });
});

describe('validarPassword', () => {
  it('exige la longitud mínima', () => {
    const r = validarPassword('corta12', 'corta12');
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MIN_PASSWORD));
  });

  it('acepta una contraseña larga sin exigir símbolos', () => {
    // La política es longitud, no composición: pedir símbolos empuja a
    // "Password1!" y al papelito pegado al monitor de la caja.
    expect(
      validarPassword('caballo verde grande', 'caballo verde grande').ok,
    ).toBe(true);
  });

  it('detecta que la confirmación no coincide', () => {
    const r = validarPassword('contrasena1', 'contrasena2');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no coinciden');
  });

  it('sin contraseña pide una, no habla de longitud', () => {
    const r = validarPassword('', '');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Escribe/);
  });

  it('sin confirmación se valida solo la contraseña', () => {
    expect(validarPassword('contrasena1').ok).toBe(true);
  });
});

describe('urlDeRetorno', () => {
  it('se construye desde el origen, no se escribe a mano', () => {
    expect(urlDeRetorno('https://invventa.app')).toBe(
      'https://invventa.app/nueva-contrasena',
    );
  });

  it('no genera doble barra si el origen ya la trae', () => {
    expect(urlDeRetorno('http://localhost:5173/')).toBe(
      'http://localhost:5173/nueva-contrasena',
    );
  });

  it('funciona con la IP del hub en la LAN', () => {
    // Desde la fase 3 la app también se sirve desde la caja.
    expect(urlDeRetorno('http://192.168.1.7:3000')).toBe(
      'http://192.168.1.7:3000/nueva-contrasena',
    );
  });
});

describe('origenDeRetorno — a dónde apunta el enlace del correo', () => {
  it('desde la caja usa la URL del HUB, no el origen de la ventana', () => {
    // El enlace se abre en el navegador del sistema. El origen interno de
    // Tauri no existe fuera de su ventana: sería un correo que no lleva a
    // ninguna parte.
    expect(
      origenDeRetorno({
        origenActual: 'http://tauri.localhost',
        urlDelHub: 'http://192.168.1.7:3000',
        esTauri: true,
      }),
    ).toBe('http://192.168.1.7:3000');
  });

  it('desde la caja SIN hub devuelve null en vez de un enlace muerto', () => {
    expect(
      origenDeRetorno({
        origenActual: 'http://tauri.localhost',
        urlDelHub: null,
        esTauri: true,
      }),
    ).toBeNull();
  });

  it('nunca acepta una dirección de Tauri como destino', () => {
    expect(
      origenDeRetorno({
        origenActual: 'http://tauri.localhost',
        urlDelHub: 'http://tauri.localhost',
        esTauri: true,
      }),
    ).toBeNull();
    expect(
      origenDeRetorno({
        origenActual: 'tauri://localhost',
        urlDelHub: null,
        esTauri: false,
      }),
    ).toBeNull();
  });

  it('desde el teléfono servido por el hub, el propio origen ya sirve', () => {
    expect(
      origenDeRetorno({
        origenActual: 'http://192.168.1.7:3000',
        urlDelHub: 'http://192.168.1.7:3000',
        esTauri: false,
      }),
    ).toBe('http://192.168.1.7:3000');
  });

  it('en desarrollo, localhost sirve tal cual', () => {
    expect(origenDeRetorno({ origenActual: 'http://localhost:5173' })).toBe(
      'http://localhost:5173',
    );
  });

  it('un origen https de producción se respeta', () => {
    expect(origenDeRetorno({ origenActual: 'https://invventa.app' })).toBe(
      'https://invventa.app',
    );
  });

  it('sin origen utilizable, null', () => {
    expect(origenDeRetorno({})).toBeNull();
    expect(origenDeRetorno({ origenActual: 'file:///C:/app' })).toBeNull();
  });
});

describe('leerEnlace', () => {
  it('lee el flujo implícito, con el token en el FRAGMENTO', () => {
    // searchParams no ve el fragmento: si se leyera de ahí, el flujo entero
    // fallaría en silencio.
    const r = leerEnlace(
      'https://x.app/nueva-contrasena#access_token=abc&refresh_token=def&type=recovery',
    );
    expect(r.tipo).toBe('implicito');
    expect(r.accessToken).toBe('abc');
    expect(r.refreshToken).toBe('def');
    expect(r.subtipo).toBe('recovery');
  });

  it('lee el flujo PKCE, con el código en el query', () => {
    const r = leerEnlace('https://x.app/nueva-contrasena?code=xyz');
    expect(r.tipo).toBe('pkce');
    expect(r.code).toBe('xyz');
  });

  it('DETECTA el enlace caducado, que llega como error en la propia URL', () => {
    // Es el caso más frecuente del flujo. Sin esto la pantalla espera una
    // sesión que no va a llegar y no dice por qué.
    const r = leerEnlace(
      'https://x.app/nueva-contrasena#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(r.tipo).toBe('error');
    expect(r.codigo).toBe('otp_expired');
    expect(r.descripcion).toContain('expired');
  });

  it('el error también se detecta si viene en el query', () => {
    const r = leerEnlace('https://x.app/nueva-contrasena?error=access_denied');
    expect(r.tipo).toBe('error');
  });

  it('el error gana sobre el token: un enlace no puede ser válido y fallido', () => {
    const r = leerEnlace(
      'https://x.app/n#error=access_denied&access_token=residuo',
    );
    expect(r.tipo).toBe('error');
  });

  it('distingue un enlace de recuperación de uno de invitación', () => {
    const r = leerEnlace('https://x.app/n#access_token=abc&type=invite');
    expect(r.subtipo).toBe('invite');
  });

  it('una URL sin nada devuelve "ninguno"', () => {
    expect(leerEnlace('https://x.app/nueva-contrasena').tipo).toBe('ninguno');
  });

  it('una URL basura devuelve "ninguno" en vez de lanzar', () => {
    expect(leerEnlace('no soy una url').tipo).toBe('ninguno');
    expect(leerEnlace(null).tipo).toBe('ninguno');
    expect(leerEnlace(undefined).tipo).toBe('ninguno');
  });
});

describe('mensajeDeError — cada mensaje dice QUÉ HACER', () => {
  it('enlace caducado → pide uno nuevo', () => {
    const m = mensajeDeError({
      message: 'Email link is invalid or has expired',
    });
    expect(m).toContain('Pide uno nuevo');
  });

  it('el código otp_expired también se reconoce', () => {
    expect(mensajeDeError({ message: 'otp_expired' })).toContain(
      'Pide uno nuevo',
    );
  });

  it('límite de envíos → dice cuánto esperar', () => {
    const m = mensajeDeError({
      message:
        'For security purposes, you can only request this after 51 seconds',
    });
    expect(m).toContain('Espera');
  });

  it('contraseña rechazada por el servidor → sugiere otra', () => {
    const m = mensajeDeError({
      message: 'Password is known to be weak and easy to guess',
    });
    expect(m).toMatch(/otra/);
  });

  it('la misma contraseña de antes se dice tal cual', () => {
    const m = mensajeDeError({
      message: 'New password should be different from the old password',
    });
    expect(m).toContain('distinta');
  });

  it('sin conexión → lo dice, porque este flujo NO funciona offline', () => {
    const m = mensajeDeError({ message: 'Failed to fetch' });
    expect(m).toContain('Sin conexión');
  });

  it('un error desconocido cae en un mensaje accionable, no en jerga', () => {
    const m = mensajeDeError({ message: 'PGRST999 unexpected' });
    expect(m).toBe('No se pudo completar la operación. Vuelve a intentarlo.');
  });

  it('acepta una cadena suelta, un Error o un objeto de Supabase', () => {
    expect(mensajeDeError('otp_expired')).toContain('Pide uno nuevo');
    expect(mensajeDeError(new Error('otp_expired'))).toContain(
      'Pide uno nuevo',
    );
    expect(mensajeDeError({ error_description: 'otp_expired' })).toContain(
      'Pide uno nuevo',
    );
  });

  it('un error vacío no produce un mensaje vacío', () => {
    expect(mensajeDeError(null).length).toBeGreaterThan(10);
    expect(mensajeDeError({}).length).toBeGreaterThan(10);
  });
});

describe('esCorreoSinConfirmar', () => {
  it('reconoce el mensaje de Supabase', () => {
    expect(esCorreoSinConfirmar({ message: 'Email not confirmed' })).toBe(true);
    expect(esCorreoSinConfirmar({ code: 'email_not_confirmed' })).toBe(false);
    expect(esCorreoSinConfirmar({ message: 'email_not_confirmed' })).toBe(true);
  });

  it('NO lo confunde con credenciales inválidas', () => {
    // Es la distinción que importa: mandar a alguien a probar contraseñas
    // cuando la suya era correcta y lo que falta es abrir un correo.
    expect(esCorreoSinConfirmar({ message: 'Invalid login credentials' })).toBe(
      false,
    );
  });

  it('tolera otras redacciones', () => {
    expect(
      esCorreoSinConfirmar({ message: 'Please confirm your email address' }),
    ).toBe(true);
  });

  it('un error vacío no es un correo sin confirmar', () => {
    expect(esCorreoSinConfirmar(null)).toBe(false);
    expect(esCorreoSinConfirmar({})).toBe(false);
    expect(esCorreoSinConfirmar('')).toBe(false);
  });
});

describe('mensajeEnviado — no filtra si la cuenta existe', () => {
  it('es condicional: "si tiene una cuenta"', () => {
    // Una pantalla que dice "ese correo no existe" es una herramienta para
    // averiguar qué correos están dados de alta.
    const m = mensajeEnviado('chris@azul.mx');
    expect(m).toContain('Si chris@azul.mx tiene una cuenta');
    expect(m).not.toMatch(/no existe|no encontramos|no está registrad/i);
  });

  it('el mensaje es IDÉNTICO para cualquier correo', () => {
    const a = mensajeEnviado('existe@azul.mx').replace('existe@azul.mx', 'X');
    const b = mensajeEnviado('inventado@nada.mx').replace(
      'inventado@nada.mx',
      'X',
    );
    expect(a).toBe(b);
  });

  it('avisa del spam y de que caduca', () => {
    const m = mensajeEnviado('chris@azul.mx');
    expect(m).toContain('spam');
    expect(m).toContain('caduca');
  });

  it('normaliza el correo que muestra', () => {
    expect(mensajeEnviado('  Chris@Azul.MX ')).toContain('chris@azul.mx');
  });
});
