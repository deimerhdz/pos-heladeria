import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectComponent } from '../components/product-select.component';
import { IconComponent } from '../../../shared/icon/icon.component';

/**
 * Vista dedicada para armar un pedido de mostrador nuevo (ajuste posterior a
 * spec 036, sobre un prototipo de referencia adicional): reemplaza el CTA
 * "+ Crear Orden Manual" que antes se mostraba embebido en la Terminal de
 * Mesas (`manual-order-panel.component.ts`) — el cajero llega aquí al
 * seleccionar una mesa libre, arma el pedido con el mismo catálogo/carrito
 * ya existentes en el store, y "Confirmar y Enviar" lo crea
 * (`createManualOrderFromDraft()`, sin cambios) y vuelve a la terminal.
 *
 * Las pestañas "Para Llevar"/"Domicilio" se muestran deshabilitadas: no
 * existe hoy ningún campo de backend para persistir el tipo de orden fuera
 * de "En Mesa" (spec 036, Clarifications/Out of Scope) — mismo criterio ya
 * usado por las pestañas equivalentes de `pos-tables-panel.component.ts`.
 *
 * Provee su propia instancia de `PosTerminalStore` (no es singleton,
 * `@Injectable()` sin `providedIn`) porque esta vista vive en una ruta
 * aparte de `table-sessions.component.ts` — mismo patrón que esa página.
 */
@Component({
  selector: 'app-manual-order-page',
  standalone: true,
  providers: [PosTerminalStore],
  imports: [DecimalPipe, ProductSelectComponent, IconComponent],
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
                  @if (store.productDiscountBadges().get(p.id); as badge) {
                    <span class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">🏷️ {{ badge }}</span>
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
                class="min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg border border-indigo-500 bg-indigo-50 text-indigo-700"
              >
                🍽️ En Mesa
              </button>
              <button
                type="button"
                disabled
                title="Todavía no disponible — requiere un cambio de backend"
                class="min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed"
              >
                🛍️ Para Llevar
              </button>
              <button
                type="button"
                disabled
                title="Todavía no disponible — requiere un cambio de backend"
                class="min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-400 cursor-not-allowed"
              >
                🛵 Domicilio
              </button>
            </div>

            <!-- Solo las mesas libres se pueden elegir: esta vista arma un
                 pedido nuevo, no edita una mesa ya ocupada. -->
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Mesas</h3>
            <div class="grid grid-cols-4 gap-2">
              @for (t of store.tablesView(); track t.id) {
                <button
                  type="button"
                  [disabled]="t.statusLabel !== 'Libre' && t.id !== store.selectedTableId()"
                  (click)="selectTable(t.id)"
                  class="text-center rounded-lg border p-2 transition-colors"
                  [class]="
                    t.id === store.selectedTableId()
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : t.statusLabel === 'Libre'
                        ? 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        : 'border-gray-100 text-gray-300 cursor-not-allowed'
                  "
                >
                  <div class="text-sm font-bold">M{{ t.number }}</div>
                  <div class="text-[10px]">{{ t.id === store.selectedTableId() ? 'Seleccionada' : t.statusLabel }}</div>
                </button>
              }
            </div>
          </div>

          <div class="p-4 border-b border-gray-100 shrink-0">
            <h3 class="text-base font-bold text-gray-900">Nueva orden</h3>
            <p class="text-xs text-gray-400 mt-0.5">
              {{ store.selectedTable() ? 'Mesa ' + store.selectedTable()!.number : 'Selecciona una mesa libre' }}
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
            <div class="flex justify-between text-sm"><span>Subtotal</span><span>{{ store.fmt(tot.subtotal) }}</span></div>
            <div class="flex justify-between text-sm">
              <!-- FR-011 (spec 036, decisión A-41): impuesto siempre $0,
                   sin campo editable, sin excepción. -->
              <span>Impuesto</span><span>{{ store.fmt(0) }}</span>
            </div>
            <div class="border-t border-gray-200 my-1"></div>
            <div class="flex justify-between font-bold text-xl"><span>Total</span><span>{{ store.fmt(tot.total) }}</span></div>

            <button
              (click)="confirm()"
              [disabled]="store.cartEmpty() || store.submitting() || !store.selectedTableId()"
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

  async ngOnInit(): Promise<void> {
    await this.store.init();
    const tableId = this.route.snapshot.paramMap.get('tableId');
    if (tableId) this.store.selectTable(tableId);
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  selectTable(id: string): void {
    this.store.selectTable(id);
  }

  backToTerminal(): void {
    this.router.navigate(['/dashboard/mesas-sesiones']);
  }

  minPrice(p: { variants: { price: number }[] }): number {
    return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
  }

  async confirm(): Promise<void> {
    const ok = await this.store.createManualOrderFromDraft();
    if (ok) {
      await this.router.navigate(['/dashboard/mesas-sesiones']);
    }
  }
}
