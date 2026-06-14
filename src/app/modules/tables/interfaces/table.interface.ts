/** Admin table model, mirrors the backend `TableResponse`. */
export interface Table {
  id: string;
  name: string;
  qr_code: string | null;
  capacity: number;
  status: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Request body for `POST /tables` (`TableCreate`). */
export interface TableCreatePayload {
  name: string;
  qr_code?: string | null;
  capacity: number;
  status?: string;
}

/** Request body for `PATCH /tables/{id}` (`TableUpdate`). */
export interface TableUpdatePayload {
  name?: string;
  qr_code?: string | null;
  capacity?: number;
  status?: string;
  active?: boolean;
}

export interface TableForm {
  name: string;
  capacity: number;
}

/**
 * Shape of a table as read by the public QR menu flow directly from Supabase
 * (`code`/`is_active`). Decoupled from the backend-aligned {@link Table} until
 * the public-menu/sessions flow is migrated.
 */
export interface PublicMenuTable {
  id: string;
  name: string;
  code: string;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}

// ── Backend QR menu flow (tag `menu`) ──────────────────────────────────────

/** Body for `POST /api/v1/menu/sessions`. */
export interface MenuSessionCreate {
  qr_code: string;
  customer_name: string;
}

/** Response of `POST /api/v1/menu/sessions`. */
export interface MenuSession {
  session_token: string;
  customer_name: string;
  table_id: string;
  table_name: string;
  capacity: number;
}

/** Item of `GET /api/v1/menu/categories`. */
export interface MenuCategoryResponse {
  id: string;
  name: string;
  description?: string | null;
}

/** Item of `GET /api/v1/menu/products` (`price` is a decimal string). */
export interface MenuProductResponse {
  id: string;
  name: string;
  description?: string | null;
  price: string;
  category_id: string;
}

/** Generic paginated wrapper (`Page[T]`) used by the backend list endpoints. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ── Backend table cart & orders (tag `menu`) ───────────────────────────────

/** Body for `POST /api/v1/menu/cart/items`. */
export interface CartItemCreate {
  product_id: string;
  quantity?: number;
}

/** Body for `PATCH /api/v1/menu/cart/items/{id}`. */
export interface CartItemUpdate {
  quantity: number;
}

/** Item of the shared table cart (`CartItemResponse`). Amounts are decimal strings. */
export interface CartItemResponse {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  table_session_id: string;
  customer_name: string;
  /** Whether the current session added this item (only mine are editable). */
  is_mine: boolean;
}

/** Response of the cart endpoints (`CartResponse`). */
export interface CartResponse {
  table_id: string;
  items: CartItemResponse[];
  total: string;
}

/** Order scope: only my items (`individual`) or the whole table (`table`). */
export type OrderScope = 'individual' | 'table';

export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/** Body for `POST /api/v1/menu/orders`. */
export interface OrderCreate {
  scope: OrderScope;
}

/** Item of an order (`OrderItemResponse`). */
export interface OrderItemResponse {
  id: string;
  product_id: string;
  product_name: string;
  table_session_id?: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

/** Response of `POST /api/v1/menu/orders` (`OrderResponse`). */
export interface OrderResponse {
  id: string;
  table_id: string;
  table_session_id?: string | null;
  scope: OrderScope;
  customer_name?: string | null;
  status: OrderStatus;
  total: string;
  items?: OrderItemResponse[];
  created_at: string;
}

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
}

export interface CartItem {
  product: MenuProduct;
  quantity: number;
}

export interface Order {
  id: string;
  table_id: string;
  status: 'pending' | 'preparing' | 'ready' | 'bill_requested' | 'paid';
  notes: string | null;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  member_id: string | null;
  created_at: string;
}

export interface SessionItem {
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface TableSession {
  sessionId: string;
  orderId: string;
  orderStatus: 'pending' | 'preparing' | 'ready' | 'bill_requested' | 'paid';
  memberCount: number;
  capacity: number;
  items: SessionItem[];
  total: number;
}

export interface TableSessionStorage {
  sessionId: string;
  memberId: string;
}
