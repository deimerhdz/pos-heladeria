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
