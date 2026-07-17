// Types for the sales module (`/api/v1/sales/*`).

/** `PaymentMethodResponse`. */
export interface PaymentMethod {
  id: string;
  name: string;
  is_cash: boolean;
  active: boolean;
}

/** Body for `POST /sales/payment-methods` (`PaymentMethodCreate`). */
export interface PaymentMethodCreatePayload {
  name: string;
  is_cash: boolean;
}

// ── Checkout (`POST /sales`) ───────────────────────────────────────────────

/** One line of a sale (`SaleItemIn`). */
export interface SaleItemPayload {
  product_variant_id: string;
  quantity: number;
  option_ids?: string[];
}

/** One payment of a sale (`PaymentIn`). Split payments = multiple entries. */
export interface PaymentPayload {
  payment_method_id: string;
  amount: number;
  reference?: string | null;
}

/** Body for `POST /sales` (`SaleCreate`). Requires an open `cash_shift_id`. */
export interface SaleCreatePayload {
  cash_shift_id: string;
  dining_session_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  discount?: number;
  tax?: number;
  tip?: number;
  items: SaleItemPayload[];
  payments: PaymentPayload[];
}

/** `SaleItemResponse` — amounts are decimal strings; `description` is the name. */
export interface SaleItem {
  id: string;
  product_variant_id: string;
  description: string;
  options?: unknown[];
  quantity: number;
  unit_price: string;
  line_total: string;
}

/** `PaymentResponse`. */
export interface SalePayment {
  id: string;
  payment_method_id: string;
  amount: string;
  reference?: string | null;
}

/** `SaleResponse` — the emitted, paid sale (receipt). */
export interface Sale {
  id: string;
  cash_shift_id: string;
  user_id: string;
  user_name?: string | null;
  customer_name?: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  tip: string;
  total: string;
  status: string;
  sold_at: string;
  items?: SaleItem[];
  payments?: SalePayment[];
}
