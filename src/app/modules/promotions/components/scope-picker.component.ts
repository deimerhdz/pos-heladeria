import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuCategory } from '../../products/interfaces/product.interface';
import { ScopeTarget, hasOwnPricing } from '../interfaces/promotion.interface';
import { formatMoney } from '../../../shared/money';
import { normalizeText } from '../../../shared/normalize-text';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';

export interface ScopeSelection {
  categories: ScopeTarget[];
  products: ScopeTarget[];
}

const ids = (targets: ScopeTarget[]): Set<string> => new Set(targets.map((t) => t.id));
const find = (targets: ScopeTarget[], id: string): ScopeTarget | undefined =>
  targets.find((t) => t.id === id);

/** Estado del checkbox de una categoría. */
export type CategoryState = 'checked' | 'indeterminate' | 'empty';

export interface ScopeProductRow {
  id: string;
  name: string;
  /** Mínimo de las presentaciones; el precio "desde" que ve el admin. */
  price: number;
}

export interface ScopeGroupRow {
  id: string;
  name: string;
  products: ScopeProductRow[];
  /** Total real de la categoría, aunque el filtro muestre menos. */
  totalProducts: number;
}

function toRow(p: MenuCategory['products'][number]): ScopeProductRow {
  return {
    id: p.id,
    name: p.name,
    price: p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0,
  };
}

/**
 * Grupos visibles para un término de búsqueda y el filtro «solo seleccionados».
 *
 * Si el nombre de la categoría casa, se muestran **todos** sus productos: quien
 * escribe "malteadas" quiere ver la categoría entera, no las filas cuyo nombre
 * repita la palabra. Si solo casan productos, se muestran esos.
 */
export function filterGroups(
  categories: MenuCategory[],
  query: string,
  selection: ScopeSelection,
  onlySelected: boolean,
): ScopeGroupRow[] {
  const q = normalizeText(query);
  const selectedCats = ids(selection.categories);
  const selectedProds = ids(selection.products);

  const groups: ScopeGroupRow[] = [];
  for (const c of categories) {
    const catMatches = !q || normalizeText(c.name).includes(q);
    let products = c.products.filter(
      (p) => catMatches || normalizeText(p.name).includes(q),
    );

    if (onlySelected && !selectedCats.has(c.id)) {
      products = products.filter((p) => selectedProds.has(p.id));
    }

    // Una categoría marcada se muestra aunque el filtro deje su lista vacía: es
    // parte de la selección y esconderla la haría parecer perdida.
    if (products.length === 0 && !(selectedCats.has(c.id) && (catMatches || !q))) continue;

    groups.push({
      id: c.id,
      name: c.name,
      products: products.map(toRow),
      totalProducts: c.products.length,
    });
  }
  return groups;
}

/**
 * Ids seleccionados que el catálogo no resuelve. `/menu` solo trae productos
 * activos, así que un target que apunte a uno desactivado desaparecería de la
 * vista sin decir nada — y en modo lectura eso es mentir sobre el alcance real.
 */
export function countMissing(categories: MenuCategory[], selection: ScopeSelection): number {
  const cats = new Set(categories.map((c) => c.id));
  const prods = new Set(categories.flatMap((c) => c.products.map((p) => p.id)));
  return (
    selection.categories.filter((t) => !cats.has(t.id)).length +
    selection.products.filter((t) => !prods.has(t.id)).length
  );
}

/** Estado del checkbox de la categoría a partir de la selección actual. */
export function categoryState(
  category: MenuCategory,
  selection: ScopeSelection,
): CategoryState {
  if (ids(selection.categories).has(category.id)) return 'checked';
  const selected = ids(selection.products);
  return category.products.some((p) => selected.has(p.id)) ? 'indeterminate' : 'empty';
}

/**
 * Marca una categoría entera y retira sus productos sueltos **que no tengan
 * precio propio**: a esos el target de categoría ya los cubre igual, y dejar
 * ambos duplicaría el alcance sin cambiar el descuento. Los que sí tienen
 * precio propio se quedan, porque ahí el target de producto no es redundante —
 * es justo el override que gana sobre la categoría.
 */
export function selectCategory(
  category: MenuCategory,
  selection: ScopeSelection,
): ScopeSelection {
  const suyos = new Set(category.products.map((p) => p.id));
  return {
    categories: [...selection.categories, { id: category.id, value: null, min_qty: null }],
    products: selection.products.filter((t) => !suyos.has(t.id) || hasOwnPricing(t)),
  };
}

