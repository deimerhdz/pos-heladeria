import {
  PaymentDraft,
  changeDue,
  emptyPaymentDraft,
  paymentIssue,
  paymentLines,
} from './payment-draft.util';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';

const methods = [
  { id: 'efectivo', name: 'Efectivo', type: 'cash', is_cash: true, active: true },
  { id: 'tarjeta', name: 'Tarjeta', type: 'card', is_cash: false, active: true },
] as PaymentMethod[];

function draft(patch: Partial<PaymentDraft> = {}): PaymentDraft {
  return { ...emptyPaymentDraft(), ...patch };
}

describe('paymentLines', () => {
  it('manda una sola línea sin combinar', () => {
    expect(paymentLines(draft({ methodId: 'efectivo', amount: 35000 }))).toEqual([
      { payment_method_id: 'efectivo', amount: 35000 },
    ]);
  });

  it('manda las dos líneas al combinar métodos', () => {
    const lines = paymentLines(
      draft({
        methodId: 'efectivo',
        amount: 20000,
        combined: true,
        secondMethodId: 'tarjeta',
        secondAmount: 15000,
      }),
    );

    expect(lines).toEqual([
      { payment_method_id: 'efectivo', amount: 20000 },
      { payment_method_id: 'tarjeta', amount: 15000 },
    ]);
  });

  it('ignora el segundo método si aún no se eligió', () => {
    const lines = paymentLines(
      draft({ methodId: 'efectivo', amount: 35000, combined: true, secondAmount: 5000 }),
    );

    expect(lines.length).toBe(1);
  });
});

describe('paymentIssue', () => {
  it('exige elegir método e importe', () => {
    expect(paymentIssue(draft(), 35000, methods)).toBe('Elige el método de pago.');
    expect(paymentIssue(draft({ methodId: 'efectivo' }), 35000, methods)).toBe(
      'Escribe el importe del pago.',
    );
  });

  it('avisa de lo que falta para cubrir la cuenta', () => {
    const issue = paymentIssue(draft({ methodId: 'efectivo', amount: 20000 }), 35000, methods);

    expect(issue).toContain('Faltan');
    expect(issue).toContain('15.000');
  });

  it('acepta el pago mixto que cubre la cuenta', () => {
    const mixto = draft({
      methodId: 'efectivo',
      amount: 20000,
      combined: true,
      secondMethodId: 'tarjeta',
      secondAmount: 15000,
    });

    expect(paymentIssue(mixto, 35000, methods)).toBeNull();
    expect(changeDue(mixto, 35000)).toBe(0);
  });

  it('rechaza que lo electrónico supere la cuenta', () => {
    // Es lo que protege el arqueo: `change_given` se descuenta del efectivo, así
    // que un exceso cobrado con tarjeta dejaría un faltante fantasma en el cajón.
    const issue = paymentIssue(
      draft({ methodId: 'tarjeta', amount: 40000 }),
      35000,
      methods,
    );

    expect(issue).toContain('no pueden superar la cuenta');
  });

  it('permite que el exceso venga del efectivo y lo devuelve como vuelto', () => {
    const mixto = draft({
      methodId: 'efectivo',
      amount: 50000,
      combined: true,
      secondMethodId: 'tarjeta',
      secondAmount: 15000,
    });

    expect(paymentIssue(mixto, 35000, methods)).toBeNull();
    expect(changeDue(mixto, 35000)).toBe(30000);
  });
});
