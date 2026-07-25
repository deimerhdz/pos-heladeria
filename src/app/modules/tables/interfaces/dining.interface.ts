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

/** Order (comanda/cuenta) lifecycle — a billing status, NOT kitchen prep. */
export type DiningOrderStatus = 'abierta' | 'bloqueada' | 'pagada' | 'cancelada';

/** Per-item kitchen status (`KitchenStatus`). The kitchen board works on this. */
export type KitchenStatus = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'anulado';

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
  session_id?: string | null;
  quantity: number;
  unit_price: string;
  /** Kitchen status of this item. */
  estado_cocina: KitchenStatus;
  void_de?: string | null;
  notes?: string | null;
  options?: DiningOrderItemOption[];
}

/** Body for `PATCH /orders/items/{id}/kitchen` (`KitchenTransitionIn`). */
export interface KitchenTransitionPayload {
  estado_cocina: KitchenStatus;
}

// ── Cobro / cierre (Fase 7) ────────────────────────────────────────────────

/** Una línea de pago (`PaymentIn`). */
export interface PaymentLine {
  payment_method_id: string;
  amount: number;
  reference?: string | null;
}

/** Body for `POST /orders/{id}/pay` (`PayIn`). */
export interface PayInPayload {
  cash_shift_id: string;
  discount: number;
  tax: number;
  tip: number;
  payments: PaymentLine[];
}

/** Body for `POST /orders/{id}/block` (`BlockIn`). */
export interface BlockPayload {
  version: number;
}

/** Body for `POST /orders/items/{id}/void` (`VoidItemIn`). */
export interface VoidItemPayload {
  motivo: string;
}

/** `BillResponse` — cuenta de la mesa (total + split por comensal). */
export interface Bill {
  dining_table_id: string;
  total: string;
  orders: {
    order_id: string;
    status: string;
    subtotal: string;
    items: {
      order_item_id: string;
      product_variant_id: string;
      session_id?: string | null;
      quantity: number;
      unit_price: string;
      line_total: string;
      estado_cocina: string;
    }[];
  }[];
  split: { session_id?: string | null; customer_name?: string | null; subtotal: string }[];
}

/** Response of `POST /orders` and `GET /orders` (`OrderResponse`). */
export interface DiningOrder {
  id: string;
  channel: string;
  status: DiningOrderStatus;
  version?: number;
  dining_session_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  created_at: string;
  items?: DiningOrderItem[];
}
