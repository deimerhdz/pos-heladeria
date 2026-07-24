import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../categories/services/category.service';
import { ProductService } from '../../products/services/product.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { Promotion, PromotionForm, PromotionType } from '../interfaces/promotion.interface';
import { PromotionService } from '../services/promotion.service';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function emptyForm(): PromotionForm {
  return {
    name: '', type: 'percent', value: 0, active: true,
    starts_at: null, ends_at: null, days_of_week: [], start_time: null, end_time: null,
    min_qty: 1, categoryIds: [], productIds: [],
  };
}

@Component({
  selector: 'app-promotions-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
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
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">{{ form.type === 'percent' ? 'Porcentaje' : 'Monto' }}</label>
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

            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Aplica a (vacío = toda la venta)</label>
              <div class="grid grid-cols-2 gap-3">
                <div class="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase mb-1">Categorías</p>
                  @for (c of categories.categories(); track c.id) {
                    <label class="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                      <input type="checkbox" [checked]="form.categoryIds.includes(c.id)" (change)="toggleCategory(c.id)" />
                      {{ c.name }}
                    </label>
                  }
                </div>
                <div class="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase mb-1">Productos</p>
                  @for (pr of products.products(); track pr.id) {
                    <label class="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                      <input type="checkbox" [checked]="form.productIds.includes(pr.id)" (change)="toggleProduct(pr.id)" />
                      {{ pr.name }}
                    </label>
                  }
                </div>
              </div>
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" [(ngModel)]="form.active" /> Activa
            </label>

            @if (svc.error()) {
              <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{{ svc.error() }}</div>
            }
          </div>

          <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-none">
            <button type="button" (click)="closeForm()" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="button" (click)="save()" [disabled]="svc.isSubmitting() || !form.name.trim()"
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
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly editing = computed(() => this.editingId() !== null);
  form: PromotionForm = emptyForm();

  readonly days = DAYS.map((label, idx) => ({ label, idx }));

  ngOnInit(): void {
    this.svc.load();
    if (this.categories.categories().length === 0) this.categories.loadCategories();
    if (this.products.products().length === 0) this.products.loadProducts();
  }

  openCreate(): void {
    this.form = emptyForm();
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
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      min_qty: p.min_qty,
      categoryIds: p.targets.filter(t => t.category_id).map(t => t.category_id as string),
      productIds: p.targets.filter(t => t.product_id).map(t => t.product_id as string),
    };
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

  async save(): Promise<void> {
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
    if (p.start_time && p.end_time) {
      parts.push(`${p.start_time.slice(0, 5)}–${p.end_time.slice(0, 5)}`);
    }
    return parts.join(' · ') || 'Siempre';
  }
}
