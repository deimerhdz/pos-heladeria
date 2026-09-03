import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ProductSelectComponent } from '../components/product-select.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/searchable-select/searchable-select.component';

/**
 * Vista dedicada para armar un pedido de mostrador nuevo (ajuste posterior a
 * spec 036, sobre un prototipo de referencia adicional): reemplaza el CTA
 * "+ Crear Orden Manual" que antes se mostraba embebido en la Terminal de
 * Mesas (`manual-order-panel.component.ts`) — el cajero llega aquí al
 * seleccionar una mesa libre, arma el pedido con el mismo catálogo/carrito
 * ya existentes en el store, y "Confirmar y Enviar" lo crea
 * (`createManualOrderFromDraft()`, sin cambios) y vuelve a la terminal.
 *
 * "Para Llevar" ya está habilitada (spec 055): comparte `store.orderTypeTab`
 * con `pos-tables-panel.component.ts` (spec 036), pero esta vista tiene su
 * propia instancia de store, así que no hay ningún efecto cruzado entre
 * ambas pantallas. "Domicilio" se mantiene deshabilitada — spec 055, FR-012.
 *
 * Provee su propia instancia de `PosTerminalStore` (no es singleton,
 * `@Injectable()` sin `providedIn`) porque esta vista vive en una ruta
 * aparte de `table-sessions.component.ts` — mismo patrón que esa página.
 */
