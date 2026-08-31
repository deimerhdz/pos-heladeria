import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../categories/services/category.service';
import { MenuService } from '../../../core/services/menu.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { formatMoney } from '../../../shared/money';
import {
  PROMOTION_TRANSITIONS,
  Promotion,
  PromotionForm,
  PromotionStatus,
  PromotionType,
} from '../interfaces/promotion.interface';
import { PromotionService } from '../services/promotion.service';
import { PromoDisplay, getPromoDisplay } from '../services/promotion-pricing.util';

type Screen = 'list' | 'form' | 'review';
type StatusTab = PromotionStatus | '';

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'active', label: 'Activas' },
  { value: 'paused', label: 'En pausa' },
  { value: 'finished', label: 'Finalizadas' },
];

const TYPE_OPTIONS: { value: PromotionType; label: string; hint: string }[] = [
  { value: 'percent', label: 'Descuento %', hint: 'Un porcentaje sobre las variantes elegidas' },
  {
    value: 'package_price',
    label: 'Precio de paquete',
    hint: 'Llevando N unidades cualesquiera del conjunto, pagas un precio fijo',
  },
];

/** Variante del catálogo, aplanada para el selector. */
interface CatalogVariant {
  id: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  variantName: string;
  price: number;
}

function emptyForm(): PromotionForm {
  return {
    name: '',
    description: '',
    type: 'percent',
    value: 0,
    starts_at: null,
    ends_at: null,
    days_of_week: [],
    start_time: null,
    end_time: null,
    min_qty: 1,
    variantIds: [],
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'p. m.' : 'a. m.';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const DISMISS_KEY = 'promos-063-migration-banner-dismissed';

@Component({
  selector: 'app-promotions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PaginationBarComponent, MoneyInputComponent],
  template: `
    <div>
      @if (showMigrationBanner()) {
        <div class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold">Algunas promociones se finalizaron con la última actualización</p>
              <p class="mt-1 text-amber-700">
                El modelo de promociones cambió a "conjunto de variantes". Estas quedaron en
                <strong>Finalizada</strong> — recréalas si siguen vigentes:
              </p>
              <ul class="mt-2 list-disc pl-5">
                @for (p of svc.closedByRefactor(); track p.id) {
                  <li>{{ p.name }} <span class="text-amber-500">({{ typeLabel(p.type) }})</span></li>
                }
              </ul>
            </div>
            <button type="button" (click)="dismissBanner()" class="text-amber-500 hover:text-amber-700 text-xs font-semibold">
              Descartar
            </button>
          </div>
        </div>
      }

      @switch (screen()) {
        @case ('list') {
          <div class="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <p class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Catálogo</p>
              <h1 class="text-2xl font-bold text-gray-900">Promociones</h1>
              <p class="text-gray-500 text-sm mt-1">
                Descuento por porcentaje o precio de paquete sobre un conjunto de variantes
              </p>
            </div>
            <button
              type="button"
              (click)="openNew()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
            >
              + Nueva promoción
            </button>
          </div>

          <div class="flex items-center gap-3 flex-wrap mb-4">
            <div class="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              @for (tab of statusTabs; track tab.value) {
                <button
                  type="button"
                  (click)="selectTab(tab.value)"
                  class="px-3.5 py-2 text-sm font-semibold transition-colors border-l border-gray-200 first:border-l-0"
                  [class]="
                    svc.statusFilter() === tab.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  "
                >
                  {{ tab.label }}
                </button>
              }
            </div>
            <input
              [ngModel]="searchSignal()"
              (ngModelChange)="onSearchChange($event)"
              type="search"
              placeholder="Buscar por nombre…"
              class="flex-1 min-w-[200px] max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          @if (svc.error()) {
            <div class="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              {{ svc.error() }}
            </div>
          }

          @if (svc.loading() && svc.promotions().length === 0) {
            <div class="flex justify-center py-16">
              <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          } @else if (svc.promotions().length === 0) {
            <div class="bg-white rounded-2xl border border-gray-100 px-5 py-16 text-center">
              <h3 class="text-base font-semibold text-gray-900 mb-2">Sin promociones</h3>
              <p class="text-sm text-gray-500 max-w-md mx-auto mb-5">
                Crea un descuento por porcentaje o un precio de paquete sobre las variantes que elijas.
              </p>
              <button
                type="button"
                (click)="openNew()"
                class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
              >
                Crear la primera promoción
              </button>
            </div>
          } @else {
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[860px]">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50">
                      <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Promoción</th>
                      <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Condición</th>
                      <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Vigencia</th>
                      <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                      <th class="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    @for (p of svc.promotions(); track p.id) {
                      <tr class="hover:bg-gray-50 transition-colors align-top">
                        <td class="px-5 py-3">
                          <div class="text-sm font-semibold text-gray-900">{{ p.name }}</div>
                          <span
                            class="inline-block mt-1 text-[10.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-50 text-indigo-600"
                            >{{ typeLabel(p.type) }}</span
                          >
                          @if (p.description) {
                            <div class="text-[11.5px] text-gray-400 mt-1 max-w-[220px]">{{ p.description }}</div>
                          }
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-600 max-w-[280px]">
                          {{ p.condition_text || '—' }}
                          <div class="text-[11px] text-gray-400 mt-0.5">{{ p.variants.length }} variante(s)</div>
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-600 max-w-[220px]">{{ vigencia(p) }}</td>
                        <td class="px-5 py-3">
                          <span
                            class="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full"
                            [class]="displayClass(displayOf(p))"
                          >
                            {{ displayLabel(displayOf(p)) }}
                          </span>
                        </td>
                        <td class="px-5 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            (click)="openEdit(p)"
                            class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2"
                          >
                            {{ p.status === 'finished' ? 'Ver' : 'Editar' }}
                          </button>
                          <button
                            type="button"
                            (click)="startDuplicate(p)"
                            class="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2"
                          >
                            Duplicar
                          </button>
                          @for (to of transitionsOf(p); track to) {
                            <button
                              type="button"
                              (click)="changeStatus(p, to)"
                              class="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2"
                            >
                              {{ statusVerb(to) }}
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            <app-pagination-bar
              [page]="svc.page()"
              [totalPages]="svc.totalPages()"
              [total]="svc.total()"
              (pageChange)="svc.load($event)"
            />
          }
        }

        @case ('form') {
          <button type="button" (click)="backToList()" class="text-sm text-gray-500 hover:text-gray-700 mb-4">← Volver</button>
          <h1 class="text-xl font-bold text-gray-900 mb-1">
            {{ editingId() ? 'Editar promoción' : 'Nueva promoción' }}
          </h1>
          @if (isReadOnly()) {
            <p class="text-sm text-amber-600 mb-4">Esta promoción está finalizada — solo lectura.</p>
          } @else if (!isDraft()) {
            <p class="text-sm text-gray-500 mb-4">
              En una promoción activa solo puedes editar nombre, descripción, vigencia y horario.
              Para cambiar el tipo, el valor, la cantidad o el conjunto, duplícala.
            </p>
          }

          <div class="grid gap-5 md:grid-cols-2">
            <div class="space-y-4">
              <label class="block">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</span>
                <input [(ngModel)]="form.name" [disabled]="isReadOnly()" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </label>
              <label class="block">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</span>
                <textarea [(ngModel)]="form.description" [disabled]="isReadOnly()" rows="2" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"></textarea>
              </label>

              <div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</span>
                <div class="mt-1 grid grid-cols-2 gap-2">
                  @for (t of typeOptions; track t.value) {
                    <button
                      type="button"
                      [disabled]="!canEditShape()"
                      (click)="setType(t.value)"
                      class="rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60"
                      [class]="form.type === t.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'"
                    >
                      <div class="font-semibold">{{ t.label }}</div>
                      <div class="text-[11px] text-gray-400">{{ t.hint }}</div>
                    </button>
                  }
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {{ form.type === 'percent' ? 'Porcentaje' : 'Precio del paquete' }}
                  </span>
                  @if (form.type === 'percent') {
                    <input type="number" [(ngModel)]="form.value" [disabled]="!canEditValue()" min="0" max="100" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  } @else {
                    <app-money-input [(ngModel)]="form.value" [disabled]="!canEditValue()" class="mt-1 block" />
                  }
                </label>
                <label class="block">
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {{ form.type === 'percent' ? 'Unidades mínimas' : 'Unidades del paquete' }}
                  </span>
                  <input type="number" [(ngModel)]="form.min_qty" [disabled]="!canEditValue()" min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </label>
              </div>

              <div class="border-t border-gray-100 pt-4">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vigencia</span>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  @for (d of days; track d.idx) {
                    <button
                      type="button"
                      [disabled]="isReadOnly()"
                      (click)="toggleDay(d.idx)"
                      class="px-2.5 py-1 rounded-md text-xs font-semibold border"
                      [class]="form.days_of_week.includes(d.idx) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'"
                    >
                      {{ d.label }}
                    </button>
                  }
                </div>
                <div class="mt-2 grid grid-cols-2 gap-3">
                  <label class="block">
                    <span class="text-[11px] text-gray-400">Desde (hora)</span>
                    <input type="time" [(ngModel)]="form.start_time" [disabled]="isReadOnly()" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label class="block">
                    <span class="text-[11px] text-gray-400">Hasta (hora)</span>
                    <input type="time" [(ngModel)]="form.end_time" [disabled]="isReadOnly()" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label class="block">
                    <span class="text-[11px] text-gray-400">Desde (fecha)</span>
                    <input type="date" [(ngModel)]="form.starts_at" [disabled]="isReadOnly() || !isDraft()" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                  <label class="block">
                    <span class="text-[11px] text-gray-400">Hasta (fecha)</span>
                    <input type="date" [(ngModel)]="form.ends_at" [disabled]="isReadOnly()" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </label>
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Conjunto de variantes ({{ form.variantIds.length }})
                </span>
                @if (canEditShape() && form.variantIds.length > 0) {
                  <button type="button" (click)="form.variantIds = []" class="text-[11px] text-gray-400 hover:text-gray-600">Vaciar</button>
                }
              </div>

              @if (canEditShape()) {
                <div class="flex flex-wrap gap-2">
                  <select [(ngModel)]="filterCategory" class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs">
                    <option value="">Todas las categorías</option>
                    @for (c of categoryFilterOptions(); track c.id) {
                      <option [value]="c.id">{{ c.name }}</option>
                    }
                  </select>
                  <input [(ngModel)]="filterText" type="search" placeholder="Buscar variante…" class="flex-1 min-w-[140px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
                  <button type="button" (click)="selectAllFiltered()" class="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600">
                    Agregar visibles
                  </button>
                </div>
              }

              <div class="border border-gray-200 rounded-lg max-h-[340px] overflow-y-auto divide-y divide-gray-50">
                @for (v of visibleVariants(); track v.id) {
                  <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                    <input type="checkbox" [checked]="form.variantIds.includes(v.id)" [disabled]="!canEditShape()" (change)="toggleVariant(v.id)" />
                    <span class="flex-1">{{ v.productName }} - {{ v.variantName }}</span>
                    <span class="text-xs text-gray-400">{{ money(v.price) }}</span>
                  </label>
                } @empty {
                  <p class="px-3 py-4 text-xs text-gray-400">Sin variantes que coincidan con el filtro.</p>
                }
              </div>
            </div>
          </div>

          @if (formError()) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{{ formError() }}</div>
          }

          <div class="mt-6 flex gap-3">
            @if (!isReadOnly()) {
              <button
                type="button"
                [disabled]="svc.isSubmitting() || !formValid()"
                (click)="goReview()"
                class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                Revisar y guardar
              </button>
            }
            <button type="button" (click)="backToList()" class="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold">Cancelar</button>
          </div>
        }

        @case ('review') {
          <button type="button" (click)="screen.set('form')" class="text-sm text-gray-500 hover:text-gray-700 mb-4">← Volver a editar</button>
          <h1 class="text-xl font-bold text-gray-900 mb-4">Revisa antes de guardar</h1>
          <div class="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 max-w-xl">
            <div>
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</span>
              <p class="text-sm text-gray-800">{{ typeLabel(form.type) }}</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Condición</span>
              <p class="text-sm text-gray-800">{{ conditionPreview() }}</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vigencia</span>
              <p class="text-sm text-gray-800">{{ vigenciaPreview() }}</p>
            </div>
            <div>
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Variantes del conjunto ({{ form.variantIds.length }})
              </span>
              <ul class="mt-1 text-sm text-gray-700 space-y-0.5 max-h-56 overflow-y-auto">
                @for (v of selectedVariants(); track v.id) {
                  <li class="flex justify-between">
                    <span>{{ v.productName }} - {{ v.variantName }}</span>
                    <span class="text-gray-400">{{ money(v.price) }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>

          @if (formError()) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 max-w-xl">{{ formError() }}</div>
          }
          @if (svc.overlapConflict(); as oc) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700 max-w-xl">
              <p class="font-semibold">{{ oc.error }}</p>
              <ul class="mt-1 list-disc pl-5">
                @for (c of oc.conflicts; track c.promotion_id) {
                  <li>{{ c.promotion_name }} — {{ c.variant_ids.length }} variante(s) compartida(s)</li>
                }
              </ul>
            </div>
          }
          @if (svc.packageNotDiscount(); as pk) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700 max-w-xl">
              <p class="font-semibold">{{ pk.error }}</p>
              <p class="mt-1">
                {{ pk.min_qty }} unidades de la variante más barata costarían
                {{ money(pk.min_qty * numVal(pk.cheapest_unit_price)) }} — el precio de paquete
                ({{ money(numVal(pk.value)) }}) no representa un descuento.
              </p>
            </div>
          }

          <div class="mt-6 flex gap-3">
            @if (isDraft() && !editingId()) {
              <button type="button" [disabled]="svc.isSubmitting()" (click)="save('draft')" class="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold">
                Guardar borrador
              </button>
              <button type="button" [disabled]="svc.isSubmitting()" (click)="save('active')" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">
                Guardar y activar
              </button>
            } @else {
              <button type="button" [disabled]="svc.isSubmitting()" (click)="save('draft')" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">
                Guardar cambios
              </button>
            }
          </div>
        }
      }
    </div>

    @if (duplicating(); as src) {
      <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl p-5 w-full max-w-sm">
          <h3 class="text-base font-semibold text-gray-900 mb-2">Duplicar "{{ src.name }}"</h3>
          <p class="text-xs text-gray-500 mb-3">La copia nace en Borrador con el mismo conjunto y condición.</p>
          <input [(ngModel)]="duplicateName" placeholder="Nombre de la copia" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" (click)="duplicating.set(null)" class="px-3 py-1.5 text-sm text-gray-500">Cancelar</button>
            <button
              type="button"
              [disabled]="svc.isSubmitting() || !duplicateName().trim()"
              (click)="confirmDuplicate()"
              class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              Duplicar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PromotionsPageComponent implements OnInit {
  readonly svc = inject(PromotionService);
  private readonly categories = inject(CategoryService);
  private readonly menu = inject(MenuService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly screen = signal<Screen>('list');
  readonly editingId = signal<string | null>(null);
  readonly editingSource = signal<Promotion | null>(null);
  readonly searchSignal = signal('');
  readonly formError = signal<string | null>(null);
  readonly bannerDismissed = signal(this.readDismissed());

  readonly duplicating = signal<Promotion | null>(null);
  readonly duplicateName = signal('');

  form: PromotionForm = emptyForm();

  filterCategory = '';
  filterText = '';

  readonly statusTabs = STATUS_TABS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly days = DAY_SHORT.map((label, idx) => ({ label, idx }));

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  readonly editingStatus = computed<PromotionStatus>(() => this.editingSource()?.status ?? 'draft');
  readonly isDraft = computed(() => this.editingStatus() === 'draft');
  readonly isReadOnly = computed(() => this.editingStatus() === 'finished');

  readonly showMigrationBanner = computed(
    () => !this.bannerDismissed() && this.svc.closedByRefactor().length > 0,
  );

  readonly catalogVariants = computed<CatalogVariant[]>(() => {
    const out: CatalogVariant[] = [];
    for (const cat of this.menu.categories()) {
      for (const prod of cat.products) {
        for (const v of prod.variants) {
          out.push({
            id: v.id,
            productId: prod.id,
            productName: prod.name,
            categoryId: cat.id,
            categoryName: cat.name,
            variantName: v.name,
            price: v.price,
          });
        }
      }
    }
    return out;
  });

  readonly categoryFilterOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const v of this.catalogVariants()) seen.set(v.categoryId, v.categoryName);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly visibleVariants = computed<CatalogVariant[]>(() => {
    const text = this.filterText.trim().toLowerCase();
    return this.catalogVariants().filter((v) => {
      if (this.filterCategory && v.categoryId !== this.filterCategory) return false;
      if (text && !`${v.productName} ${v.variantName}`.toLowerCase().includes(text)) return false;
      return true;
    });
  });

  readonly selectedVariants = computed<CatalogVariant[]>(() => {
    const set = new Set(this.form.variantIds);
    return this.catalogVariants().filter((v) => set.has(v.id));
  });

  ngOnInit(): void {
    this.svc.load(1);
    this.categories.loadAllCategories();
    void this.menu.loadMenu();
    this.svc.loadClosedByRefactor();
  }

  selectTab(status: StatusTab): void {
    this.svc.setStatusFilter(status);
  }

  onSearchChange(value: string): void {
    this.searchSignal.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.svc.setSearch(value.trim()), 300);
  }

  displayOf(p: Promotion): PromoDisplay {
    return getPromoDisplay(p, this.svc.ready() ? this.svc.now() : new Date());
  }

  transitionsOf(p: Promotion): PromotionStatus[] {
    return PROMOTION_TRANSITIONS[p.status] ?? [];
  }

  async changeStatus(p: Promotion, to: PromotionStatus): Promise<void> {
    const ok = await this.confirm.ask({
      title: `${this.statusVerb(to)} "${p.name}"`,
      message: `¿Seguro que quieres ${this.statusVerb(to).toLowerCase()} esta promoción?`,
    });
    if (!ok) return;
    const res = await this.svc.changeStatus(p.id, to);
    if (res) {
      this.toast.success('Estado actualizado');
    } else if (this.svc.overlapConflict()) {
      this.toast.error('Otra promoción activa ya cubre esas variantes en un horario que se cruza.');
    } else if (this.svc.otherError()) {
      this.toast.error(this.svc.otherError()!);
    }
  }

  openNew(): void {
    this.form = emptyForm();
    this.editingId.set(null);
    this.editingSource.set(null);
    this.formError.set(null);
    this.filterCategory = '';
    this.filterText = '';
    this.screen.set('form');
  }

  openEdit(p: Promotion): void {
    this.editingId.set(p.id);
    this.editingSource.set(p);
    this.formError.set(null);
    this.form = {
      name: p.name,
      description: p.description ?? '',
      type: p.type === 'package_price' ? 'package_price' : 'percent',
      value: Number(p.value),
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      min_qty: p.min_qty,
      variantIds: p.variants.map((v) => v.product_variant_id),
    };
    this.screen.set('form');
  }

  backToList(): void {
    this.screen.set('list');
  }

  /** FR-018: el tipo y el conjunto solo se cambian en `draft` (si no, se duplica). */
  canEditShape(): boolean {
    return !this.isReadOnly() && this.isDraft();
  }

  /** FR-018: `value` / `min_qty` bloqueados fuera de `draft`. */
  canEditValue(): boolean {
    return !this.isReadOnly() && this.isDraft();
  }

  setType(t: PromotionType): void {
    if (!this.canEditShape()) return;
    this.form.type = t;
    if (this.form.min_qty < 1) this.form.min_qty = 1;
  }

  toggleDay(idx: number): void {
    if (this.isReadOnly()) return;
    const i = this.form.days_of_week.indexOf(idx);
    if (i >= 0) this.form.days_of_week.splice(i, 1);
    else this.form.days_of_week.push(idx);
  }

  toggleVariant(id: string): void {
    if (!this.canEditShape()) return;
    const i = this.form.variantIds.indexOf(id);
    if (i >= 0) this.form.variantIds.splice(i, 1);
    else this.form.variantIds.push(id);
  }

  selectAllFiltered(): void {
    if (!this.canEditShape()) return;
    const ids = new Set(this.form.variantIds);
    for (const v of this.visibleVariants()) ids.add(v.id);
    this.form.variantIds = [...ids];
  }

  formValid(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.canEditShape() && this.form.variantIds.length === 0) return false;
    if (this.form.type === 'percent' && (this.form.value <= 0 || this.form.value > 100)) return false;
    if (this.form.type === 'package_price' && this.form.value <= 0) return false;
    if (this.form.min_qty < 1) return false;
    if (!this.form.start_time !== !this.form.end_time) return false;
    return true;
  }

  goReview(): void {
    this.formError.set(null);
    this.svc.overlapConflict.set(null);
    this.svc.packageNotDiscount.set(null);
    if (!this.formValid()) {
      this.formError.set('Revisa los campos: nombre, valor válido y al menos una variante.');
      return;
    }
    this.screen.set('review');
  }

  async save(status: 'draft' | 'active'): Promise<void> {
    this.formError.set(null);
    const id = this.editingId();
    let res: Promotion | null;
    if (!id) {
      res = await this.svc.create(this.form, status);
    } else if (this.isDraft()) {
      res = await this.svc.updateShape(id, this.form);
      if (res) res = await this.svc.update(id, this.form);
      if (res && status === 'active') res = await this.svc.changeStatus(id, 'active');
    } else {
      res = await this.svc.update(id, this.form);
    }

    if (res) {
      this.toast.success(id ? 'Promoción actualizada' : 'Promoción creada');
      this.screen.set('list');
      this.svc.load();
    } else if (this.svc.overlapConflict() || this.svc.packageNotDiscount()) {
      // Se muestran en el panel de la pantalla de revisión.
    } else {
      this.formError.set(this.svc.otherError() ?? 'No se pudo guardar.');
    }
  }

  startDuplicate(p: Promotion): void {
    this.duplicating.set(p);
    this.duplicateName.set(`${p.name} (copia)`);
  }

  async confirmDuplicate(): Promise<void> {
    const src = this.duplicating();
    if (!src) return;
    const res = await this.svc.duplicate(src.id, this.duplicateName().trim());
    if (res) {
      this.toast.success('Copia creada en Borrador');
      this.duplicating.set(null);
      this.svc.load();
      this.openEdit(res);
    } else {
      this.toast.error(this.svc.otherError() ?? 'No se pudo duplicar.');
    }
  }

  dismissBanner(): void {
    this.bannerDismissed.set(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  money(n: number): string {
    return formatMoney(n);
  }

  numVal(s: string): number {
    return Number(s);
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'percent':
        return 'Descuento %';
      case 'package_price':
        return 'Precio de paquete';
      case 'combo':
        return 'Combo (finalizada)';
      case 'qty_price':
      case 'qty_price_presentation':
        return 'Precio por cantidad (finalizada)';
      case 'fixed':
        return 'Monto fijo (finalizada)';
      default:
        return type;
    }
  }

  statusVerb(to: PromotionStatus): string {
    switch (to) {
      case 'active':
        return 'Activar';
      case 'paused':
        return 'Pausar';
      case 'finished':
        return 'Finalizar';
      default:
        return to;
    }
  }

  vigencia(p: Promotion): string {
    const parts: string[] = [];
    if (p.days_of_week) {
      parts.push('los ' + p.days_of_week.split(',').map((d) => DAY_FULL[Number(d)]).join(', '));
    }
    if (p.start_time && p.end_time) parts.push(`de ${fmtTime(p.start_time)} a ${fmtTime(p.end_time)}`);
    if (p.ends_at) parts.push(`hasta el ${fmtDate(p.ends_at)}`);
    return parts.length ? parts.join(', ') : 'Todos los días';
  }

  vigenciaPreview(): string {
    const parts: string[] = [];
    if (this.form.days_of_week.length) {
      parts.push('los ' + this.form.days_of_week.map((i) => DAY_FULL[i]).join(', '));
    }
    if (this.form.start_time && this.form.end_time) {
      parts.push(`de ${fmtTime(this.form.start_time)} a ${fmtTime(this.form.end_time)}`);
    }
    if (this.form.ends_at) parts.push(`hasta el ${fmtDate(this.form.ends_at)}`);
    return parts.length ? parts.join(', ') : 'Todos los días, sin límite';
  }

  conditionPreview(): string {
    const n = this.form.variantIds.length;
    const v = this.form.value;
    if (this.form.type === 'package_price') {
      return this.form.min_qty > 1
        ? `Llevando ${this.form.min_qty} de estas ${n} variantes pagas ${this.money(v)}`
        : `Cada una de estas ${n} variantes a ${this.money(v)}`;
    }
    return this.form.min_qty === 1
      ? `${v}% en estas ${n} variantes`
      : `${v}% llevando ${this.form.min_qty} de estas ${n} variantes`;
  }

  displayLabel(d: PromoDisplay): string {
    switch (d) {
      case 'draft':
        return 'Borrador';
      case 'live':
        return 'Vigente';
      case 'out_of_window':
        return 'Fuera de horario';
      case 'scheduled':
        return 'Programada';
      case 'expired':
        return 'Vencida';
      case 'paused':
        return 'En pausa';
      case 'finished':
        return 'Finalizada';
    }
  }

  displayClass(d: PromoDisplay): string {
    switch (d) {
      case 'live':
        return 'bg-green-100 text-green-700';
      case 'draft':
      case 'scheduled':
        return 'bg-gray-100 text-gray-600';
      case 'out_of_window':
        return 'bg-amber-100 text-amber-700';
      case 'expired':
      case 'finished':
        return 'bg-gray-100 text-gray-400';
      case 'paused':
        return 'bg-orange-100 text-orange-700';
    }
  }
}
