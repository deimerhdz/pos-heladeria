/** Unit of measure used by the (not-yet-migrated) menu recipes. */
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'L' | 'unidad' | 'porcion';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number;
  stock_min: number;
  is_active: boolean;
  category_id: string;
  created_at: string;
}

export interface ProductForm {
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
}

export interface RecipeItem {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient_name: string;
  ingredient_unit: IngredientUnit;
  ingredient_cost_per_unit: number;
}

export interface RecipeItemForm {
  ingredient_id: string;
  quantity: number;
}
