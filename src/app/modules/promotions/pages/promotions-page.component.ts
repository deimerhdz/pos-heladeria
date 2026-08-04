import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../categories/services/category.service';
import { ProductService } from '../../products/services/product.service';
import { MenuService } from '../../menu/services/menu.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ComboItem, Promotion, PromotionForm } from '../interfaces/promotion.interface';
import { PromotionService } from '../services/promotion.service';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function emptyForm(): PromotionForm {
  return {
    name: '', type: 'percent', value: 0, active: true,
    starts_at: null, ends_at: null, days_of_week: [], days_of_month: [], start_time: null, end_time: null,
    min_qty: 1, categoryIds: [], productIds: [], comboItems: [],
  };
}

@Component({
  selector: 'app-promotions-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe, SearchableSelectComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Promociones</h1>
          <p class="text-gray-500 text-sm mt-1">Descuentos automáticos aplicados en la venta</p>
        </div>
        <button
          type="button"
          (click)="openCreate()"
          class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
        >+ Nueva promoción</button>
      </div>

      @if (svc.loading()) {
        <div class="flex justify-center py-16">
          <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (svc.promotions().length === 0) {
        <div class="bg-white rounded-2xl border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">
          Aún no hay promociones. Crea la primera con "Nueva promoción".
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50">
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Descuento</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Vigencia</th>
                <th class="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Activa</th>
                <th class="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (p of svc.promotions(); track p.id) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-5 py-3 text-sm font-medium text-gray-800">{{ p.name }}</td>
                  <td class="px-5 py-3 text-sm text-gray-700">{{ discountLabel(p) }}</td>
                  <td class="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">{{ vigencia(p) }}</td>
                  <td class="px-5 py-3 text-center">
                    <button
                      type="button"
                      (click)="toggle(p)"
                      class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                      [class]="p.active ? 'bg-emerald-500' : 'bg-gray-300'"
                      [attr.aria-pressed]="p.active"
                    >
                      <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                            [class]="p.active ? 'translate-x-5' : 'translate-x-1'"></span>
                    </button>
                  </td>
                  <td class="px-5 py-3 text-right whitespace-nowrap">
                    <button type="button" (click)="openEdit(p)"
                      class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 mr-3">Editar</button>
                    <button type="button" (click)="remove(p)"
                      class="text-xs font-semibold text-red-500 hover:text-red-700">Eliminar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Modal formulario -->
    @if (showForm()) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-none">
            <h2 class="text-base font-bold text-gray-900">{{ editing() ? 'Editar promoción' : 'Nueva promoción' }}</h2>
            <button type="button" (click)="closeForm()" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div class="p-6 space-y-4 overflow-y-auto">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Nombre</label>
              <input [(ngModel)]="form.name" type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Feliz Hora 10%" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Tipo</label>
                <select [(ngModel)]="form.type" [disabled]="editing()" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50">
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Monto fijo</option>
                  <option value="combo">Combo</option>
                </select>
                @if (editing()) {
                  <p class="text-[11px] text-gray-400 mt-1">El tipo no se puede cambiar tras crear la promoción.</p>
                }
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">
                  {{ form.type === 'percent' ? 'Porcentaje' : form.type === 'combo' ? 'Precio del combo' : 'Monto' }}
                </label>
                <input [(ngModel)]="form.value" type="number" min="0" [max]="form.type === 'percent' ? 100 : null"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
                <input [(ngModel)]="form.starts_at" type="date" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
                <input [(ngModel)]="form.ends_at" type="date" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Días de la semana</label>
              <div class="flex flex-wrap gap-1.5">
                @for (d of days; track d.idx) {
                  <button type="button" (click)="toggleDay(d.idx)"
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors"
                    [class]="form.days_of_week.includes(d.idx) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'">
                    {{ d.label }}
                  </button>
                }
              </div>
              <p class="text-[11px] text-gray-400 mt-1">Vacío = todos los días.</p>
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Días del mes</label>
              <div class="flex flex-wrap gap-2 mb-2">
                <button type="button" (click)="applyDaysOfMonthPreset([15, 30])"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300">
                  Quincena (15 y 30)
                </button>
                <button type="button" (click)="applyDaysOfMonthPreset([31])"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300">
                  Fin de mes
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mb-2">
                @for (d of form.days_of_month; track d) {
                  <span class="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    Día {{ d }}
                    <button type="button" (click)="removeDayOfMonth(d)" class="text-indigo-400 hover:text-indigo-700 px-0.5">✕</button>
                  </span>
                }
                @if (form.days_of_month.length === 0) {
                  <span class="text-[11px] text-gray-400">Vacío = todos los días.</span>
                }
              </div>
              <div class="flex items-center gap-2">
                <input type="number" min="1" max="31" [(ngModel)]="newDayOfMonth" placeholder="Día (1-31)"
                  class="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                <button type="button" (click)="addDayOfMonth()" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800">+ Agregar día</button>
              </div>
              @if (form.days_of_month.includes(31)) {
                <p class="text-[11px] text-amber-600 mt-1">⚠️ El día 31 no existe en meses de 28-30 días: esos meses la promo no se aplicará ese día.</p>
              }
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Desde (hora)</label>
                <input [(ngModel)]="form.start_time" type="time" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Hasta (hora)</label>
                <input [(ngModel)]="form.end_time" type="time" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>

            @if (form.type === 'combo') {
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-xs font-semibold text-gray-500">Productos del combo</label>
                  <span class="text-[11px]" [class]="comboDistinctCount() >= 2 ? 'text-gray-400' : 'text-red-500 font-semibold'">
                    {{ comboDistinctCount() }} producto(s) distinto(s)
                  </span>
                </div>
                @if (editing()) {
                  <p class="text-[11px] text-gray-400 mb-1">Los productos del combo no se pueden editar tras crearlo.</p>
                } @else if (comboDistinctCount() < 2) {
                  <p class="text-xs text-red-500 mb-2">Selecciona al menos 2 productos distintos para el combo.</p>
                }
                <div class="space-y-2" [class.opacity-50]="editing()">
                  @for (line of form.comboItems; track $index) {
                    <div class="flex items-center gap-2">
                      <app-searchable-select [ngModel]="line.product_variant_id" [disabled]="editing()"
                        (ngModelChange)="setComboField($index, 'product_variant_id', $event)"
                        [options]="comboVariantOptions()" placeholder="Producto…" class="flex-1" />
                      <input type="number" min="1" [value]="line.quantity" [disabled]="editing()"
                        (input)="setComboField($index, 'quantity', +$any($event.target).value)" placeholder="Cant."
                        class="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50" />
                      <button type="button" (click)="removeComboLine($index)" [disabled]="editing()"
                        class="px-2 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">✕</button>
                    </div>
                  }
                </div>
                @if (!editing()) {
                  <button type="button" (click)="addComboLine()"
                    class="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">+ Agregar producto al combo</button>
                }

                @if (form.comboItems.length > 0) {
                  <div class="mt-3 p-3 rounded-lg" [class]="comboSavings() > 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'">
                    <div class="flex justify-between text-sm">
                      <span class="text-gray-600">Suma normal</span>
                      <span class="font-semibold text-gray-900">$ {{ comboNormalTotal() | number: '1.2-2' }}</span>
                    </div>
                    <div class="flex justify-between text-sm mt-0.5">
                      <span class="text-gray-600">Precio del combo</span>
                      <span class="font-semibold text-gray-900">$ {{ form.value | number: '1.2-2' }}</span>
                    </div>
                    @if (comboSavings() > 0) {
                      <p class="text-sm font-bold text-emerald-700 mt-1">Ahorro: $ {{ comboSavings() | number: '1.2-2' }} ({{ comboSavingsPct() }}%)</p>
                    } @else {
                      <p class="text-xs font-semibold text-amber-700 mt-1">⚠️ El precio del combo no genera descuento frente a la suma de sus productos.</p>
                    }
                  </div>
                }
              </div>
            } @else {
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Aplica a (vacío = toda la venta)</label>
                @if (editing()) {
                  <p class="text-[11px] text-gray-400 mb-1">El alcance no se puede editar tras crear la promoción.</p>
                }
                <div class="grid grid-cols-2 gap-3">
                  <div class="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto" [class.opacity-50]="editing()">
                    <p class="text-[11px] font-semibold text-gray-400 uppercase mb-1">Categorías</p>
                    @for (c of categories.categories(); track c.id) {
                      <label class="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                        <input type="checkbox" [checked]="form.categoryIds.includes(c.id)" [disabled]="editing()" (change)="toggleCategory(c.id)" />
                        {{ c.name }}
                      </label>
                    }
                  </div>
                  <div class="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto" [class.opacity-50]="editing()">
                    <p class="text-[11px] font-semibold text-gray-400 uppercase mb-1">Productos</p>
                    @for (pr of products.products(); track pr.id) {
                      <label class="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                        <input type="checkbox" [checked]="form.productIds.includes(pr.id)" [disabled]="editing()" (change)="toggleProduct(pr.id)" />
                        {{ pr.name }}
                      </label>
                    }
                  </div>
                </div>
              </div>
            }

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" [(ngModel)]="form.active" /> Activa
            </label>

            @if (svc.error()) {
              <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{{ svc.error() }}</div>
            }
          </div>

          <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-none">
            <button type="button" (click)="closeForm()" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="button" (click)="save()" [disabled]="svc.isSubmitting() || !form.name.trim() || !canSave()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
              {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PromotionsPageComponent implements OnInit {
  readonly svc = inject(PromotionService);
  readonly categories = inject(CategoryService);
  readonly products = inject(ProductService);
  private readonly menu = inject(MenuService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly editing = computed(() => this.editingId() !== null);
  form: PromotionForm = emptyForm();
  newDayOfMonth: number | null = null;

  readonly days = DAYS.map((label, idx) => ({ label, idx }));

  readonly comboVariantOptions = computed<SearchableSelectOption[]>(() =>
    this.menu.categories().flatMap(c =>
      c.products.flatMap(p =>
        p.variants.map(v => ({
          id: v.id,
          label: p.variants.length > 1 ? `${p.name} · ${v.name}` : p.name,
        })),
      ),
    ),
  );

  private readonly variantPrices = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const c of this.menu.categories()) {
      for (const p of c.products) {
        for (const v of p.variants) map.set(v.id, v.price);
      }
    }
    return map;
  });

  ngOnInit(): void {
    this.svc.load();
    if (this.categories.categories().length === 0) this.categories.loadCategories();
    if (this.products.products().length === 0) this.products.loadProducts();
    if (this.menu.categories().length === 0) this.menu.loadMenu();
  }

  openCreate(): void {
    this.form = emptyForm();
    this.newDayOfMonth = null;
    this.editingId.set(null);
    this.svc.error.set(null);
    this.showForm.set(true);
  }

  openEdit(p: Promotion): void {
    this.form = {
      name: p.name, type: p.type, value: Number(p.value), active: p.active,
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      days_of_month: p.days_of_month ? p.days_of_month.split(',').map(Number) : [],
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      min_qty: p.min_qty,
      categoryIds: p.targets.filter(t => t.category_id).map(t => t.category_id as string),
      productIds: p.targets.filter(t => t.product_id).map(t => t.product_id as string),
      comboItems: p.combo_items.map(c => ({ ...c })),
    };
    this.newDayOfMonth = null;
    this.editingId.set(p.id);
    this.svc.error.set(null);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  toggleDay(idx: number): void {
    const set = new Set(this.form.days_of_week);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    this.form.days_of_week = [...set];
  }

  addDayOfMonth(): void {
    const d = this.newDayOfMonth;
    if (d == null || d < 1 || d > 31) return;
    if (!this.form.days_of_month.includes(d)) {
      this.form.days_of_month = [...this.form.days_of_month, d].sort((a, b) => a - b);
    }
    this.newDayOfMonth = null;
  }

  removeDayOfMonth(d: number): void {
    this.form.days_of_month = this.form.days_of_month.filter(x => x !== d);
  }

  applyDaysOfMonthPreset(days: number[]): void {
    const set = new Set([...this.form.days_of_month, ...days]);
    this.form.days_of_month = [...set].sort((a, b) => a - b);
  }

  toggleCategory(id: string): void {
    const set = new Set(this.form.categoryIds);
    set.has(id) ? set.delete(id) : set.add(id);
    this.form.categoryIds = [...set];
  }

  toggleProduct(id: string): void {
    const set = new Set(this.form.productIds);
    set.has(id) ? set.delete(id) : set.add(id);
    this.form.productIds = [...set];
  }

  addComboLine(): void {
    const first = this.comboVariantOptions()[0]?.id ?? '';
    this.form.comboItems = [...this.form.comboItems, { product_variant_id: first, quantity: 1 }];
  }

  removeComboLine(index: number): void {
    this.form.comboItems = this.form.comboItems.filter((_, i) => i !== index);
  }

  setComboField(index: number, field: keyof ComboItem, value: string | number): void {
    this.form.comboItems = this.form.comboItems.map((l, i) => (i === index ? { ...l, [field]: value } : l));
  }

  comboDistinctCount(): number {
    return new Set(this.form.comboItems.map(l => l.product_variant_id).filter(Boolean)).size;
  }

  comboNormalTotal(): number {
    return this.form.comboItems.reduce(
      (sum, l) => sum + (this.variantPrices().get(l.product_variant_id) ?? 0) * (l.quantity || 0),
      0,
    );
  }

  comboSavings(): number {
    return this.comboNormalTotal() - Number(this.form.value || 0);
  }

  comboSavingsPct(): number {
    const total = this.comboNormalTotal();
    return total > 0 ? Math.round((this.comboSavings() / total) * 100) : 0;
  }

  canSave(): boolean {
    return this.form.type !== 'combo' || this.comboDistinctCount() >= 2;
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      this.toast.error('Selecciona al menos 2 productos distintos para el combo');
      return;
    }
    const id = this.editingId();
    const ok = id ? await this.svc.update(id, this.form) : await this.svc.create(this.form);
    if (ok) {
      this.toast.success(id ? 'Promoción actualizada' : 'Promoción creada');
      this.showForm.set(false);
    } else {
      this.toast.error(this.svc.error() ?? 'No se pudo guardar');
    }
  }

  async toggle(p: Promotion): Promise<void> {
    const ok = await this.svc.toggleActive(p);
    if (ok) this.toast.success(p.active ? 'Promoción desactivada' : 'Promoción activada');
    else this.toast.error(this.svc.error() ?? 'No se pudo actualizar');
  }

  async remove(p: Promotion): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar promoción',
      message: `¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar', tone: 'danger',
    });
    if (!ok) return;
    const done = await this.svc.remove(p.id);
    if (done) this.toast.success('Promoción eliminada');
    else this.toast.error(this.svc.error() ?? 'No se pudo eliminar');
  }

  discountLabel(p: Promotion): string {
    if (p.type === 'combo') {
      return `Combo · $ ${Number(p.value).toFixed(2)} (${p.combo_items.length} productos)`;
    }
    return p.type === 'percent' ? `${Number(p.value)}%` : `S/ ${Number(p.value).toFixed(2)}`;
  }

  vigencia(p: Promotion): string {
    const parts: string[] = [];
    if (p.starts_at || p.ends_at) {
      parts.push(`${p.starts_at?.slice(0, 10) ?? '…'} → ${p.ends_at?.slice(0, 10) ?? '…'}`);
    }
    if (p.days_of_week) {
      parts.push(p.days_of_week.split(',').map(d => DAYS[Number(d)]).join(' '));
    }
    if (p.days_of_month) {
      parts.push('Días ' + p.days_of_month.replaceAll(',', ', '));
    }
    if (p.start_time && p.end_time) {
      parts.push(`${p.start_time.slice(0, 5)}–${p.end_time.slice(0, 5)}`);
    }
    return parts.join(' · ') || 'Siempre';
  }
}
