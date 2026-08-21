// Tipos del lado **staff** del flujo de mesas (tags `orders` + `table-sessions`).
//
// El contrato del comensal (carrito, sesión, pedidos propios) vive en
// `diner.interface.ts`: son rutas públicas con un modelo de auth distinto y no
// deben mezclarse con estas.
//
// Ver `pos-backend/docs/flujo-qr.md`.

// ── Orders (`/orders`) ─────────────────────────────────────────────────────

export type OrderChannel = 'qr' | 'counter' | 'waiter';

/**
 * Ciclo de vida del **pedido** (facturación), independiente del de cocina.
 *
 * `recibida` es el pedido que el comensal ya envió pero que el personal aún no
 * ha aceptado: **no ha descontado inventario**. El stock se compromete al
 * confirmar (`recibida` → `abierta`).
 */
export type DiningOrderStatus =
  | 'recibida'
  | 'abierta'
  | 'bloqueada'
  | 'pagada'
  | 'cancelada';

/**
 * Estado de preparación por ítem (`KitchenStatus`), que mueve la terminal de
 * mesas. El backend admite el salto directo `pendiente → listo`.
 */
export type KitchenStatus = 'pendiente' | 'en_preparacion' | 'listo' | 'anulado';

/**
 * One line of a `POST /orders` (or `.../tables/{id}/items`) request
 * (`OrderItemIn`). Exactly one of `product_variant_id` / `combo_id` must be
 * set; a combo doesn't accept `option_ids`.
 */
