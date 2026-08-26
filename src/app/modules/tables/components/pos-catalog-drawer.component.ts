import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectComponent } from './product-select.component';
import { ComboSelectComponent, ComboSelection } from './combo-select.component';
import { Promotion } from '../../promotions/interfaces/promotion.interface';

/**
 * Catálogo del "+ Agregar producto": combos + buscador por nombre +
 * categorías + grid de productos. Reutiliza `ProductSelectComponent` para
 * configurar variante/opciones/notas/cantidad, y `ComboSelectComponent`
 * (sin variante/opciones) para los combos.
 *
 * Spec 036 (FR-006/FR-007): antes se mostraba como overlay de pantalla
 * completa (`fixed inset-0 bg-black/40`); ahora se embebe dentro del panel
 * central (`pos-order-panel.component.ts`), alternando con la lista de
 * ítems del pedido — por eso ya no tiene su propio fondo/backdrop ni ancho
 * máximo, ocupa el espacio que le da su contenedor.
 */
@Component({
  selector: 'app-pos-catalog-drawer',
  standalone: true,
  imports: [DecimalPipe, ProductSelectComponent, ComboSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 class="text-base font-bold text-gray-900">Catálogo de productos</h3>
        <button (click)="store.closeCatalog()" class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">← Volver a la lista</button>
      </div>

      @if (store.combos().length > 0) {
        <div class="px-4 py-3 border-b border-gray-100 shrink-0">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🎁 Combos</p>
          <div class="grid grid-cols-2 gap-3">
            @for (c of store.combos(); track c.id) {
              <button
                (click)="configuringCombo.set(c)"
                class="text-left bg-indigo-50 rounded-xl border border-indigo-100 p-3 hover:border-indigo-300 transition-colors"
              >
                <div class="font-semibold text-indigo-900 text-sm">{{ c.name }}</div>
                <div class="text-xs text-indigo-600 mt-0.5">{{ c.combo_items.length }} productos incluidos</div>
                <div class="text-sm font-bold text-indigo-900 mt-1">$ {{ +c.value | number: '1.0-0' }}</div>
              </button>
            }
          </div>
        </div>
      }

      <div class="px-4 py-3 border-b border-gray-100 shrink-0 space-y-2">
        <input
          type="text"
          [value]="store.catalogSearchText()"
          (input)="store.setCatalogSearchText($any($event.target).value)"
          placeholder="Buscar producto por nombre…"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div class="flex gap-2 flex-wrap">
          @for (c of store.categories(); track c.id) {
            <button
              (click)="store.setCatalogCategory(c.id)"
              class="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
              [class]="store.catalogCategoryId() === c.id ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
            >
              {{ c.name }}
            </button>
          }
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        @if (store.catalogProductsFiltered().length === 0) {
          <!-- FR-007, edge case: estado vacío claro, tanto por búsqueda como
               por categoría sin coincidencias. -->
          <p class="text-center text-sm text-gray-400 py-10">
            @if (store.catalogSearchText()) {
              Sin productos que coincidan con "{{ store.catalogSearchText() }}".
            } @else {
              Sin productos en esta categoría.
            }
          </p>
        } @else {
          <div class="grid grid-cols-2 gap-3">
            @for (p of store.catalogProductsFiltered(); track p.id) {
              <button
                (click)="store.openConfig(p)"
                class="relative text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 transition-colors"
              >
                @if (store.productDiscountBadges().get(p.id); as badge) {
                  <span class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">🏷️ {{ badge }}</span>
                }
                <div class="font-semibold text-gray-900 text-sm">{{ p.name }}</div>
                <div class="text-sm font-bold text-gray-900 mt-1">
                  Desde $ {{ minPrice(p) | number: '1.0-0' }}
                </div>
              </button>
            }
          </div>
        }
      </div>
    </div>

    @if (store.configuringProduct(); as product) {
      <app-product-select
        [product]="product"
        (added)="store.addDraftFromSelection($event)"
        (cancelled)="store.closeConfig()"
      />
    }

    @if (configuringCombo(); as combo) {
      <app-combo-select
        [promo]="combo"
        (confirmed)="onComboConfirmed($event)"
        (cancelled)="configuringCombo.set(null)"
      />
    }
  `,
})
export class PosCatalogDrawerComponent {
  readonly store = inject(PosTerminalStore);
  readonly configuringCombo = signal<Promotion | null>(null);

  minPrice(p: { variants: { price: number }[] }): number {
    return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
  }

  onComboConfirmed(sel: ComboSelection): void {
    this.store.addComboDraft(sel.promo, sel.quantity);
    this.configuringCombo.set(null);
  }
}
