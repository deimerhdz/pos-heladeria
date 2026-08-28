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
  it('manda una sola línea con el método elegido', () => {
    expect(paymentLines(draft({ methodId: 'efectivo', amount: 35000 }))).toEqual([
      { payment_method_id: 'efectivo', amount: 35000 },
    ]);
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

  it('spec 046, FR-003/FR-007: un único método, con el monto exacto, cubre la cuenta sin combinar nada', () => {
    const pago = draft({ methodId: 'efectivo', amount: 35000 });

    expect(paymentIssue(pago, 35000, methods)).toBeNull();
    expect(changeDue(pago, 35000)).toBe(0);
  });

  it('permite que el exceso en efectivo se devuelva como vuelto, sin un segundo método', () => {
    const pago = draft({ methodId: 'efectivo', amount: 50000 });

    expect(paymentIssue(pago, 35000, methods)).toBeNull();
    expect(changeDue(pago, 35000)).toBe(15000);
  });
});
