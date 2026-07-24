// ── Admin table management (tag `orders`, base `/orders/tables`) ────────────

export type TableStatus = 'libre' | 'ocupada' | 'reservada' | 'pendiente_pago';

/** Admin table model, mirrors the backend `TableResponse`. */
export interface Table {
  id: string;
  number: number;
  name: string | null;
  /** UUID token used to resolve the table + open a session by QR. */
  qr_token: string;
  active: boolean;
  status: TableStatus;
}

/** Cuenta consolidada de un grupo de mesas unidas (`GET /orders/group/{id}/bill`). */
export interface GroupBill {
  merged_group_id: string;
  total: string;
  orders: { order_id: string; dining_table_id: string | null; status: string; subtotal: string }[];
}

/** Request body for `POST /orders/tables` (`TableCreate`). */
export interface TableCreatePayload {
  number: number;
  name?: string | null;
}

/** Request body for `PATCH /orders/tables/{id}` (`TableUpdate`). */
export interface TableUpdatePayload {
  name?: string | null;
  active?: boolean;
}

/** Form model backing the create/edit modal. */
export interface TableForm {
  number: number;
  name?: string | null;
}

/** Response of `GET /orders/tables/{id}/qr-token` — the printable, signed QR. */
export interface TableQrToken {
  table_id: string;
  number: number;
  /** Signed, printable token (distinct from the table's UUID `qr_token`). */
  qr_token: string;
  /** Relative path the QR should point to, e.g. `/menu/qr-token/{token}`. */
  menu_path: string;
}