@Component({
  selector: 'app-manual-order-page',
  standalone: true,
  providers: [PosTerminalStore],
  imports: [DecimalPipe, FormsModule, ProductSelectComponent, IconComponent, SearchableSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-[calc(100dvh-57px)] -m-4 md:-m-6 bg-gray-50">
      <!-- Barra superior: solo volver (spec 052 — Tipo de Orden y Mesas se
           unificaron en el panel derecho, junto a Nueva orden). -->
      <div class="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
        <button
          type="button"
          (click)="backToTerminal()"
          class="min-h-9 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Volver a la Terminal
        </button>
      </div>

      <!-- Catálogo (izquierda) + panel de configuración y pedido (derecha) -->
      <div class="flex-1 flex min-h-0">
        <div class="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto p-4 gap-3">
          <input
            type="text"
            [value]="store.catalogSearchText()"
            (input)="store.setCatalogSearchText($any($event.target).value)"
            placeholder="Buscar productos (Ej. Fresa, Vaso grande…)"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          <div class="flex gap-1.5 flex-wrap">
            @for (c of store.categories(); track c.id) {
              <button
                type="button"
                (click)="store.setCatalogCategory(c.id)"
                class="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
                [class]="
                  store.catalogCategoryId() === c.id
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                "
              >
                {{ c.name }}
              </button>
            }
          </div>

          <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            @for (p of store.catalogProductsFiltered(); track p.id) {
              <button
                type="button"
                (click)="store.openConfig(p)"
                class="text-left bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-indigo-300 transition-colors"
              >
                <div class="relative w-full aspect-square bg-indigo-50 flex items-center justify-center overflow-hidden">
                  @if (store.cardPromotionText(p.variants); as promo) {
                    <!-- spec 073, FR-016: condición legible del backend (spec 066), no la insignia local. -->
                    <span class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">🏷️ {{ promo }}</span>
                  }
                  @if (p.image_url) {
                    <img [src]="p.image_url" [alt]="p.name" class="w-full h-full object-cover" />
                  } @else {
                    <span class="w-10 h-10 text-gray-300"><app-icon name="image-off" /></span>
                  }
                </div>
                <div class="p-3">
                  <div class="font-semibold text-gray-900 text-sm">{{ p.name }}</div>
                  <div class="text-sm font-bold text-gray-900 mt-1">Desde $ {{ minPrice(p) | number: '1.0-0' }}</div>
                </div>
              </button>
            }
            @if (store.catalogProductsFiltered().length === 0) {
              <p class="col-span-full text-center text-sm text-gray-400 py-10">Sin productos que coincidan.</p>
            }
          </div>
        </div>

        <div class="w-full sm:w-[400px] shrink-0 flex flex-col min-h-0 border-l border-gray-200 bg-white">
          <div class="p-4 border-b border-gray-100 shrink-0 space-y-3">
            <h2 class="text-base font-bold text-gray-900">Tipo de Orden</h2>
            <div class="flex gap-1.5 flex-wrap">
              <button
                type="button"
                (click)="setOrderTypeTab('mesas')"
                class="min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
                [class]="
                  store.orderTypeTab() === 'mesas'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                "
              >
                🍽️ En Mesa
              </button>
              <button
                type="button"
                (click)="setOrderTypeTab('para-llevar')"
                class="min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
                [class]="
                  store.orderTypeTab() === 'para-llevar'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                "
              >
                🛍️ Para Llevar
              </button>
              <button
                type="button"
                (click)="setOrderTypeTab('domicilios')"
                class="min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
                [class]="
                  store.orderTypeTab() === 'domicilios'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                "
              >
                🛵 Domicilio
              </button>
            </div>

            @if (store.orderTypeTab() === 'mesas') {
              <!-- Solo las mesas libres se pueden elegir: esta vista arma un
                   pedido nuevo, no edita una mesa ya ocupada (spec 053: mesas
                   ocupadas siguen visibles en el select, no seleccionables). -->
              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Mesas</h3>
              <app-searchable-select
                placeholder="Buscar mesa…"
                [options]="mesaOptions()"
                [ngModel]="store.selectedTableId()"
                (ngModelChange)="selectTable($event)"
              />
            }

            @if (store.orderTypeTab() !== 'domicilios') {
              <!-- Cliente de la orden: "Consumidor final" por defecto (spec
                   054; también para "Para Llevar", spec 055 FR-010), editable
                   con el botón ✏️; nunca se guarda vacío. -->
              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</h3>
              <div class="relative">
                <input
                  type="text"
                  [value]="store.customerName()"
                  [readOnly]="!editandoCliente()"
                  (input)="store.customerName.set($any($event.target).value)"
                  (blur)="onClienteBlur()"
                  class="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  [class.bg-gray-50]="!editandoCliente()"
                  [class.text-gray-500]="!editandoCliente()"
                />
                <button
                  type="button"
                  (click)="toggleEditarCliente()"
                  title="Editar cliente"
                  class="absolute right-2 inset-y-0 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✏️
                </button>
              </div>
            } @else {
              <!-- "Domicilio" (spec 056): a diferencia de "En Mesa"/"Para
                   Llevar", el cliente NO tiene valor por defecto — campo
                   simple siempre editable, sin el toggle de solo-lectura
                   (no hay nada que proteger, FR-003). Dirección y valor del
                   domicilio son obligatorios (FR-004, FR-006); teléfono
                   siempre opcional (FR-008). -->
              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</h3>
              <input
                type="text"
                [value]="store.customerName()"
                (input)="store.customerName.set($any($event.target).value)"
                placeholder="Nombre del cliente"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Dirección</h3>
              <input
                type="text"
                [value]="store.deliveryAddress()"
                (input)="store.deliveryAddress.set($any($event.target).value)"
                placeholder="Dirección de entrega"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Teléfono</h3>
              <input
                type="text"
                [value]="store.deliveryPhone()"
                (input)="store.deliveryPhone.set($any($event.target).value)"
                placeholder="Opcional"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Valor del domicilio</h3>
              <input
                type="number"
                min="0"
                [value]="store.deliveryFee()"
                (input)="onDeliveryFeeInput($any($event.target).value)"
                placeholder="$ 0"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            }
          </div>

          <div class="p-4 border-b border-gray-100 shrink-0">
            <h3 class="text-base font-bold text-gray-900">Nueva orden</h3>
            <p class="text-xs text-gray-400 mt-0.5">
              @if (store.orderTypeTab() === 'para-llevar') {
                Para llevar
              } @else if (store.orderTypeTab() === 'domicilios') {
                Domicilio
              } @else {
                {{ store.selectedTable() ? 'Mesa ' + store.selectedTable()!.number : 'Selecciona una mesa libre' }}
              }
            </p>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            @for (it of store.cartView(); track it.key) {
              <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                  <span class="font-semibold text-gray-900 text-sm">{{ it.qty }}x {{ it.name }}</span>
                  <span class="font-bold text-gray-900 text-sm">{{ store.fmt(it.subtotal) }}</span>
                </div>
                @for (b of it.bullets; track $index) {
                  <div class="text-xs text-gray-500 pl-1">• {{ b }}</div>
                }
                <div class="flex items-center justify-between pt-1">
                  <div class="flex items-center gap-2">
                    <button (click)="store.decDraft(it.key)" class="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold">−</button>
                    <span class="w-5 text-center font-bold text-sm">{{ it.qty }}</span>
                    <button (click)="store.incDraft(it.key)" class="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold">+</button>
                  </div>
                  <button (click)="store.removeDraft(it.key)" class="text-xs font-medium text-red-600 hover:text-red-700">Eliminar</button>
                </div>
              </div>
            }
            @if (store.cartEmpty()) {
              <div class="text-center text-gray-400 py-10 text-sm">Agrega productos desde el catálogo.</div>
            }
          </div>

          <div class="border-t border-gray-100 p-4 space-y-2 bg-gray-50 shrink-0">
            @let tot = store.totals();
            @if (store.draftPreview(); as p) {
              <!-- spec 073, FR-013/FR-014: el desglose (con descuento por
                   promoción) lo calcula el backend sobre el borrador. -->
              <div class="flex justify-between text-sm"><span>Subtotal</span><span>{{ store.fmt(+p.subtotal) }}</span></div>
              @if (+p.discount > 0) {
                <div class="flex justify-between text-sm text-emerald-700"><span>Descuento</span><span>− {{ store.fmt(+p.discount) }}</span></div>
              }
              <div class="flex justify-between text-sm"><span>Impuesto</span><span>{{ store.fmt(0) }}</span></div>
              @if (+p.delivery_fee > 0) {
                <div class="flex justify-between text-sm"><span>Domicilio</span><span>{{ store.fmt(+p.delivery_fee) }}</span></div>
              }
              <div class="border-t border-gray-200 my-1"></div>
              <div class="flex justify-between font-bold text-xl"><span>Total</span><span>{{ store.fmt(+p.total) }}</span></div>
            } @else {
              <!-- FR-015: sin descuento verificado (cargando o sin conexión) —
                   subtotal sin descuento + aviso; NO bloquea confirmar. -->
              <div class="flex justify-between text-sm"><span>Subtotal</span><span>{{ store.fmt(tot.subtotal) }}</span></div>
              <div class="flex justify-between text-sm">
                <!-- FR-011 (spec 036, decisión A-41): impuesto siempre $0. -->
                <span>Impuesto</span><span>{{ store.fmt(0) }}</span>
              </div>
              @if (store.orderTypeTab() === 'domicilios') {
                <div class="flex justify-between text-sm"><span>Domicilio</span><span>{{ store.fmt(tot.deliveryFee) }}</span></div>
              }
              <div class="border-t border-gray-200 my-1"></div>
              <div class="flex justify-between font-bold text-xl"><span>Total</span><span>{{ store.fmt(tot.total) }}</span></div>
              @if (store.draftPreviewError()) {
                <p class="text-xs text-amber-700">El descuento se confirma al cobrar.</p>
              } @else if (store.draftPreviewLoading()) {
                <p class="text-xs text-gray-400">Calculando el descuento…</p>
              }
            }

            <button
              (click)="confirm()"
              [disabled]="
                store.cartEmpty() ||
                store.submitting() ||
                (store.orderTypeTab() === 'mesas' && !store.selectedTableId()) ||
                (store.orderTypeTab() === 'domicilios' && (
                  !store.customerName().trim() || !store.deliveryAddress().trim() || store.deliveryFee() == null
                ))
              "
              class="w-full py-3 mt-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {{ store.submitting() ? 'Guardando…' : '➤ Confirmar y Enviar' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    @if (store.configuringProduct(); as product) {
      <app-product-select
        [product]="product"
        (added)="store.addDraftFromSelection($event)"
        (cancelled)="store.closeConfig()"
      />
    }
  `,
})
export class ManualOrderPageComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmSvc = inject(ConfirmService);

  /**
   * spec 073, FR-013: recalcula el desglose del borrador (con descuento por
   * promoción) en cada cambio de línea, tipo de orden o valor del domicilio.
   */
  private readonly _draftPreview = effect(() => {
    this.store.draftLines();
    this.store.orderTypeTab();
    this.store.deliveryFee();
    void this.store.loadDraftPreview();
  });

  /** Opciones del select buscable de mesas (spec 053, corrección posterior:
   *  el número de mesa es siempre parte de la etiqueta, no se reemplaza por
   *  el nombre personalizado — "Mesa 1 - Terraza - Libre", no solo
   *  "Terraza - Libre"). Mesas ocupadas visibles pero no seleccionables —
   *  mismo criterio que tenía la rejilla de botones que reemplaza. */
  readonly mesaOptions = computed<SearchableSelectOption[]>(() =>
    this.store.tablesView().map((t) => ({
      id: t.id,
      label: `Mesa ${t.number}${t.name ? ` - ${t.name}` : ''} - ${t.statusLabel}`,
      disabled: t.statusLabel !== 'Libre' && t.id !== this.store.selectedTableId(),
    })),
  );

  /** Modo de edición del campo "Cliente" (spec 054) — estado puramente de
   *  interacción de esta pantalla, no vive en el store. */
  readonly editandoCliente = signal(false);

  async ngOnInit(): Promise<void> {
    await this.store.init();
    const tableId = this.route.snapshot.paramMap.get('tableId');
    if (tableId) this.store.selectTable(tableId);
    this.applyDefaultCustomerName();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  selectTable(id: string): void {
    this.store.selectTable(id);
    this.applyDefaultCustomerName();
  }

  /** Spec 055: cambiar a "Para Llevar" también diligencia "Cliente" por
   *  defecto — a diferencia de `selectTable()`, aquí no hay ningún cambio de
   *  mesa que dispare `applyDefaultCustomerName()` por su cuenta. "Domicilio"
   *  (spec 056, FR-003) hace lo opuesto: siempre limpia "Cliente" al entrar,
   *  para que un "Consumidor final" heredado de "En Mesa"/"Para Llevar" no
   *  quede colado como si fuera un valor válido ya diligenciado. */
  setOrderTypeTab(tab: 'mesas' | 'para-llevar' | 'domicilios'): void {
    this.store.setOrderTypeTab(tab);
    if (tab === 'domicilios') {
      this.store.customerName.set('');
    } else {
      this.applyDefaultCustomerName();
    }
  }

  toggleEditarCliente(): void {
    this.editandoCliente.set(true);
  }

  onClienteBlur(): void {
    this.editandoCliente.set(false);
    this.applyDefaultCustomerName();
  }

  /** Spec 054, FR-005: el nombre de cliente nunca se guarda vacío — EXCEPTO
   *  en "Domicilio" (spec 056, FR-003), donde el campo es obligatorio y sin
   *  ningún valor por defecto: sin este corte, el propio `confirm()` lo
   *  sobrescribiría en silencio justo antes de enviar (research.md D8). */
  private applyDefaultCustomerName(): void {
    if (this.store.orderTypeTab() === 'domicilios') return;
    if (!this.store.customerName().trim()) {
      this.store.customerName.set('Consumidor final');
    }
  }

  backToTerminal(): void {
    this.router.navigate(['/dashboard/mesas-sesiones']);
  }

  minPrice(p: { variants: { price: number }[] }): number {
    return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
  }

  /** spec 056: `store.deliveryFee` nunca tiene valor por defecto — un campo
   *  vacío queda `null` (faltante), no `0` implícito (FR-006, Edge Cases). */
  onDeliveryFeeInput(value: string): void {
    this.store.deliveryFee.set(value === '' ? null : Number(value));
  }

  async confirm(): Promise<void> {
    this.applyDefaultCustomerName();

    // spec 073, FR-015a / research.md D11: doble chequeo del total antes de
    // crear el pedido — pero solo si la pantalla venía mostrando un total con
    // descuento del backend. Si el preview había fallado (FR-015), la pantalla
    // ya avisó "el descuento se confirma al cobrar": no hay ningún total previo
    // que pueda "cambiar", así que se crea el pedido sin más.
    const shown = this.store.draftPreview();
    if (shown) {
      const before = Number(shown.total);
      await this.store.loadDraftPreview();
      const fresh = this.store.draftPreview();
      if (fresh && Number(fresh.total) !== before) {
        const ok = await this.confirmSvc.ask({
          title: 'El total cambió',
          message:
            `El total del pedido pasó a ${this.store.fmt(Number(fresh.total))} ` +
            `(antes ${this.store.fmt(before)}). ¿Crear el pedido por ese importe?`,
          confirmText: 'Sí, crear',
        });
        if (!ok) return;
      }
    }

    const ok = await this.store.createManualOrderFromDraft();
    if (ok) {
      await this.router.navigate(['/dashboard/mesas-sesiones']);
    }
  }
}
