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
  PromotionRuleForm,
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

/** spec 063 (revisión 2026-09-01): filtro de ayuda para poblar el selector de
 *  **una** regla (FR-004) — nunca se guarda, solo puebla el checkbox list. */
interface RuleFilter {
  category: string;
  text: string;
}

function emptyRule(): PromotionRuleForm {
  return { type: 'percent', value: 0, min_qty: 1, variantIds: [] };
}

function emptyForm(): PromotionForm {
  return {
    name: '',
    description: '',
    starts_at: null,
    ends_at: null,
    days_of_week: [],
    start_time: null,
    end_time: null,
    rules: [emptyRule()],
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
                  <li>{{ p.name }} <span class="text-amber-500">({{ typeLabel(p.rules[0]?.type ?? '') }})</span></li>
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
                Descuento por porcentaje o precio de paquete sobre uno o varios conjuntos de variantes
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
                      <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Reglas</th>
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
                          @if (p.description) {
                            <div class="text-[11.5px] text-gray-400 mt-1 max-w-[220px]">{{ p.description }}</div>
                          }
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-600 max-w-[300px]">
                          <ul class="space-y-1.5">
                            @for (r of p.rules; track r.id) {
                              <li>
                                <span
                                  class="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 mr-1"
                                  >{{ typeLabel(r.type) }}</span
                                >
                                {{ r.condition_text || '—' }}
                                <span class="text-[11px] text-gray-400">({{ r.variants.length }} var.)</span>
                              </li>
                            } @empty {
                              <li class="text-gray-400">Sin reglas</li>
                            }
                          </ul>
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
          <div class="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
            <div class="flex items-center gap-3">
              <button type="button" (click)="backToList()" class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                Volver
              </button>
              <span class="text-gray-200">|</span>
              <h1 class="text-lg font-bold text-gray-900">{{ editingId() ? 'Editar promoción' : 'Nueva promoción' }}</h1>
            </div>
            <button type="button" class="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-600" title="Ayuda">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
          </div>

          @if (isReadOnly()) {
            <p class="text-sm text-amber-600 mb-4">Esta promoción está finalizada — solo lectura.</p>
          } @else if (!isDraft()) {
            <p class="text-sm text-gray-500 mb-4">
              En una promoción activa solo puedes editar nombre, descripción, vigencia y horario —
              afecta a todas sus reglas de una vez. Para cambiar el tipo, el valor, la cantidad o el
              conjunto de una regla, o agregar/quitar reglas, duplícala.
            </p>
          }

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
            <h2 class="text-base font-semibold text-gray-900 pb-3 mb-4 border-b border-gray-100">Información general</h2>
            <div class="space-y-4">
              <label class="block">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</span>
                <input [(ngModel)]="form.name" [disabled]="isReadOnly()" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label class="block">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</span>
                <textarea [(ngModel)]="form.description" [disabled]="isReadOnly()" rows="2" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"></textarea>
              </label>

              <div class="border-t border-gray-100 pt-4">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vigencia (aplica a todas las reglas)</span>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  @for (d of days; track d.idx) {
                    <button
                      type="button"
                      [disabled]="isReadOnly()"
                      (click)="toggleDay(d.idx)"
                      class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                      [class]="form.days_of_week.includes(d.idx) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'"
                    >
                      {{ d.label }}
                    </button>
                  }
                </div>
                <div class="mt-3 grid grid-cols-2 gap-4">
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
          </div>

          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2">
                Reglas
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">{{ form.rules.length }}</span>
              </h2>
              @if (canEditShape()) {
                <button
                  type="button"
                  (click)="addRule()"
                  class="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  + Agregar regla
                </button>
              }
            </div>

            @if (sharedVariantConflict(); as sc) {
              <div class="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                La variante <strong>{{ sc.variantLabel }}</strong> está en la regla {{ sc.a + 1 }} y en la
                regla {{ sc.b + 1 }} — cada variante solo puede pertenecer a una regla de esta promoción.
              </div>
            }

            <div class="space-y-3">
              @for (rule of form.rules; track $index; let ruleIndex = $index) {
                @if (isRuleExpanded(ruleIndex)) {
                  <div class="rounded-xl border border-gray-200 p-4">
                    <div class="flex items-center justify-between mb-3">
                      <span class="text-xs font-semibold text-gray-400">Regla {{ ruleIndex + 1 }}</span>
                      @if (canEditShape() && form.rules.length > 1) {
                        <button
                          type="button"
                          (click)="removeRule(ruleIndex)"
                          class="text-[11px] font-semibold text-red-500 hover:text-red-700"
                        >
                          Quitar regla
                        </button>
                      }
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                      <div class="space-y-3">
                        <div>
                          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</span>
                          <div class="mt-1 grid grid-cols-2 gap-2">
                            @for (t of typeOptions; track t.value) {
                              <button
                                type="button"
                                [disabled]="!canEditShape()"
                                (click)="setRuleType(ruleIndex, t.value)"
                                class="rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60"
                                [class]="rule.type === t.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'"
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
                              {{ rule.type === 'percent' ? 'Porcentaje' : 'Precio del paquete' }}
                            </span>
                            @if (rule.type === 'percent') {
                              <input type="number" [(ngModel)]="rule.value" [disabled]="!canEditShape()" min="0" max="100" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                            } @else {
                              <app-money-input [(ngModel)]="rule.value" [disabled]="!canEditShape()" class="mt-1 block" />
                            }
                          </label>
                          <label class="block">
                            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {{ rule.type === 'percent' ? 'Unidades mínimas' : 'Unidades del paquete' }}
                            </span>
                            <input type="number" [(ngModel)]="rule.min_qty" [disabled]="!canEditShape()" min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                          </label>
                        </div>
                      </div>

                      <div class="space-y-2">
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Conjunto ({{ rule.variantIds.length }})
                          </span>
                          @if (canEditShape() && rule.variantIds.length > 0) {
                            <button type="button" (click)="clearRuleVariants(ruleIndex)" class="text-[11px] text-gray-400 hover:text-gray-600">Vaciar</button>
                          }
                        </div>

                        @if (canEditShape()) {
                          <div class="flex flex-wrap gap-2">
                            <select [(ngModel)]="ruleFilters[ruleIndex].category" class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs">
                              <option value="">Todas las categorías</option>
                              @for (c of categoryFilterOptions(); track c.id) {
                                <option [value]="c.id">{{ c.name }}</option>
                              }
                            </select>
                            <input [(ngModel)]="ruleFilters[ruleIndex].text" type="search" placeholder="Buscar variante…" class="flex-1 min-w-[120px] px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
                            <button type="button" (click)="selectAllFilteredForRule(ruleIndex)" class="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600">
                              Agregar visibles
                            </button>
                          </div>
                        }

                        <div class="border border-gray-200 rounded-lg max-h-[220px] overflow-y-auto divide-y divide-gray-50">
                          @for (v of visibleVariantsForRule(ruleIndex); track v.id) {
                            <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                              <input type="checkbox" [checked]="rule.variantIds.includes(v.id)" [disabled]="!canEditShape()" (change)="toggleVariantForRule(ruleIndex, v.id)" />
                              <span class="flex-1">{{ v.productName }} - {{ v.variantName }}</span>
                              <span class="text-xs text-gray-400">{{ money(v.price) }}</span>
                            </label>
                          } @empty {
                            <p class="px-3 py-4 text-xs text-gray-400">Sin variantes que coincidan con el filtro.</p>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                } @else {
                  <div class="rounded-xl border border-gray-200 p-4">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-semibold text-gray-700">Regla {{ ruleIndex + 1 }}</span>
                      <div class="flex items-center gap-3">
                        <button type="button" (click)="expandRule(ruleIndex)" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Editar</button>
                        @if (form.rules.length > 1) {
                          <button type="button" (click)="removeRule(ruleIndex)" class="text-xs font-semibold text-red-500 hover:text-red-700">Quitar</button>
                        }
                      </div>
                    </div>
                    <p class="mt-1 text-sm text-gray-600">{{ typeLabel(rule.type) }} - {{ ruleSummaryText(rule) }}</p>
                    <p class="text-xs text-gray-400">
                      {{ rule.variantIds.length }} producto{{ rule.variantIds.length === 1 ? '' : 's' }} seleccionado{{ rule.variantIds.length === 1 ? '' : 's' }}
                    </p>
                  </div>
                }
              }
            </div>
          </div>

          @if (formError()) {
            <div class="mb-5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{{ formError() }}</div>
          }

          <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-5">
            <h2 class="text-sm font-bold text-indigo-700 mb-3">Resumen</h2>
            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-gray-500">Estado</span>
                <span class="flex items-center gap-1.5 font-semibold text-gray-800">
                  <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                  {{ rawStatusLabel(editingStatus()) }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-500">Reglas configuradas</span>
                <span class="font-semibold text-gray-800">{{ form.rules.length }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-500">Total productos afectados</span>
                <span class="font-semibold text-gray-800">{{ totalAffectedProducts() }}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            @if (!isReadOnly()) {
              <button
                type="button"
                [disabled]="svc.isSubmitting() || !formValid()"
                (click)="goReview()"
                class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Revisar y guardar
              </button>
            }
            <button type="button" (click)="backToList()" class="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">Cancelar</button>
          </div>
        }

        @case ('review') {
          <button type="button" (click)="screen.set('form')" class="text-sm text-gray-500 hover:text-gray-700 mb-4">← Volver a editar</button>
          <h1 class="text-xl font-bold text-gray-900 mb-4">Revisa antes de guardar</h1>
          <div class="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 max-w-xl">
            <div>
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vigencia</span>
              <p class="text-sm text-gray-800">{{ vigenciaPreview() }}</p>
            </div>
            @for (rule of form.rules; track $index) {
              <div class="border-t border-gray-100 pt-3">
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Regla {{ $index + 1 }} — {{ typeLabel(rule.type) }}
                </span>
                <p class="text-sm text-gray-800 mt-1">{{ ruleConditionPreview(rule) }}</p>
                <ul class="mt-2 text-sm text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                  @for (v of selectedVariantsForRule($index); track v.id) {
                    <li class="flex justify-between">
                      <span>{{ v.productName }} - {{ v.variantName }}</span>
                      <span class="text-gray-400">{{ money(v.price) }}</span>
                    </li>
                  }
                </ul>
              </div>
            }
          </div>

          @if (formError()) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 max-w-xl">{{ formError() }}</div>
          }
          @if (svc.overlapConflict(); as oc) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700 max-w-xl">
              <p class="font-semibold">{{ oc.error }}</p>
              <ul class="mt-1 list-disc pl-5">
                @for (c of oc.conflicts; track c.rule_id) {
                  <li>{{ c.promotion_name }} — {{ c.variant_ids.length }} variante(s) compartida(s)</li>
                }
              </ul>
            </div>
          }
          @if (svc.ruleVariantConflict(); as rc) {
            <div class="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700 max-w-xl">
              <p class="font-semibold">{{ rc.error }}</p>
              <p class="mt-1">Regla {{ rc.rule_index_a + 1 }} y regla {{ rc.rule_index_b + 1 }} comparten
                {{ rc.variant_ids.length }} variante(s).</p>
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
          <p class="text-xs text-gray-500 mb-3">La copia nace en Borrador con las mismas reglas y la misma vigencia.</p>
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

  /** Índice de la única regla mostrada en forma expandida (acordeón); las
   *  demás se muestran como resumen colapsado. */
  readonly expandedRuleIndex = signal(0);

  form: PromotionForm = emptyForm();
  /** spec 063 (revisión 2026-09-01): un filtro de ayuda por regla — índice
   *  paralelo a `form.rules`, nunca se guarda (FR-004). */
  ruleFilters: RuleFilter[] = [{ category: '', text: '' }];

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

  /** spec 063 (revisión 2026-09-01, FR-001a): variante repetida entre dos
   *  reglas del formulario — validación de cliente, antes de enviar
   *  (el servidor la revalida siempre, contracts/superficies-consumo.md §3). */
  readonly sharedVariantConflict = computed<{ a: number; b: number; variantLabel: string } | null>(() => {
    const rules = this.form.rules;
    const byId = new Map(this.catalogVariants().map((v) => [v.id, v]));
    for (let i = 0; i < rules.length; i++) {
      const setI = new Set(rules[i].variantIds);
      for (let j = i + 1; j < rules.length; j++) {
        const shared = rules[j].variantIds.find((id) => setI.has(id));
        if (shared) {
          const v = byId.get(shared);
          return { a: i, b: j, variantLabel: v ? `${v.productName} - ${v.variantName}` : shared };
        }
      }
    }
    return null;
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
      message: `¿Seguro que quieres ${this.statusVerb(to).toLowerCase()} esta promoción? Afecta a sus ${p.rules.length} regla(s) a la vez.`,
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
    this.ruleFilters = [{ category: '', text: '' }];
    this.editingId.set(null);
    this.editingSource.set(null);
    this.formError.set(null);
    this.expandedRuleIndex.set(0);
    this.screen.set('form');
  }

  openEdit(p: Promotion): void {
    this.editingId.set(p.id);
    this.editingSource.set(p);
    this.formError.set(null);
    const rules: PromotionRuleForm[] = p.rules.length
      ? p.rules.map((r) => ({
          type: r.type === 'package_price' ? 'package_price' : 'percent',
          value: Number(r.value),
          min_qty: r.min_qty,
          variantIds: r.variants.map((v) => v.product_variant_id),
        }))
      : [emptyRule()];
    this.form = {
      name: p.name,
      description: p.description ?? '',
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      rules,
    };
    this.ruleFilters = rules.map(() => ({ category: '', text: '' }));
    this.expandedRuleIndex.set(0);
    this.screen.set('form');
  }

  backToList(): void {
    this.screen.set('list');
  }

  /** FR-018: las reglas (agregar/quitar/editar cualquier campo) solo se
   *  cambian en `draft` (si no, se duplica). */
  canEditShape(): boolean {
    return !this.isReadOnly() && this.isDraft();
  }

  addRule(): void {
    if (!this.canEditShape()) return;
    this.form.rules.push(emptyRule());
    this.ruleFilters.push({ category: '', text: '' });
    this.expandedRuleIndex.set(this.form.rules.length - 1);
  }

  removeRule(index: number): void {
    if (!this.canEditShape() || this.form.rules.length <= 1) return;
    this.form.rules.splice(index, 1);
    this.ruleFilters.splice(index, 1);
    if (this.expandedRuleIndex() >= this.form.rules.length) {
      this.expandedRuleIndex.set(this.form.rules.length - 1);
    }
  }

  /** Acordeón: solo una regla se muestra expandida a la vez (fuera de
   *  `canEditShape()`, donde todas son de solo lectura y se ven completas). */
  isRuleExpanded(index: number): boolean {
    return !this.canEditShape() || this.expandedRuleIndex() === index;
  }

  expandRule(index: number): void {
    this.expandedRuleIndex.set(index);
  }

  setRuleType(index: number, t: PromotionType): void {
    if (!this.canEditShape()) return;
    const rule = this.form.rules[index];
    rule.type = t;
    if (rule.min_qty < 1) rule.min_qty = 1;
  }

  toggleDay(idx: number): void {
    if (this.isReadOnly()) return;
    const i = this.form.days_of_week.indexOf(idx);
    if (i >= 0) this.form.days_of_week.splice(i, 1);
    else this.form.days_of_week.push(idx);
  }

  toggleVariantForRule(ruleIndex: number, variantId: string): void {
    if (!this.canEditShape()) return;
    const ids = this.form.rules[ruleIndex].variantIds;
    const i = ids.indexOf(variantId);
    if (i >= 0) ids.splice(i, 1);
    else ids.push(variantId);
  }

  clearRuleVariants(ruleIndex: number): void {
    if (!this.canEditShape()) return;
    this.form.rules[ruleIndex].variantIds = [];
  }

  visibleVariantsForRule(ruleIndex: number): CatalogVariant[] {
    const filter = this.ruleFilters[ruleIndex] ?? { category: '', text: '' };
    const text = filter.text.trim().toLowerCase();
    return this.catalogVariants().filter((v) => {
      if (filter.category && v.categoryId !== filter.category) return false;
      if (text && !`${v.productName} ${v.variantName}`.toLowerCase().includes(text)) return false;
      return true;
    });
  }

  selectAllFilteredForRule(ruleIndex: number): void {
    if (!this.canEditShape()) return;
    const rule = this.form.rules[ruleIndex];
    const ids = new Set(rule.variantIds);
    for (const v of this.visibleVariantsForRule(ruleIndex)) ids.add(v.id);
    rule.variantIds = [...ids];
  }

  selectedVariantsForRule(ruleIndex: number): CatalogVariant[] {
    const rule = this.form.rules[ruleIndex];
    if (!rule) return [];
    const set = new Set(rule.variantIds);
    return this.catalogVariants().filter((v) => set.has(v.id));
  }

  formValid(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.form.rules.length === 0) return false;
    if (!this.form.start_time !== !this.form.end_time) return false;
    if (this.sharedVariantConflict()) return false;
    for (const rule of this.form.rules) {
      if (this.canEditShape() && rule.variantIds.length === 0) return false;
      if (rule.type === 'percent' && (rule.value <= 0 || rule.value > 100)) return false;
      if (rule.type === 'package_price' && rule.value <= 0) return false;
      if (rule.min_qty < 1) return false;
    }
    return true;
  }

  goReview(): void {
    this.formError.set(null);
    this.svc.overlapConflict.set(null);
    this.svc.packageNotDiscount.set(null);
    this.svc.ruleVariantConflict.set(null);
    if (!this.formValid()) {
      this.formError.set(
        'Revisa los campos: nombre, cada regla con un valor válido y al menos una variante, ' +
          'y ninguna variante repetida entre reglas.',
      );
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
    } else if (this.svc.overlapConflict() || this.svc.packageNotDiscount() || this.svc.ruleVariantConflict()) {
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

  /** Línea corta para la regla colapsada en el acordeón (Reglas). */
  ruleSummaryText(rule: PromotionRuleForm): string {
    const unidad = rule.min_qty === 1 ? 'unidad' : 'unidades';
    if (rule.type === 'package_price') {
      return `Paga ${this.money(rule.value)} llevando ${rule.min_qty} ${unidad}.`;
    }
    return `${rule.value}% de descuento a partir de ${rule.min_qty} ${unidad}.`;
  }

  totalAffectedProducts(): number {
    return this.form.rules.reduce((acc, r) => acc + r.variantIds.length, 0);
  }

  rawStatusLabel(status: PromotionStatus): string {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'active':
        return 'Activa';
      case 'paused':
        return 'En pausa';
      case 'finished':
        return 'Finalizada';
      default:
        return status;
    }
  }

  ruleConditionPreview(rule: PromotionRuleForm): string {
    const n = rule.variantIds.length;
    const v = rule.value;
    if (rule.type === 'package_price') {
      return rule.min_qty > 1
        ? `Llevando ${rule.min_qty} de estas ${n} variantes pagas ${this.money(v)}`
        : `Cada una de estas ${n} variantes a ${this.money(v)}`;
    }
    return rule.min_qty === 1
      ? `${v}% en estas ${n} variantes`
      : `${v}% llevando ${rule.min_qty} de estas ${n} variantes`;
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
