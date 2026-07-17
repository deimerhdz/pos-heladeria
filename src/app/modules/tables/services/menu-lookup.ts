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
}

export function buildMenuLookup(categories: MenuCategory[]): MenuLookup {
  const labels = new Map<string, string>();
  const optLabels = new Map<string, string>();
  const prices = new Map<string, number>();
  const optPrices = new Map<string, number>();

  for (const category of categories) {
    for (const product of category.products) {
      for (const variant of product.variants) {
        // Only qualify with the variant name when the product has more than one.
        labels.set(
          variant.id,
          product.variants.length > 1 ? `${product.name} · ${variant.name}` : product.name,
        );
        prices.set(variant.id, variant.price);
      }
      for (const group of product.option_groups) {
        for (const option of group.options) {
          optLabels.set(option.id, option.name);
          optPrices.set(option.id, option.extra_price);
        }
      }
    }
  }

  return {
    variantLabel: (id) => labels.get(id) ?? 'Producto',
    optionLabel: (id) => optLabels.get(id) ?? '',
    variantPrice: (id) => prices.get(id) ?? 0,
    optionPrice: (id) => optPrices.get(id) ?? 0,
  };
}
