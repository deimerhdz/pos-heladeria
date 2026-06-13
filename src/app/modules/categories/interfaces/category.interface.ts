/** Mirrors the backend `CategoryResponse`. */
export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the category form. */
export interface CategoryForm {
  name: string;
  description: string;
}

/** Request body for `POST /categories` (`CategoryCreate`). */
export interface CategoryCreatePayload {
  name: string;
  description: string | null;
}

/** Request body for `PATCH /categories/{id}` (`CategoryUpdate`). */
export interface CategoryUpdatePayload {
  name?: string;
  description?: string | null;
  active?: boolean;
}
