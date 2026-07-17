// Types for the real cash module (`/api/v1/cash/*`). Decimal amounts arrive as
// strings; payloads send numbers.

/** `RegisterResponse` — a physical cash drawer. */
export interface CashRegister {
  id: string;
  name: string;
  active: boolean;
}

/** Body for `POST /cash/registers` (`RegisterCreate`). */
export interface RegisterCreatePayload {
  name: string;
}

/** `ShiftResponse` — a cashier work shift on a register. */
export interface CashShift {
  id: string;
  cash_register_id: string;
  user_id: string;
  user_name?: string | null;
  opening_amount: string;
  opened_at: string;
  closed_at?: string | null;
  counted_amount?: string | null;
  status: string;
}

/** Body for `POST /cash/shifts/open` (`ShiftOpen`). */
export interface ShiftOpenPayload {
  cash_register_id: string;
  opening_amount?: number;
}

/** Body for `POST /cash/shifts/{id}/close` (`ShiftClose`) — cierre con arqueo. */
export interface ShiftClosePayload {
  counted_amount?: number;
}

export type CashMovementType = 'in' | 'out';

/** Body for `POST /cash/shifts/{id}/movements` (`CashMovementIn`). */
export interface CashMovementPayload {
  type: CashMovementType;
  amount: number;
  description: string;
}

/** `CashMovementResponse`. */
export interface CashMovement {
  id: string;
  cash_shift_id: string;
  type: string;
  amount: string;
  description: string;
  occurred_at: string;
}

/** `ReconciliationResponse` — arqueo del turno. */
export interface Reconciliation {
  cash_shift_id: string;
  status: string;
  opening_amount: string;
  cash_sales: string;
  cash_in: string;
  cash_out: string;
  expected: string;
  counted_amount?: string | null;
  difference?: string | null;
}
