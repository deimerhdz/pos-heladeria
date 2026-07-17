// Types for the real QR menu / table-session flow (tags `menu` + `orders`).
// The diner scans a table QR, opens a session, builds a client-side cart and
// submits it as a single order. There is no server-side cart.

// ── Sessions (`/orders/sessions`) ──────────────────────────────────────────

/** Body for `POST /orders/sessions` (`SessionOpen`). */
export interface SessionOpenPayload {
  /** The table's UUID `qr_token` (from the resolved menu). */
  qr_token: string;
  customer_name: string;
}

/** Response of the session endpoints (`SessionResponse`). */
export interface DiningSession {
  id: string;
  dining_table_id: string;
  customer_name: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
}

// ── Orders (`/orders`) ─────────────────────────────────────────────────────

export type OrderChannel = 'qr' | 'counter' | 'waiter';

export type DiningOrderStatus = 'pending' | 'preparing' | 'served' | 'cancelled';

/** One line of a `POST /orders` request (`OrderItemIn`). */
export interface OrderItemPayload {
  product_variant_id: string;
  quantity?: number;
  option_ids?: string[];
  notes?: string | null;
}

/** Body for `POST /orders` (`OrderCreate`). */
export interface OrderCreatePayload {
  channel?: OrderChannel;
  dining_session_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  items: OrderItemPayload[];
}

/** Selected option on an order item (`OrderItemOptionResponse`). */
export interface DiningOrderItemOption {
  id: string;
  option_id: string;
}

/** One line of an order response (`OrderItemResponse`). Amounts are strings. */
export interface DiningOrderItem {
  id: string;
  product_variant_id: string;
  quantity: number;
  unit_price: string;
  notes?: string | null;
  options?: DiningOrderItemOption[];
}

/** Response of `POST /orders` and `GET /orders` (`OrderResponse`). */
export interface DiningOrder {
  id: string;
  channel: string;
  status: DiningOrderStatus;
  dining_session_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  created_at: string;
  items?: DiningOrderItem[];
}
