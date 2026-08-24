import { displayOrderStatus } from './order-status.util';

/**
 * Panel de Control → Órdenes reportó "Abierta" para un pedido QR ya cobrado
 * (badge y pestaña "Pagadas" usaban `status` crudo, que nunca llega a
 * `'pagada'` en los caminos QR/mostrador — spec 029, research.md D2). Mismo
 * criterio que `PosTerminalStore.deriveTableStatus` en la Terminal de Mesas.
 */
describe('displayOrderStatus', () => {
  it('un pedido abierta con Sale ya registrada (paid) se ve como pagada', () => {
    expect(displayOrderStatus({ status: 'abierta', paid: true })).toBe('pagada');
  });

  it('sin paid, se muestra el status real', () => {
    expect(displayOrderStatus({ status: 'abierta', paid: false })).toBe('abierta');
    expect(displayOrderStatus({ status: 'abierta' })).toBe('abierta');
  });

  it('una orden cancelada se muestra cancelada aunque paid fuera true', () => {
    expect(displayOrderStatus({ status: 'cancelada', paid: true })).toBe('cancelada');
  });

  it('el camino legado bloqueada→pagada (pay_order) sigue viéndose pagada', () => {
    expect(displayOrderStatus({ status: 'pagada', paid: true })).toBe('pagada');
  });
});
