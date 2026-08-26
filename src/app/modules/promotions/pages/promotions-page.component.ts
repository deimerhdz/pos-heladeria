import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
  PromotionOverlap,
  PromotionStatus,
  PromotionType,
  ScopeTarget,
  hasOwnPricing,
} from '../interfaces/promotion.interface';
import { PromotionService } from '../services/promotion.service';
import { ScopePickerComponent, ScopeSelection } from '../components/scope-picker.component';
import {
  PromoDisplay,
  PromoScope,
  findOverlaps,
  getPromoDisplay,
  scopeOf,
} from '../services/promotion-pricing.util';

type Screen = 'list' | 'type' | 'discount' | 'pack' | 'combo' | 'review' | 'edit';
/** `pick` cubre categorías y productos a la vez: el backend acepta ambas formas
 *  de target en la misma promoción (`_matches` hace OR sobre la lista). */
type ScopeMode = 'all' | 'pick';
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

/** Presets de prioridad. El campo exacto (0..1000) vive en «Más opciones». */
const PRIORITY_PRESETS = [
  { value: 0, label: 'Normal' },
  { value: 50, label: 'Alta' },
  { value: 100, label: 'Máxima' },
];

function emptyForm(): PromotionForm {
  return {
    name: '',
    description: '',
    type: 'percent',
    value: 0,
    priority: 0,
    starts_at: null,
    ends_at: null,
    days_of_week: [],
    start_time: null,
    end_time: null,
    min_qty: 1,
    categoryTargets: [],
    productTargets: [],
    comboItems: [],
  };
}

/**
 * Firma de una lista de destinos, para detectar cambios de forma. Incluye el
 * precio propio: cambiar «2 Grandes por $12.000» a «$13.000» es un cambio de
 * `targets` y va por `PATCH /shape`, no por el PATCH de escalares.
 */
function targetKeys(targets: ScopeTarget[]): string[] {
  return targets.map((t) => `${t.id}:${t.min_qty ?? ''}:${t.value ?? ''}`);
}

