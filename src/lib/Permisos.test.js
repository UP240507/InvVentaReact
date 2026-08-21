import { describe, it, expect } from 'vitest';
import {
  permisoDeMarcadoKds,
  getCapacidades,
  tieneFlag,
  CAPACIDADES_BASE,
} from './Permisos';

describe('permisoDeMarcadoKds — el seguro del KDS', () => {
  // ── LA PRUEBA QUE IMPORTA MÁS QUE NINGUNA ─────────────────────────────────
  // Si esto falla, la cocina de todos los locales se queda mirando una pantalla
  // que no responde en cuanto se publique la versión. `getCapacidades` NO mezcla
  // con `CAPACIDADES_BASE` cuando el rol tiene fila propia, así que un flag
  // nuevo llega `undefined` a todo tenant que ya esté en producción. Por eso los
  // dos flags del KDS son restricciones y no permisos: ausente = como ayer.
  it('sin ninguno de los dos flags, se marca igual que siempre', () => {
    expect(permisoDeMarcadoKds({}).puede).toBe(true);
    expect(permisoDeMarcadoKds(null).puede).toBe(true);
    expect(permisoDeMarcadoKds(undefined).puede).toBe(true);
    // Capacidades reales de un rol de cocina, tal cual vienen hoy de la base.
    expect(permisoDeMarcadoKds(CAPACIDADES_BASE.Chef).puede).toBe(true);
  });

  it('con `kds_solo_lectura` no marca nada, ni de su propia estación', () => {
    const cap = { kds_solo_lectura: true };
    const r = permisoDeMarcadoKds(cap, {
      estacionUsuario: 'Cocina',
      estacionItem: 'Cocina',
    });
    expect(r.puede).toBe(false);
    expect(r.motivo).toBe('solo_lectura');
  });

  it('«sólo lectura» gana sobre cualquier coincidencia de estación', () => {
    // El orden importa: quien entra a supervisar no marca aunque le hayan
    // puesto una estación por herencia de otro rol.
    const cap = { kds_solo_lectura: true, kds_estacion_fija: true };
    expect(
      permisoDeMarcadoKds(cap, {
        estacionUsuario: 'Barra',
        estacionItem: 'Barra',
      }).motivo,
    ).toBe('solo_lectura');
  });

  it('con estación fija, la suya sí y la ajena no', () => {
    const cap = { kds_estacion_fija: true };
    expect(
      permisoDeMarcadoKds(cap, {
        estacionUsuario: 'Barra',
        estacionItem: 'Barra',
      }).puede,
    ).toBe(true);

    const ajena = permisoDeMarcadoKds(cap, {
      estacionUsuario: 'Barra',
      estacionItem: 'Cocina',
    });
    expect(ajena.puede).toBe(false);
    expect(ajena.motivo).toBe('otra_estacion');
  });

  it('la comparación no se rompe por espacios sueltos', () => {
    // Las estaciones se teclean a mano en Zonas de Producción. Un espacio de
    // más no puede significar «no eres de aquí».
    const cap = { kds_estacion_fija: true };
    expect(
      permisoDeMarcadoKds(cap, {
        estacionUsuario: ' Cocina ',
        estacionItem: 'Cocina',
      }).puede,
    ).toBe(true);
  });

  it('restricción activada y empleado SIN estación: pasa, pero lo dice', () => {
    // El caso incómodo. No hay con qué comparar, así que bloquear todo sería un
    // muro que nadie entiende. Se deja pasar y se devuelve un motivo con nombre
    // para que la pantalla avise de que el ajuste no está haciendo nada — un
    // ajuste que promete y no cumple es peor que uno apagado.
    const r = permisoDeMarcadoKds(
      { kds_estacion_fija: true },
      { estacionUsuario: null, estacionItem: 'Cocina' },
    );
    expect(r.puede).toBe(true);
    expect(r.motivo).toBe('sin_estacion');
  });
});

describe('getCapacidades — la trampa que obliga a lo de arriba', () => {
  it('una fila propia REEMPLAZA la base: no hereda nada', () => {
    // Se fija aquí porque es lo que hace peligroso añadir capacidades nuevas, y
    // no está escrito en ningún otro sitio ejecutable. Si algún día alguien
    // cambia esto por una mezcla, esta prueba falla y le obliga a pensar en los
    // permisos que una fila incompleta acabaría heredando de vuelta.
    const filas = [{ rol: 'Chef', capacidades: { rutas: ['kds'] } }];
    const cap = getCapacidades('Chef', filas);

    expect(cap.rutas).toEqual(['kds']);
    // La base de Chef tiene más cosas; ninguna sobrevive.
    expect(cap.ruta_inicial).toBeUndefined();
    expect(tieneFlag(cap, 'kds_solo_lectura')).toBe(false);
  });

  it('sin fila, cae a la base del rol', () => {
    expect(getCapacidades('Chef', []).ruta_inicial).toBe('/kds');
  });

  it('un rol desconocido cae a Mesero, no a Admin', () => {
    expect(getCapacidades('Inventado', [])).toEqual(CAPACIDADES_BASE.Mesero);
  });
});
