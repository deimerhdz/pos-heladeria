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
import { MoneyPipe } from '../../../shared/money.pipe';
import {
  MenuOption,
  MenuOptionGroup,
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { normalizeText } from '../../../shared/normalize-text';
import { DiscountInfo, discountInfo, effectivePrice } from '../../promotions/services/promotion-pricing.util';

/** Una opción elegida junto con cuántas unidades de ella (spec 065). Siempre
 *  `quantity: 1` para una opción de un grupo "conteo". */
export interface ChosenMenuOption {
  option: MenuOption;
  quantity: number;
}

/** Emitted when the diner confirms their selection for a product. */
export interface ProductSelection {
  product: MenuProduct;
  variant: MenuVariant;
  options: ChosenMenuOption[];
  quantity: number;
  notes: string | null;
}

@Component({
  selector: 'app-product-select',
  standalone: true,
  imports: [MoneyPipe],
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

        <div class="overflow-y-auto">
          <!-- Sin foto no se reserva alto: un emoji gigante solo restaría sitio a los sabores. -->
          @if (product.image_url) {
            <img [src]="product.image_url" [alt]="product.name"
              class="w-full aspect-[16/9] object-cover bg-indigo-50" />
          }

          <div class="px-6 py-4 space-y-5">
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
                    class="w-full flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border text-sm transition-colors"
                    [class]="v.available === false
                      ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : variantId() === v.id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'"
                  >
                    <span class="w-full flex items-center justify-between">
                      <span class="font-medium">{{ v.name }}</span>
                      @if (v.available === false) {
                        <span class="text-xs font-semibold text-gray-400">Agotado</span>
                      } @else if (discountFor(v); as disc) {
                        <span class="flex items-center gap-1.5">
                          <!-- spec 066 (research.md D-13): la insignia de porcentaje se
                               acota al tipo 'percent'. Con un precio de paquete de
                               cantidad mínima 1 ($8.000 -> $6.000) el frontend fabricaría
                               un -25% que la regla nunca enuncia, y FR-007 lo prohíbe.
                               La guarda mira el campo crudo de la presentación, no
                               disc.kind: discountInfo colapsa a 'percent' todo lo que no
                               sea 'fixed', así que ahí el tipo real ya se perdió. -->
                          @if (disc.kind === 'fixed' || v.discount_kind === 'percent') {
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                              @if (disc.kind === 'fixed') {
                                -{{ disc.amountOff | money }}
                              } @else {
                                -{{ disc.percent }}%
                              }
                            </span>
                          }
                          <span class="text-gray-400 text-xs line-through">{{ disc.original | money }}</span>
                          <span class="font-semibold">{{ disc.discounted | money }}</span>
                        </span>
                      } @else {
                        <span class="font-semibold">{{ variantPrice(v) | money }}</span>
                      }
                    </span>
                    <!-- spec 066 (FR-008): condición corta + equivalente por unidad, en
                         tono discreto para no competir con el precio. Texto ya compuesto
                         por el backend. -->
                    @if (v.promotion) {
                      <span class="w-full text-left text-[11px] text-gray-500">
                        {{ v.promotion.display_text }}
                      </span>
                    }
                  </button>
                }
              </div>
              <!-- spec 066 (FR-016): la condición completa de la presentación elegida.
                   Este componente lo comparten el menú QR y las dos superficies del
                   cajero, así que el comensal y el cajero leen la misma cadena sin
                   ninguna rama por superficie (SC-005 por construcción). -->
              @if (selectedVariant()?.promotion; as promo) {
                <p class="mt-2 text-xs text-gray-600">{{ promo.condition_text }}</p>
              }
            </div>
          }

          <!-- Option groups: los de la PRESENTACIÓN elegida, no los del producto.
               Cuántos sabores se eligen cambia con el tamaño. -->
          @for (group of activeGroups(); track group.id) {
            <div class="border border-gray-100 rounded-xl overflow-hidden">
              <!-- Cabecera plegable: nombre, progreso y lo ya elegido -->
              <button type="button" (click)="toggleGroup(group.id)"
                class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-gray-700">{{ group.name }}</span>
                  @if (!isExpanded(group.id) && chosenCount(group) > 0) {
                    <span class="block text-xs text-indigo-600 truncate">{{ chosenNames(group) }}</span>
                  }
                </span>
                <span class="flex items-center gap-2 shrink-0">
                  <span class="text-xs font-medium"
                    [class]="isComplete(group) ? 'text-emerald-600' : 'text-gray-400'">
                    {{ groupHint(group) }}
                  </span>
                  <span class="text-gray-400 text-xs">{{ isExpanded(group.id) ? '▲' : '▼' }}</span>
                </span>
              </button>

              @if (isExpanded(group.id)) {
                <div class="px-4 pb-4 space-y-3">
                  @if (showSearch(group)) {
                    <input type="search" [value]="filterValue(group.id)"
                      (input)="setFilter(group.id, $any($event.target).value)"
                      [placeholder]="'Buscar en ' + group.name + '…'"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  }

                  @if (group.selection_mode === 'cantidad') {
                    <!-- Modo "cantidad": stepper +/- por opción, nunca obligatorio. -->
                    <div class="space-y-2">
                      @for (opt of visibleOptions(group); track opt.id) {
                        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200">
                          <span class="min-w-0">
                            <span class="block text-sm font-medium text-gray-700 truncate">{{ opt.name }}</span>
                            @if (opt.extra_price > 0) {
                              <span class="block text-xs text-gray-500">+ {{ opt.extra_price | money }}</span>
                            }
                          </span>
                          <div class="flex items-center gap-2 shrink-0">
                            <button type="button" (click)="decrementOption(group, opt)"
                              [disabled]="optionQuantity(group.id, opt.id) === 0"
                              aria-label="Quitar una unidad"
                              class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-base font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                            >−</button>
                            <span class="w-5 text-center text-sm font-semibold">{{ optionQuantity(group.id, opt.id) }}</span>
                            <button type="button" (click)="incrementOption(group, opt)"
                              [disabled]="!canIncrement(group, opt)"
                              aria-label="Añadir una unidad"
                              class="w-8 h-8 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-base font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                            >+</button>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <!-- Rejilla de 2 columnas: 24 sabores caben en 12 filas. -->
                    <div class="grid grid-cols-2 gap-2">
                      @for (opt of visibleOptions(group); track opt.id) {
                        <button
                          type="button"
                          (click)="toggleOption(group, opt)"
                          class="min-h-[3rem] px-3 py-2 rounded-xl border text-sm text-left leading-tight transition-colors"
                          [class]="isSelected(opt.id)
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'"
                        >
                          <span class="flex items-start justify-between gap-1">
                            <span class="font-medium">{{ opt.name }}</span>
                            @if (isSelected(opt.id) && group.max_select > 1) {
                              <span class="shrink-0 w-4 h-4 rounded-full bg-white/25 text-[10px] font-bold flex items-center justify-center">
                                {{ selectionOrder(group, opt.id) }}
                              </span>
                            }
                          </span>
                          @if (opt.extra_price > 0) {
                            <span class="block text-xs mt-0.5"
                              [class]="isSelected(opt.id) ? 'text-indigo-100' : 'text-gray-500'">
                              + {{ opt.extra_price | money }}
                            </span>
                          }
                        </button>
                      }
                    </div>
                  }

                  @if (visibleOptions(group).length === 0) {
                    <p class="text-sm text-gray-400 text-center py-2">Ningún sabor coincide.</p>
                  }

                  <!-- Agotados aparte y al final: que existan se informa, pero no estorban. -->
                  @if (soldOutOptions(group).length > 0) {
                    <div>
                      <p class="text-xs font-medium text-gray-400 mb-1.5">Agotados</p>
                      <div class="grid grid-cols-2 gap-2">
                        @for (opt of soldOutOptions(group); track opt.id) {
                          <span class="min-h-[3rem] px-3 py-2 rounded-xl bg-gray-50 text-sm text-gray-400 line-through leading-tight">
                            {{ opt.name }}
                          </span>
                        }
                      </div>
                    </div>
                  }

                  @if (groupError(group)) {
                    <p class="text-red-500 text-xs">{{ groupError(group) }}</p>
                  }
                </div>
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
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Cantidad</span>
            <!-- 44 px: el objetivo táctil mínimo cómodo con el pulgar. -->
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="dec()"
                [disabled]="quantity() === 1"
                aria-label="Quitar uno"
                class="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
              >−</button>
              <span class="w-8 text-center text-lg font-semibold">{{ quantity() }}</span>
              <button
                type="button"
                (click)="inc()"
                aria-label="Añadir uno"
                class="w-11 h-11 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xl font-bold leading-none flex items-center justify-center transition-colors"
              >+</button>
            </div>
          </div>
          <!-- Con el grupo plegado, un botón atenuado sin más no dice qué falta. -->
          <button
            type="button"
            (click)="confirm()"
            [disabled]="!canConfirm()"
            class="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            @if (blockingLabel(); as falta) {
              {{ falta }}
            } @else {
              Agregar · {{ lineTotal() | money }}
            }
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
  /**
   * group.id → option.id → cantidad elegida (spec 065). Para un grupo "conteo"
   * el valor sigue siendo efectivamente `0` o `1` por opción -- ninguna lógica de
   * "conteo" cambia de forma, solo de representación interna (research.md
   * Decisión 8). El orden de inserción de las claves es lo que alimenta el
   * badge numerado (1, 2, 3…) de un grupo "conteo" con `max_select > 1`.
   */
  readonly selected = signal<Record<string, Record<string, number>>>({});
  readonly quantity = signal(1);
  readonly notes = signal('');
  /** Grupos desplegados. Ver `syncExpanded`: se abre lo que falta, se cierra lo completo. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** group.id → texto del buscador. */
  private readonly filters = signal<Record<string, string>>({});
  /** A partir de cuántas opciones el buscador compensa su propio espacio. */
  private readonly SEARCH_THRESHOLD = 10;

  ngOnInit(): void {
    // Preselecciona la primera presentación pedible (a menudo la única).
    const first =
      this.product.variants.find((v) => v.available !== false) ?? this.product.variants[0];
    if (first) this.variantId.set(first.id);
    this.syncExpanded();
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
   * lo que el tamaño nuevo sigue ofreciendo y se recorta a su `max_select` (grupos
   * "conteo" -- un grupo "cantidad" no tiene ese tope de opciones distintas). Sin
   * esto, pasar de "Mediana" (2 sabores) a "Pequeña" (1) dejaría dos elegidos y el
   * backend respondería 422 al añadir al carrito.
   */
  selectVariant(v: MenuVariant): void {
    if (v.available === false || v.id === this.variantId()) return;
    this.variantId.set(v.id);
    this.selected.update((map) => {
      const next: Record<string, Record<string, number>> = {};
      for (const group of v.option_groups) {
        const previo = map[group.id] ?? {};
        const validIds = Object.keys(previo).filter((id) =>
          group.options.some((o) => o.id === id && o.available) && previo[id] > 0,
        );
        if (validIds.length === 0) continue;
        if (group.selection_mode === 'cantidad') {
          const entry: Record<string, number> = {};
          for (const id of validIds) entry[id] = previo[id];
          next[group.id] = entry;
        } else {
          const entry: Record<string, number> = {};
          for (const id of validIds.slice(0, group.max_select)) entry[id] = 1;
          next[group.id] = entry;
        }
      }
      return next;
    });
    // Los grupos del tamaño nuevo son otros: hay que recalcular qué queda abierto.
    this.syncExpanded();
  }

  private readonly selectedOptions = computed<ChosenMenuOption[]>(() => {
    const map = this.selected();
    const chosen: ChosenMenuOption[] = [];
    for (const group of this.activeGroups()) {
      const entry = map[group.id] ?? {};
      for (const opt of group.options) {
        const quantity = entry[opt.id] ?? 0;
        if (quantity > 0) chosen.push({ option: opt, quantity });
      }
    }
    return chosen;
  });

  readonly lineTotal = computed(() => {
    const variant = this.selectedVariant();
    const base = variant ? effectivePrice(variant.price, variant.discounted_price) : 0;
    const extra = this.selectedOptions().reduce(
      (s, c) => s + c.option.extra_price * c.quantity, 0,
    );
    return (base + extra) * this.quantity();
  });

  /** Precio efectivo de una presentación (con descuento si el backend lo trajo). */
  variantPrice(v: MenuVariant): number {
    return effectivePrice(v.price, v.discounted_price);
  }

  discountFor(v: MenuVariant): DiscountInfo | null {
    return discountInfo(v.price, v.discounted_price, v.discount_kind);
  }

  optionQuantity(groupId: string, optId: string): number {
    return this.selected()[groupId]?.[optId] ?? 0;
  }

  isSelected(optId: string): boolean {
    return Object.values(this.selected()).some((entry) => (entry[optId] ?? 0) > 0);
  }

  /** Posición de la opción dentro del grupo (1, 2, 3…), o 0 si no está elegida. */
  selectionOrder(group: MenuOptionGroup, optId: string): number {
    const ids = Object.keys(this.selected()[group.id] ?? {});
    return ids.indexOf(optId) + 1;
  }

  /** Distintas opciones elegidas (grupo "conteo") -- ver `chosenTotal` para "cantidad". */
  chosenCount(group: MenuOptionGroup): number {
    return Object.keys(this.selected()[group.id] ?? {}).length;
  }

  /** Unidades totales elegidas en un grupo "cantidad" (research.md Decisión 8). */
  chosenTotal(group: MenuOptionGroup): number {
    const entry = this.selected()[group.id] ?? {};
    return Object.values(entry).reduce((s, q) => s + q, 0);
  }

  isComplete(group: MenuOptionGroup): boolean {
    // spec 065, FR-003: un grupo "cantidad" nunca bloquea -- no hay mínimo posible.
    if (group.selection_mode === 'cantidad') return true;
    const n = this.chosenCount(group);
    return n >= group.min_select && n >= group.max_select;
  }

  // --- Acordeón ---

  isExpanded(groupId: string): boolean {
    return this.expanded().has(groupId);
  }

  toggleGroup(groupId: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  /**
   * Deja abierto lo que falta por elegir y cerrado lo que ya está completo.
   *
   * Se llama al abrir el modal, al cambiar de presentación y tras cada elección: así el
   * grupo se pliega solo al completarse y el siguiente queda a la vista, sin que el
   * comensal tenga que buscar el botón de agregar al final de 24 sabores.
   */
  private syncExpanded(): void {
    this.expanded.set(
      new Set(this.activeGroups().filter((g) => !this.isComplete(g)).map((g) => g.id)),
    );
  }

  // --- Opciones ---

  /**
   * Elegibles: disponibles y que casen con el buscador, en el orden del catálogo.
   *
   * Lo ya elegido se muestra aunque no case con el filtro: si al buscar "ore"
   * desaparecieran los dos sabores que llevas marcados, parecería que se perdieron.
   */
  visibleOptions(group: MenuOptionGroup): MenuOption[] {
    const q = normalizeText(this.filters()[group.id] ?? '');
    return group.options.filter(
      (o) => o.available && (!q || normalizeText(o.name).includes(q) || this.isSelected(o.id)),
    );
  }

  /** Agotados, aparte y al final: que existan se informa, pero no estorban al elegir. */
  soldOutOptions(group: MenuOptionGroup): MenuOption[] {
    const q = normalizeText(this.filters()[group.id] ?? '');
    return group.options.filter(
      (o) => !o.available && (!q || normalizeText(o.name).includes(q)),
    );
  }

  showSearch(group: MenuOptionGroup): boolean {
    return group.options.length > this.SEARCH_THRESHOLD;
  }

  filterValue(groupId: string): string {
    return this.filters()[groupId] ?? '';
  }

  setFilter(groupId: string, value: string): void {
    this.filters.update((f) => ({ ...f, [groupId]: value }));
  }

  /** Nombres elegidos, para el resumen de la cabecera cuando el grupo está plegado. */
  chosenNames(group: MenuOptionGroup): string {
    const entry = this.selected()[group.id] ?? {};
    return Object.keys(entry)
      .filter((id) => entry[id] > 0)
      .map((id) => {
        const name = group.options.find((o) => o.id === id)?.name;
        if (!name) return null;
        return entry[id] > 1 ? `${entry[id]}x ${name}` : name;
      })
      .filter(Boolean)
      .join(', ');
  }

  /**
   * Cuántas opciones hay que elegir en este grupo para poder agregar.
   *
   * Un grupo que descuenta inventario reparte una cantidad física fija entre las
   * opciones elegidas: los sabores de un helado de tres bolas. Elegir uno solo
   * le sirve al cliente las tres bolas y descuenta una, así que ahí el mínimo
   * real es el máximo configurado. El backend aplica la misma regla.
   *
   * Un grupo que descuenta pero es opcional (`min_select = 0`) se queda como
   * está: no elegir es una respuesta válida y el consumo cuadra con lo servido.
   *
   * Un grupo "cantidad" nunca exige nada (spec 065, FR-003, research.md
   * Decisión 3): no hay equivalente de `min_select` para ese modo.
   */
  requiredCount(group: MenuOptionGroup): number {
    if (group.selection_mode === 'cantidad') return 0;
    return group.consume && group.min_select > 0 ? group.max_select : group.min_select;
  }

  groupHint(group: MenuOptionGroup): string {
    if (group.selection_mode === 'cantidad') {
      const total = this.chosenTotal(group);
      return total === 0 ? 'Opcional' : `${total} unidad(es)`;
    }
    const disponibles = group.options.filter((o) => o.available).length;
    if (disponibles === 0) return 'Sin existencias';
    const requeridas = this.requiredCount(group);
    if (disponibles < requeridas) return `Solo quedan ${disponibles}`;
    const n = this.chosenCount(group);
    // Con un tope fijo el progreso es lo único que importa; si el rango es abierto hay
    // que recordar además cuál es.
    if (requeridas === group.max_select) return `${n} de ${group.max_select}`;
    if (requeridas > 0) return `${n} · elige ${requeridas}–${group.max_select}`;
    if (group.max_select > 0) return `${n} · hasta ${group.max_select}`;
    return 'Opcional';
  }

  /**
   * Qué falta para poder agregar, en el propio botón. Antes solo se atenuaba, y con el
   * grupo plegado no había forma de saber por qué.
   */
  blockingLabel(): string | null {
    const variant = this.selectedVariant();
    if (!variant) return 'Elige una presentación';
    if (variant.available === false) return 'Presentación agotada';
    for (const g of this.activeGroups()) {
      if (g.selection_mode === 'cantidad') continue; // FR-003: nunca bloquea.
      const faltan = this.requiredCount(g) - this.chosenCount(g);
      if (faltan > 0) {
        return faltan === 1
          ? `Elige 1 más de ${g.name}`
          : `Elige ${faltan} más de ${g.name}`;
      }
    }
    return null;
  }

  groupError(group: MenuOptionGroup): string | null {
    if (group.selection_mode === 'cantidad') return null; // FR-003: nunca bloquea.
    const n = this.chosenCount(group);
    const requeridas = this.requiredCount(group);
    if (n < requeridas) {
      const disponibles = group.options.filter((o) => o.available).length;
      if (disponibles < requeridas) {
        return 'No hay suficientes opciones disponibles ahora mismo.';
      }
      // Con un número exacto "al menos" confunde: no es un mínimo, es la cuenta.
      return requeridas === group.max_select
        ? `Elige ${requeridas}`
        : `Selecciona al menos ${requeridas}`;
    }
    return null;
  }

  toggleOption(group: MenuOptionGroup, opt: MenuOption): void {
    if (!opt.available) return;
    this.selected.update((map) => {
      const current = map[group.id] ?? {};
      const has = (current[opt.id] ?? 0) > 0;
      let next: Record<string, number>;
      if (has) {
        next = { ...current };
        delete next[opt.id];
      } else if (group.max_select === 1) {
        next = { [opt.id]: 1 }; // single-select replaces
      } else if (group.max_select > 0 && Object.keys(current).length >= group.max_select) {
        return map; // at limit, ignore
      } else {
        next = { ...current, [opt.id]: 1 };
      }
      return { ...map, [group.id]: next };
    });

    // Se pliega al completar y se reabre si se deshace una elección. El buscador se
    // limpia al cerrar para que reabrirlo no muestre una lista filtrada a medias.
    if (this.isComplete(group)) {
      this.expanded.update((open) => {
        const nextOpen = new Set(open);
        nextOpen.delete(group.id);
        return nextOpen;
      });
      this.setFilter(group.id, '');
    } else {
      this.expanded.update((open) => new Set(open).add(group.id));
    }
  }

  // --- Cantidad libre por opción (spec 065, US2/US4) ---

  /** `true` si el botón `+` de esta opción debe estar habilitado (US4, FR-008/FR-009). */
  canIncrement(group: MenuOptionGroup, opt: MenuOption): boolean {
    if (!opt.available) return false;
    const current = this.optionQuantity(group.id, opt.id);
    if (group.max_quantity_per_option !== null && current >= group.max_quantity_per_option) {
      return false;
    }
    if (group.max_total_quantity !== null && this.chosenTotal(group) >= group.max_total_quantity) {
      return false;
    }
    return true;
  }

  incrementOption(group: MenuOptionGroup, opt: MenuOption): void {
    if (!this.canIncrement(group, opt)) return;
    this.selected.update((map) => {
      const current = map[group.id] ?? {};
      return { ...map, [group.id]: { ...current, [opt.id]: (current[opt.id] ?? 0) + 1 } };
    });
  }

  decrementOption(group: MenuOptionGroup, opt: MenuOption): void {
    this.selected.update((map) => {
      const current = map[group.id] ?? {};
      const qty = current[opt.id] ?? 0;
      if (qty <= 0) return map;
      const next = { ...current };
      if (qty <= 1) delete next[opt.id];
      else next[opt.id] = qty - 1;
      return { ...map, [group.id]: next };
    });
  }

  canConfirm(): boolean {
    const variant = this.selectedVariant();
    if (!variant || variant.available === false) return false;
    return this.activeGroups().every((g) => {
      if (g.selection_mode === 'cantidad') return true; // FR-003: nunca bloquea.
      const chosen = Object.keys(this.selected()[g.id] ?? {});
      if (chosen.length < this.requiredCount(g) || chosen.length > g.max_select) return false;
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