export interface OrderItemPayload {
  product_variant_id?: string;
  combo_id?: string;
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
  /**
   * Solo válido con `channel: 'counter' | 'waiter'` (feature 028). El pedido se
   * crea **sin** descontar inventario ni ser visible en cocina — eso solo pasa
   * al llamar `POST /orders/{id}/checkout-and-send`. Así una orden de mostrador
   * que el cajero está armando no golpea cocina antes de estar pagada.
   */
  hold_for_payment?: boolean;
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
  /**
   * Combo (selección explícita) que originó esta línea. Varias líneas del
   * mismo pedido comparten `combo_id`: son los componentes reales de un
   * mismo combo, cada uno con su propio `product_variant_id` y receta.
   */
  combo_id?: string | null;
  /**
   * Comensal al que se le cobra esta línea. La asignación es **por ítem**, no
   * por pedido: por eso la cuenta dividida es exacta aunque un pedido mezcle
   * personas. `null` = lo añadió el mesero.
   */
  participant_id?: string | null;
  quantity: number;
  unit_price: string;
  /** Estado de preparación de este ítem. */
  estado_cocina: KitchenStatus;
  /**
   * Versión del evento de tiempo real que emitió esta escritura. Solo lo
   * rellena `PATCH /orders/items/{id}/kitchen`, para que una pantalla que
   * parchee el ítem en local pueda descartar un evento en vuelo que lo
   * revertiría.
   */
  rt_v?: number | null;
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

// ── Pagos (spec 024) ────────────────────────────────────────────────────────

export type PaymentAttemptStatus = 'pendiente' | 'confirmado' | 'rechazado';

/**
 * Resumen del intento de pago vigente de la orden (`current_payment_attempt`
 * en `OrderResponse`). **No** trae `rejection_reason` — eso solo lo expone el
 * historial completo (`PaymentAttemptResponse`, `GET
 * /orders/{id}/payment-attempts`), que es la vista de cajero/back-office.
 */
export interface CurrentPaymentAttemptSummary {
  id: string;
  status: PaymentAttemptStatus;
  payment_method_name: string;
  is_cash: boolean;
  receipt_file_url: string | null;
}

/** Vista de cajero de un intento de pago (`PaymentAttemptResponse`). */
export interface PaymentAttempt {
  id: string;
  order_id: string;
  payment_method_id: string;
  payment_method_name: string;
  is_cash: boolean;
  status: PaymentAttemptStatus;
  amount_received: string | null;
  change_amount: string | null;
  receipt_file_url: string | null;
  rejection_reason: string | null;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** Body de `POST /orders/payment-attempts/{id}/reject` (`PaymentAttemptRejectIn`). */
export interface PaymentAttemptRejectPayload {
  reason: string;
}

/** Body de `POST /orders/payment-attempts/{id}/confirm-cash` (`PaymentAttemptConfirmCashIn`). */
export interface PaymentAttemptConfirmCashPayload {
  amount_received: number;
}

/** Response of `POST /orders` and `GET /orders` (`OrderResponse`). */
export interface DiningOrder {
  id: string;
  channel: string;
  status: DiningOrderStatus;
  version?: number;
  /** Sesión de mesa a la que pertenece (agrupa los pedidos de todos los comensales). */
  table_session_id?: string | null;
  /** Comensal que lo envió; `null` si lo creó el staff. */
  participant_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  created_at: string;
  items?: DiningOrderItem[];
  /** `null` si nunca se inició ningún intento de pago (spec 024). */
  current_payment_attempt?: CurrentPaymentAttemptSummary | null;
}

// ── Terminal híbrida por origen (feature 028) ──────────────────────────────

/**
 * Qué panel muestra la barra lateral de cobro: `'resumen'` (solo lectura, para
 * pedidos `qr` — el comensal ya pagó a distancia y el cajero solo valida el
 * comprobante) o `'terminal-pos'` (editable, para pedidos creados/pagados en
 * el mostrador por el cajero, o una mesa libre donde todavía no hay pedido).
 */
export type SidebarMode = 'resumen' | 'terminal-pos';

/**
 * Decide el modo de la barra lateral a partir del pedido activo de la mesa.
 *
 * `null`/`undefined` (mesa libre, sin pedido seleccionado todavía) cae en
 * `'terminal-pos'`: es justo donde se arma un pedido manual nuevo.
 */
export function getSidebarMode(order: DiningOrder | null | undefined): SidebarMode {
  return order?.channel === 'qr' ? 'resumen' : 'terminal-pos';
}

/** Body de `POST /orders/{id}/checkout-and-send` (feature 028). Paga un pedido
 *  de mostrador, emite su venta/factura y lo envía a cocina en una sola
 *  llamada atómica. */
export interface CheckoutAndSendPayload {
  /** Backstop de doble clic: el backend rechaza con `409` si ya no coincide. */
  version: number;
  cash_shift_id: string;
  payments: PaymentLine[];
  discount?: number;
  tax?: number;
  tip?: number;
  /** A nombre de quién se factura; por defecto "Consumidor Final". */
  billing_customer_name?: string;
}

// ── Sesión de mesa (`/table-sessions`) ─────────────────────────────────────

export type BillingMode = 'unified' | 'split';

/** Un comensal de la mesa (`ParticipantResponse`). */
export interface SessionParticipant {
  id: string;
  display_name: string;
  /** Nombre desambiguado ("Ana (2)"). **Es el que se muestra**, no `display_name`. */
  display_label: string | null;
  status: string;
  joined_at: string;
  expires_at?: string | null;
  closed_at?: string | null;
}

/** Sesión de mesa (`TableSessionResponse`). Una activa por mesa como máximo. */
export interface TableSession {
  id: string;
  dining_table_id: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  closed_by_user_name?: string | null;
  billing_mode?: BillingMode | null;
  participants: SessionParticipant[];
}

/** Una línea del desglose de la cuenta (`SessionBillLine`). */
/** `POST /table-sessions/{id}/participants` — comensal creado por el staff. */
export interface ParticipantCreatePayload {
  display_name: string;
}

/**
 * Una línea (o parte de ella) y a quién se le cobra. `participant_id: null` = sin
 * asignar. `quantity` reparte las unidades de una misma línea entre varias personas:
 * se mandan varias entradas del mismo `order_item_id` y **la suma debe ser exactamente
 * la cantidad de la línea**. Omitirlo significa "la línea entera".
 */
export interface ItemAssignment {
  order_item_id: string;
  participant_id: string | null;
  quantity?: number;
}

/** `PUT /table-sessions/{id}/assignments` — reparto en lote. */
export interface AssignmentsPayload {
  assignments: ItemAssignment[];
}

/** Ítem consumido, para el detalle de la cuenta (spec 026, FR-006). */
export interface SessionBillItem {
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface SessionBillLine {
  /** `null` = ítems añadidos por el mesero, sin comensal asignado. */
  participant_id: string | null;
  display_label: string | null;
  subtotal: string;
  /** spec 026, FR-006: detalle de ítems y descuento ya aplicado. */
  items: SessionBillItem[];
  discount: string;
}

/** Cuenta de la sesión (`SessionBillResponse`). */
export interface SessionBill {
  table_session_id: string;
  dining_table_id: string;
  total: string;
  order_ids: string[];
  split: SessionBillLine[];
}

/** Pago de un comensal concreto en modo `split` (`SplitPaymentIn`). */
export interface SplitPayment {
  participant_id: string | null;
  payments: PaymentLine[];
  discount?: number;
  tax?: number;
  tip?: number;
}

/** Body de `POST /table-sessions/{id}/close` (`CloseSessionIn`). */
export interface CloseSessionPayload {
  cash_shift_id: string;
  billing_mode: BillingMode;
  /** Solo en `unified`. */
  payments?: PaymentLine[];
  discount?: number;
  tax?: number;
  tip?: number;
  /**
   * Solo en `unified`: a nombre de quién va la factura. Si se omite, el backend
   * usa los comensales de la sesión y, si no hay, la mesa.
   */
  customer_name?: string;
  /** Solo en `split`: uno por **cada** comensal con consumo. */
  splits?: SplitPayment[];
}

/** Respuesta del cierre (`CloseSessionResponse`). */
export interface CloseSessionResponse {
  table_session: TableSession;
  /** Una venta en `unified`, una por comensal en `split`. */
  sale_ids: string[];
}
