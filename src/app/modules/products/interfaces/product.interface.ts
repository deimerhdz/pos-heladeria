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
  /** Si el producto exige y aplica descuento de inventario en sus presentaciones. */
  tracks_inventory: boolean;
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
  tracks_inventory?: boolean;
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
  tracks_inventory?: boolean;
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

/**
 * `detail` del 409 de `POST /products/{id}/variants` y `PATCH /variants/{id}` cuando el
 * nombre ya está tomado dentro del producto.
 *
 * `active: false` es el caso interesante: la que estorba es una presentación
 * soft-borrada, que el editor no lista y por eso el usuario intenta recrearla. Se
 * resuelve restaurándola, no creando otra.
 */
export interface VariantNameConflict {
  error: string;
  variant_id: string;
  active: boolean;
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

// --- Recipes (per variant, consume inventory items) ---

/**
 * Un insumo fijo que la variante consume siempre (200 g de fruta). Lo que el cliente
 * elige va en {@link VariantOptionGroup}, no aquí.
 */
export interface RecipeItem {
  inventory_item_id: string;
  quantity: number;
}

/** `PUT /variants/{id}/recipe` (`RecipeSet`). */
export interface RecipeSetPayload {
  items: RecipeItem[];
}

// --- Grupos de opciones por variante ---

/**
 * Un grupo que ofrece una presentación: cuántas opciones elige el cliente y cuánto
 * descuenta **cada una** de ellas.
 *
 * Vive en la variante y no en el producto porque las tres cosas cambian con el tamaño:
 * la ensalada pequeña elige 1 sabor y descuenta 60 g, la mediana elige 2 y descuenta
 * 120 g de cada uno.
 *
 * `quantity_per_option` es por opción elegida, no el total del grupo. En 0 el grupo se
 * ofrece pero no descuenta por sí mismo.
 */
export interface VariantOptionGroup {
  option_group_id: string;
  min_select: number;
  max_select: number;
  quantity_per_option: number;
}

/** `PUT /variants/{id}/option-groups` (`VariantOptionGroupSet`). */
export interface VariantOptionGroupSetPayload {
  groups: VariantOptionGroup[];
}

// --- Draft (single-page create/edit) ---
//
// El backend no admite creación anidada; el draft es el modelo de UI que la
// página unifica y que `ProductService.saveProduct` orquesta en varias llamadas.

/** Un insumo fijo en el draft. `inventory_item_id` es null mientras no se elige. */
export interface RecipeLineDraft {
  inventory_item_id: string | null;
  quantity: number;
}

/** Un grupo ofrecido por la variante, en el draft. `name` se resuelve para mostrarlo. */
export interface VariantOptionGroupDraft {
  option_group_id: string | null;
  name: string;
  min_select: number;
  max_select: number;
  quantity_per_option: number;
}

/**
 * Una presentación en el draft, con TODO lo suyo: precio, insumos fijos y grupos.
 * `id === null` = aún no existe en el backend.
 */
export interface VariantDraft {
  /** Id de backend, o null si es nueva. */
  id: string | null;
  /** Clave local estable para `@for` mientras no hay id. */
  localId: string;
  name: string;
  price: number;
  recipe: RecipeLineDraft[];
  optionGroups: VariantOptionGroupDraft[];
}

/**
 * Presentación soft-borrada: no se vende ni sale en la carta, pero su fila sigue
 * existiendo y sigue ocupando su nombre dentro del producto. Se lista aparte para poder
 * restaurarla; no se edita, así que no necesita receta ni grupos.
 */
export interface DeactivatedVariant {
  id: string;
  name: string;
  price: number;
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
  /**
   * Si el producto maneja inventario. Apagado por defecto en un producto nuevo. Habilita
   * la sección de insumos (receta fija y grupos de opciones) de cada presentación cuando
   * está activado; apagarlo NO borra los insumos ya guardados, solo deja de exigirlos y
   * de aplicarlos al vender.
   */
  tracks_inventory: boolean;
  /** Las presentaciones vivas: las únicas editables y las únicas que se guardan. */
  variants: VariantDraft[];
  /** Las desactivadas del producto. Vacío en un producto nuevo. */
  deactivated: DeactivatedVariant[];
}

// --- Public menu (`GET /menu`) ---

export interface MenuOption {
  id: string;
  name: string;
  extra_price: number;
  /** Hay stock del insumo que consume. `false` = se muestra como "Agotado". */
  available: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  /**
   * El grupo descuenta inventario por cada opción elegida.
   *
   * Cambia cuántas hay que elegir: un helado de tres bolas reparte una cantidad
   * física fija entre los sabores, así que elegir uno solo sirve tres y
   * descuenta uno. Por eso ahí se exige el máximo y no el mínimo. Ver
   * `requiredCount()` en `product-select.component.ts`.
   */
  consume: boolean;
  options: MenuOption[];
}

export interface MenuVariant {
  id: string;
  name: string;
  price: number;
  /** Precio ya con el mejor descuento vigente aplicado, o `null`/ausente si no hay. */
  discounted_price?: number | null;
  /** Tipo de promoción que generó `discounted_price` ('percent'/'fixed'), o `null`/ausente si no hay. */
  discount_kind?: string | null;
  /**
   * Fuente autoritativa de qué puede elegir el cliente: cuántas opciones y de qué
   * grupos cambia con el tamaño.
   */
  option_groups: MenuOptionGroup[];
  /** `false` si un grupo obligatorio de esta presentación se quedó sin stock. */
  available: boolean;
}

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants: MenuVariant[];
  /**
   * Unión de los grupos de todas las presentaciones. **Solo sirve para resolver el
   * nombre y el precio de una opción** (tickets, comandas, carrito): su
   * `min/max_select` es el de la primera presentación que lo ofrece y no significa
   * nada. Para saber qué puede elegir el cliente, usar `variants[].option_groups`.
   */
  option_groups: MenuOptionGroup[];
  /** `false` si ninguna presentación se puede pedir. */
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}
