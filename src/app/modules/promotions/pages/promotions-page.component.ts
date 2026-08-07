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
import { ProductService } from '../../products/services/product.service';
import { Product } from '../../products/interfaces/product.interface';
import { MenuService } from '../../menu/services/menu.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { Promotion, PromotionForm } from '../interfaces/promotion.interface';
import { PromotionService } from '../services/promotion.service';
import {
  PromoScope,
  PromoStatus,
  findOverlap,
  getPromoStatus,
  scopeOf,
} from '../services/promotion-pricing.util';

type Screen = 'list' | 'type' | 'discount' | 'combo' | 'review' | 'edit';
type ScopeMode = 'all' | 'category' | 'product';

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function emptyForm(): PromotionForm {
  return {
    name: '',
    type: 'percent',
    value: 0,
    active: true,
    starts_at: null,
    ends_at: null,
    days_of_week: [],
    days_of_month: [],
    start_time: null,
    end_time: null,
    min_qty: 1,
    categoryIds: [],
    productIds: [],
    comboItems: [],
  };
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
  imports: [FormsModule, NgTemplateOutlet, PaginationBarComponent],
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
                Descuentos automáticos y combos que se aplican en la venta
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

          @if (svc.loading()) {
            <div class="flex justify-center py-16">
              <div
                class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
              ></div>
            </div>
          } @else if (rows().length === 0) {
            <div class="bg-white rounded-2xl border border-gray-100 px-5 py-16 text-center">
              <h3 class="text-base font-semibold text-gray-900 mb-2">
                Todavía no tienes promociones
              </h3>
              <p class="text-sm text-gray-500 max-w-md mx-auto mb-5">
                Crea un descuento que se aplique solo, o un combo que el cajero elija al vender.
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
                <table class="w-full min-w-[900px]">
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
                        Descuento
                      </th>
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Vigencia
                      </th>
                      <th
                        class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Estado
                      </th>
                      <th
                        class="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                      >
                        Activa
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
                            [class]="
                              row.promo.type === 'combo'
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-indigo-50 text-indigo-700'
                            "
                            >{{ row.promo.type === 'combo' ? 'Combo' : 'Descuento' }}</span
                          >
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-700">
                          {{ scopePhrase(row.promo) }}
                          @if (row.overlap) {
                            <div
                              class="flex items-start gap-1 mt-1.5 text-[11.5px] text-amber-700 max-w-[220px]"
                            >
                              <span>⚠️</span
                              ><span
                                >Se solapa con "{{ row.overlap.name }}". Solo se aplicará el
                                descuento mayor.</span
                              >
                            </div>
                          }
                        </td>
                        <td class="px-5 py-3 text-sm font-semibold text-gray-900">
                          {{ discountLabel(row.promo) }}
                        </td>
                        <td class="px-5 py-3 text-sm text-gray-500">{{ vigencia(row.promo) }}</td>
                        <td class="px-5 py-3">
                          <div class="flex items-center gap-2">
                            <span
                              class="w-2.5 h-2.5 rounded-full flex-none"
                              [class]="statusDotClass(row.status)"
                            ></span>
                            <div>
                              <div
                                class="text-sm font-medium"
                                [class]="statusTextClass(row.status)"
                              >
                                {{ statusLabel(row.status) }}
                              </div>
                              @if (statusDetail(row.promo, row.status); as detail) {
                                <div class="text-[11.5px] text-gray-400">{{ detail }}</div>
                              }
                            </div>
                          </div>
                        </td>
                        <td class="px-5 py-3 text-center">
                          <button
                            type="button"
                            (click)="toggle(row.promo)"
                            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                            [class]="row.promo.active ? 'bg-emerald-500' : 'bg-gray-300'"
                            [attr.aria-pressed]="row.promo.active"
                          >
                            <span
                              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                              [class]="row.promo.active ? 'translate-x-5' : 'translate-x-1'"
                            ></span>
                          </button>
                        </td>
                        <td class="px-5 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            (click)="openEdit(row.promo)"
                            class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 mr-3"
                          >
                            Editar
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
                [page]="svc.page()" [size]="svc.size()"
                [total]="svc.total()" [totalPages]="svc.totalPages()"
                [loading]="svc.loading()"
                (pageChange)="svc.load($event, svc.size())"
                (sizeChange)="svc.load(1, $event)" />
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
            Un descuento se aplica solo cuando se cumplen las condiciones. Un combo lo elige el
            cajero al vender.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <button
              type="button"
              (click)="chooseKind('discount')"
              class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all p-6"
            >
              <div
                class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 9h.01" />
                  <path d="M15 15h.01" />
                  <path
                    d="M21.732 12.732a1 1 0 0 0 0-1.464L12.732 2.27a1 1 0 0 0-1.464 0L2.27 11.27a1 1 0 0 0 0 1.464l9 9a1 1 0 0 0 1.464 0z"
                  />
                </svg>
              </div>
              <div class="text-lg font-bold text-gray-900 mb-1.5">Descuento</div>
              <div class="text-sm text-gray-500">
                Se aplica automáticamente. Ej: 20% en conos de 5 a 7pm, $3.000 menos en toda la
                venta.
              </div>
            </button>
            <button
              type="button"
              (click)="chooseKind('combo')"
              class="text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all p-6"
            >
              <div
                class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 3v18" />
                  <path d="M3 8h18" />
                  <rect x="3" y="8" width="18" height="13" rx="1" />
                  <path d="M3 8V6a2 2 0 0 1 2-2h4l3 4" />
                  <path d="M21 8V6a2 2 0 0 0-2-2h-4l-3 4" />
                </svg>
              </div>
              <div class="text-lg font-bold text-gray-900 mb-1.5">Combo</div>
              <div class="text-sm text-gray-500">
                El cajero lo elige al vender. Ej: cono + malteada + topping por $15.000.
              </div>
            </button>
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
          <div class="max-w-xl space-y-8">
            <div>
              <label
                class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                >Nombre de la promoción</label
              >
              <input
                [(ngModel)]="form.name"
                (blur)="touchName()"
                type="text"
                placeholder="Ej: 20% en conos los martes"
                class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              @if (touched['name'] && !form.name.trim()) {
                <p class="text-xs text-red-500 mt-1">
                  Ponle un nombre para reconocerla en la lista.
                </p>
              }
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                >¿Qué descuenta?</label
              >
              <div class="flex flex-wrap gap-2">
                <button type="button" (click)="setScopeMode('all')" [class]="scopeChipClass('all')">
                  Toda la venta
                </button>
                <button
                  type="button"
                  (click)="setScopeMode('category')"
                  [class]="scopeChipClass('category')"
                >
                  Una o varias categorías
                </button>
                <button
                  type="button"
                  (click)="setScopeMode('product')"
                  [class]="scopeChipClass('product')"
                >
                  Productos específicos
                </button>
              </div>

              @if (scopeMode() === 'category') {
                <div class="flex flex-wrap gap-2 mt-3">
                  @for (c of categories.allCategories(); track c.id) {
                    <button
                      type="button"
                      (click)="toggleCategory(c.id)"
                      [class]="pickerChipClass(form.categoryIds.includes(c.id))"
                    >
                      {{ c.name }}
                    </button>
                  }
                </div>
              }

              @if (scopeMode() === 'product') {
                <div class="mt-3">
                  <input
                    [ngModel]="productPickerQuery()"
                    (ngModelChange)="productPickerQuery.set($event)"
                    type="text"
                    placeholder="Buscar producto…"
                    class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  @if (form.productIds.length > 0) {
                    <div class="flex flex-wrap gap-2 mt-2.5">
                      @for (id of form.productIds; track id) {
                        <span
                          class="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                        >
                          {{ productName(id) }}
                          <button
                            type="button"
                            (click)="removeScopeProduct(id)"
                            class="text-indigo-400 hover:text-indigo-700 px-0.5"
                          >
                            ✕
                          </button>
                        </span>
                      }
                    </div>
                  }
                  @if (productSearchResults().length > 0) {
                    <div
                      class="border border-gray-200 rounded-lg mt-2 max-h-52 overflow-y-auto divide-y divide-gray-100"
                    >
                      @for (p of productSearchResults(); track p.id) {
                        <button
                          type="button"
                          (click)="addScopeProduct(p.id)"
                          class="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50"
                        >
                          {{ p.name }}
                        </button>
                      }
                    </div>
                  }
                </div>
              }
              @if (touched['name'] || touched['value']) {
                @if (
                  scopeMode() !== 'all' &&
                  ((scopeMode() === 'category' && !form.categoryIds.length) ||
                    (scopeMode() === 'product' && !form.productIds.length))
                ) {
                  <p class="text-xs text-red-500 mt-2">
                    Elige a qué aplica: es el paso que más se olvida.
                  </p>
                }
              }
            </div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
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
                <input
                  [(ngModel)]="form.value"
                  (blur)="touchValue()"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <span class="text-sm font-semibold text-gray-600">{{
                  form.type === 'percent' ? '%' : 'pesos'
                }}</span>
              </div>
              @if (touched['value'] && numberValue() <= 0) {
                <p class="text-xs text-red-500 mt-1">Ingresa un valor mayor a 0.</p>
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

            @if (draftOverlap(); as clash) {
              <div class="flex gap-2.5 p-3.5 rounded-lg border border-amber-200 bg-amber-50">
                <span>⚠️</span>
                <p class="text-sm text-amber-800">
                  Esta promoción se solapa con "{{ clash.name }}". Cuando ambas califiquen, solo se
                  aplicará el descuento más alto.
                </p>
              </div>
            }

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                (click)="backToType()"
                class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                [disabled]="!canSaveDiscount()"
                (click)="goToReview()"
                class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
              >
                Revisar y crear
              </button>
            </div>
          </div>
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
          <div class="max-w-2xl space-y-8">
            <div>
              <label
                class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                >Nombre del combo</label
              >
              <input
                [(ngModel)]="form.name"
                (blur)="touchName()"
                type="text"
                placeholder="Ej: Cono + malteada + topping"
                class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              @if (touched['name'] && !form.name.trim()) {
                <p class="text-xs text-red-500 mt-1">
                  Ponle un nombre para reconocerlo en la lista.
                </p>
              }
            </div>

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
                        <span class="w-4 text-center text-sm font-semibold">{{
                          line.quantity
                        }}</span>
                        <button
                          type="button"
                          (click)="incrementComboQty(line.variantId)"
                          class="w-7 h-7 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                        >
                          +
                        </button>
                        <span class="w-20 text-right text-sm text-gray-500">{{
                          line.lineTotal
                        }}</span>
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

            @if (comboItemRows().length > 0) {
              <div>
                <label
                  class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                  >Precio del combo</label
                >
                <div class="flex items-center gap-2 max-w-[200px]">
                  <span class="text-sm font-semibold text-gray-500">$</span>
                  <input
                    [(ngModel)]="form.value"
                    (blur)="touchComboPrice()"
                    type="number"
                    min="0"
                    class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                    El precio del combo es igual o más caro que comprar por separado. El cliente no
                    ahorra nada.
                  </div>
                }
              </div>
            }

            <ng-container [ngTemplateOutlet]="scheduleFields" />

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                (click)="backToType()"
                class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                [disabled]="!canSaveCombo()"
                (click)="goToReview()"
                class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
              >
                Revisar y crear
              </button>
            </div>
          </div>
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
            El tipo y a qué aplica no se podrán cambiar después. Solo el nombre, el valor, la
            vigencia y el estado activo se pueden editar más adelante.
          </p>
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm max-w-xl p-6">
            <span
              class="inline-block text-[10.5px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded mb-3"
              [class]="
                form.type === 'combo' ? 'bg-gray-100 text-gray-600' : 'bg-indigo-50 text-indigo-700'
              "
              >{{ form.type === 'combo' ? 'Combo' : 'Descuento' }}</span
            >
            <p class="text-base text-gray-800 leading-relaxed">{{ draftSummary() }}</p>
          </div>
          <div class="flex gap-3 pt-6">
            <button
              type="button"
              (click)="backToForm()"
              class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              Volver a editar
            </button>
            <button
              type="button"
              (click)="save()"
              [disabled]="svc.isSubmitting()"
              class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {{ svc.isSubmitting() ? 'Creando…' : 'Crear promoción' }}
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
          <h1 class="text-2xl font-bold text-gray-900 mb-6">Editar promoción</h1>
          <div class="max-w-xl space-y-7">
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
                <strong>{{ form.type === 'combo' ? 'Combo' : 'Descuento' }}</strong> ·
                {{ editFrozenScope() }}
              </div>
              <p class="text-xs text-gray-500 mb-3">
                El tipo y a qué aplica quedan fijos desde la creación, para que el cálculo de la
                cuenta nunca cambie de forma inesperada.
              </p>
              <button
                type="button"
                (click)="duplicateAndCreate()"
                class="px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-white"
              >
                Duplicar y crear una nueva
              </button>
            </div>

            <div>
              <label
                class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                >Nombre</label
              >
              <input
                [(ngModel)]="form.name"
                type="text"
                class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            @if (form.type !== 'combo') {
              <div>
                <label
                  class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                  >¿Cuánto descuenta?</label
                >
                <div class="flex items-center gap-2 max-w-50">
                  <input
                    [(ngModel)]="form.value"
                    type="number"
                    min="0"
                    class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <span class="text-sm font-semibold text-gray-600">{{
                    form.type === 'percent' ? '%' : 'pesos'
                  }}</span>
                </div>
              </div>
            } @else {
              <div>
                <label
                  class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                  >Precio del combo</label
                >
                <div class="flex items-center gap-2 max-w-50">
                  <span class="text-sm font-semibold text-gray-500">$</span>
                  <input
                    [(ngModel)]="form.value"
                    type="number"
                    min="0"
                    class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <p class="text-sm text-gray-600 mt-2">
                  Ahorro para el cliente:
                  <strong [class]="comboSavings() > 0 ? 'text-emerald-600' : 'text-amber-600'">{{
                    comboSavingsLabel()
                  }}</strong>
                </p>
              </div>
            }

            <ng-container [ngTemplateOutlet]="scheduleFields" />

            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                >Activa</label
              >
              <div class="flex items-center gap-2.5">
                <button
                  type="button"
                  (click)="toggleFormActive()"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  [class]="form.active ? 'bg-emerald-500' : 'bg-gray-300'"
                >
                  <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                    [class]="form.active ? 'translate-x-5' : 'translate-x-1'"
                  ></span>
                </button>
                <span class="text-sm text-gray-700">{{ form.active ? 'Activa' : 'Apagada' }}</span>
              </div>
            </div>

            @if (svc.error()) {
              <div
                class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
              >
                {{ svc.error() }}
              </div>
            }

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                (click)="backToList()"
                class="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="save()"
                [disabled]="svc.isSubmitting() || !form.name.trim()"
                class="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar cambios' }}
              </button>
            </div>
          </div>
        }
      }
    </div>

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
        </div>
        <p class="text-[11px] text-gray-400 mb-4">Vacío = todo el día</p>

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
          <p class="text-[11px] text-gray-400 mb-3">Vacío = sin límite de fecha</p>
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
            </div>
            <p class="text-xs text-gray-500 mb-1.5">Días del mes</p>
            <div class="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                (click)="applyDaysOfMonthPreset([15, 30])"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300"
              >
                Quincena (15 y 30)
              </button>
              <button
                type="button"
                (click)="applyDaysOfMonthPreset([31])"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-indigo-300"
              >
                Fin de mes
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mb-2">
              @for (d of form.days_of_month; track d) {
                <span
                  class="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                >
                  Día {{ d }}
                  <button
                    type="button"
                    (click)="removeDayOfMonth(d)"
                    class="text-indigo-400 hover:text-indigo-700 px-0.5"
                  >
                    ✕
                  </button>
                </span>
              }
              @if (form.days_of_month.length === 0) {
                <span class="text-[11px] text-gray-400">Vacío = todos los días.</span>
              }
            </div>
            <div class="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="31"
                [(ngModel)]="newDayOfMonth"
                placeholder="Día (1-31)"
                class="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
              <button
                type="button"
                (click)="addDayOfMonth()"
                class="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                + Agregar día
              </button>
            </div>
            @if (form.days_of_month.includes(31)) {
              <p class="text-[11px] text-amber-600 mt-1">
                ⚠️ El día 31 no existe en meses de 28-30 días: esos meses la promo no se aplicará
                ese día.
              </p>
            }
          </div>
        } @else {
          <button
            type="button"
            (click)="toggleAdvanced()"
            class="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-1"
          >
            + Más opciones (cantidad mínima, días del mes)
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
  readonly products = inject(ProductService);
  private readonly menu = inject(MenuService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly screen = signal<Screen>('list');
  readonly editingId = signal<string | null>(null);
  readonly scopeMode = signal<ScopeMode>('all');
  readonly showDateRange = signal(false);
  readonly showAdvanced = signal(false);
  readonly productPickerQuery = signal('');
  readonly comboSearchQuery = signal('');
  readonly now = signal(new Date());

  form: PromotionForm = emptyForm();
  newDayOfMonth: number | null = null;
  touched: Record<string, boolean> = {};

  readonly days = DAY_SHORT.map((label, idx) => ({ label, idx }));

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
    for (const c of this.menu.categories()) {
      for (const p of c.products) {
        if (p.variants.length > 0) map.set(p.id, p.variants[0].price);
      }
    }
    return map;
  });

  readonly categoryOfProduct = computed<Map<string, string | null>>(() => {
    const map = new Map<string, string | null>();
    for (const p of this.products.products()) map.set(p.id, p.category_id);
    return map;
  });

  readonly rows = computed(() => {
    const now = this.now();
    const catMap = this.categoryOfProduct();
    // La tabla muestra solo la página actual, pero el solapamiento se calcula
    // contra `allPromotions` (todas) — si comparara solo contra la página
    // actual, una promo en otra página dejaría de detectarse como solapada.
    const promos = this.svc.promotions();
    const allPromos = this.svc.allPromotions();
    return promos.map((p) => ({
      promo: p,
      status: getPromoStatus(p, now),
      overlap:
        p.type === 'combo'
          ? null
          : findOverlap(
              scopeOf(p),
              allPromos.filter((x) => x.id !== p.id),
              now,
              catMap,
            ),
    }));
  });

  readonly editingPromo = computed(
    () => this.svc.allPromotions().find((p) => p.id === this.editingId()) ?? null,
  );

  constructor() {
    const intervalId = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(intervalId));
  }

  ngOnInit(): void {
    this.svc.load();
    this.svc.loadAll();
    if (this.categories.allCategories().length === 0) this.categories.loadAllCategories();
    if (this.products.products().length === 0) this.products.loadProducts();
    if (this.menu.categories().length === 0) this.menu.loadMenu();
  }

  // ── Navegación del wizard ────────────────────────────────────────────

  openNew(): void {
    this.form = emptyForm();
    this.newDayOfMonth = null;
    this.touched = {};
    this.editingId.set(null);
    this.scopeMode.set('all');
    this.showDateRange.set(false);
    this.showAdvanced.set(false);
    this.productPickerQuery.set('');
    this.comboSearchQuery.set('');
    this.svc.otherError.set(null);
    this.screen.set('type');
  }

  chooseKind(kind: 'discount' | 'combo'): void {
    this.form.type = kind === 'combo' ? 'combo' : 'percent';
    this.screen.set(kind);
  }

  backToType(): void {
    this.screen.set('type');
  }

  backToForm(): void {
    this.screen.set(this.form.type === 'combo' ? 'combo' : 'discount');
  }

  backToList(): void {
    this.screen.set('list');
  }

  goToReview(): void {
    const valid = this.form.type === 'combo' ? this.canSaveCombo() : this.canSaveDiscount();
    if (valid) this.screen.set('review');
  }

  openEdit(p: Promotion): void {
    this.form = this.formFromPromotion(p);
    this.newDayOfMonth = null;
    this.touched = {};
    this.editingId.set(p.id);
    this.scopeMode.set(this.scopeModeFromForm(this.form));
    this.showDateRange.set(!!(this.form.starts_at || this.form.ends_at));
    this.showAdvanced.set(this.form.min_qty > 1 || this.form.days_of_month.length > 0);
    this.svc.otherError.set(null);
    this.screen.set('edit');
  }

  duplicateAndCreate(): void {
    const p = this.editingPromo();
    if (!p) return;
    this.form = this.formFromPromotion(p);
    this.form.name = `${this.form.name} (copia)`;
    this.newDayOfMonth = null;
    this.touched = {};
    this.editingId.set(null);
    this.scopeMode.set(this.scopeModeFromForm(this.form));
    this.showDateRange.set(!!(this.form.starts_at || this.form.ends_at));
    this.showAdvanced.set(this.form.min_qty > 1 || this.form.days_of_month.length > 0);
    this.svc.otherError.set(null);
    this.screen.set(p.type === 'combo' ? 'combo' : 'discount');
  }

  private formFromPromotion(p: Promotion): PromotionForm {
    return {
      name: p.name,
      type: p.type,
      value: Number(p.value),
      active: p.active,
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      days_of_month: p.days_of_month ? p.days_of_month.split(',').map(Number) : [],
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      min_qty: p.min_qty,
      categoryIds: p.targets.filter((t) => t.category_id).map((t) => t.category_id as string),
      productIds: p.targets.filter((t) => t.product_id).map((t) => t.product_id as string),
      comboItems: p.combo_items.map((c) => ({ ...c })),
    };
  }

  private scopeModeFromForm(form: PromotionForm): ScopeMode {
    if (form.categoryIds.length) return 'category';
    if (form.productIds.length) return 'product';
    return 'all';
  }

  // ── Validación de borrador ───────────────────────────────────────────

  touchName(): void {
    this.touched['name'] = true;
  }

  touchValue(): void {
    this.touched['value'] = true;
  }

  touchComboPrice(): void {
    this.touched['comboPrice'] = true;
  }

  numberValue(): number {
    return Number(this.form.value) || 0;
  }

  canSaveDiscount(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.numberValue() <= 0) return false;
    if (this.scopeMode() === 'category' && this.form.categoryIds.length === 0) return false;
    if (this.scopeMode() === 'product' && this.form.productIds.length === 0) return false;
    return true;
  }

  canSaveCombo(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.comboDistinctCount() < 2) return false;
    if (this.numberValue() <= 0) return false;
    return true;
  }

  // ── Alcance (descuentos) ─────────────────────────────────────────────

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
    if (mode === 'category') this.form.productIds = [];
    else if (mode === 'product') this.form.categoryIds = [];
    else {
      this.form.categoryIds = [];
      this.form.productIds = [];
    }
  }

  toggleCategory(id: string): void {
    const set = new Set(this.form.categoryIds);
    set.has(id) ? set.delete(id) : set.add(id);
    this.form.categoryIds = [...set];
  }

  productName(id: string): string {
    return this.products.products().find((p) => p.id === id)?.name ?? '—';
  }

  productSearchResults(): Product[] {
    const q = this.productPickerQuery().trim().toLowerCase();
    if (!q) return [];
    return this.products
      .products()
      .filter((p) => p.name.toLowerCase().includes(q) && !this.form.productIds.includes(p.id))
      .slice(0, 8);
  }

  addScopeProduct(id: string): void {
    if (!this.form.productIds.includes(id)) this.form.productIds = [...this.form.productIds, id];
    this.productPickerQuery.set('');
  }

  removeScopeProduct(id: string): void {
    this.form.productIds = this.form.productIds.filter((x) => x !== id);
  }

  discountExample(): { name: string; before: string; after: string } | null {
    const val = this.numberValue();
    if (val <= 0) return null;
    let product: Product | undefined;
    if (this.scopeMode() === 'product' && this.form.productIds.length) {
      product = this.products.products().find((p) => p.id === this.form.productIds[0]);
    } else if (this.scopeMode() === 'category' && this.form.categoryIds.length) {
      product = this.products.products().find((p) => p.category_id === this.form.categoryIds[0]);
    } else if (this.scopeMode() === 'all') {
      product = this.products.products()[0];
    }
    if (!product) return null;
    const price = this.productPriceMap().get(product.id);
    if (price == null) return null;
    const after = this.form.type === 'percent' ? price * (1 - val / 100) : Math.max(0, price - val);
    return { name: product.name, before: this.money(price), after: this.money(after) };
  }

  draftOverlap(): Promotion | null {
    if (this.form.type === 'combo') return null;
    if (this.scopeMode() === 'category' && !this.form.categoryIds.length) return null;
    if (this.scopeMode() === 'product' && !this.form.productIds.length) return null;
    const target: PromoScope = {
      all: this.scopeMode() === 'all',
      categoryIds: new Set(this.scopeMode() === 'category' ? this.form.categoryIds : []),
      productIds: new Set(this.scopeMode() === 'product' ? this.form.productIds : []),
    };
    const candidates = this.svc.allPromotions().filter((p) => p.id !== this.editingId());
    return findOverlap(target, candidates, this.now(), this.categoryOfProduct());
  }

  // ── Combo ─────────────────────────────────────────────────────────────

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

  addDayOfMonth(): void {
    const d = this.newDayOfMonth;
    if (d == null || d < 1 || d > 31) return;
    if (!this.form.days_of_month.includes(d)) {
      this.form.days_of_month = [...this.form.days_of_month, d].sort((a, b) => a - b);
    }
    this.newDayOfMonth = null;
  }

  removeDayOfMonth(d: number): void {
    this.form.days_of_month = this.form.days_of_month.filter((x) => x !== d);
  }

  applyDaysOfMonthPreset(days: number[]): void {
    const set = new Set([...this.form.days_of_month, ...days]);
    this.form.days_of_month = [...set].sort((a, b) => a - b);
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

  toggleFormActive(): void {
    this.form.active = !this.form.active;
  }

  // ── Resumen / revisión ───────────────────────────────────────────────

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
    const amt = this.form.type === 'percent' ? `${val}%` : `${this.money(val)} de descuento fijo`;
    let scopeSentence: string;
    if (this.scopeMode() === 'all') {
      scopeSentence = 'toda la venta';
    } else if (this.scopeMode() === 'category') {
      const names = this.form.categoryIds.map(
        (id) => this.categories.allCategories().find((c) => c.id === id)?.name ?? '—',
      );
      scopeSentence = (names.length > 1 ? 'las categorías ' : 'la categoría ') + joinList(names);
    } else {
      const names = this.form.productIds.map((id) => this.productName(id));
      scopeSentence = (names.length > 1 ? 'los productos ' : 'el producto ') + joinList(names);
    }
    const sentence = `${amt} en ${scopeSentence}, ${vigPhrase(this.form)}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
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
    const names = p.targets.map((t) => {
      if (t.category_id)
        return this.categories.allCategories().find((c) => c.id === t.category_id)?.name ?? '—';
      return this.products.products().find((pr) => pr.id === t.product_id)?.name ?? '—';
    });
    return names.length <= 2 ? names.join(' y ') : `${names[0]} y ${names.length - 1} más`;
  }

  editFrozenScope(): string {
    const p = this.editingPromo();
    return p ? this.scopePhrase(p) : '';
  }

  discountLabel(p: Promotion): string {
    if (p.type === 'combo') return `${this.money(Number(p.value))} fijo`;
    return p.type === 'percent' ? `${Number(p.value)}%` : `${this.money(Number(p.value))} menos`;
  }

  money(n: number): string {
    return '$' + Math.round(n).toLocaleString('es-CO');
  }

  // ── Estado (lista) ───────────────────────────────────────────────────

  statusLabel(status: PromoStatus): string {
    switch (status) {
      case 'live':
        return 'En vivo';
      case 'paused':
        return 'En pausa';
      case 'scheduled':
        return 'Programada';
      case 'expired':
        return 'Vencida';
      case 'off':
        return 'Desactivada';
      default:
        return '';
    }
  }

  statusDetail(p: Promotion, status: PromoStatus): string {
    switch (status) {
      case 'scheduled':
        return p.starts_at ? `Empieza el ${fmtDate(p.starts_at)}` : '';
      case 'expired':
        return p.ends_at ? `Terminó el ${fmtDate(p.ends_at)}` : '';
      case 'paused':
        return 'Fuera de horario o días configurados';
      case 'off':
        return 'Actívala para que aplique';
      default:
        return '';
    }
  }

  statusDotClass(status: PromoStatus): string {
    switch (status) {
      case 'live':
        return 'bg-emerald-500';
      case 'paused':
        return 'bg-white border-2 border-amber-500';
      case 'scheduled':
        return 'bg-white border-2 border-dashed border-indigo-400';
      case 'expired':
        return 'bg-gray-300';
      case 'off':
        return 'bg-white border-2 border-gray-300';
      default:
        return 'bg-gray-300';
    }
  }

  statusTextClass(status: PromoStatus): string {
    switch (status) {
      case 'live':
        return 'text-emerald-700';
      case 'paused':
        return 'text-amber-700';
      case 'scheduled':
        return 'text-indigo-600';
      case 'expired':
        return 'text-gray-500';
      case 'off':
        return 'text-gray-400';
      default:
        return 'text-gray-500';
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    const id = this.editingId();
    const ok = id ? await this.svc.update(id, this.form) : await this.svc.create(this.form);
    if (ok) {
      this.toast.success(id ? 'Promoción actualizada' : 'Promoción creada');
      this.screen.set('list');
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
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    const done = await this.svc.remove(p.id);
    if (done) this.toast.success('Promoción eliminada');
    else this.toast.error(this.svc.error() ?? 'No se pudo eliminar');
  }
}
