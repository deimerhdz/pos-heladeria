import { ReceiptData, buildReceiptHtml, formatMoney } from './receipt.util';

function makeReceipt(patch: Partial<ReceiptData> = {}): ReceiptData {
  return {
    businessName: 'Heladería Skeilo',
    logoUrl: null,
    tableLabel: 'Mesa 5 · Terraza',
    soldAt: '2026-07-28T18:42:00',
    cashier: 'Ana',
    customerName: 'Carlos',
    saleId: '11111111-2222-3333-4444-5555aabbccdd',
    lines: [{ quantity: 2, description: 'Helado de vainilla', lineTotal: 12000 }],
    subtotal: 12000,
    discount: 0,
    tax: 0,
    tip: 0,
    total: 12000,
    payments: [{ name: 'Efectivo', amount: 12000 }],
    change: null,
    message: '¡Gracias por su compra!',
    ...patch,
  };
}

describe('buildReceiptHtml', () => {
  it('imprime negocio, líneas, total y mensaje', () => {
    const html = buildReceiptHtml([makeReceipt()]);

    expect(html).toContain('Heladería Skeilo');
    expect(html).toContain('Mesa 5 · Terraza');
    expect(html).toContain('2 × Helado de vainilla');
    expect(html).toContain('TOTAL');
    expect(html).toContain(formatMoney(12000));
    expect(html).toContain('¡Gracias por su compra!');
    // Los 6 últimos caracteres del uuid identifican el ticket en el mostrador.
    expect(html).toContain('#BBCCDD');
    expect(html).toContain('@page { size: 58mm auto; margin: 0; }');
  });

  it('omite los totales que no aplican', () => {
    const html = buildReceiptHtml([makeReceipt()]);

    // Sin descuento/impuesto/propina, el subtotal no aporta nada sobre el total.
    expect(html).not.toContain('Descuento');
    expect(html).not.toContain('Impuesto');
    expect(html).not.toContain('Propina');
    expect(html).not.toContain('Subtotal');
  });

  it('muestra el desglose cuando hay descuento', () => {
    const html = buildReceiptHtml([
      makeReceipt({ discount: 2000, total: 10000 }),
    ]);

    expect(html).toContain('Subtotal');
    expect(html).toContain('Descuento');
    expect(html).toContain('-' + formatMoney(2000));
  });

  it('emite un ticket por venta en cuenta dividida', () => {
    const html = buildReceiptHtml([
      makeReceipt({ customerName: 'Ana', total: 8000 }),
      makeReceipt({ saleId: 'aaaa-bbbb', customerName: 'Luis', total: 4000 }),
    ]);

    expect(html.match(/<article class="ticket">/g)?.length).toBe(2);
    expect(html).toContain('Ana');
    expect(html).toContain('Luis');
    // El salto de página entre tickets lo pone el CSS, no el marcado.
    expect(html).toContain('.ticket + .ticket { page-break-before: always;');
  });

  it('escapa el HTML de los textos del negocio', () => {
    const html = buildReceiptHtml([
      makeReceipt({ message: '<script>alert(1)</script>' }),
    ]);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
