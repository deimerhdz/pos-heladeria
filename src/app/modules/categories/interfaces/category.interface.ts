/** Mirrors the backend `PresentationSummary` (spec 083). */
export interface CategoryPresentationSummary {
  id: string;
  name: string;
}

/** Mirrors the backend `CategoryResponse`. */
export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at?: string | null;
  /** spec 083 (FR-004): presentaciones asociadas actualmente. */
  presentations: CategoryPresentationSummary[];
}

/** Editable fields captured by the category form. */
export interface CategoryForm {
  name: string;
  description: string;
  display_order: number | null;
  /** spec 083: ids de presentaciones asociadas (reemplazo total al guardar). */
  presentation_ids: string[];
}

/** Request body for `POST /categories` (`CategoryCreate`). */
export interface CategoryCreatePayload {
  name: string;
  description: string | null;
  display_order: number | null;
  presentation_ids: string[];
}

/** Request body for `PATCH /categories/{id}` (`CategoryUpdate`). */
export interface CategoryUpdatePayload {
  name?: string;
  description?: string | null;
  active?: boolean;
  display_order: number | null;
  presentation_ids?: string[];
}
