import { describe, it, expect } from 'vitest';
import { metodoDePago, montosDeVenta } from './Pago';

const ef = (monto) => ({ metodo: 'Efectivo', monto });
const tar = (monto) => ({ metodo: 'Tarjeta', monto });
const tra = (monto) => ({ metodo: 'Transferencia', monto });

describe('montosDeVenta · lo que se queda en la caja (H15)', () => {
  it('$75 pagados con $100: se quedan 75 y se recibieron 100', () => {
    const m = montosDeVenta([ef(100)], 25);
    expect(m.efectivo).toBe(75);
    expect(m.efectivo).not.toBe(100); // lo que guardaba antes
    expect(m.efectivo_recibido).toBe(100);
    expect(m.cambio).toBe(25);
  });

  it('pago exacto: lo que se queda es lo recibido', () => {
    expect(montosDeVenta([ef(45)], 0).efectivo).toBe(45);
  });

  it('mixto: la tarjeta no da cambio; el cambio sale del efectivo', () => {
    // $150 de cuenta: $100 con tarjeta y un billete de $100 → $50 de cambio.
    const m = montosDeVenta([tar(100), ef(100)], 50);
    expect(m.tarjeta).toBe(100);
    expect(m.efectivo).toBe(50);
    expect(m.efectivo_recibido).toBe(100);
  });

  it('el cambio nunca deja el efectivo en negativo', () => {
    // Un cambio mayor que lo recibido en efectivo no puede venir del cajón.
    const m = montosDeVenta([ef(20), tar(100)], 60);
    expect(m.efectivo).toBe(0);
    expect(m.cambio).toBe(20);
  });

  it('una cuenta de $0 con un billete capturado no deja dinero (H14)', () => {
    // La venta del 17-nov: total 0, $200 tecleados, $200 de cambio.
    const m = montosDeVenta([ef(200)], 200);
    expect(m.efectivo).toBe(0);
  });

  it('sin pagos, todo en cero', () => {
    expect(montosDeVenta([], 0)).toEqual({
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      efectivo_recibido: 0,
      cambio: 0,
    });
  });

  it('centavos: 87.30 pagados con 100 dejan 87.30', () => {
    expect(montosDeVenta([ef(100)], 12.7).efectivo).toBe(87.3);
  });
});

describe('metodoDePago · por métodos distintos, no por pagos', () => {
  it('dos pagos en efectivo son efectivo, no mixto', () => {
    expect(metodoDePago([ef(100), ef(50)], 150)).toBe('efectivo');
  });

  it('un solo método se nombra a sí mismo', () => {
    expect(metodoDePago([tar(80)], 80)).toBe('tarjeta');
    expect(metodoDePago([tra(80)], 80)).toBe('transferencia');
  });

  it('dos métodos distintos son mixto', () => {
    expect(metodoDePago([ef(50), tar(30)], 80)).toBe('mixto');
  });

  it('una cuenta de $0 es cortesía, aunque se haya tecleado un billete', () => {
    expect(metodoDePago([], 0)).toBe('cortesia');
    expect(metodoDePago([ef(200)], 0)).toBe('cortesia');
  });

  it('un pago en cero no cuenta como método', () => {
    expect(metodoDePago([ef(100), tar(0)], 100)).toBe('efectivo');
  });

  it('sin pagos y con algo que cobrar queda efectivo, como antes', () => {
    expect(metodoDePago([], 50)).toBe('efectivo');
  });
});
