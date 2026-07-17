import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  MenuOption,
  MenuOptionGroup,
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';

/** Emitted when the diner confirms their selection for a product. */
export interface ProductSelection {
  product: MenuProduct;
  variant: MenuVariant;
  options: MenuOption[];
  quantity: number;
  notes: string | null;
}

@Component({
  selector: 'app-product-select',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 class="text-lg font-semibold text-gray-900 truncate">{{ product.name }}</h2>
          <button type="button" (click)="cancelled.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        <div class="px-6 py-4 space-y-5 overflow-y-auto">
          @if (product.description) {
            <p class="text-sm text-gray-500">{{ product.description }}</p>
          }

          <!-- Variant -->
          @if (product.variants.length > 0) {
            <div>
              <p class="text-sm font-semibold text-gray-700 mb-2">Presentación</p>
              <div class="space-y-2">
                @for (v of product.variants; track v.id) {
                  <button
                    type="button"
                    (click)="variantId.set(v.id)"
                    class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors"
                    [class]="variantId() === v.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'"
                  >
                    <span class="font-medium">{{ v.name }}</span>
                    <span class="font-semibold">$ {{ v.price | number:'1.2-2' }}</span>
                  </button>
                }
              </div>
            </div>
          }

          <!-- Option groups -->
          @for (group of product.option_groups; track group.id) {
            <div>
              <div class="flex items-center justify-between mb-2">
                <p class="text-sm font-semibold text-gray-700">{{ group.name }}</p>
                <span class="text-xs text-gray-400">{{ groupHint(group) }}</span>
              </div>
              <div class="space-y-2">
                @for (opt of group.options; track opt.id) {
                  <button
                    type="button"
                    (click)="toggleOption(group, opt)"
                    class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors"
                    [class]="isSelected(opt.id)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'"
                  >
                    <span class="flex items-center gap-2">
                      <span class="text-xs">{{ isSelected(opt.id) ? '☑️' : '⬜️' }}</span>
                      <span class="font-medium">{{ opt.name }}</span>
                    </span>
                    @if (opt.extra_price > 0) {
                      <span class="text-xs text-gray-500">+ $ {{ opt.extra_price | number:'1.2-2' }}</span>
                    }
                  </button>
                }
              </div>
              @if (groupError(group)) {
                <p class="text-red-500 text-xs mt-1">{{ groupError(group) }}</p>
              }
            </div>
          }

          <!-- Notes -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
            <input
              type="text"
              [value]="notes()"
              (input)="notes.set($any($event.target).value)"
              placeholder="Ej: sin azúcar…"
              maxlength="500"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Cantidad</span>
            <div class="flex items-center gap-2">
              <button type="button" (click)="dec()" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">−</button>
              <span class="w-6 text-center font-semibold">{{ quantity() }}</span>
              <button type="button" (click)="inc()" class="w-8 h-8 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold">+</button>
            </div>
          </div>
          <button
            type="button"
            (click)="confirm()"
            [disabled]="!canConfirm()"
            class="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Agregar · $ {{ lineTotal() | number:'1.2-2' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ProductSelectComponent implements OnInit {
  @Input() product!: MenuProduct;
  @Output() added = new EventEmitter<ProductSelection>();
  @Output() cancelled = new EventEmitter<void>();

  readonly variantId = signal<string | null>(null);
  /** group.id → selected option ids. */
  readonly selected = signal<Record<string, string[]>>({});
  readonly quantity = signal(1);
  readonly notes = signal('');

  ngOnInit(): void {
    // Preselect the first (often only) variant.
    if (this.product.variants.length > 0) {
      this.variantId.set(this.product.variants[0].id);
    }
  }

  private readonly selectedVariant = computed<MenuVariant | null>(
    () => this.product.variants.find((v) => v.id === this.variantId()) ?? null,
  );

  private readonly selectedOptions = computed<MenuOption[]>(() => {
    const map = this.selected();
    const opts: MenuOption[] = [];
    for (const group of this.product.option_groups) {
      const ids = map[group.id] ?? [];
      for (const opt of group.options) {
        if (ids.includes(opt.id)) opts.push(opt);
      }
    }
    return opts;
  });

  readonly lineTotal = computed(() => {
    const base = this.selectedVariant()?.price ?? 0;
    const extra = this.selectedOptions().reduce((s, o) => s + o.extra_price, 0);
    return (base + extra) * this.quantity();
  });

  isSelected(optId: string): boolean {
    return Object.values(this.selected()).some((ids) => ids.includes(optId));
  }

  groupHint(group: MenuOptionGroup): string {
    if (group.max_select === 1 && group.min_select === 1) return 'Elige 1';
    if (group.min_select > 0) return `Elige ${group.min_select}–${group.max_select}`;
    if (group.max_select > 0) return `Hasta ${group.max_select}`;
    return 'Opcional';
  }

  groupError(group: MenuOptionGroup): string | null {
    const n = (this.selected()[group.id] ?? []).length;
    if (n < group.min_select) return `Selecciona al menos ${group.min_select}`;
    return null;
  }

  toggleOption(group: MenuOptionGroup, opt: MenuOption): void {
    this.selected.update((map) => {
      const current = map[group.id] ?? [];
      const has = current.includes(opt.id);
      let next: string[];
      if (has) {
        next = current.filter((id) => id !== opt.id);
      } else if (group.max_select === 1) {
        next = [opt.id]; // single-select replaces
      } else if (group.max_select > 0 && current.length >= group.max_select) {
        return map; // at limit, ignore
      } else {
        next = [...current, opt.id];
      }
      return { ...map, [group.id]: next };
    });
  }

  canConfirm(): boolean {
    if (!this.selectedVariant()) return false;
    return this.product.option_groups.every(
      (g) => (this.selected()[g.id] ?? []).length >= g.min_select,
    );
  }

  inc(): void {
    this.quantity.update((q) => q + 1);
  }

  dec(): void {
    this.quantity.update((q) => Math.max(1, q - 1));
  }

  confirm(): void {
    const variant = this.selectedVariant();
    if (!variant || !this.canConfirm()) return;
    this.added.emit({
      product: this.product,
      variant,
      options: this.selectedOptions(),
      quantity: this.quantity(),
      notes: this.notes().trim() || null,
    });
  }
}
