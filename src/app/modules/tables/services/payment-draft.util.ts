import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import { PaymentLine } from '../interfaces/dining.interface';
import { formatMoney } from './receipt.util';

/**
 * Cómo paga el cliente un cobro concreto: un método, o dos combinados.
 *
 * Es el estado que edita `PaymentInputComponent`; el backend acepta N pagos por
 * venta, aquí se limita a dos porque es el caso real (efectivo + tarjeta) y
 * evita convertir el panel de cobro en una hoja de cálculo.
 */
export interface PaymentDraft {
  methodId: string;
  amount: number;
  /** Hay un segundo método en juego. */
  combined: boolean;
  secondMethodId: string;
  secondAmount: number;
}

export function emptyPaymentDraft(): PaymentDraft {
  return { methodId: '', amount: 0, combined: false, secondMethodId: '', secondAmount: 0 };
}

/** Las líneas de pago que se mandan al backend: una, o dos si está combinado. */
export function paymentLines(draft: PaymentDraft): PaymentLine[] {
  const lines: PaymentLine[] = [
    { payment_method_id: draft.methodId, amount: draft.amount },
  ];
  if (draft.combined && draft.secondMethodId) {
    lines.push({ payment_method_id: draft.secondMethodId, amount: draft.secondAmount });
  }
  return lines;
}

/** Lo que entrega el cliente en total. */
export function paidAmount(draft: PaymentDraft): number {
  return draft.amount + (draft.combined && draft.secondMethodId ? draft.secondAmount : 0);
}

/** Suma de lo cobrado por métodos que no son efectivo. */
export function nonCashAmount(draft: PaymentDraft, methods: PaymentMethodCheckoutOption[]): number {
  const isCash = (id: string): boolean => !!methods.find((m) => m.id === id)?.is_cash;
  let sum = 0;
  if (draft.methodId && !isCash(draft.methodId)) sum += draft.amount;
  if (draft.combined && draft.secondMethodId && !isCash(draft.secondMethodId)) {
    sum += draft.secondAmount;
  }
  return sum;
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
 */
export function paymentIssue(
  draft: PaymentDraft,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): string | null {
  if (!draft.methodId) return 'Elige el método de pago.';
  if (draft.amount <= 0) return 'Escribe el importe del pago.';
  if (draft.combined) {
    if (!draft.secondMethodId) return 'Elige el segundo método de pago.';
    if (draft.secondAmount <= 0) return 'Escribe el importe del segundo método.';
  }

  const missing = missingAmount(draft, total);
  if (missing > 0) return `Faltan ${formatMoney(missing)} para cubrir la cuenta.`;

  if (nonCashAmount(draft, methods) > total) {
    return 'Los pagos que no son en efectivo no pueden superar la cuenta: el vuelto solo sale del efectivo.';
  }
  return null;
}
