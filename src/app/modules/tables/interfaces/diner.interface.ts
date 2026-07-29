// Contrato público del comensal (rutas `/cart` y `/menu/qr-token`).
//
// El comensal es anónimo: no hay login. Su identidad viaja firmada en el
// `session_token` que devuelve `POST /cart/sessions` y que se envía en la
// cabecera `x-session-token`. `display_name` es solo texto que el comensal
// escribe — NO identifica a nadie y no es único dentro de la mesa.
//
// Ver `pos-backend/docs/flujo-qr.md`.

/** Mesa resuelta desde el QR firmado (`SessionTableInfo`). */
export interface DinerTable {
  id: string;
  number: number;
  name: string | null;
}

/** Body de `POST /cart/sessions` (`SessionOpenIn`). */
export interface SessionOpenPayload {
  /** Token **firmado** de la mesa (JWT), no el UUID de `dining_tables.qr_token`. */
  qr_token: string;
  display_name: string;
}

/** Respuesta de `POST /cart/sessions` (`SessionOpenResponse`). */
export interface SessionOpenResponse {
  participant_id: string;
  table_session_id: string;
  display_name: string;
  /**
   * Nombre ya desambiguado que ven cocina y staff ("Ana (2)" si ya había una
   * Ana en la mesa). **Es el que se muestra en la UI**, no `display_name`.
   */
  display_label: string | null;
  expires_at: string | null;
  table: DinerTable;
  cart_id: string;
  /** Se envía en `x-session-token` en toda operación del comensal. */
  session_token: string;
}

// ── Carrito borrador (vive en el backend) ──────────────────────────────────

/** Body de `POST /cart/items` (`CartItemIn`). */
export interface CartItemPayload {
  product_variant_id: string;
  quantity?: number;
  option_ids?: string[];
  notes?: string | null;
}

/** Body de `PATCH /cart/items/{id}` (`CartItemUpdate`). */
export interface CartItemUpdatePayload {
  quantity?: number;
  option_ids?: string[];
  notes?: string | null;
}

/** Opción elegida en una línea del carrito (`CartItemOptionResponse`). */
export interface CartItemOption {
  id: string;
  option_id: string;
}

/** Una línea del carrito (`CartItemResponse`). Los importes llegan como string. */
export interface CartItemResponse {
  id: string;
  product_variant_id: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  notes: string | null;
  options: CartItemOption[];
}

/** Carrito completo (`CartResponse`). Toda mutación devuelve este objeto entero. */
export interface CartResponse {
  id: string;
  participant_id: string;
  display_name: string;
  /**
   * Nombre desambiguado del comensal ("Ana (2)"). **Es el que se muestra en la
   * UI**, y llega aquí porque el `session_token` no lleva el nombre: al recargar
   * el menú, `GET /cart` es lo que permite repintar el saludo.
   */
  display_label: string | null;
  status: string;
  total: string;
  items: CartItemResponse[];
}

// ── Pedidos del comensal ───────────────────────────────────────────────────

// `POST /cart/submit`, `GET /cart/orders` y `POST /cart/orders/{id}/cancel`
// devuelven el mismo `OrderResponse` que el lado staff, así que se reutiliza
// `DiningOrder` en vez de mantener un tipo paralelo que se desincronizaría.

/** Body de `POST /cart/orders/{id}/cancel` (`MyOrderCancelIn`). */
export interface MyOrderCancelPayload {
  motivo: string;
}

// ── Errores tipados que la UI debe distinguir ──────────────────────────────

/**
 * `detail` del `409` de `POST /cart/items`: el chequeo preventivo de stock.
 *
 * Ojo: en `POST /orders/{id}/confirm` (staff) el mismo problema llega como
 * **cadena**, no como objeto. No son intercambiables.
 */
export interface StockConflictDetail {
  error: string;
  insumo: string;
  disponible: string;
  requerido: string;
  contexto: string;
}
