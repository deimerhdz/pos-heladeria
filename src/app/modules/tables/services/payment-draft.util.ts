import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import { PaymentLine } from '../interfaces/dining.interface';
import { formatMoney } from './receipt.util';

/**
 * Cómo paga el cliente un cobro concreto: un único método.
 *
 * Es el estado que edita `PaymentInputComponent`; el backend acepta N pagos
 * por venta, pero spec 046 (FR-004/FR-007) retiró la opción de combinar más
 * de un método desde el frontend — cada cobro se hace con un único método,
 * por el total exacto o más.
 */
export interface PaymentDraft {
  methodId: string;
  amount: number;
}

export function emptyPaymentDraft(): PaymentDraft {
  return { methodId: '', amount: 0 };
}

/** La línea de pago que se manda al backend. */
export function paymentLines(draft: PaymentDraft): PaymentLine[] {
  return [{ payment_method_id: draft.methodId, amount: draft.amount }];
}

/** Lo que entrega el cliente en total. */
export function paidAmount(draft: PaymentDraft): number {
  return draft.amount;
}

/** Suma de lo cobrado por métodos que no son efectivo. */
export function nonCashAmount(draft: PaymentDraft, methods: PaymentMethodCheckoutOption[]): number {
  const isCash = (id: string): boolean => !!methods.find((m) => m.id === id)?.is_cash;
  return draft.methodId && !isCash(draft.methodId) ? draft.amount : 0;
}

/** Vuelto: lo que sobra del total. Siempre sale del efectivo (ver `paymentIssue`). */
export function changeDue(draft: PaymentDraft, total: number): number {
  return Math.max(0, paidAmount(draft) - total);
}

/** Lo que falta para cubrir la cuenta. */
export function missingAmount(draft: PaymentDraft, total: number): number {
  return Math.max(0, total - paidAmount(draft));
}

/**
 * Motivo por el que este cobro **no** se puede registrar, o `null` si está bien.
 *
 * La regla del no-efectivo es la que protege el arqueo: `change_given` se calcula
 * como `pagado − total` sin mirar el método, y el arqueo se lo descuenta al
 * efectivo. Un cobro electrónico por encima del total dejaría un faltante
 * fantasma en el cajón.
 *
 * Spec 046 (FR-003/FR-004/FR-007): si el monto no alcanza, este cobro no se
 * puede registrar — no hay ninguna forma de completarlo con un segundo
 * método, el cajero debe rechazar el pedido o esperar el monto exacto.
 */
export function paymentIssue(
  draft: PaymentDraft,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): string | null {
  if (!draft.methodId) return 'Elige el método de pago.';
  if (draft.amount <= 0) return 'Escribe el importe del pago.';

  const missing = missingAmount(draft, total);
  if (missing > 0) return `Faltan ${formatMoney(missing)} para cubrir la cuenta.`;

  if (nonCashAmount(draft, methods) > total) {
    return 'Los pagos que no son en efectivo no pueden superar la cuenta: el vuelto solo sale del efectivo.';
  }
  return null;
}
