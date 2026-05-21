export interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CategoryForm {
  name: string;
  description: string;
  image_url: string;
}
