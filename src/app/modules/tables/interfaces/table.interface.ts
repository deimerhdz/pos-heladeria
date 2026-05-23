export interface Table {
  id: string;
  name: string;
  code: string;
  capacity: number | null;
  is_active: boolean;
  created_at: string;
}

export interface TableWithOccupancy extends Table {
  member_count: number | null;
}

export interface TableForm {
  name: string;
  capacity: number | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
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
