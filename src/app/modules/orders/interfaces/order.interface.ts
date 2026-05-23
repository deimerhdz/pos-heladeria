export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'bill_requested' | 'paid';

export interface Order {
  id: string;
  table_id: string;
  table_name: string;
  status: OrderStatus;
  notes: string | null;
  customer_name: string | null;
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
  created_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}