@Component({
  selector: 'app-scope-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, MoneyInputComponent],
  template: `
    <div class="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <!-- Cabecera fija: buscador, filtro y contadores -->
      <div class="sticky top-0 bg-white border-b border-gray-100 z-10">
        <div class="flex items-center gap-2 p-3 flex-wrap">
          <input
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            type="search"
            [placeholder]="readonly ? 'Buscar en el alcance…' : 'Buscar producto o categoría…'"
            class="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          @if (!readonly) {
            <label
              class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap"
            >
              <input
                type="checkbox"
                [ngModel]="onlySelected()"
                (ngModelChange)="onlySelected.set($event)"
                class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
              />
              Solo seleccionados
            </label>
          }
        </div>
        <div class="flex items-center justify-between gap-3 px-3 pb-2.5 flex-wrap">
          <span class="text-xs" [class]="hasSelection() ? 'text-gray-600' : 'text-gray-400'">
            {{ summary() }}
            @if (packPricing && !readonly && incomplete() > 0) {
              <strong class="text-amber-700">
                · {{ incomplete() }} sin precio
              </strong>
            }
          </span>
          @if (hasSelection() && !readonly) {
            <button
              type="button"
              (click)="clearAll()"
              class="text-xs font-semibold text-gray-500 hover:text-red-600"
            >
              Quitar todo
            </button>
          }
        </div>
      </div>

      <!-- Tabla -->
      <div class="max-h-80 overflow-y-auto divide-y divide-gray-50">
        @for (g of groups(); track g.id) {
          <div>
            <label
              class="flex items-center gap-2.5 px-3 py-2"
              [class]="
                (faltaPrecio(g.id, 'category') ? 'bg-amber-50' : 'bg-gray-50/70') +
                (readonly ? '' : ' hover:bg-gray-100 cursor-pointer')
              "
            >
              @if (!readonly) {
                <input
                  type="checkbox"
                  [checked]="stateOf(g.id) === 'checked'"
                  [indeterminate]="stateOf(g.id) === 'indeterminate'"
                  (change)="toggleCategory(g.id)"
                  class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                />
              }
              <span class="text-sm font-semibold text-gray-800 flex-1">{{ g.name }}</span>
              @if (stateOf(g.id) === 'checked') {
                <span
                  class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700"
                  >Categoría completa</span
                >
                @if (packPricing && !readonly) {
                  <ng-container
                    [ngTemplateOutlet]="packInputs"
                    [ngTemplateOutletContext]="{ id: g.id, kind: 'category' }"
                  />
                }
              }
              <span class="text-[11px] text-gray-400 whitespace-nowrap">
                {{ g.totalProducts }} {{ g.totalProducts === 1 ? 'producto' : 'productos' }}
              </span>
            </label>

            @for (p of g.products; track p.id) {
              <label
                class="flex items-center gap-2.5 pr-3 py-2"
                [class]="rowClass(g.id) + (faltaPrecio(p.id, 'product') ? ' bg-amber-50' : '')"
              >
                @if (!readonly) {
                  <input
                    type="checkbox"
                    [checked]="stateOf(g.id) === 'checked' || isProductSelected(p.id)"
                    [disabled]="stateOf(g.id) === 'checked'"
                    (change)="toggleProduct(p.id)"
                    class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 disabled:cursor-not-allowed"
                  />
                }
                <span class="text-sm text-gray-700 flex-1">{{ p.name }}</span>

                @if (packPricing) {
                  @if (readonly) {
                    @if (effectiveTerms(p.id, g.id); as t) {
                      <span class="text-xs text-gray-500 whitespace-nowrap">
                        {{ t.pack }} por {{ money(t.price) }}
                      </span>
                    } @else {
                      <span class="text-xs text-amber-700 whitespace-nowrap">sin precio</span>
                    }
                  } @else if (isProductSelected(p.id) || stateOf(g.id) === 'checked') {
                    @if (hasOwn(p.id, 'product')) {
                      <span
                        class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"
                        >Precio propio</span
                      >
                    }
                    <ng-container
                      [ngTemplateOutlet]="packInputs"
                      [ngTemplateOutletContext]="{ id: p.id, kind: 'product' }"
                    />
                  } @else {
                    <span class="text-xs text-gray-400 whitespace-nowrap">{{ money(p.price) }}</span>
                  }
                } @else if (!readonly && stateOf(g.id) === 'checked') {
                  <span class="text-[11px] text-gray-400">incluido por la categoría</span>
                } @else {
                  <span class="text-xs text-gray-400 whitespace-nowrap">{{ money(p.price) }}</span>
                }
              </label>
            }
          </div>
        } @empty {
          <div class="px-3 py-10 text-center">
            <p class="text-sm text-gray-500">
              @if (readonly && !hasSelection()) {
                Esta promoción aplica a <strong>toda la venta</strong>.
              } @else if (query()) {
                Ningún producto o categoría coincide con «{{ query() }}».
              } @else {
                Todavía no has seleccionado nada.
              }
            </p>
            @if (query() || (onlySelected() && !readonly)) {
              <button
                type="button"
                (click)="resetFilters()"
                class="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                {{ readonly ? 'Quitar la búsqueda' : 'Ver todo el catálogo' }}
              </button>
            }
          </div>
        }
      </div>

      <!--
        Unidades y precio de una fila. Van como placeholder, no como valor: así
        se distingue "hereda el paquete por defecto" de "tiene precio propio", y
        vaciar el campo vuelve a heredar.
      -->
      <ng-template #packInputs let-id="id" let-kind="kind">
        <span class="inline-flex items-center gap-1" (click)="$event.preventDefault()">
          <input
            type="number"
            min="2"
            [ngModel]="targetOf(id, kind)?.min_qty"
            (ngModelChange)="setTerm(id, kind, 'min_qty', $event)"
            placeholder="uds"
            class="w-12 px-1.5 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <span class="text-[11px] text-gray-400">por</span>
          <app-money-input
            [ngModel]="targetOf(id, kind)?.value"
            (ngModelChange)="setTerm(id, kind, 'value', $event)"
            placeholder="precio"
            sizeClass="w-20 px-1.5 py-1 rounded text-xs text-right"
          />
        </span>
      </ng-template>

      @if (readonly && missing() > 0) {
        <div class="px-3 py-2 border-t border-amber-100 bg-amber-50 text-[11.5px] text-amber-800">
          ⚠️ {{ missing() }}
          {{ missing() === 1 ? 'destino ya no está' : 'destinos ya no están' }} en el menú (producto
          o categoría desactivada). La promoción los conserva, pero no se pueden vender.
        </div>
      }
    </div>
  `,
})
export class ScopePickerComponent {
  @Input({ required: true }) categories: MenuCategory[] = [];
  /**
   * Vista de consulta: sin checkboxes ni «quitar todo», y siempre acotada a lo
   * seleccionado. Es lo que ve el admin cuando el alcance ya está congelado
   * porque la promoción salió de borrador.
   */
  @Input() readonly = false;
  /**
   * Muestra un `[unidades] por [precio]` en cada fila seleccionada. Solo lo
   * activan las pantallas de Paquete: es el único tipo cuyo motor entiende el
   * precio por destino.
   */
  @Input() packPricing = false;

