// src/components/BarraPestanas.test.jsx
//
// La navegación en teléfono. Lo que se fija es lo que se rompe callado:
//
//   1. Que los destinos salgan de LA LISTA, no de una copia. Una segunda lista
//      «la de móvil» se desincroniza al primer permiso nuevo, y el que se queda
//      atrás es siempre el que no usas a diario.
//   2. Que quepan. Una barra con 24 destinos no es una barra.
//   3. Que la pestaña activa se vea aunque el destino esté dentro de «Más» —
//      si no, un mesero en Propinero ve las cuatro apagadas y ninguna pista de
//      dónde está.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  Utensils,
  MonitorPlay,
  Coins,
  Package,
  Truck,
  Wallet,
} from 'lucide-react';
import BarraPestanas from './BarraPestanas';

afterEach(cleanup);

const DESTINOS = [
  { path: '/mesas', icon: Utensils, label: 'Mapa de Mesas' },
  { path: '/pos', icon: Package, label: 'Punto de Venta' },
  { path: '/kds', icon: MonitorPlay, label: 'Monitor Cocina' },
  { path: '/propinas', icon: Coins, label: 'Propinero' },
  { path: '/proveedores', icon: Truck, label: 'Proveedores' },
  { path: '/gastos', icon: Wallet, label: 'Gastos y Costos' },
];

const pintar = (items = DESTINOS, ruta = '/mesas') =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <BarraPestanas items={items} />
    </MemoryRouter>,
  );

describe('la barra de pestañas', () => {
  it('enseña cuatro destinos y agrupa el resto en «Más»', () => {
    pintar();
    expect(screen.getByText('Mapa de Mesas')).toBeTruthy();
    expect(screen.getByText('Propinero')).toBeTruthy();
    expect(screen.getByText('Más')).toBeTruthy();
    // Los que no caben NO están en la barra hasta que se abre la hoja.
    expect(screen.queryByText('Proveedores')).toBeNull();
  });

  it('sin sobrantes no inventa un «Más» vacío', () => {
    pintar(DESTINOS.slice(0, 3));
    expect(screen.queryByText('Más')).toBeNull();
  });

  it('«Más» abre una hoja con exactamente los que no caben', () => {
    pintar();
    fireEvent.click(screen.getByText('Más'));
    expect(screen.getByText('Proveedores')).toBeTruthy();
    expect(screen.getByText('Gastos y Costos')).toBeTruthy();
  });

  it('elegir un destino de la hoja la cierra', () => {
    // Sin esto la hoja se queda encima de la pantalla a la que acabas de
    // navegar, tapándola.
    pintar();
    fireEvent.click(screen.getByText('Más'));
    fireEvent.click(screen.getByText('Proveedores'));
    expect(document.querySelector('[data-figura="hoja-mas"]')).toBeNull();
  });

  it('estando en un destino de «Más», la píldora se enciende', () => {
    // Si no, las cuatro pestañas salen apagadas y la barra no dice dónde estás.
    pintar(DESTINOS, '/gastos');
    const mas = screen.getByText('Más').closest('button');
    expect(mas.className).toContain('text-ops-accent');
  });

  it('estando en un destino visible, «Más» NO se enciende', () => {
    pintar(DESTINOS, '/mesas');
    const mas = screen.getByText('Más').closest('button');
    expect(mas.className).not.toContain('text-ops-accent');
  });

  it('cada pestaña lleva su rótulo, no sólo el icono', () => {
    // Un icono solo se adivina, y adivinar mal aquí cuesta salir de la pantalla
    // en la que estabas trabajando.
    pintar();
    const barra = document.querySelector('[data-figura="pestanas"]');
    for (const d of DESTINOS.slice(0, 4)) {
      expect(barra.textContent).toContain(d.label);
    }
  });

  it('respeta la franja del gesto de inicio', () => {
    // Sin el `env(safe-area-inset-bottom)`, en un iPhone la última fila queda
    // debajo de la barra del sistema y se toca la del sistema.
    pintar();
    expect(
      document.querySelector('[data-figura="pestanas"]').className,
    ).toContain('safe-area-inset-bottom');
  });

  it('no declara destinos: los recibe', () => {
    // La garantía de la lista única. Si algún día alguien mete aquí un menú
    // propio, esta prueba sigue en verde — pero el día que los permisos filtren
    // algo, la barra lo respeta porque nunca supo qué existe.
    pintar([{ path: '/solo-uno', icon: Utensils, label: 'Único' }]);
    const barra = document.querySelector('[data-figura="pestanas"]');
    expect(barra.querySelectorAll('a')).toHaveLength(1);
    expect(screen.queryByText('Mapa de Mesas')).toBeNull();
  });
});
