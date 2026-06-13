/** Backend product type (`ProductType` enum). */
export type ProductType = 'INGREDIENT' | 'PRODUCT' | 'RECIPE';

/** A recipe component: a referenced product and how much of it the recipe uses. */
export interface ProductComponentForm {
  component_id: string;
  quantity: number;
}

/** Product as managed by the inventory module, modeled on the backend `ProductListResponse`. */
export interface Ingredient {
  id: string;
  name: string;
  description: string | null;
  cost: number;
  price: number;
  is_menu: boolean;
  product_type: ProductType;
  control_stock: boolean;
  stock: number;
  stock_min: number;
  category_id: string;
  unit_measure_id: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the inventory form. */
export interface IngredientForm {
  name: string;
  description: string;
  product_type: ProductType;
  cost: number;
  /** Sale price; sent as 0 for INGREDIENT. */
  price: number;
  /** Whether the product is shown on the restaurant menu (PRODUCT/RECIPE). */
  is_menu: boolean;
  category_id: string;
  unit_measure_id: string;
  /** Whether the product tracks stock. */
  control_stock: boolean;
  /** Initial stock, used only on creation when control_stock is on. */
  current_stock: number;
  /** Minimum stock threshold for low-stock alerts. */
  stock_min: number;
  /** Components, only for RECIPE. */
  components: ProductComponentForm[];
}

/** Stock movement captured by the movement modal. */
export interface RecordMovementForm {
  type: 'income' | 'expense';
  quantity: number;
  reason: string;
}

/** Request body for `POST /products` (`ProductCreate`). */
export interface ProductCreatePayload {
  name: string;
  description: string | null;
  price: number;
  cost: number;
  is_menu: boolean;
  product_type: ProductType;
  control_stock: boolean;
  stock: number | null;
  stock_min: number;
  category_id: string;
  unit_measure_id: string;
  components?: ProductComponentForm[] | null;
}

/** Request body for `PATCH /products/{id}` (`ProductUpdate`). */
export interface ProductUpdatePayload {
  name?: string;
  description?: string | null;
  price?: number;
  cost?: number;
  is_menu?: boolean;
  product_type?: ProductType;
  control_stock?: boolean;
  stock_min?: number;
  components?: ProductComponentForm[] | null;
  category_id?: string;
  unit_measure_id?: string;
  active?: boolean;
}

/** Request body for `POST /inventory/{id}/income|expense` (`InventoryMovementCreate`). */
export interface InventoryMovementPayload {
  quantity: number;
  reason?: string | null;
}
