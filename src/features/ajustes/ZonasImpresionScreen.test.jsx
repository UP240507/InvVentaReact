// src/features/ajustes/ZonasImpresionScreen.test.jsx
//
// ── LA AFIRMACIÓN ───────────────────────────────────────────────────────────
// **Las zonas que se editan son las del restaurante, no la lista de ejemplo.**
//
// La pantalla arranca con `useState(['Cocina', 'Barra'])` y sólo las sustituye
// si `configuracion.zonas_produccion` trae algo. Ese nombre de clave es el
// único hilo: si se renombrara —o si alguien guardara en `zonas_impresion`,
// que es como se llama la pantalla—, aquí seguirían saliendo «Cocina» y
// «Barra» tan tranquilas, el dueño creería estar viendo sus zonas, y al
// guardar se llevaría por delante las de verdad.
//
// Es el patrón de la casa: código correcto de los dos lados y un nombre de
// campo en medio que nadie comprueba. Ya pasó con `proveedor_nombre`, que se
// leía en tres sitios sin haber existido nunca.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const app = {
  configuracion: {
    nombre_empresa: 'AZUL',
    zonas_produccion: ['Plancha', 'Postres', 'Bar'],
  },
  recetas: [
    { id: 1, nombre: 'Taco', categoria: 'Platos fuertes', activo: true },
  ],
  updateConfiguracion: () => {},
  showToast: () => {},
};

vi.mock('../../store/useAppStore', () => ({
  useAppStore: Object.assign(() => app, {
    setState: () => {},
    getState: () => app,
  }),
}));

import ZonasImpresionScreen from './ZonasImpresionScreen';

describe('ZonasImpresionScreen', () => {
  it('LA AFIRMACIÓN: enseña las zonas de la configuración, no las de ejemplo', () => {
    const { container } = render(<ZonasImpresionScreen />);
    const texto = container.textContent;

    expect(texto).toContain('Plancha');
    expect(texto).toContain('Postres');
    // «Cocina» y «Barra» son el valor inicial del componente. Si aparecen
    // teniendo el restaurante sus propias zonas, la configuración no se leyó.
    expect(texto).not.toContain('Cocina');
  });

  it('sin zonas guardadas cae a la lista de ejemplo, que es mejor que nada', () => {
    const previa = app.configuracion;
    app.configuracion = { nombre_empresa: 'AZUL' };

    const { container } = render(<ZonasImpresionScreen />);
    expect(container.textContent).toContain('Cocina');

    app.configuracion = previa;
  });
});