  @Input() set categoryTargets(value: ScopeTarget[]) {
    this.selectedCategories.set(value ?? []);
  }
  @Input() set productTargets(value: ScopeTarget[]) {
    this.selectedProducts.set(value ?? []);
  }
  @Output() selectionChange = new EventEmitter<ScopeSelection>();

  readonly query = signal('');
  readonly onlySelected = signal(false);

  private readonly selectedCategories = signal<ScopeTarget[]>([]);
  private readonly selectedProducts = signal<ScopeTarget[]>([]);

  readonly selection = computed<ScopeSelection>(() => ({
    categories: this.selectedCategories(),
    products: this.selectedProducts(),
  }));

  readonly groups = computed(() =>
    // En lectura no hay catálogo que explorar: la tabla *es* el alcance.
    filterGroups(
      this.categories,
      this.query(),
      this.selection(),
      this.readonly || this.onlySelected(),
    ),
  );

  readonly hasSelection = computed(
    () => this.selectedCategories().length > 0 || this.selectedProducts().length > 0,
  );

  readonly missing = computed(() => countMissing(this.categories, this.selection()));

  readonly summary = computed(() => {
    const cats = this.selectedCategories().length;
    const prods = this.selectedProducts().length;
    if (!cats && !prods) {
      return this.readonly ? 'Aplica a toda la venta' : 'Nada seleccionado todavía';
    }
    const parts: string[] = [];
    if (cats) parts.push(`${cats} ${cats === 1 ? 'categoría completa' : 'categorías completas'}`);
    if (prods) parts.push(`${prods} ${prods === 1 ? 'producto' : 'productos'}`);
    return parts.join(' · ');
  });

  /** La sangría del checkbox no aplica cuando no hay checkbox. */
  rowClass(categoryId: string): string {
    if (this.readonly) return 'pl-6';
    return this.stateOf(categoryId) === 'checked'
      ? 'pl-9 opacity-60 cursor-pointer'
      : 'pl-9 hover:bg-gray-50 cursor-pointer';
  }

