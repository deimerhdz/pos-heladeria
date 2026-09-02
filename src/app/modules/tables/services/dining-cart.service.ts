import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { ChosenMenuOption } from '../components/product-select.component';
import { CartResponse } from '../interfaces/diner.interface';
import { DinerService } from './diner.service';
import { effectivePrice } from '../../promotions/services/promotion-pricing.util';

/** Una línea del carrito, ya resuelta contra el menú para poder pintarla. */
export interface CartLine {
  /** Id de la línea en el backend (`cart_items.id`). */
  id: string;
  productName: string;
  variantName: string;
  optionNames: string[];
  quantity: number;
  notes: string | null;
  unitPrice: number;
  lineTotal: number;
}

/** Índice del menú para resolver ids → nombres al pintar el carrito. */
interface MenuIndex {
  variants: Map<string, { productName: string; variantName: string }>;
  options: Map<string, string>;
}

/**
 * Carrito borrador del comensal. **Vive en el backend**, no en el navegador:
 * cada cambio va a `/cart/items` y el estado local es la proyección de la
 * respuesta (el backend devuelve el carrito completo en cada mutación).
 *
 * Eso es lo que hace que el carrito sobreviva a una recarga y que el aviso de
 * stock insuficiente aparezca al añadir la línea, no al final.
 */
@Injectable({ providedIn: 'root' })
export class DiningCartService {
  private readonly api = inject(DinerService);

  readonly lines = signal<CartLine[]>([]);
  readonly total = signal(0);
  /**
   * Nombre desambiguado del comensal, que viaja en la respuesta del carrito.
   *
   * Vive aquí y no en la pantalla porque `GET /cart` es lo único que se recarga al
   * reingresar: así el saludo sobrevive a un F5 sin guardar nada en el navegador.
   */
  readonly dinerName = signal('');
  /** Hay una operación en vuelo: la UI debe bloquear los botones de cantidad. */
  readonly busy = signal(false);

  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  readonly isEmpty = computed(() => this.lines().length === 0);

  private index: MenuIndex = { variants: new Map(), options: new Map() };

  /** Indexa el menú resuelto para poder mostrar nombres en las líneas. */
  indexMenu(categories: { products: MenuProduct[] }[]): void {
    const variants = new Map<string, { productName: string; variantName: string }>();
    const options = new Map<string, string>();
    for (const cat of categories) {
      for (const product of cat.products) {
        for (const v of product.variants) {
          variants.set(v.id, { productName: product.name, variantName: v.name });
        }
        for (const g of product.option_groups) {
          for (const o of g.options) options.set(o.id, o.name);
        }
      }
    }
    this.index = { variants, options };
  }

  /** Carga el carrito vigente del backend (al abrir o al reingresar). */
  async load(): Promise<void> {
    this.apply(await this.api.getCart());
  }

  /**
   * Añade una línea. Propaga el error para que la pantalla muestre qué insumo
   * falta cuando el backend responde el `409` estructurado.
   */
  async add(
    _product: MenuProduct,
    variant: MenuVariant,
    options: ChosenMenuOption[],
    quantity: number,
    notes: string | null,
  ): Promise<void> {
    await this.mutate(() =>
      this.api.addItem({
        product_variant_id: variant.id,
        quantity,
        options: options.map((c) => ({ option_id: c.option.id, quantity: c.quantity })),
        notes: notes || null,
      }),
    );
  }

  async setQuantity(itemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) return this.remove(itemId);
    await this.mutate(() => this.api.updateItem(itemId, { quantity }));
  }

  async remove(itemId: string): Promise<void> {
    await this.mutate(() => this.api.removeItem(itemId));
  }

  /**
   * Limpia las líneas (tras enviar el pedido o cerrar la sesión).
   *
   * **No toca `dinerName`**: al enviar un pedido el comensal sigue en la mesa y
   * borrarlo dejaría el saludo en blanco. Para eso está `clearDiner()`.
   */
  clear(): void {
    this.lines.set([]);
    this.total.set(0);
  }

  /** Olvida al comensal (sesión expirada o salida de la mesa). */
  clearDiner(): void {
    this.dinerName.set('');
  }

  private async mutate(fn: () => Promise<CartResponse>): Promise<void> {
    this.busy.set(true);
    try {
      this.apply(await fn());
    } finally {
      this.busy.set(false);
    }
  }

  /** Proyecta la respuesta del backend al estado local. */
  private apply(cart: CartResponse): void {
    this.dinerName.set(cart.display_label || cart.display_name);
    this.lines.set(
      cart.items.map((it) => {
        const variant = this.index.variants.get(it.product_variant_id);
        return {
          id: it.id,
          productName: variant?.productName ?? 'Producto',
          variantName: variant?.variantName ?? '',
          optionNames: it.options
            .map((o) => {
              const name = this.index.options.get(o.option_id);
              if (!name) return null;
              return o.quantity > 1 ? `${o.quantity}x ${name}` : name;
            })
            .filter((n): n is string => !!n),
          quantity: it.quantity,
          notes: it.notes,
          unitPrice: effectivePrice(it.unit_price, it.discounted_unit_price),
          lineTotal: effectivePrice(it.line_total, it.discounted_line_total),
        };
      }),
    );
    this.total.set(effectivePrice(cart.total, cart.discounted_total));
  }
}
