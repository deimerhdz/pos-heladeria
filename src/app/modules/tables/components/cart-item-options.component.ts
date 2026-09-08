import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CartOptionLine } from '../services/pos-terminal.store';

/**
 * Opciones elegidas de una línea de carrito (agrupadas por el nombre de su
 * grupo, p. ej. "Toppings", "Sabores") + su nota de texto libre, si tiene --
 * extraído de `pos-order-panel.component.ts` (rediseño de ítems, a pedido
 * del usuario) para reutilizarlo tal cual en `manual-order-page.component.ts`
 * (antes mostraba ahí un bullet plano por opción vía `bulletsOf()`, sin
 * distinguir de qué grupo venía cada una ni qué era nota).
 *
 * Sin ítems `[]` ni nota: no renderiza nada.
 */
@Component({
  selector: 'app-cart-item-options',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let grupos = optionGroups();
    @if (grupos.length > 0) {
      <div class="border border-[#e5e7eb] rounded-[8px] px-2.5 py-2 space-y-1.5">
        @for (g of grupos; track g.label ?? $index) {
          <div class="text-[12px] text-[#4b5563]">
            @if (g.label) {
              <span class="font-semibold text-[#374151]">{{ g.label }}:</span>
            }
            {{ g.items.join(', ') }}
          </div>
        }
        @if (notes) {
          <span
            class="inline-flex items-center gap-1 bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] text-[11px] px-2 py-0.5 rounded-full italic"
          >
            ℹ️ <span class="font-semibold not-italic">Nota:</span> {{ notes }}
          </span>
        }
      </div>
    } @else if (notes) {
      <span
        class="inline-flex items-center gap-1 bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] text-[11px] px-2 py-0.5 rounded-full italic"
      >
        ℹ️ <span class="font-semibold not-italic">Nota:</span> {{ notes }}
      </span>
    }
  `,
})
export class CartItemOptionsComponent {
  private readonly optionsSignal = signal<CartOptionLine[]>([]);
  @Input() set options(value: CartOptionLine[]) {
    this.optionsSignal.set(value);
  }
  @Input() notes: string | null = null;

  /**
   * Agrupa las opciones elegidas por el nombre de su grupo -- así el detalle
   * muestra a qué grupo pertenece cada selección, reutilizando el mismo
   * nombre que el comensal/mesero vio al elegirla, en vez de una lista plana
   * sin distinguir. Los componentes de un combo (sin grupo, `groupLabel:
   * null`) van todos juntos al final, sin etiqueta. El orden de aparición de
   * los grupos es el orden en que llegan las opciones.
   */
  readonly optionGroups = computed(() => {
    const order: (string | null)[] = [];
    const byLabel = new Map<string | null, string[]>();
    for (const o of this.optionsSignal()) {
      if (!byLabel.has(o.groupLabel)) {
        byLabel.set(o.groupLabel, []);
        order.push(o.groupLabel);
      }
      byLabel.get(o.groupLabel)!.push(o.text);
    }
    return order.map((label) => ({ label, items: byLabel.get(label)! }));
  });
}