  stateOf(categoryId: string): CategoryState {
    const category = this.categories.find((c) => c.id === categoryId);
    return category ? categoryState(category, this.selection()) : 'empty';
  }

  isProductSelected(id: string): boolean {
    return ids(this.selectedProducts()).has(id);
  }

  /** El destino de una fila, para leer o escribir su precio propio. */
  targetOf(id: string, kind: 'category' | 'product'): ScopeTarget | undefined {
    return find(kind === 'category' ? this.selectedCategories() : this.selectedProducts(), id);
  }

  /** `true` si la fila define su propio paquete en vez de heredarlo. */
  hasOwn(id: string, kind: 'category' | 'product'): boolean {
    const t = this.targetOf(id, kind);
    return !!t && hasOwnPricing(t);
  }

  /**
   * Términos que se cobrarán en esta fila: los suyos si los tiene, si no los de
   * su categoría. Sin cadena hacia la promoción — un paquete ya no tiene precio
   * propio, así que `null` significa "sin definir", no "hereda".
   */
  effectiveTerms(productId: string, categoryId: string): { pack: number; price: number } | null {
    const propio = this.targetOf(productId, 'product');
    const fuente = propio && hasOwnPricing(propio) ? propio : this.targetOf(categoryId, 'category');
    if (!fuente || fuente.min_qty == null || fuente.value == null) return null;
    return { pack: fuente.min_qty, price: Number(fuente.value) };
  }

  /** Filas marcadas a las que todavía les falta precio. */
  readonly incomplete = computed(() =>
    [...this.selectedCategories(), ...this.selectedProducts()].filter(
      (t) => t.value == null || t.min_qty == null,
    ).length,
  );

  faltaPrecio(id: string, kind: 'category' | 'product'): boolean {
    const t = this.targetOf(id, kind);
    return !!t && (t.value == null || t.min_qty == null);
  }

  toggleCategory(categoryId: string): void {
    const category = this.categories.find((c) => c.id === categoryId);
    if (!category) return;
    if (ids(this.selectedCategories()).has(categoryId)) {
      this.emit({
        categories: this.selectedCategories().filter((t) => t.id !== categoryId),
        products: this.selectedProducts(),
      });
    } else {
      const next = selectCategory(category, this.selection());
      if (this.packPricing) {
        // Mismo criterio que las filas de producto: unidades mínimas puestas,
        // precio en blanco para que nadie lo dé por bueno sin mirarlo.
        next.categories = next.categories.map((t) =>
          t.id === categoryId && t.min_qty == null ? { ...t, min_qty: 2 } : t,
        );
      }
      this.emit(next);
    }
  }

  toggleProduct(productId: string): void {
    const current = this.selectedProducts();
    this.emit({
      categories: this.selectedCategories(),
      products: ids(current).has(productId)
        ? current.filter((t) => t.id !== productId)
        : [...current, { id: productId, value: null, min_qty: this.packPricing ? 2 : null }],
    });
  }

  /**
   * Escribe el precio o las unidades de una fila. Un campo vacío vuelve a
   * `null`, que es «hereda»: sin esa distinción no habría forma de deshacer un
   * override una vez puesto.
   */
  setTerm(
    id: string,
    kind: 'category' | 'product',
    field: 'value' | 'min_qty',
    raw: string | number | null,
  ): void {
    const parsed = raw === '' || raw === null ? null : Number(raw);
    const next = parsed != null && Number.isFinite(parsed) ? parsed : null;

    const patch = (list: ScopeTarget[]) =>
      list.map((t) => (t.id === id ? { ...t, [field]: next } : t));

    if (kind === 'category') {
      this.emit({ categories: patch(this.selectedCategories()), products: this.selectedProducts() });
      return;
    }
    // Dar precio propio a un producto de una categoría marcada exige que exista
    // su fila: es el target que va a ganar sobre el de la categoría.
    const actuales = this.selectedProducts();
    const lista = ids(actuales).has(id)
      ? actuales
      : [...actuales, { id, value: null, min_qty: this.packPricing ? 2 : null }];
    this.emit({ categories: this.selectedCategories(), products: patch(lista) });
  }

  clearAll(): void {
    this.emit({ categories: [], products: [] });
  }

  resetFilters(): void {
    this.query.set('');
    this.onlySelected.set(false);
  }

  money(n: number): string {
    return formatMoney(n);
  }

  private emit(next: ScopeSelection): void {
    this.selectedCategories.set(next.categories);
    this.selectedProducts.set(next.products);
    this.selectionChange.emit(next);
  }
}
