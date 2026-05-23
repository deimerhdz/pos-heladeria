export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_active: boolean;
  stock: number;
  category_id: string;
  created_at: string;
}

export interface ProductForm {
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  stock: number;
}
