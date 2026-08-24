import { DiningOrder, getSidebarMode } from './dining.interface';

/**
 * Reporte del usuario: un pedido de mostrador (canal `counter`) ya cobrado
 * seguía mostrando el panel editable completo —dividir cuenta, selector de
 * método de pago, "Rechazar pedido"— en vez de la vista de solo lectura que
 * un pedido QR ya pagado sí usa. `getSidebarMode` solo miraba el canal, sin
 * mirar `paid` (spec 029, research.md D2: `status` nunca llega a `'pagada'`
 * en los caminos QR ni mostrador).
 */
describe('getSidebarMode', () => {
  function order(overrides: Partial<DiningOrder>): DiningOrder {
    return {
      id: 'o1',
      channel: 'counter',
      status: 'abierta',
      created_at: '2026-08-21T18:27:00',
      ...overrides,
    } as DiningOrder;
  }

  it('un pedido de mostrador ya pagado va a "resumen" (solo lectura)', () => {
    expect(getSidebarMode(order({ channel: 'counter', paid: true }))).toBe('resumen');
  });

  it('un pedido de mostrador sin pagar sigue en "terminal-pos" (editable)', () => {
    expect(getSidebarMode(order({ channel: 'counter', paid: false }))).toBe('terminal-pos');
  });

  it('un pedido QR sin pagar sigue en "resumen" (comportamiento existente)', () => {
    expect(getSidebarMode(order({ channel: 'qr', paid: false }))).toBe('resumen');
  });

  it('sin pedido seleccionado, cae en "terminal-pos"', () => {
    expect(getSidebarMode(null)).toBe('terminal-pos');
    expect(getSidebarMode(undefined)).toBe('terminal-pos');
  });
});
