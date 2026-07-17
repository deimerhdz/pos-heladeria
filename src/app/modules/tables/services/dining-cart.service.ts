import { Injectable, computed, signal } from '@angular/core';
import {
  MenuOption,
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { OrderItemPayload } from '../interfaces/dining.interface';

/** A single client-side cart line: a variant + chosen options + quantity. */
export interface CartLine {
  /** Stable key per variant + selected-options combination. */
  key: string;
  productName: string;
  variant: MenuVariant;
  options: MenuOption[];
  quantity: number;
  notes: string | null;
  /** variant.price + Σ options.extra_price. */
  unitPrice: number;
}

/**
 * Client-side cart for the QR menu. The backend has no cart endpoint: the diner
 * builds this locally and it is posted as a single `POST /orders`.
 */
@Injectable({ providedIn: 'root' })
export class DiningCartService {
  readonly lines = signal<CartLine[]>([]);

  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  readonly total = computed(() => this.lines().reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  readonly isEmpty = computed(() => this.lines().length === 0);

  /** Add a variant with the given options; merges into an existing matching line. */
  add(
    product: MenuProduct,
    variant: MenuVariant,
    options: MenuOption[],
    quantity: number,
    notes: string | null,
  ): void {
    const key = this.buildKey(variant.id, options);
    const unitPrice = variant.price + options.reduce((s, o) => s + o.extra_price, 0);

    this.lines.update((lines) => {
      const existing = lines.find((l) => l.key === key && l.notes === (notes || null));
      if (existing) {
        return lines.map((l) =>
          l === existing ? { ...l, quantity: l.quantity + quantity } : l,
        );
      }
      return [
        ...lines,
        {
          key,
          productName: product.name,
          variant,
          options,
          quantity,
          notes: notes || null,
          unitPrice,
        },
      ];
    });
  }

  setQuantity(key: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(key);
      return;
    }
    this.lines.update((lines) => lines.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }

  remove(key: string): void {
    this.lines.update((lines) => lines.filter((l) => l.key !== key));
  }

  clear(): void {
    this.lines.set([]);
  }

  /** Map the cart to the `items` array of a `POST /orders` request. */
  toOrderItems(): OrderItemPayload[] {
    return this.lines().map((l) => ({
      product_variant_id: l.variant.id,
      quantity: l.quantity,
      option_ids: l.options.map((o) => o.id),
      notes: l.notes,
    }));
  }

  private buildKey(variantId: string, options: MenuOption[]): string {
    const opts = options
      .map((o) => o.id)
      .sort()
      .join(',');
    return `${variantId}|${opts}`;
  }
}
