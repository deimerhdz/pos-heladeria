/**
 * Product domain models for the REST `/products`, `/variants`, `/option-groups`
 * and `/menu` APIs.
 *
 * The backend returns decimals (`price`, `extra_price`, `quantity`) as strings;
 * these domain types use `number`. The service handles the conversion.
 */

/** How a product is prepared. `prepared` = hecho al momento; `packaged` = empacado. */
export type PreparationType = 'prepared' | 'packaged';

// --- Products ---

/** A product (list/detail). Mirrors backend `ProductResponse`/`ProductListResponse`. */
export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  preparation_type: PreparationType;
  image_url: string | null;
  active: boolean;
  /** Disponibilidad operativa ('agotado temporal'), distinta de `active` (RF-006). */
  available: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the product create/edit forms. */
export interface ProductForm {
  category_id: string;
  name: string;
  description: string;
  preparation_type: PreparationType;
  image_url: string;
}

/** `POST /products` (`ProductCreate`). */
export interface ProductCreatePayload {
  category_id: string;
  name: string;
  description?: string | null;
  preparation_type: PreparationType;
  image_url?: string | null;
}

/** `PATCH /products/{id}` (`ProductUpdate`) — all optional. */
export interface ProductUpdatePayload {
  category_id?: string;
  name?: string;
  description?: string | null;
  preparation_type?: PreparationType;
  image_url?: string | null;
  active?: boolean;
  available?: boolean;
}

// --- Variants ---

/** A product variant (a concrete priced option, e.g. "Pequeño"). Mirrors `VariantResponse`. */
export interface Variant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  active: boolean;
}

/** Editable fields captured by the variant form. */
export interface VariantForm {
  name: string;
  price: number;
  sku: string | null;
}

/** `POST /products/{id}/variants` (`VariantCreate`). */
export interface VariantCreatePayload {
  name: string;
  price: number;
  sku?: string | null;
}

/** `PATCH /variants/{id}` (`VariantUpdate`) — all optional. */
export interface VariantUpdatePayload {
  name?: string;
  price?: number;
  sku?: string | null;
  active?: boolean;
}

// --- Option groups & options ---

/** An option inside a group (e.g. a flavor). Mirrors `OptionResponse`. */
export interface Option {
  id: string;
  option_group_id: string;
  name: string;
  extra_price: number;
  /** Optional inventory item this option consumes. */
  inventory_item_id: string | null;
  item_quantity: number;
  active: boolean;
}

/** A group of options with selection bounds. Mirrors `OptionGroupResponse`. */
export interface OptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  active: boolean;
  options: Option[];
}

/** Editable fields captured by the option-group form. */
export interface OptionGroupForm {
  name: string;
  min_select: number;
  max_select: number;
}

/** `POST /option-groups` (`OptionGroupCreate`). */
export interface OptionGroupCreatePayload {
  name: string;
  min_select: number;
  max_select: number;
}

/** `PATCH /option-groups/{id}` (`OptionGroupUpdate`). Partial: only sent fields apply. */
export interface OptionGroupUpdatePayload {
  name?: string;
  min_select?: number;
  max_select?: number;
  active?: boolean;
}

/** Editable fields captured by the option form. */
export interface OptionForm {
  name: string;
  extra_price: number;
  inventory_item_id: string | null;
  item_quantity: number;
}

/** `POST /option-groups/{gid}/options` (`OptionCreate`). */
export interface OptionCreatePayload {
  name: string;
  extra_price: number;
  inventory_item_id?: string | null;
  item_quantity: number;
}

/**
 * `PATCH /options/{id}` (`OptionUpdate`). Partial: only sent fields apply.
 * `inventory_item_id: null` explicitly unlinks the inventory item.
 */
export interface OptionUpdatePayload {
  name?: string;
  extra_price?: number;
  inventory_item_id?: string | null;
  item_quantity?: number;
  active?: boolean;
}

/** `POST /products/{pid}/option-groups` (`ProductOptionGroupCreate`). */
export interface ProductOptionGroupPayload {
  option_group_id: string;
  min_select: number;
  max_select: number;
}

// --- Recipes (per variant, consume inventory items) ---

/** One line of a variant recipe. Mirrors `RecipeItemResponse` / `RecipeItemIn`. */
export interface RecipeItem {
  inventory_item_id: string;
  quantity: number;
}

/** `PUT /variants/{id}/recipe` (`RecipeSet`). */
export interface RecipeSetPayload {
  items: RecipeItem[];
}

// --- Draft (single-page create/edit) ---
//
// El backend no admite creación anidada; el draft es el modelo de UI que la
// página unifica y que `ProductService.saveProduct` orquesta en varias llamadas.

/** Una línea de receta en el draft (insumo fijo). */
export interface RecipeLineDraft {
  inventory_item_id: string;
  quantity: number;
}

/** Una variante en el draft. `id === null` = aún no existe en el backend. */
export interface VariantDraft {
  /** Id de backend, o null si es nueva. */
  id: string | null;
  /** Clave local estable para `@for` mientras no hay id. */
  localId: string;
  name: string;
  price: number;
  recipe: RecipeLineDraft[];
}

/** Asignación de un grupo de opciones al producto. `assigned` = ya persistida. */
export interface OptionGroupAssignmentDraft {
  option_group_id: string;
  name: string;
  min_select: number;
  max_select: number;
  /** true si ya está asignada en el backend (al quitarla se hace DELETE). */
  assigned: boolean;
}

/** Draft completo del producto para la página unificada de crear/editar. */
export interface ProductDraft {
  id: string | null;
  name: string;
  category_id: string;
  description: string;
  preparation_type: PreparationType;
  image_url: string;
  active: boolean;
  hasSizes: boolean;
  variants: VariantDraft[];
  optionGroups: OptionGroupAssignmentDraft[];
  /** Grupos asignados al cargar el draft; los que ya no estén se desasignan al guardar. */
  originalOptionGroupIds: string[];
}

// --- Public menu (`GET /menu`) ---

export interface MenuOption {
  id: string;
  name: string;
  extra_price: number;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options: MenuOption[];
}

export interface MenuVariant {
  id: string;
  name: string;
  price: number;
}

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants: MenuVariant[];
  option_groups: MenuOptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}
