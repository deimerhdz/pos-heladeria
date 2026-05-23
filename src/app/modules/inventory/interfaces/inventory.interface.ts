import { Product } from '../../products/interfaces/product.interface';

export type MovementType = 'in' | 'out' | 'adjustment';

export interface InventoryMovement {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  reason: string;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProductStock extends Product {
  stock: number;
}
