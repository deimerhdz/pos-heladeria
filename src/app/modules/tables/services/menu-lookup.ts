import { MenuCategory } from '../../products/interfaces/product.interface';

/**
 * Resolves order-item ids to human labels and prices. Comanda items only carry
 * `product_variant_id` / `option_id`, so staff/kitchen/diner/checkout views
 * build this from the menu (`GET /menu`) to show names and estimate totals.
 */
export interface MenuLookup {
  variantLabel(variantId: string): string;
  optionLabel(optionId: string): string;
  variantPrice(variantId: string): number;
  optionPrice(optionId: string): number;
  /** Producto dueño de la variante — para resolver a qué aplica una promoción. */
  productId(variantId: string): string | undefined;
  /** Categoría del producto dueño de la variante — ídem. */
  categoryId(variantId: string): string | undefined;
}

interface MenuLookupMaps {
  labels: Map<string, string>;
  optLabels: Map<string, string>;
  prices: Map<string, number>;
  optPrices: Map<string, number>;
  productIds: Map<string, string>;
  categoryIds: Map<string, string>;
}

function indexVariants(category: MenuCategory, product: MenuCategory['products'][number], maps: MenuLookupMaps): void {
  for (const variant of product.variants) {
    // Only qualify with the variant name when the product has more than one.
    maps.labels.set(
      variant.id,
      product.variants.length > 1 ? `${product.name} · ${variant.name}` : product.name,
    );
    maps.prices.set(variant.id, variant.price);
    maps.productIds.set(variant.id, product.id);
    maps.categoryIds.set(variant.id, category.id);
  }
}

function indexOptions(product: MenuCategory['products'][number], maps: MenuLookupMaps): void {
  for (const group of product.option_groups) {
    for (const option of group.options) {
      maps.optLabels.set(option.id, option.name);
      maps.optPrices.set(option.id, option.extra_price);
    }
  }
}

export function buildMenuLookup(categories: MenuCategory[]): MenuLookup {
  const maps: MenuLookupMaps = {
    labels: new Map(),
    optLabels: new Map(),
    prices: new Map(),
    optPrices: new Map(),
    productIds: new Map(),
    categoryIds: new Map(),
  };

  for (const category of categories) {
    for (const product of category.products) {
      indexVariants(category, product, maps);
      indexOptions(product, maps);
    }
  }

  return {
    variantLabel: (id) => maps.labels.get(id) ?? 'Producto',
    optionLabel: (id) => maps.optLabels.get(id) ?? '',
    variantPrice: (id) => maps.prices.get(id) ?? 0,
    optionPrice: (id) => maps.optPrices.get(id) ?? 0,
    productId: (id) => maps.productIds.get(id),
    categoryId: (id) => maps.categoryIds.get(id),
  };
}
