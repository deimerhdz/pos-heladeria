import { Component, EventEmitter, OnInit, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ManualOrderItem } from '../../orders/interfaces/order.interface';
import { Product } from '../../products/interfaces/product.interface';
import { ProductService } from '../../products/services/product.service';

@Component({
  selector: 'app-manual-order-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      (click)="onBackdropClick($event)"
    >
      <div
        class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col z-50"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 class="text-lg font-bold text-gray-900">Nueva venta</h2>
            <p class="text-xs text-gray-400 mt-0.5">Selecciona productos para la orden</p>
          </div>
          <button
            (click)="cancelled.emit()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- Body: two columns -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Productos disponibles -->
          <div class="w-1/2 border-r border-gray-100 flex flex-col">
            <div class="px-4 py-3 border-b border-gray-100">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Catálogo</p>
            </div>

            @if (productService.loading()) {
              <p class="px-4 py-6 text-center text-sm text-gray-400 animate-pulse">Cargando productos...</p>
            } @else if (activeProducts().length === 0) {
              <p class="px-4 py-6 text-center text-sm text-gray-400">Sin productos activos</p>
            } @else {
              <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
                @for (product of activeProducts(); track product.id) {
                  <button
                    (click)="addProduct(product)"
                    class="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-indigo-50 transition-colors text-left"
                  >
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-gray-800 truncate">{{ product.name }}</p>
                      <p class="text-xs text-gray-400">S/ {{ product.price.toFixed(2) }}</p>
                    </div>
                    <span class="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-bold shrink-0">+</span>
                  </button>
                }
              </div>
            }
          </div>

          <!-- Ítems de la orden -->
          <div class="w-1/2 flex flex-col">
            <div class="px-4 py-3 border-b border-gray-100">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Orden</p>
            </div>

            @if (items().length === 0) {
              <p class="px-4 py-6 text-center text-sm text-gray-400 flex-1">Agrega productos desde el catálogo</p>
            } @else {
              <div class="overflow-y-auto flex-1 divide-y divide-gray-50">
                @for (item of items(); track item.product_id) {
                  <div class="px-4 py-3 flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-gray-800 truncate">{{ item.product_name }}</p>
                      <p class="text-xs text-gray-400">S/ {{ item.subtotal.toFixed(2) }}</p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        (click)="decrement(item)"
                        class="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-lg font-bold hover:bg-red-100 hover:text-red-600 transition-colors"
                      >−</button>
                      <span class="w-6 text-center text-sm font-bold text-gray-800">{{ item.quantity }}</span>
                      <button
                        (click)="increment(item)"
                        class="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-lg font-bold hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                      >+</button>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Total -->
            <div class="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center shrink-0">
              <span class="text-sm font-semibold text-gray-600">Total</span>
              <span class="text-xl font-bold text-gray-900">S/ {{ total().toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            (click)="cancelled.emit()"
            class="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:border-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            (click)="onProceed()"
            [disabled]="items().length === 0"
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            [class]="
              items().length > 0
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            "
          >
            Cobrar S/ {{ total().toFixed(2) }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ManualOrderFormComponent implements OnInit {
  @Output() proceed = new EventEmitter<ManualOrderItem[]>();
  @Output() cancelled = new EventEmitter<void>();

  readonly productService = inject(ProductService);
  readonly items = signal<ManualOrderItem[]>([]);
  readonly activeProducts = computed(() => this.productService.products().filter(p => p.is_active));
  readonly total = computed(() => this.items().reduce((sum, i) => sum + i.subtotal, 0));

  async ngOnInit(): Promise<void> {
    await this.productService.loadProducts();
  }

  addProduct(product: Product): void {
    this.items.update(current => {
      const existing = current.find(i => i.product_id === product.id);
      if (existing) {
        return current.map(i =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
            : i
        );
      }
      return [...current, {
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: 1,
        subtotal: product.price,
      }];
    });
  }

  increment(item: ManualOrderItem): void {
    this.items.update(current =>
      current.map(i =>
        i.product_id === item.product_id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
          : i
      )
    );
  }

  decrement(item: ManualOrderItem): void {
    if (item.quantity === 1) {
      this.items.update(current => current.filter(i => i.product_id !== item.product_id));
      return;
    }
    this.items.update(current =>
      current.map(i =>
        i.product_id === item.product_id
          ? { ...i, quantity: i.quantity - 1, subtotal: (i.quantity - 1) * i.unit_price }
          : i
      )
    );
  }

  onProceed(): void {
    if (this.items().length === 0) return;
    this.proceed.emit(this.items());
  }

  onBackdropClick(event: MouseEvent): void {
    this.cancelled.emit();
  }
}
