import { mapVentasPorMetodo } from './cash-session.store';
import { Reconciliation, SalesByMethod } from '../interfaces/cash.interface';

function recon(sales: SalesByMethod[]): Reconciliation {
  return {
    cash_shift_id: 's1',
    status: 'open',
    opening_amount: '50000',
    ventas_efectivo: '17500',
    ventas_tarjeta: '0',
    ventas_transferencia: '4000',
    cambio_entregado: '0',
    sales_by_method: sales,
    ingresos: '0',
    egresos: '0',
    retiros: '0',
    expected: '67500',
  };
}

describe('mapVentasPorMetodo', () => {
  it('convierte los importes que llegan como string', () => {
    const ventas = mapVentasPorMetodo(
      recon([
        {
          method_id: 'pm1',
          method_name: 'Efectivo',
          method_type: 'cash',
          total: '17500',
          count: 3,
        },
      ]),
    );

    expect(ventas).toEqual([
      { id: 'pm1', name: 'Efectivo', type: 'cash', total: 17500, count: 3 },
    ]);
  });

  it('conserva los métodos sin ventas que manda el backend', () => {
    // Es el caso reportado: la tarjeta existía pero no aparecía en el arqueo.
    const ventas = mapVentasPorMetodo(
      recon([
        { method_id: 'pm1', method_name: 'Efectivo', method_type: 'cash', total: '17500', count: 3 },
        { method_id: 'pm2', method_name: 'Tarjeta', method_type: 'card', total: '0', count: 0 },
      ]),
    );

    expect(ventas.map((v) => v.name)).toEqual(['Efectivo', 'Tarjeta']);
    expect(ventas[1].total).toBe(0);
    expect(ventas[1].count).toBe(0);
  });

  it('respeta el orden del backend, con el efectivo primero', () => {
    const ventas = mapVentasPorMetodo(
      recon([
        { method_id: 'pm1', method_name: 'Efectivo', method_type: 'cash', total: '1', count: 1 },
        { method_id: 'pm3', method_name: 'Nequi', method_type: 'transfer', total: '2', count: 1 },
        { method_id: 'pm2', method_name: 'Tarjeta', method_type: 'card', total: '3', count: 1 },
      ]),
    );

    expect(ventas.map((v) => v.id)).toEqual(['pm1', 'pm3', 'pm2']);
  });

  it('devuelve una lista vacía sin arqueo cargado', () => {
    expect(mapVentasPorMetodo(null)).toEqual([]);
  });
});
