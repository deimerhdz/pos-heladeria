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
                    (click)="selectVariant(v)"
                    [disabled]="v.available === false"
                    class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors"
                    [class]="v.available === false
                      ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : variantId() === v.id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'"
                  >
                    <span class="font-medium">{{ v.name }}</span>
                    @if (v.available === false) {
                      <span class="text-xs font-semibold text-gray-400">Agotado</span>
                    } @else {
                      <span class="font-semibold">$ {{ v.price | number:'1.2-2' }}</span>
                    }
                  </button>
                }
              </div>
            </div>
          }

          <!-- Option groups: los de la PRESENTACIÓN elegida, no los del producto.
               Cuántos sabores se eligen cambia con el tamaño. -->
          @for (group of activeGroups(); track group.id) {
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
                    [disabled]="!opt.available"
                    class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors"
                    [class]="!opt.available
                      ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : isSelected(opt.id)
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'"
                  >
                    <span class="flex items-center gap-2">
                      <span class="text-xs">{{ !opt.available ? '🚫' : isSelected(opt.id) ? '☑️' : '⬜️' }}</span>
                      <span class="font-medium" [class.line-through]="!opt.available">{{ opt.name }}</span>
                    </span>
                    @if (!opt.available) {
                      <span class="text-xs font-semibold text-gray-400">Agotado</span>
                    } @else if (opt.extra_price > 0) {
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
    // Preselecciona la primera presentación pedible (a menudo la única).
    const first =
      this.product.variants.find((v) => v.available !== false) ?? this.product.variants[0];
    if (first) this.variantId.set(first.id);
  }

  readonly selectedVariant = computed<MenuVariant | null>(
    () => this.product.variants.find((v) => v.id === this.variantId()) ?? null,
  );

  /** Grupos que ofrece la presentación elegida; son los que gobiernan la selección. */
  readonly activeGroups = computed<MenuOptionGroup[]>(
    () => this.selectedVariant()?.option_groups ?? [],
  );

  /**
   * Cambiar de tamaño reconcilia lo ya elegido en vez de dejarlo obsoleto: se conserva
   * lo que el tamaño nuevo sigue ofreciendo y se recorta a su `max_select`. Sin esto,
   * pasar de "Mediana" (2 sabores) a "Pequeña" (1) dejaría dos elegidos y el backend
   * respondería 422 al añadir al carrito.
   */
  selectVariant(v: MenuVariant): void {
    if (v.available === false || v.id === this.variantId()) return;
    this.variantId.set(v.id);
    this.selected.update((map) => {
      const next: Record<string, string[]> = {};
      for (const group of v.option_groups) {
        const previos = (map[group.id] ?? []).filter((id) =>
          group.options.some((o) => o.id === id && o.available),
        );
        if (previos.length) next[group.id] = previos.slice(0, group.max_select);
      }
      return next;
    });
  }

  private readonly selectedOptions = computed<MenuOption[]>(() => {
    const map = this.selected();
    const opts: MenuOption[] = [];
    for (const group of this.activeGroups()) {
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
    const disponibles = group.options.filter((o) => o.available).length;
    if (disponibles === 0) return 'Sin existencias';
    if (disponibles < group.min_select) return `Solo quedan ${disponibles}`;
    if (group.max_select === 1 && group.min_select === 1) return 'Elige 1';
    if (group.min_select > 0) return `Elige ${group.min_select}–${group.max_select}`;
    if (group.max_select > 0) return `Hasta ${group.max_select}`;
    return 'Opcional';
  }

  groupError(group: MenuOptionGroup): string | null {
    const n = (this.selected()[group.id] ?? []).length;
    if (n < group.min_select) {
      const disponibles = group.options.filter((o) => o.available).length;
      if (disponibles < group.min_select) {
        return 'No hay suficientes opciones disponibles ahora mismo.';
      }
      return `Selecciona al menos ${group.min_select}`;
    }
    return null;
  }

  toggleOption(group: MenuOptionGroup, opt: MenuOption): void {
    if (!opt.available) return;
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
    const variant = this.selectedVariant();
    if (!variant || variant.available === false) return false;
    return this.activeGroups().every((g) => {
      const chosen = this.selected()[g.id] ?? [];
      if (chosen.length < g.min_select || chosen.length > g.max_select) return false;
      // El menú pudo refrescarse con el modal abierto y dejar agotado algo ya elegido.
      return chosen.every((id) => g.options.find((o) => o.id === id)?.available !== false);
    });
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