function joinList(arr: string[]): string {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
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

interface VigInput {
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

function vigPhrase(v: VigInput): string {
  const parts: string[] = [];
  let dayTime = '';
  if (v.days_of_week.length) dayTime = 'los ' + joinList(v.days_of_week.map((i) => DAY_FULL[i]));
  if (v.start_time && v.end_time) {
    dayTime +=
      (dayTime ? ' ' : 'todos los días ') + `de ${fmtTime(v.start_time)} a ${fmtTime(v.end_time)}`;
  }
  if (dayTime) parts.push(dayTime);
  if (v.starts_at && v.ends_at) parts.push(`del ${fmtDate(v.starts_at)} al ${fmtDate(v.ends_at)}`);
  else if (v.ends_at) parts.push(`hasta el ${fmtDate(v.ends_at)}`);
  else if (v.starts_at) parts.push(`a partir del ${fmtDate(v.starts_at)}`);
  return parts.length ? parts.join(', ') : 'Todos los días, sin horario ni fecha límite';
}

@Component({
  selector: 'app-promotions-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    PaginationBarComponent,
    ScopePickerComponent,
    MoneyInputComponent,
  ],
  template: `
    <div>
      @switch (screen()) {
        @case ('list') {
          <div class="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <p class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
                Catálogo
              </p>
              <h1 class="text-2xl font-bold text-gray-900">Promociones</h1>
              <p class="text-gray-500 text-sm mt-1">
                Descuentos automáticos, paquetes y combos que se aplican en la venta
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
            <div
              class="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
            >
              {{ svc.error() }}
            </div>
          }

          @if (svc.loading() && rows().length === 0) {
            <div class="flex justify-center py-16">
              <div
                class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
              ></div>
            </div>
          } @else if (rows().length === 0) {
            <div class="bg-white rounded-2xl border border-gray-100 px-5 py-16 text-center">
              <h3 class="text-base font-semibold text-gray-900 mb-2">{{ emptyTitle() }}</h3>
              <p class="text-sm text-gray-500 max-w-md mx-auto mb-5">{{ emptyMessage() }}</p>
              @if (isFiltered()) {
                <button
                  type="button"
                  (click)="clearFilters()"
                  class="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                >
                  Quitar filtros
                </button>
              } @else {
                <button
                  type="button"
                  (click)="openNew()"
                  class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
                >
                  Crear la primera promoción
                </button>
              }
            </div>
          } @else {
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[980px]">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50">
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Promoción
                      </th>
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Aplica a
                      </th>
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Beneficio
                      </th>
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Vigencia
                      </th>
                      @if (showPriorityColumn()) {
                        <th
                          class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                        >
                          Prioridad
                        </th>
                      }
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Estado
                      </th>
                      <th class="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    @for (row of rows(); track row.promo.id) {
                      <tr class="hover:bg-gray-50 transition-colors align-top">
                        <td class="px-5 py-3">
                          <div class="text-sm font-semibold text-gray-900">
                            {{ row.promo.name }}
                          </div>
                          <span
                            class="inline-block mt-1 text-[10.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
                            [class]="typeBadgeClass(row.promo.type)"
                            >{{ typeLabel(row.promo.type) }}</span
                          >
                          @if (row.promo.description) {
                            <div class="text-[11.5px] text-gray-400 mt-1 max-w-[220px]">
                              {{ row.promo.description }}
                            </div>
                          }
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-700">
                          {{ scopePhrase(row.promo) }}
                          @if (row.overlap; as clash) {
                            <div
                              class="flex items-start gap-1 mt-1.5 text-[11.5px] text-amber-700 max-w-[230px]"
                            >
                              <span>⚠️</span>
                              <span>
                                Compite con "{{ clash.name }}".
                                {{ verdict(row.promo.priority, clash.priority, clash.name) }}
                              </span>
                            </div>
                          }
                        </td>
                        <td class="px-5 py-3 text-sm font-semibold text-gray-900">
                          {{ benefitLabel(row.promo) }}
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-500">{{ vigencia(row.promo) }}</td>
                        @if (showPriorityColumn()) {
                          <td class="px-5 py-3 text-sm text-gray-600">
                            {{ priorityLabel(row.promo.priority) }}
                          </td>
                        }
                        <td class="px-5 py-3">
                          <div class="flex items-center gap-2">
                            <span
                              class="w-2.5 h-2.5 rounded-full flex-none"
                              [class]="dotClass(row.display)"
                            ></span>
                            <div>
                              <div class="text-sm font-medium" [class]="textClass(row.display)">
                                {{ displayLabel(row.display) }}
                              </div>
                              @if (displayDetail(row.promo, row.display); as detail) {
                                <div class="text-[11.5px] text-gray-400">{{ detail }}</div>
                              }
                            </div>
                          </div>
                        </td>
                        <td class="px-5 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            (click)="openEdit(row.promo)"
                            class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 mr-3"
                          >
                            {{ row.promo.status === 'finished' ? 'Ver' : 'Editar' }}
                          </button>
                          @if (primaryAction(row.promo.status); as action) {
                            <button
                              type="button"
                              (click)="changeStatus(row.promo, action.to)"
                              [disabled]="svc.isSubmitting()"
                              class="text-xs font-semibold text-emerald-600 hover:text-emerald-800 disabled:opacity-50 mr-3"
                            >
                              {{ action.label }}
                            </button>
                          }
                          @if (can(row.promo.status, 'finished')) {
                            <button
                              type="button"
                              (click)="changeStatus(row.promo, 'finished')"
                              [disabled]="svc.isSubmitting()"
                              class="text-xs font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50 mr-3"
                            >
                              Finalizar
                            </button>
                          }
                          <button
                            type="button"
                            (click)="askDuplicate(row.promo)"
                            class="text-xs font-semibold text-gray-500 hover:text-gray-800 mr-3"
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            (click)="remove(row.promo)"
                            class="text-xs font-semibold text-red-500 hover:text-red-700"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination-bar
                [page]="svc.page()"
                [size]="svc.size()"
                [total]="svc.total()"
                [totalPages]="svc.totalPages()"
                [loading]="svc.loading()"
                (pageChange)="svc.load($event, svc.size())"
                (sizeChange)="svc.load(1, $event)"
              />
            </div>
          }
        }

        @case ('type') {
          <button
            type="button"
            (click)="backToList()"
            class="text-sm font-medium text-gray-500 hover:text-gray-800 mb-5"
          >
            ← Volver a promociones
          </button>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">¿Qué quieres crear?</h1>
          <p class="text-gray-500 text-sm mb-8 max-w-xl">
            El descuento y el paquete se aplican solos cuando se cumplen las condiciones. El combo
            lo elige el cajero al vender.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl">
            <button
              type="button"
              (click)="chooseKind('discount')"
              class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all p-6"
            >
              <div
                class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 text-lg"
              >
                %
              </div>
              <div class="text-lg font-bold text-gray-900 mb-1.5">Descuento</div>
              <div class="text-sm text-gray-500">
                Se aplica automáticamente. Ej: 20% en conos de 5 a 7 p. m., $3.000 menos en toda la
                venta.
              </div>
            </button>
            <button
              type="button"
              (click)="chooseKind('pack')"
              class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all p-6"
            >
              <div
                class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 text-sm font-bold"
              >
                3x
              </div>
              <div class="text-lg font-bold text-gray-900 mb-1.5">Paquete</div>
              <div class="text-sm text-gray-500">
                Varias unidades del mismo tipo a precio cerrado. Ej: 3 conos por $10.000. Se aplica
                solo, por paquetes completos.
              </div>
            </button>
            <!-- <button
               type="button"
               (click)="chooseKind('combo')"
               class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all p-6"
             >
               <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 text-lg">
                 🎁
               </div>
               <div class="text-lg font-bold text-gray-900 mb-1.5">Combo</div>
               <div class="text-sm text-gray-500">
                 Productos distintos por un precio. El cajero lo elige al vender. Ej: cono + malteada
                 + topping por $15.000.
               </div>
            </button> !-->
          </div>
        }

        @case ('discount') {
          <button
            type="button"
            (click)="backToType()"
            class="text-sm font-medium text-gray-500 hover:text-gray-800 mb-5"
          >
            ← Volver
          </button>
          <h1 class="text-2xl font-bold text-gray-900 mb-6">Nuevo descuento</h1>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div class="lg:col-span-5 space-y-7">
              <ng-container [ngTemplateOutlet]="identityFields" />

              <div>
                <label
                  class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                  >¿Cuánto descuenta?</label
                >
                <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden mb-3">
                  <button
                    type="button"
                    (click)="form.type = 'percent'"
                    class="px-4 py-2 text-sm font-semibold transition-colors"
                    [class]="
                      form.type === 'percent'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    "
                  >
                    Porcentaje
                  </button>
                  <button
                    type="button"
                    (click)="form.type = 'fixed'"
                    class="px-4 py-2 text-sm font-semibold border-l border-gray-200 transition-colors"
                    [class]="
                      form.type === 'fixed'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    "
                  >
                    Monto fijo
                  </button>
                </div>
                <div class="flex items-center gap-2 max-w-[200px]">
                  @if (form.type === 'percent') {
                    <input
                      [(ngModel)]="form.value"
                      (blur)="touch('value')"
                      type="number"
                      min="0"
                      max="100"
                      class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  } @else {
                    <app-money-input
                      [ngModel]="form.value"
                      (ngModelChange)="form.value = $event ?? 0"
                      (blurred)="touch('value')"
                      sizeClass="px-3 py-2.5 rounded-lg text-sm"
                    />
                  }
                  <span class="text-sm font-semibold text-gray-600">{{
                    form.type === 'percent' ? '%' : 'pesos'
                  }}</span>
                </div>
                @if (touched['value'] && numberValue() <= 0) {
                  <p class="text-xs text-red-500 mt-1">Ingresa un valor mayor a 0.</p>
                }
                @if (form.type === 'percent' && numberValue() > 100) {
                  <p class="text-xs text-red-500 mt-1">
                    Un descuento porcentual no puede superar 100.
                  </p>
                }
                @if (discountExample(); as ex) {
                  <div
                    class="inline-block mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    Ejemplo: {{ ex.name }} pasa de
                    <span class="line-through text-gray-400">{{ ex.before }}</span> a
                    <strong class="text-gray-900">{{ ex.after }}</strong>
                  </div>
                }
              </div>

              <ng-container [ngTemplateOutlet]="scheduleFields" />
              <ng-container [ngTemplateOutlet]="priorityFields" />
            </div>

            <div class="lg:col-span-7 space-y-4">
              <ng-container [ngTemplateOutlet]="scopeFields" />
              <ng-container [ngTemplateOutlet]="draftClashPanel" />
            </div>
          </div>
          <ng-container [ngTemplateOutlet]="wizardActions" />
        }

        @case ('pack') {
          <button
            type="button"
            (click)="backToType()"
            class="text-sm font-medium text-gray-500 hover:text-gray-800 mb-5"
          >
            ← Volver
          </button>
          <h1 class="text-2xl font-bold text-gray-900 mb-6">Nuevo paquete</h1>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div class="lg:col-span-5 space-y-7">
              <ng-container [ngTemplateOutlet]="identityFields" />

              <div class="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <p class="text-sm text-indigo-900 font-semibold mb-1">
                  El precio se define producto por producto
                </p>
                <p class="text-xs text-indigo-700">
                  Elige a la derecha a qué aplica y pon en cada fila cuántas unidades entran y a qué
                  precio. Solo descuenta paquetes completos: con 2 unidades por paquete, una compra
                  de 3 cobra un paquete y una unidad suelta al precio normal.
                </p>
              </div>

              @if (packExample(); as ex) {
                <div class="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  {{ ex.line }}
                  @if (ex.savings > 0) {
                    · <strong class="text-emerald-600">ahorra {{ money(ex.savings) }}</strong>
                  } @else {
                    ·
                    <strong class="text-amber-600">
                      no hay ahorro frente al precio normal ({{ money(ex.normal) }})
                    </strong>
                  }
                </div>
              }

              <ng-container [ngTemplateOutlet]="scheduleFields" />
              <ng-container [ngTemplateOutlet]="priorityFields" />
            </div>

            <div class="lg:col-span-7 space-y-4">
              <ng-container [ngTemplateOutlet]="scopeFields" />
              <ng-container [ngTemplateOutlet]="draftClashPanel" />
            </div>
          </div>
          <ng-container [ngTemplateOutlet]="wizardActions" />
        }

        @case ('combo') {
          <button
            type="button"
            (click)="backToType()"
            class="text-sm font-medium text-gray-500 hover:text-gray-800 mb-5"
          >
            ← Volver
          </button>
          <h1 class="text-2xl font-bold text-gray-900 mb-6">Nuevo combo</h1>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div class="lg:col-span-5 space-y-7">
              <ng-container [ngTemplateOutlet]="identityFields" />
              <ng-container [ngTemplateOutlet]="scheduleFields" />
              <ng-container [ngTemplateOutlet]="priorityFields" />
            </div>

            <div class="lg:col-span-7 space-y-4">
              <ng-container [ngTemplateOutlet]="comboItemsFields" />
              @if (comboItemRows().length > 0) {
                <ng-container [ngTemplateOutlet]="comboPriceFields" />
              }
            </div>
          </div>
          <ng-container [ngTemplateOutlet]="wizardActions" />
        }

        @case ('review') {
          <button
            type="button"
            (click)="backToForm()"
            class="text-sm font-medium text-gray-500 hover:text-gray-800 mb-5"
          >
            ← Volver a editar
          </button>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Confirma antes de crear</h1>
          <p class="text-gray-500 text-sm mb-6 max-w-xl">
            El tipo y a qué aplica solo se pueden cambiar mientras la promoción sea un
            <strong>borrador</strong>. Una vez activa quedan fijos, para que el cálculo de una venta
            ya cobrada nunca cambie: a partir de ahí la salida es duplicarla.
          </p>
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm max-w-xl p-6">
            <span
              class="inline-block text-[10.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded mb-3"
              [class]="typeBadgeClass(form.type)"
              >{{ typeLabel(form.type) }}</span
            >
            <p class="text-base text-gray-800 leading-relaxed">{{ draftSummary() }}</p>
            @if (form.priority > 0) {
              <p class="text-sm text-gray-500 mt-3">
                Prioridad {{ priorityLabel(form.priority) }}: gana frente a otras promociones de
                prioridad menor que apliquen al mismo producto.
              </p>
            }
          </div>

          @if (svc.error()) {
            <div
              class="max-w-xl mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
            >
              {{ svc.error() }}
            </div>
          }

          <div class="flex gap-3 pt-6 flex-wrap">
            <button
              type="button"
              (click)="backToForm()"
              class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              Volver a editar
            </button>
            <button
              type="button"
              (click)="save('draft')"
              [disabled]="svc.isSubmitting()"
              class="px-4 py-2.5 rounded-lg text-sm font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
            >
              Guardar como borrador
            </button>
            <button
              type="button"
              (click)="save('active')"
              [disabled]="svc.isSubmitting()"
              class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {{ svc.isSubmitting() ? 'Creando…' : 'Crear y activar' }}
            </button>
          </div>
        }

        @case ('edit') {
          <button
            type="button"
            (click)="backToList()"
            class="text-sm font-medium text-gray-500 hover:text-gray-800 mb-5"
          >
            ← Volver a promociones
          </button>
          <div class="flex items-center gap-3 mb-6 flex-wrap">
            <h1 class="text-2xl font-bold text-gray-900">
              {{ isReadOnly() ? 'Promoción finalizada' : 'Editar promoción' }}
            </h1>
            <span
              class="text-[10.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
              [class]="statusBadgeClass(editingStatus())"
              >{{ statusLabel(editingStatus()) }}</span
            >
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            <div class="lg:col-span-5 space-y-6">
              @if (isDraft()) {
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
                  <div class="text-sm font-semibold text-indigo-900 mb-1">
                    Es un borrador: todavía puedes cambiarlo todo
                  </div>
                  <p class="text-xs text-indigo-700">
                    El tipo y a qué aplica solo se pueden editar aquí. Al activarla quedan fijos.
                  </p>
                </div>
              } @else {
                <div class="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4">
                  <div class="flex items-center gap-2 mb-2 text-gray-500">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    >
                      <rect x="3" y="11" width="18" height="10" rx="1" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span class="text-xs font-semibold uppercase tracking-wide"
                      >No se puede modificar</span
                    >
                  </div>
                  <div class="text-sm text-gray-900 mb-1">
                    <strong>{{ typeLabel(form.type) }}</strong> · alcance fijo
                  </div>
                  <p class="text-xs text-gray-500 mb-3">
                    Esta promoción ya salió de borrador y pudo explicar el descuento de una venta.
                    Duplícala, edita la copia y finaliza la original.
                  </p>
                  <button
                    type="button"
                    (click)="askDuplicateEditing()"
                    class="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-white"
                  >
                    Duplicar y editar la copia
                  </button>
                </div>
              }

              @if (!isReadOnly()) {
                <ng-container [ngTemplateOutlet]="identityFields" />

                @if (isDraft()) {
                  <div>
                    <label
                      class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                      >Tipo</label
                    >
                    <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                      @for (t of editableTypes; track t) {
                        <button
                          type="button"
                          (click)="switchType(t)"
                          class="px-3.5 py-2 text-sm font-semibold border-l border-gray-200 first:border-l-0 transition-colors"
                          [class]="
                            form.type === t
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          "
                        >
                          {{ typeLabel(t) }}
                        </button>
                      }
                    </div>
                  </div>
                }

                @if (form.type === 'qty_price') {
                  <div class="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                    <p class="text-xs text-indigo-700">
                      El precio y las unidades de este paquete se definen en cada fila de la tabla.
                    </p>
                  </div>
                } @else if (form.type === 'combo') {
                  <div>
                    <label
                      class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                      >Precio del combo</label
                    >
                    <div class="flex items-center gap-2 max-w-50">
                      <span class="text-sm font-semibold text-gray-500">$</span>
                      <app-money-input
                        [ngModel]="form.value"
                        (ngModelChange)="form.value = $event ?? 0"
                        sizeClass="px-3 py-2.5 rounded-lg text-sm"
                      />
                    </div>
                    <p class="text-sm text-gray-600 mt-2">
                      Ahorro para el cliente:
                      <strong
                        [class]="comboSavings() > 0 ? 'text-emerald-600' : 'text-amber-600'"
                        >{{ comboSavingsLabel() }}</strong
                      >
                    </p>
                  </div>
                } @else {
                  <div>
                    <label
                      class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                      >¿Cuánto descuenta?</label
                    >
                    <div class="flex items-center gap-2 max-w-50">
                      @if (form.type === 'percent') {
                        <input
                          [(ngModel)]="form.value"
                          type="number"
                          min="0"
                          max="100"
                          class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      } @else {
                        <app-money-input
                          [ngModel]="form.value"
                          (ngModelChange)="form.value = $event ?? 0"
                          sizeClass="px-3 py-2.5 rounded-lg text-sm"
                        />
                      }
                      <span class="text-sm font-semibold text-gray-600">{{
                        form.type === 'percent' ? '%' : 'pesos'
                      }}</span>
                    </div>
                    @if (form.type === 'percent' && numberValue() > 100) {
                      <p class="text-xs text-red-500 mt-1">
                        Un descuento porcentual no puede superar 100.
                      </p>
                    }
                  </div>
                }

                <ng-container [ngTemplateOutlet]="scheduleFields" />
                <ng-container [ngTemplateOutlet]="priorityFields" />
              } @else {
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <p class="text-base text-gray-800 leading-relaxed">{{ draftSummary() }}</p>
                </div>
              }
            </div>

            <div class="lg:col-span-7 space-y-4">
              @if (isDraft()) {
                @if (form.type === 'combo') {
                  <ng-container [ngTemplateOutlet]="comboItemsFields" />
                } @else {
                  <ng-container [ngTemplateOutlet]="scopeFields" />
                }
              } @else {
                <ng-container [ngTemplateOutlet]="scopeReadonly" />
              }
              <ng-container [ngTemplateOutlet]="overlapsPanel" />
            </div>
          </div>

          <div
            class="sticky bottom-0 -mx-4 md:-mx-6 mt-6 px-4 md:px-6 py-3 bg-gray-50/95 backdrop-blur border-t border-gray-200"
          >
            @if (svc.error()) {
              <div
                class="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
              >
                {{ svc.error() }}
              </div>
            }
            <div class="flex gap-3 pt-2 flex-wrap">
              <button
                type="button"
                (click)="backToList()"
                class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                {{ isReadOnly() ? 'Volver' : 'Cancelar' }}
              </button>
              @if (!isReadOnly()) {
                <button
                  type="button"
                  (click)="saveEdit()"
                  [disabled]="svc.isSubmitting() || !canSaveEdit()"
                  class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
                >
                  {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar cambios' }}
                </button>
              }
              @if (editingPromo(); as promo) {
                @if (primaryAction(promo.status); as action) {
                  <button
                    type="button"
                    (click)="changeStatus(promo, action.to)"
                    [disabled]="svc.isSubmitting()"
                    class="px-4 py-2.5 rounded-lg text-sm font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {{ action.label }}
                  </button>
                }
              }
            </div>
          </div>
        }
      }
    </div>

    <!-- ── Modal de duplicado ────────────────────────────────────────── -->
    @if (duplicating(); as source) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="flex items-start justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 class="text-base font-semibold text-gray-900">Duplicar promoción</h2>
              <p class="text-xs text-gray-500 mt-0.5">
                La copia nace como borrador, con el mismo alcance y componentes.
              </p>
            </div>
            <button
              type="button"
              (click)="closeDuplicate()"
              class="text-gray-400 hover:text-gray-700 px-1"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div class="px-5 py-4">
            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
              >Nombre de la copia</label
            >
            <input
              [ngModel]="duplicateName()"
              (ngModelChange)="duplicateName.set($event)"
              type="text"
              class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p class="text-[11px] text-gray-400 mt-1.5">
              Copiando "{{ source.name }}". El nombre no puede repetirse.
            </p>
            @if (duplicateError(); as err) {
              <p class="text-xs text-red-500 mt-2">{{ err }}</p>
            }
          </div>
          <div class="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
            <button
              type="button"
              (click)="closeDuplicate()"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              (click)="confirmDuplicate()"
              [disabled]="svc.isSubmitting() || !duplicateName().trim()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {{ svc.isSubmitting() ? 'Duplicando…' : 'Duplicar' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Plantillas compartidas ─────────────────────────────────────── -->

    <ng-template #comboItemsFields>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
          >Productos del combo</label
        >
        <input
          [ngModel]="comboSearchQuery()"
          (ngModelChange)="comboSearchQuery.set($event)"
          type="text"
          placeholder="Buscar producto para agregar…"
          class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        @if (comboSearchResults().length > 0) {
          <div
            class="border border-gray-200 rounded-lg mt-2 max-h-52 overflow-y-auto divide-y divide-gray-100"
          >
            @for (opt of comboSearchResults(); track opt.id) {
              <button
                type="button"
                (click)="addComboVariant(opt.id)"
                class="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50"
              >
                <span>{{ opt.label }}</span>
                <span class="text-gray-400 text-xs">{{
                  money(variantPrices().get(opt.id) || 0)
                }}</span>
              </button>
            }
          </div>
        }

        @if (comboItemRows().length > 0) {
          <div class="border border-gray-200 rounded-lg mt-3 divide-y divide-gray-100">
            @for (line of comboItemRows(); track line.variantId) {
              <div class="flex items-center justify-between px-3 py-2.5">
                <div class="text-sm text-gray-800">{{ line.label }}</div>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    (click)="decrementComboQty(line.variantId)"
                    class="w-7 h-7 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    −
                  </button>
                  <span class="w-4 text-center text-sm font-semibold">{{ line.quantity }}</span>
                  <button
                    type="button"
                    (click)="incrementComboQty(line.variantId)"
                    class="w-7 h-7 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    +
                  </button>
                  <span class="w-20 text-right text-sm text-gray-500">{{ line.lineTotal }}</span>
                  <button
                    type="button"
                    (click)="removeComboVariant(line.variantId)"
                    class="text-gray-400 hover:text-red-500 px-1"
                    aria-label="Quitar"
                  >
                    ✕
                  </button>
                </div>
              </div>
            }
          </div>
        }
        @if (touched['comboPrice'] && comboDistinctCount() < 2) {
          <p class="text-xs text-red-500 mt-2">
            Selecciona al menos 2 productos distintos para el combo.
          </p>
        }
      </div>
    </ng-template>

    <ng-template #comboPriceFields>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
          >Precio del combo</label
        >
        <div class="flex items-center gap-2 max-w-[200px]">
          <span class="text-sm font-semibold text-gray-500">$</span>
          <app-money-input
            [ngModel]="form.value"
            (ngModelChange)="form.value = $event ?? 0"
            (blurred)="touch('comboPrice')"
            sizeClass="px-3 py-2.5 rounded-lg text-sm"
          />
        </div>
        <div class="flex gap-6 mt-3 text-sm">
          <div>
            <div class="text-xs text-gray-400">Precio normal</div>
            <div class="font-semibold text-gray-900">{{ money(comboNormalTotal()) }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-400">Ahorro para el cliente</div>
            <div
              class="font-semibold"
              [class]="comboSavings() > 0 ? 'text-emerald-600' : 'text-amber-600'"
            >
              {{ comboSavingsLabel() }}
            </div>
          </div>
        </div>
        @if (numberValue() > 0 && comboSavings() <= 0) {
          <div
            class="mt-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2 inline-block"
          >
            El precio del combo es igual o más caro que comprar por separado. El cliente no ahorra
            nada.
          </div>
        }
      </div>
    </ng-template>
    <ng-template #identityFields>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
            >Nombre</label
          >
          <input
            [(ngModel)]="form.name"
            (blur)="touch('name')"
            type="text"
            maxlength="255"
            placeholder="Ej: 20% en conos los martes"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          @if (touched['name'] && !form.name.trim()) {
            <p class="text-xs text-red-500 mt-1">Ponle un nombre para reconocerla en la lista.</p>
          }
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
            >Descripción (opcional)</label
          >
          <textarea
            [(ngModel)]="form.description"
            rows="2"
            maxlength="2000"
            placeholder="Para qué es esta promoción, o cualquier detalle que el equipo deba saber."
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          ></textarea>
        </div>
      </div>
    </ng-template>

    <ng-template #scopeFields>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
          >¿A qué aplica?</label
        >
        <div class="flex flex-wrap gap-2">
          @if (form.type !== 'qty_price') {
            <button type="button" (click)="setScopeMode('all')" [class]="scopeChipClass('all')">
              Toda la venta
            </button>
          }
          <button type="button" (click)="setScopeMode('pick')" [class]="scopeChipClass('pick')">
            Elegir productos o categorías
          </button>
        </div>

        @if (scopeMode() === 'pick') {
          <div class="mt-3">
            <app-scope-picker
              [categories]="menu.categories()"
              [categoryTargets]="form.categoryTargets"
              [productTargets]="form.productTargets"
              [packPricing]="form.type === 'qty_price'"
              (selectionChange)="onScopeChange($event)"
            />
            <p class="text-[11px] text-gray-400 mt-1.5">
              Marcar una categoría entera incluye también los productos que se creen en ella más
              adelante.
              @if (form.type === 'qty_price') {
                Cada fila necesita sus unidades y su precio; el de un producto gana sobre el de su
                categoría.
              }
            </p>
          </div>
        }
        @if (scopeIncomplete() && (touched['name'] || touched['value'])) {
          <p class="text-xs text-red-500 mt-2">Elige a qué aplica: es el paso que más se olvida.</p>
        }
      </div>
    </ng-template>

    <!--
      Alcance en solo lectura, para una promoción que ya salió de borrador. Antes
      esto era una línea comprimida («Malteadas (categoría) y 3 más») que, en un
      target de categoría, no dejaba ver qué productos entran de verdad — justo
      cuando el alcance ya está congelado y no se puede corregir.
    -->
    <ng-template #scopeReadonly>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
          >Aplica a</label
        >
        @if (form.type === 'combo') {
          <div class="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div class="px-3 py-2 bg-gray-50/70 border-b border-gray-100 text-xs text-gray-500">
              El combo se cobra completo: estos son sus componentes.
            </div>
            <div class="divide-y divide-gray-50">
              @for (line of comboItemRows(); track line.variantId) {
                <div class="flex items-center gap-2.5 px-3 py-2">
                  <span class="text-xs font-semibold text-gray-400 w-6">{{ line.quantity }}×</span>
                  <span class="text-sm text-gray-700 flex-1">{{ line.label }}</span>
                  <span class="text-xs text-gray-400 whitespace-nowrap">{{ line.lineTotal }}</span>
                </div>
              } @empty {
                <div class="px-3 py-8 text-center text-sm text-gray-500">
                  Este combo no tiene componentes configurados.
                </div>
              }
            </div>
          </div>
        } @else {
          <app-scope-picker
            [categories]="menu.categories()"
            [categoryTargets]="form.categoryTargets"
            [productTargets]="form.productTargets"
            [packPricing]="form.type === 'qty_price'"
            [readonly]="true"
          />
        }
      </div>
    </ng-template>

    <ng-template #priorityFields>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
          >Prioridad</label
        >
        <div class="flex flex-wrap gap-2 items-center">
          @for (p of priorityPresets; track p.value) {
            <button
              type="button"
              (click)="form.priority = p.value"
              [class]="pickerChipClass(form.priority === p.value)"
            >
              {{ p.label }}
            </button>
          }
          <span class="text-[11px] text-gray-400">
            Cuando dos promociones aplican al mismo producto, gana la de mayor prioridad.
          </span>
        </div>
      </div>
    </ng-template>

    <ng-template #draftClashPanel>
      @if (draftOverlaps().length > 0) {
        <div class="p-3.5 rounded-lg border border-amber-200 bg-amber-50">
          <div class="flex gap-2.5">
            <span>⚠️</span>
            <div class="text-sm text-amber-800">
              <p class="font-semibold mb-1">
                Esta promoción compite con
                {{
                  draftOverlaps().length === 1 ? 'otra' : draftOverlaps().length + ' promociones'
                }}
              </p>
              <ul class="space-y-0.5">
                @for (o of draftOverlaps(); track o.id) {
                  <li>
                    {{ o.name }} · prioridad {{ priorityLabel(o.priority) }} —
                    {{ verdict(form.priority, o.priority, o.name) }}
                  </li>
                }
              </ul>
              <p class="text-xs mt-1.5">
                No es un error: solo se aplica una por línea. Sube la prioridad si quieres que gane
                esta.
              </p>
            </div>
          </div>
        </div>
      }
    </ng-template>

    <ng-template #overlapsPanel>
      @if (serverOverlaps().length > 0) {
        <div class="p-3.5 rounded-lg border border-amber-200 bg-amber-50">
          <div class="flex gap-2.5">
            <span>⚠️</span>
            <div class="text-sm text-amber-800 w-full">
              <p class="font-semibold mb-1">Compite con otras promociones</p>
              <ul class="space-y-1">
                @for (o of serverOverlaps(); track o.id) {
                  <li class="flex items-center justify-between gap-3 flex-wrap">
                    <span>
                      {{ o.name }} · prioridad {{ priorityLabel(o.priority) }} —
                      {{ verdict(form.priority, o.priority, o.name) }}
                    </span>
                    @if (o.priority >= form.priority) {
                      <button
                        type="button"
                        (click)="raisePriorityAbove(o)"
                        [disabled]="svc.isSubmitting()"
                        class="text-xs font-semibold text-amber-900 underline hover:no-underline disabled:opacity-50"
                      >
                        Ponerla por encima
                      </button>
                    }
                  </li>
                }
              </ul>
              <p class="text-xs mt-1.5">
                Solo se aplica una promoción por línea; el resto no se acumula.
              </p>
            </div>
          </div>
        </div>
      }
    </ng-template>

    <!--
      Barra fija al pie: con dos columnas los botones quedaban al final de la más
      larga y obligaban a bajar para guardar. El scroll lo tiene el main del
      layout, así que sticky bottom-0 se ancla ahí; el fondo opaco repite el
      bg-gray-50 del layout para que el contenido pase por debajo sin verse.
    -->
    <ng-template #wizardActions>
      <div
        class="sticky bottom-0 -mx-4 md:-mx-6 mt-6 px-4 md:px-6 py-3 bg-gray-50/95 backdrop-blur border-t border-gray-200"
      >
        @if (svc.error()) {
          <div
            class="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
          >
            {{ svc.error() }}
          </div>
        }
        <div class="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            (click)="backToType()"
            class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            [disabled]="!canSaveDraft()"
            (click)="goToReview()"
            class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
          >
            Revisar y crear
          </button>
          @if (!canSaveDraft()) {
            <span class="text-xs text-gray-400">{{ blockingHint() }}</span>
          }
        </div>
      </div>
    </ng-template>

    <ng-template #scheduleFields>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
          >¿Cuándo aplica?</label
        >
        <div class="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            (click)="applyDayPreset('all')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300"
          >
            Todos los días
          </button>
          <button
            type="button"
            (click)="applyDayPreset('weekend')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300"
          >
            Fines de semana
          </button>
          <button
            type="button"
            (click)="applyDayPreset('happyhour')"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300"
          >
            Happy hour (5–7 p. m.)
          </button>
        </div>

        <p class="text-xs text-gray-500 mb-1.5">Días de la semana</p>
        <div class="flex flex-wrap gap-1.5 mb-1">
          @for (d of days; track d.idx) {
            <button
              type="button"
              (click)="toggleDay(d.idx)"
              class="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              [class]="
                form.days_of_week.includes(d.idx)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
              "
            >
              {{ d.label }}
            </button>
          }
        </div>
        <p class="text-[11px] text-gray-400 mb-4">Vacío = todos los días</p>

        <p class="text-xs text-gray-500 mb-1.5">Horario (opcional)</p>
        <div class="flex items-center gap-2.5 mb-1">
          <input
            [(ngModel)]="form.start_time"
            type="time"
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm w-32"
          />
          <span class="text-gray-400 text-sm">a</span>
          <input
            [(ngModel)]="form.end_time"
            type="time"
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm w-32"
          />
          @if (form.start_time || form.end_time) {
            <button
              type="button"
              (click)="clearTimeWindow()"
              class="text-xs font-semibold text-gray-400 hover:text-gray-700"
            >
              Quitar horario
            </button>
          }
        </div>
        @if (halfTimeWindow()) {
          <p class="text-xs text-red-500 mb-3">
            Un horario a medias no significa nada: pon la hora de inicio y la de fin, o quita las
            dos.
          </p>
        } @else {
          <p class="text-[11px] text-gray-400 mb-4">
            Vacío = todo el día. Se admite cruzar la medianoche (ej. 10 p. m. a 2 a. m.).
          </p>
        }

        @if (showDateRange()) {
          <p class="text-xs text-gray-500 mb-1.5">Fecha límite (opcional)</p>
          <div class="flex items-center gap-2.5 mb-1">
            <input
              [(ngModel)]="form.starts_at"
              type="date"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <span class="text-gray-400 text-sm">a</span>
            <input
              [(ngModel)]="form.ends_at"
              type="date"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          @if (invalidDateRange()) {
            <p class="text-xs text-red-500 mb-3">
              La fecha de fin no puede ser anterior al inicio.
            </p>
          } @else {
            <p class="text-[11px] text-gray-400 mb-3">Vacío = sin límite de fecha</p>
          }
        } @else {
          <button
            type="button"
            (click)="toggleDateRange()"
            class="text-sm font-medium text-indigo-600 hover:text-indigo-700 mb-3"
          >
            + Agregar fecha de inicio o fin
          </button>
        }

        @if (showAdvanced()) {
          <div class="mt-2 pt-4 border-t border-gray-100">
            <div class="grid grid-cols-2 gap-3 mb-3">
              @if (form.type !== 'qty_price') {
                <div>
                  <label class="block text-xs font-semibold text-gray-500 mb-1"
                    >Cantidad mínima</label
                  >
                  <input
                    [(ngModel)]="form.min_qty"
                    type="number"
                    min="1"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              }
              <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Prioridad exacta (0-1000)</label
                >
                <input
                  [(ngModel)]="form.priority"
                  type="number"
                  min="0"
                  max="1000"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        } @else {
          <button
            type="button"
            (click)="toggleAdvanced()"
            class="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-1"
          >
            + Más opciones (cantidad mínima, prioridad exacta)
          </button>
        }

        <div class="mt-4 text-sm bg-gray-50 rounded-lg px-3 py-2.5 text-gray-700">
          Se aplicará: <strong>{{ vigPreview() }}</strong>
        </div>
      </div>
    </ng-template>
  `,
})
export class PromotionsPageComponent implements OnInit {
  readonly svc = inject(PromotionService);
  readonly categories = inject(CategoryService);
  /** Público: la plantilla se lo pasa a `<app-scope-picker>` como catálogo. */
  readonly menu = inject(MenuService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly screen = signal<Screen>('list');
  readonly editingId = signal<string | null>(null);
  readonly scopeMode = signal<ScopeMode>('all');
  readonly showDateRange = signal(false);
  readonly showAdvanced = signal(false);
  readonly comboSearchQuery = signal('');
  readonly now = signal(new Date());

  /** Eco local del buscador; la consulta al servicio va con debounce. */
  readonly searchSignal = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  /** `overlaps` devuelto por el backend en el último create/update/shape. */
  readonly serverOverlaps = signal<PromotionOverlap[]>([]);

  readonly duplicating = signal<Promotion | null>(null);
  readonly duplicateName = signal('');
  readonly duplicateError = signal<string | null>(null);

  form: PromotionForm = emptyForm();
  touched: Record<string, boolean> = {};

  readonly days = DAY_SHORT.map((label, idx) => ({ label, idx }));
  readonly statusTabs = STATUS_TABS;
  readonly priorityPresets = PRIORITY_PRESETS;
  readonly editableTypes: PromotionType[] = ['percent', 'fixed', 'qty_price', 'combo'];

  /**
   * Catálogo completo desde `GET /menu` (una sola llamada, sin paginar). Antes
   * el selector leía `ProductService.products()`, que es la **página 1** de la
   * pantalla de Productos: con más de 20 productos, los demás simplemente no
   * existían para el buscador ni para resolver el nombre de un target.
   */
  readonly catalogProducts = computed(() =>
    this.menu.categories().flatMap((c) => c.products.map((p) => ({ ...p, categoryId: c.id }))),
  );

  readonly categoryOptions = computed(() => {
    const fromCatalog = this.categories.allCategories();
    if (fromCatalog.length) return fromCatalog;
    return this.menu.categories().map((c) => ({ id: c.id, name: c.name }));
  });

  readonly comboVariantOptions = computed(() =>
    this.menu.categories().flatMap((c) =>
      c.products.flatMap((p) =>
        p.variants.map((v) => ({
          id: v.id,
          label: p.variants.length > 1 ? `${p.name} · ${v.name}` : p.name,
        })),
      ),
    ),
  );

  readonly variantPrices = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const c of this.menu.categories()) {
      for (const p of c.products) {
        for (const v of p.variants) map.set(v.id, v.price);
      }
    }
    return map;
  });

  readonly productPriceMap = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const p of this.catalogProducts()) {
      if (p.variants.length > 0) map.set(p.id, Math.min(...p.variants.map((v) => v.price)));
    }
    return map;
  });

  readonly categoryOfProduct = computed<Map<string, string | null>>(() => {
    const map = new Map<string, string | null>();
    for (const p of this.catalogProducts()) map.set(p.id, p.categoryId);
    return map;
  });

  readonly rows = computed(() => {
    const now = this.now();
    const catMap = this.categoryOfProduct();
    // La tabla muestra solo la página actual, pero el solapamiento se calcula
    // contra `overlapCandidates` (todas) — si comparara solo contra la página
    // actual, una promo en otra página dejaría de detectarse como solapada.
    const promos = this.svc.promotions();
    const candidates = this.svc.overlapCandidates();
    return promos.map((p) => ({
      promo: p,
      display: getPromoDisplay(p, now),
      overlap:
        p.type === 'combo' || p.status === 'finished'
          ? null
          : (findOverlaps(
              { ...p, scope: scopeOf(p) },
              candidates.filter((x) => x.id !== p.id),
              catMap,
            )[0] ?? null),
    }));
  });

  readonly showPriorityColumn = computed(() => this.rows().some((r) => r.promo.priority > 0));

  /**
   * La promoción abierta, preferentemente la copia fresca de las listas. El
   * `editingSource` es el respaldo para el instante posterior a crear o
   * duplicar: ahí la promoción existe en el servidor pero el refetch de las
   * listas todavía no llegó, y sin respaldo `editingStatus()` caería a 'draft'
   * y ofrecería editar la forma de una promoción que quizá nació activa.
   */
  readonly editingSource = signal<Promotion | null>(null);
  readonly editingPromo = computed(
    () =>
      this.svc.overlapCandidates().find((p) => p.id === this.editingId()) ??
      this.svc.promotions().find((p) => p.id === this.editingId()) ??
      this.editingSource(),
  );

  readonly editingStatus = computed<PromotionStatus>(() => this.editingPromo()?.status ?? 'draft');
  readonly isDraft = computed(() => this.editingStatus() === 'draft');
  readonly isReadOnly = computed(() => this.editingStatus() === 'finished');

  constructor() {
    const intervalId = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(intervalId);
      if (this.searchDebounce) clearTimeout(this.searchDebounce);
    });
  }

  ngOnInit(): void {
    this.svc.load();
    this.svc.loadOverlapCandidates();
    if (this.categories.allCategories().length === 0) this.categories.loadAllCategories();
    if (this.menu.categories().length === 0) this.menu.loadMenu();
  }

  // ── Filtros de la lista ──────────────────────────────────────────────

  selectTab(status: StatusTab): void {
    this.svc.setStatusFilter(status);
  }

  onSearchChange(value: string): void {
    this.searchSignal.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.svc.setSearch(value), 300);
  }

  isFiltered(): boolean {
    return !!this.svc.statusFilter() || !!this.svc.search().trim();
  }

  clearFilters(): void {
    this.searchSignal.set('');
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.svc.search.set('');
    this.svc.setStatusFilter('');
  }

  emptyTitle(): string {
    if (this.svc.search().trim()) return 'Ningún resultado';
    switch (this.svc.statusFilter()) {
      case 'draft':
        return 'No hay borradores';
      case 'active':
        return 'No hay promociones activas';
      case 'paused':
        return 'No hay promociones en pausa';
      case 'finished':
        return 'No hay promociones finalizadas';
      default:
        return 'Todavía no tienes promociones';
    }
  }

  emptyMessage(): string {
    if (this.isFiltered())
      return 'Prueba con otro término de búsqueda o quita el filtro de estado.';
    return 'Crea un descuento que se aplique solo, un paquete a precio cerrado, o un combo que el cajero elija al vender.';
  }

  // ── Navegación del asistente ─────────────────────────────────────────

  openNew(): void {
    this.resetForm(emptyForm());
    this.screen.set('type');
  }

  chooseKind(kind: 'discount' | 'pack'): void {
    // if (kind === 'combo') {
    //   this.form.type = 'combo';
    //   this.form.min_qty = 1;
    // } else

    if (kind === 'pack') {
      this.form.type = 'qty_price';
      // Un paquete no puede aplicar a "toda la venta": el precio vive en cada fila.
      this.scopeMode.set('pick');
      // El backend exige `min_qty >= 2` para `qty_price`: un paquete de 1 es un
      // precio, no una promoción.
      if (this.form.min_qty < 2) this.form.min_qty = 2;
    } else {
      this.form.type = 'percent';
      this.form.min_qty = 1;
    }
    this.screen.set(kind);
  }

  backToType(): void {
    this.screen.set('type');
  }

  backToForm(): void {
    this.screen.set(this.formScreen());
  }

  backToList(): void {
    this.serverOverlaps.set([]);
    this.svc.otherError.set(null);
    this.screen.set('list');
  }

  private formScreen(): Screen {
    if (this.form.type === 'combo') return 'combo';
    if (this.form.type === 'qty_price') return 'pack';
    return 'discount';
  }

  goToReview(): void {
    if (this.canSaveDraft()) this.screen.set('review');
  }

  openEdit(p: Promotion): void {
    this.resetForm(this.formFromPromotion(p));
    this.editingId.set(p.id);
    this.editingSource.set(p);
    this.scopeMode.set(this.scopeModeFromForm(this.form));
    this.showDateRange.set(!!(this.form.starts_at || this.form.ends_at));
    this.showAdvanced.set(this.form.min_qty > 1);
    this.screen.set('edit');
  }

  private resetForm(form: PromotionForm): void {
    this.form = form;
    this.touched = {};
    this.editingId.set(null);
    this.editingSource.set(null);
    this.scopeMode.set('all');
    this.showDateRange.set(false);
    this.showAdvanced.set(false);
    this.comboSearchQuery.set('');
    this.serverOverlaps.set([]);
    this.svc.otherError.set(null);
  }

  private formFromPromotion(p: Promotion): PromotionForm {
    return {
      name: p.name,
      description: p.description ?? '',
      type: p.type,
      value: Number(p.value),
      priority: p.priority,
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      min_qty: p.min_qty,
      categoryTargets: p.targets
        .filter((t) => t.category_id)
        .map((t) => ({
          id: t.category_id as string,
          value: t.value == null ? null : Number(t.value),
          min_qty: t.min_qty,
        })),
      productTargets: p.targets
        .filter((t) => t.product_id)
        .map((t) => ({
          id: t.product_id as string,
          value: t.value == null ? null : Number(t.value),
          min_qty: t.min_qty,
        })),
      comboItems: p.combo_items.map((c) => ({ ...c })),
    };
  }

  private scopeModeFromForm(form: PromotionForm): ScopeMode {
    return form.categoryTargets.length || form.productTargets.length ? 'pick' : 'all';
  }

  /** Cambio de tipo en un borrador: normaliza los campos que dependen del tipo. */
  switchType(type: PromotionType): void {
    this.form.type = type;
    if (type === 'qty_price') {
      if (this.form.min_qty < 2) this.form.min_qty = 2;
      this.scopeMode.set('pick');
    }
    if (type === 'combo') {
      this.form.categoryTargets = [];
      this.form.productTargets = [];
      this.scopeMode.set('all');
    } else {
      this.form.comboItems = [];
    }
    if (type === 'percent' && this.form.value > 100) this.form.value = 0;
  }

  // ── Validación ───────────────────────────────────────────────────────

  touch(field: string): void {
    this.touched[field] = true;
  }

  numberValue(): number {
    return Number(this.form.value) || 0;
  }

  /** Destinos del alcance sin precio, que es lo que bloquea guardar un paquete. */
  targetsSinPrecio(): number {
    if (this.form.type !== 'qty_price') return 0;
    return [...this.form.categoryTargets, ...this.form.productTargets].filter(
      (t) => t.value == null || t.min_qty == null,
    ).length;
  }

  /** Un horario a medias es 422 en el backend; se bloquea antes de enviarlo. */
  halfTimeWindow(): boolean {
    return !!this.form.start_time !== !!this.form.end_time;
  }

  invalidDateRange(): boolean {
    return !!(this.form.starts_at && this.form.ends_at && this.form.ends_at < this.form.starts_at);
  }

  scopeIncomplete(): boolean {
    if (this.form.type === 'combo') return false;
    // Un paquete no tiene precio propio, así que siempre necesita destinos —y
    // con precio—, aunque el modo diga otra cosa.
    if (this.scopeMode() === 'all') return this.form.type === 'qty_price';
    // En `pick` basta con una de las dos: el alcance puede ser solo categorías,
    // solo productos, o una mezcla de ambos.
    if (this.form.categoryTargets.length === 0 && this.form.productTargets.length === 0)
      return true;
    return this.targetsSinPrecio() > 0;
  }

  canSaveDraft(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.halfTimeWindow() || this.invalidDateRange()) return false;
    if (this.form.type === 'combo') return this.comboDistinctCount() >= 2 && this.numberValue() > 0;
    // En un paquete el precio está en cada fila; `form.value` es inerte.
    if (this.form.type !== 'qty_price') {
      if (this.numberValue() <= 0) return false;
      if (this.form.type === 'percent' && this.numberValue() > 100) return false;
    }
    return !this.scopeIncomplete();
  }

  /**
   * Por qué está bloqueado el guardado. Con la barra de acciones fija, el botón
   * deshabilitado se ve siempre pero el campo que falta puede estar fuera de
   * pantalla — sin esta pista el usuario no sabe adónde ir.
   */
  blockingHint(): string {
    if (!this.form.name.trim()) return 'Falta el nombre';
    if (this.form.type === 'combo' && this.comboDistinctCount() < 2)
      return 'Elige al menos 2 productos para el combo';
    if (this.form.type === 'qty_price') {
      if (!this.form.categoryTargets.length && !this.form.productTargets.length)
        return 'Elige a qué productos aplica el paquete';
      const faltan = this.targetsSinPrecio();
      if (faltan) return `Falta el precio de ${faltan} ${faltan === 1 ? 'fila' : 'filas'}`;
    } else {
      if (this.numberValue() <= 0)
        return this.form.type === 'percent' ? 'Falta el porcentaje' : 'Falta el precio';
      if (this.form.type === 'percent' && this.numberValue() > 100)
        return 'El porcentaje no puede superar 100';
    }
    if (this.scopeIncomplete()) return 'Falta elegir a qué aplica';
    if (this.halfTimeWindow()) return 'El horario necesita hora de inicio y de fin';
    if (this.invalidDateRange()) return 'La fecha de fin es anterior al inicio';
    return '';
  }

  canSaveEdit(): boolean {
    return this.canSaveDraft();
  }

  // ── Alcance ──────────────────────────────────────────────────────────

  scopeChipClass(mode: ScopeMode): string {
    const base = 'px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors';
    return this.scopeMode() === mode
      ? `${base} bg-indigo-600 text-white border-indigo-600`
      : `${base} bg-white text-gray-600 border-gray-200 hover:border-indigo-300`;
  }

  pickerChipClass(active: boolean): string {
    const base = 'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors';
    return active
      ? `${base} bg-indigo-600 text-white border-indigo-600`
      : `${base} bg-white text-gray-600 border-gray-200 hover:border-indigo-300`;
  }

  setScopeMode(mode: ScopeMode): void {
    this.scopeMode.set(mode);
    // "Toda la venta" es `targets: []`; volver a él limpia la selección.
    if (mode === 'all') {
      this.form.categoryTargets = [];
      this.form.productTargets = [];
    }
  }

  onScopeChange(selection: ScopeSelection): void {
    this.form.categoryTargets = selection.categories;
    this.form.productTargets = selection.products;
  }

  /**
   * `/menu` solo trae el catálogo publicado, así que un target que apunte a un
   * producto desactivado no aparece. Decirlo es más útil que un guion.
   */
  productName(id: string): string {
    return this.catalogProducts().find((p) => p.id === id)?.name ?? 'Producto no disponible';
  }

  /**
   * Producto representativo del alcance, para las vistas previas del descuento
   * y del paquete. Prefiere un producto marcado a dedo, luego uno de la primera
   * categoría marcada, y como último recurso el primero del catálogo.
   */
  private sampleProduct(): { id: string; name: string } | null {
    const catalog = this.catalogProducts();
    if (this.form.productTargets.length) {
      const elegido = catalog.find((p) => p.id === this.form.productTargets[0].id);
      if (elegido) return elegido;
    }
    if (this.form.categoryTargets.length) {
      const deCategoria = catalog.find((p) => p.categoryId === this.form.categoryTargets[0].id);
      if (deCategoria) return deCategoria;
    }
    return catalog[0] ?? null;
  }

  discountExample(): { name: string; before: string; after: string } | null {
    const val = this.numberValue();
    if (val <= 0) return null;
    const product = this.sampleProduct();
    if (!product) return null;
    const price = this.productPriceMap().get(product.id);
    if (price == null) return null;
    const after = this.form.type === 'percent' ? price * (1 - val / 100) : Math.max(0, price - val);
    return { name: product.name, before: this.money(price), after: this.money(after) };
  }

  /**
   * Vista previa sobre un producto del alcance, con **su** paquete: si el
   * producto de muestra tiene precio propio, el ejemplo tiene que enseñar ese y
   * no el defecto, o contradice lo que se acaba de escribir en su fila.
   */
  packExample(): { line: string; normal: number; savings: number; propio: boolean } | null {
    const product = this.sampleProduct();
    const propio = product ? this.form.productTargets.find((t) => t.id === product.id) : undefined;
    const deCategoria = product
      ? this.form.categoryTargets.find((t) => t.id === this.categoryOfProduct().get(product.id))
      : undefined;
    const fuente = propio && hasOwnPricing(propio) ? propio : deCategoria;

    // Sin términos en el destino no hay nada que previsualizar: la promoción ya
    // no tiene un paquete propio del que tirar.
    const units = Number(fuente?.min_qty) || 0;
    const val = Number(fuente?.value) || 0;
    if (val <= 0 || units < 2) return null;

    const tieneOverride = !!(fuente && hasOwnPricing(fuente));
    const price = product ? this.productPriceMap().get(product.id) : null;
    const label = product?.name ?? 'unidades';
    if (price == null) {
      return {
        line: `${units} ${label} por ${this.money(val)}`,
        normal: 0,
        savings: 0,
        propio: tieneOverride,
      };
    }
    const normal = price * units;
    return {
      line: `${units} × ${label} por ${this.money(val)}`,
      normal,
      savings: normal - val,
      propio: tieneOverride,
    };
  }

  /** Aviso de solapamiento mientras se redacta, con las mismas reglas del backend. */
  draftOverlaps(): Promotion[] {
    if (this.form.type === 'combo') return [];
    if (this.scopeIncomplete()) return [];
    const scope: PromoScope = {
      all: this.scopeMode() === 'all',
      categoryIds: new Set(this.form.categoryTargets.map((t) => t.id)),
      productIds: new Set(this.form.productTargets.map((t) => t.id)),
    };
    const candidates = this.svc.overlapCandidates().filter((p) => p.id !== this.editingId());
    return findOverlaps(
      {
        scope,
        starts_at: this.form.starts_at,
        ends_at: this.form.ends_at,
        days_of_week: this.form.days_of_week.join(',') || null,
        start_time: this.form.start_time,
        end_time: this.form.end_time,
      },
      candidates,
      this.categoryOfProduct(),
    ).slice(0, 4);
  }

  /** Quién gana cuando dos promociones aplican a la misma línea. */
  verdict(mine: number, theirs: number, theirName: string): string {
    if (mine > theirs) return 'Gana esta.';
    if (mine < theirs) return `Gana "${theirName}".`;
    return 'Misma prioridad: gana la de mayor descuento.';
  }

  /** Sube la prioridad por encima de la rival y guarda el cambio. */
  async raisePriorityAbove(rival: PromotionOverlap): Promise<void> {
    const id = this.editingId();
    this.form.priority = Math.min(1000, rival.priority + 10);
    if (!id) return;
    const updated = await this.svc.update(id, this.form);
    if (updated) {
      this.serverOverlaps.set(updated.overlaps ?? []);
      this.toast.success(`Prioridad ajustada a ${this.form.priority}`);
    } else {
      this.toast.error(this.svc.error() ?? 'No se pudo actualizar la prioridad');
    }
  }

  // ── Combo ────────────────────────────────────────────────────────────

  comboSearchResults(): { id: string; label: string }[] {
    const q = this.comboSearchQuery().trim().toLowerCase();
    if (!q) return [];
    return this.comboVariantOptions()
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 8);
  }

  addComboVariant(variantId: string): void {
    const existing = this.form.comboItems.find((it) => it.product_variant_id === variantId);
    if (existing) {
      this.form.comboItems = this.form.comboItems.map((it) =>
        it.product_variant_id === variantId ? { ...it, quantity: it.quantity + 1 } : it,
      );
    } else {
      this.form.comboItems = [
        ...this.form.comboItems,
        { product_variant_id: variantId, quantity: 1 },
      ];
    }
    this.comboSearchQuery.set('');
  }

  incrementComboQty(variantId: string): void {
    this.form.comboItems = this.form.comboItems.map((it) =>
      it.product_variant_id === variantId ? { ...it, quantity: it.quantity + 1 } : it,
    );
  }

  decrementComboQty(variantId: string): void {
    this.form.comboItems = this.form.comboItems.map((it) =>
      it.product_variant_id === variantId && it.quantity > 1
        ? { ...it, quantity: it.quantity - 1 }
        : it,
    );
  }

  removeComboVariant(variantId: string): void {
    this.form.comboItems = this.form.comboItems.filter((it) => it.product_variant_id !== variantId);
  }

  comboItemRows(): { variantId: string; label: string; quantity: number; lineTotal: string }[] {
    return this.form.comboItems.map((it) => {
      const label =
        this.comboVariantOptions().find((o) => o.id === it.product_variant_id)?.label ?? '—';
      const price = this.variantPrices().get(it.product_variant_id) ?? 0;
      return {
        variantId: it.product_variant_id,
        label,
        quantity: it.quantity,
        lineTotal: this.money(price * it.quantity),
      };
    });
  }

  comboDistinctCount(): number {
    return new Set(this.form.comboItems.map((it) => it.product_variant_id)).size;
  }

  comboNormalTotal(): number {
    return this.form.comboItems.reduce(
      (sum, it) => sum + (this.variantPrices().get(it.product_variant_id) ?? 0) * it.quantity,
      0,
    );
  }

  comboSavings(): number {
    return this.comboNormalTotal() - this.numberValue();
  }

  comboSavingsLabel(): string {
    const s = this.comboSavings();
    if (s > 0) return this.money(s);
    if (s === 0) return 'Sin ahorro';
    return `${this.money(Math.abs(s))} más caro`;
  }

  // ── Horario / vigencia ───────────────────────────────────────────────

  applyDayPreset(preset: 'all' | 'weekend' | 'happyhour'): void {
    if (preset === 'all') {
      this.form.days_of_week = [];
      this.form.start_time = null;
      this.form.end_time = null;
    } else if (preset === 'weekend') {
      this.form.days_of_week = [5, 6];
    } else if (preset === 'happyhour') {
      this.form.start_time = '17:00';
      this.form.end_time = '19:00';
    }
  }

  toggleDay(idx: number): void {
    const set = new Set(this.form.days_of_week);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    this.form.days_of_week = [...set].sort((a, b) => a - b);
  }

  clearTimeWindow(): void {
    this.form.start_time = null;
    this.form.end_time = null;
  }

  toggleDateRange(): void {
    const next = !this.showDateRange();
    this.showDateRange.set(next);
    if (!next) {
      this.form.starts_at = null;
      this.form.ends_at = null;
    }
  }

  toggleAdvanced(): void {
    this.showAdvanced.update((v) => !v);
  }

  vigPreview(): string {
    return vigPhrase(this.form);
  }

  vigencia(p: Promotion): string {
    return vigPhrase({
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      start_time: p.start_time,
      end_time: p.end_time,
      starts_at: p.starts_at,
      ends_at: p.ends_at,
    });
  }

  // ── Etiquetas ────────────────────────────────────────────────────────

  typeLabel(type: PromotionType): string {
    switch (type) {
      case 'combo':
        return 'Combo';
      case 'qty_price':
        return 'Paquete';
      case 'fixed':
        return 'Monto fijo';
      default:
        return 'Porcentaje';
    }
  }

  typeBadgeClass(type: PromotionType): string {
    if (type === 'combo') return 'bg-gray-100 text-gray-600';
    if (type === 'qty_price') return 'bg-violet-50 text-violet-700';
    return 'bg-indigo-50 text-indigo-700';
  }

  benefitLabel(p: Promotion): string {
    const value = Number(p.value);
    switch (p.type) {
      case 'percent':
        return `${value}%`;
      case 'fixed':
        return `${this.money(value)} menos`;
      case 'qty_price': {
        // El precio vive en los destinos: si todos coinciden se muestra, y si
        // no, decirlo — «2 por $ 0» sería el valor inerte de la promoción.
        const terms = p.targets.map((t) => `${t.min_qty}|${t.value}`);
        if (terms.length && new Set(terms).size === 1 && p.targets[0].min_qty != null) {
          return `${p.targets[0].min_qty} por ${this.money(Number(p.targets[0].value))}`;
        }
        return `Precio por producto (${terms.length})`;
      }
      default:
        return `${this.money(value)} el combo`;
    }
  }

  priorityLabel(priority: number): string {
    const preset = PRIORITY_PRESETS.find((p) => p.value === priority);
    return preset ? `${preset.label} (${priority})` : String(priority);
  }

  statusLabel(status: PromotionStatus): string {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'active':
        return 'Activa';
      case 'paused':
        return 'En pausa';
      default:
        return 'Finalizada';
    }
  }

  statusBadgeClass(status: PromotionStatus): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-600';
      case 'active':
        return 'bg-emerald-50 text-emerald-700';
      case 'paused':
        return 'bg-amber-50 text-amber-700';
      default:
        return 'bg-slate-100 text-slate-500';
    }
  }

  displayLabel(display: PromoDisplay): string {
    switch (display) {
      case 'draft':
        return 'Borrador';
      case 'live':
        return 'Activa';
      case 'out_of_window':
        return 'Activa';
      case 'scheduled':
        return 'Activa';
      case 'expired':
        return 'Activa';
      case 'paused':
        return 'En pausa';
      default:
        return 'Finalizada';
    }
  }

  /**
   * El sub-texto es la diferencia entre `status` (lo que el backend guarda) y
   * si de verdad está descontando ahora mismo. Sin él, "Activa" y "no aplica"
   * conviven sin explicación.
   */
  displayDetail(p: Promotion, display: PromoDisplay): string {
    switch (display) {
      case 'draft':
        return 'Sin publicar: no aplica en la venta';
      case 'live':
        return 'Aplicando ahora';
      case 'out_of_window':
        return 'Fuera de su horario o días';
      case 'scheduled':
        return p.starts_at ? `Empieza el ${fmtDate(p.starts_at)}` : 'Programada';
      case 'expired':
        return p.ends_at ? `Venció el ${fmtDate(p.ends_at)}` : 'Vencida';
      case 'paused':
        return 'Pausada por el equipo';
      default:
        return 'Cerrada, se conserva el historial';
    }
  }

  dotClass(display: PromoDisplay): string {
    switch (display) {
      case 'live':
        return 'bg-emerald-500';
      case 'out_of_window':
        return 'bg-white border-2 border-emerald-400';
      case 'paused':
        return 'bg-white border-2 border-amber-500';
      case 'scheduled':
        return 'bg-white border-2 border-dashed border-indigo-400';
      case 'draft':
        return 'bg-white border-2 border-gray-300';
      default:
        return 'bg-gray-300';
    }
  }

  textClass(display: PromoDisplay): string {
    switch (display) {
      case 'live':
      case 'out_of_window':
        return 'text-emerald-700';
      case 'paused':
        return 'text-amber-700';
      case 'scheduled':
        return 'text-indigo-600';
      case 'draft':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  }

  scopePhrase(p: Promotion): string {
    if (p.type === 'combo') {
      return p.combo_items
        .map((it) => {
          const label =
            this.comboVariantOptions().find((o) => o.id === it.product_variant_id)?.label ?? '—';
          return it.quantity > 1 ? `${it.quantity}x ${label}` : label;
        })
        .join(' + ');
    }
    if (p.targets.length === 0) return 'Toda la venta';
    // Una promoción puede mezclar categorías y productos, y «Malteadas» junto a
    // «Malteada de fresa» se leen igual: sin la marca no se sabe si la fila
    // cubre una categoría entera o un solo producto.
    const names = p.targets.map((t) => {
      if (t.category_id) {
        const name = this.categoryOptions().find((c) => c.id === t.category_id)?.name ?? '—';
        return `${name} (categoría)`;
      }
      return this.productName(t.product_id as string);
    });
    return names.length <= 2 ? names.join(' y ') : `${names[0]} y ${names.length - 1} más`;
  }

  draftSummary(): string {
    const val = this.numberValue();
    if (this.form.type === 'combo') {
      const itemsTxt = this.form.comboItems
        .map((it) => {
          const label =
            this.comboVariantOptions().find((o) => o.id === it.product_variant_id)?.label ?? '—';
          return (it.quantity > 1 ? `${it.quantity}x ` : '') + label;
        })
        .join(' + ');
      return `${itemsTxt} por ${this.money(val)}, ${vigPhrase(this.form).toLowerCase()}.`;
    }

    const scopeSentence = this.draftScopeSentence();
    const sentence =
      this.form.type === 'qty_price'
        ? `Paquetes de ${scopeSentence}, con su precio por producto, ${vigPhrase(this.form)}.`
        : `${this.form.type === 'percent' ? `${val}%` : `${this.money(val)} de descuento fijo`} en ${scopeSentence}, ${vigPhrase(this.form)}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  /**
   * El alcance en palabras. Ahora puede ser mixto —categorías **y** productos a
   * la vez—, así que se redactan las dos mitades y se unen.
   */
  private draftScopeSentence(): string {
    if (this.scopeMode() === 'all') return 'toda la venta';

    const partes: string[] = [];
    if (this.form.categoryTargets.length) {
      const names = this.form.categoryTargets.map(
        (t) => this.categoryOptions().find((c) => c.id === t.id)?.name ?? '—',
      );
      partes.push((names.length > 1 ? 'las categorías ' : 'la categoría ') + joinList(names));
    }
    if (this.form.productTargets.length) {
      const names = this.form.productTargets.map((t) => this.productName(t.id));
      partes.push((names.length > 1 ? 'los productos ' : 'el producto ') + joinList(names));
    }
    return partes.length ? partes.join(' y ') : 'toda la venta';
  }

  money(n: number): string {
    return formatMoney(n);
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────

  /** Solo las transiciones que el backend acepta; nunca un botón que dé 409. */
  can(from: PromotionStatus, to: PromotionStatus): boolean {
    return PROMOTION_TRANSITIONS[from].includes(to);
  }

  primaryAction(status: PromotionStatus): { to: PromotionStatus; label: string } | null {
    switch (status) {
      case 'draft':
        return { to: 'active', label: 'Activar' };
      case 'active':
        return { to: 'paused', label: 'Pausar' };
      case 'paused':
        return { to: 'active', label: 'Reanudar' };
      default:
        return null;
    }
  }

  async changeStatus(promo: Promotion, to: PromotionStatus): Promise<void> {
    if (to === 'finished') {
      const ok = await this.confirm.ask({
        title: 'Finalizar promoción',
        message: `"${promo.name}" dejará de aplicarse y no se podrá reactivar: finalizar es definitivo. Se conserva en el historial y siempre puedes duplicarla para relanzarla.`,
        confirmText: 'Finalizar',
      });
      if (!ok) return;
    }
    const updated = await this.svc.changeStatus(promo.id, to);
    if (!updated) {
      this.toast.error(this.svc.error() ?? 'No se pudo cambiar el estado');
      return;
    }
    const messages: Record<PromotionStatus, string> = {
      active: promo.status === 'paused' ? 'Promoción reanudada' : 'Promoción activada',
      paused: 'Promoción pausada',
      finished: 'Promoción finalizada',
      draft: 'Promoción en borrador',
    };
    this.toast.success(messages[to]);
    if (this.screen() === 'edit') this.backToList();
  }

  // ── Guardado ─────────────────────────────────────────────────────────

  async save(status: 'draft' | 'active'): Promise<void> {
    const created = await this.svc.create(this.form, status);
    if (!created) {
      this.toast.error(this.svc.error() ?? 'No se pudo guardar');
      return;
    }
    this.toast.success(status === 'active' ? 'Promoción creada y activada' : 'Borrador guardado');
    if (created.overlaps?.length) {
      // Abrir la recién creada en edición es lo que deja el panel de
      // solapamientos a la vista, con el atajo para subir la prioridad.
      this.openEdit(created);
      this.serverOverlaps.set(created.overlaps);
    } else {
      this.backToList();
    }
  }

  /**
   * Editar un borrador puede tocar la forma; editar cualquier otra cosa no.
   * Los escalares van siempre por `PATCH /{id}`; el tipo, el alcance y los
   * componentes solo por `PATCH /{id}/shape` y solo mientras sea borrador.
   */
  async saveEdit(): Promise<void> {
    const id = this.editingId();
    const original = this.editingPromo();
    if (!id) return;

    const updated = await this.svc.update(id, this.form);
    if (!updated) {
      this.toast.error(this.svc.error() ?? 'No se pudo guardar');
      return;
    }

    let result = updated;
    if (original && this.isDraft() && this.shapeChanged(original)) {
      const shaped = await this.svc.updateShape(id, this.form);
      if (!shaped) {
        this.toast.error(this.svc.error() ?? 'No se pudo cambiar el tipo o el alcance');
        return;
      }
      result = shaped;
    }

    this.toast.success('Promoción actualizada');
    if (result.overlaps?.length) this.serverOverlaps.set(result.overlaps);
    else this.backToList();
  }

  private shapeChanged(original: Promotion): boolean {
    if (original.type !== this.form.type) return true;
    const before = this.formFromPromotion(original);
    const same = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
    if (!same(targetKeys(before.categoryTargets), targetKeys(this.form.categoryTargets)))
      return true;
    if (!same(targetKeys(before.productTargets), targetKeys(this.form.productTargets))) return true;
    const key = (items: { product_variant_id: string; quantity: number }[]) =>
      items
        .map((i) => `${i.product_variant_id}:${i.quantity}`)
        .sort()
        .join('|');
    return key(before.comboItems) !== key(this.form.comboItems);
  }

  // ── Duplicar ─────────────────────────────────────────────────────────

  askDuplicate(promo: Promotion): void {
    this.duplicating.set(promo);
    this.duplicateName.set(`${promo.name} (copia)`);
    this.duplicateError.set(null);
  }

  askDuplicateEditing(): void {
    const promo = this.editingPromo();
    if (promo) this.askDuplicate(promo);
  }

  closeDuplicate(): void {
    this.duplicating.set(null);
    this.duplicateError.set(null);
  }

  async confirmDuplicate(): Promise<void> {
    const source = this.duplicating();
    const name = this.duplicateName().trim();
    if (!source || !name) return;
    this.duplicateError.set(null);
    const copy = await this.svc.duplicate(source.id, name);
    if (!copy) {
      this.duplicateError.set(this.svc.error() ?? 'No se pudo duplicar');
      return;
    }
    this.closeDuplicate();
    this.toast.success('Copia creada como borrador');
    this.openEdit(copy);
  }

  // ── Eliminar ─────────────────────────────────────────────────────────

  async remove(p: Promotion): Promise<void> {
    const live = p.status === 'active' || p.status === 'paused';
    const ok = await this.confirm.ask({
      title: 'Eliminar promoción',
      message: live
        ? `"${p.name}" está ${p.status === 'active' ? 'activa' : 'en pausa'}. Eliminarla la borra junto con su alcance y sus componentes, sin dejar rastro. Si solo quieres que deje de aplicarse, usa Finalizar: conserva el historial.`
        : `¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    const done = await this.svc.remove(p.id);
    if (done) {
      this.toast.success('Promoción eliminada');
      if (this.screen() === 'edit') this.backToList();
    } else {
      this.toast.error(this.svc.error() ?? 'No se pudo eliminar');
    }
  }
}
