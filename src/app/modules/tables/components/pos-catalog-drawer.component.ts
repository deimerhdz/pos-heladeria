import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectComponent } from './product-select.component';

/** Drawer del catálogo: categorías + grid de productos. Reutiliza
 *  `ProductSelectComponent` para configurar variante/opciones/notas/cantidad. */
@Component({
  selector: 'app-pos-catalog-drawer',
  standalone: true,
  imports: [DecimalPipe, ProductSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-40 flex justify-end bg-black/40" (click)="store.closeCatalog()">
      <div class="w-full max-w-[560px] h-full bg-white shadow-xl flex flex-col" (click)="$event.stopPropagation()">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 class="text-base font-bold text-gray-900">Catálogo de productos</h3>
          <button (click)="store.closeCatalog()" class="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">✕</button>
        </div>

        <div class="flex gap-2 px-4 py-3 border-b border-gray-100 flex-wrap shrink-0">
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

        <div class="flex-1 overflow-y-auto p-4">
          @if (store.catalogProducts().length === 0) {
            <p class="text-center text-sm text-gray-400 py-10">Sin productos en esta categoría.</p>
          } @else {
            <div class="grid grid-cols-2 gap-3">
              @for (p of store.catalogProducts(); track p.id) {
                <button
                  (click)="store.openConfig(p)"
                  class="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 transition-colors"
                >
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
export class PosCatalogDrawerComponent {
  readonly store = inject(PosTerminalStore);

  minPrice(p: { variants: { price: number }[] }): number {
    return p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
  }
}
