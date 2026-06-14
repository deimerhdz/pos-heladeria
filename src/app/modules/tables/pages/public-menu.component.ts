import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MenuApiService } from '../services/menu-api.service';
import { MenuCartService } from '../services/menu-cart.service';
import { CartComponent } from '../components/cart.component';
import { MenuCategory, OrderStatus } from '../interfaces/table.interface';

type MenuView = 'loading' | 'error' | 'name' | 'table-full' | 'categories' | 'products' | 'orders';

const ORDER_STATUS: Record<OrderStatus, { label: string; classes: string }> = {
  pending: { label: 'En espera', classes: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'En preparación', classes: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
};

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [DecimalPipe, CartComponent],
  template: `
    <div class="min-h-screen bg-gray-50">

      <!-- Loading inicial -->
      @if (view() === 'loading') {
        <div class="flex items-center justify-center min-h-screen">
          <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }

      <!-- Error -->
      @if (view() === 'error') {
        <div class="flex flex-col items-center justify-center min-h-screen px-4 text-center">
          <div class="text-6xl mb-4">🚫</div>
          <h1 class="text-xl font-bold text-gray-800">{{ errorMessage() }}</h1>
          <p class="text-gray-500 text-sm mt-2">Verifica que el código QR sea correcto.</p>
        </div>
      }

      <!-- Mesa no disponible -->
      @if (view() === 'table-full') {
        <div class="flex flex-col items-center justify-center min-h-screen px-4 text-center">
          <div class="text-6xl mb-4">🪑</div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Mesa no disponible</h1>
          <p class="text-gray-500 text-sm max-w-xs">
            Esta mesa no está disponible en este momento. Por favor inténtalo de nuevo más tarde.
          </p>
        </div>
      }

      <!-- Pantalla de nombre -->
      @if (view() === 'name') {
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            <div class="text-5xl mb-4">🍦</div>
            <h1 class="text-2xl font-bold text-gray-900 mb-1">¡Bienvenido!</h1>
            <p class="text-sm text-gray-400 mb-6">Ingresa tu nombre para ver el menú</p>

            <div class="space-y-4 text-left">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">
                  ¿Cuál es tu nombre?
                </label>
                <input
                  type="text"
                  [value]="nameInput()"
                  (input)="nameInput.set($any($event.target).value)"
                  (keyup.enter)="confirmName()"
                  placeholder="Tu nombre"
                  autofocus
                  class="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
                  [class.border-red-400]="nameError()"
                  [class.border-gray-200]="!nameError()"
                />
                @if (nameError()) {
                  <p class="text-red-500 text-xs mt-1">Por favor ingresa tu nombre para continuar</p>
                }
              </div>
              <button
                (click)="confirmName()"
                [disabled]="joining()"
                class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                @if (joining()) {
                  <span class="flex items-center justify-center gap-2">
                    <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Abriendo menú...
                  </span>
                } @else {
                  Continuar
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ══════════════════════════════════════ -->
      <!-- PANTALLA: SELECCIÓN DE CATEGORÍA      -->
      <!-- ══════════════════════════════════════ -->
      @if (view() === 'categories') {
        <div class="max-w-5xl mx-auto px-4 py-8 md:flex md:gap-6 md:items-start">

          <!-- Columna principal -->
          <div class="flex-1 min-w-0">
            <!-- Header -->
            <div class="text-center mb-8">
              <div class="text-4xl mb-2">🍦</div>
              <h1 class="text-2xl font-bold text-gray-900">¿Qué deseas pedir?</h1>
              @if (tableName()) {
                <p class="text-indigo-600 font-medium mt-1">{{ tableName() }}</p>
              }
              <p class="text-sm text-gray-400 mt-0.5">Hola, {{ customerName() }} 👋</p>
              <button
                (click)="openOrders()"
                class="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-medium transition-colors"
              >
                🧾 Mis pedidos
                @if (cart.orders().length > 0) {
                  <span class="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-bold">
                    {{ cart.orders().length }}
                  </span>
                }
              </button>
            </div>

            @if (categories().length === 0) {
              <div class="text-center py-16">
                <div class="text-5xl mb-4">📋</div>
                <p class="text-gray-600 font-medium">El menú no tiene categorías disponibles en este momento</p>
              </div>
            } @else {
              <!-- Grilla de categorías -->
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                @for (category of categories(); track category.id) {
                  <button
                    (click)="selectCategory(category)"
                    class="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center hover:border-indigo-300 hover:shadow-md active:scale-95 transition-all"
                  >
                    <div class="w-14 h-14 mx-auto mb-3 rounded-xl bg-indigo-50 flex items-center justify-center text-3xl group-hover:bg-indigo-100 transition-colors">
                      🍦
                    </div>
                    <p class="font-bold text-gray-900 text-sm leading-tight">{{ category.name }}</p>
                  </button>
                }
              </div>
            }
          </div>

          <!-- Panel carrito desktop -->
          <div class="hidden md:block w-80 shrink-0 sticky top-6">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 min-h-64">
              <app-cart />
            </div>
          </div>
        </div>

        <!-- FAB carrito mobile -->
        <div class="md:hidden">
          @if (!cartDrawerOpen()) {
            <button
              (click)="cartDrawerOpen.set(true)"
              class="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-indigo-700 transition-colors z-40"
            >
              🛒
              @if (cart.totalItems() > 0) {
                <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {{ cart.totalItems() }}
                </span>
              }
            </button>
          }
          @if (cartDrawerOpen()) {
            <div class="fixed inset-0 bg-black/40 z-40" (click)="cartDrawerOpen.set(false)"></div>
            <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 max-h-[80vh] overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
                <span class="text-base font-bold text-gray-900">Carrito</span>
                <button (click)="cartDrawerOpen.set(false)" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <app-cart />
            </div>
          }
        </div>
      }

      <!-- ══════════════════════════════════════ -->
      <!-- PANTALLA: PRODUCTOS DE CATEGORÍA      -->
      <!-- ══════════════════════════════════════ -->
      @if (view() === 'products' && selectedCategory()) {
        <div class="max-w-5xl mx-auto px-4 py-6 md:flex md:gap-6 md:items-start">

          <!-- Columna principal -->
          <div class="flex-1 min-w-0">
            <!-- Header con volver -->
            <div class="flex items-center gap-3 mb-6">
              <button
                (click)="view.set('categories')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-medium text-sm transition-colors"
              >
                ← Categorías
              </button>
              <span class="text-gray-200 select-none">|</span>
              <h1 class="text-lg font-bold text-gray-900 truncate">{{ selectedCategory()!.name }}</h1>
            </div>

            @if (loadingProducts()) {
              <div class="flex justify-center py-12">
                <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            } @else if (selectedCategory()!.products.length === 0) {
              <div class="text-center py-16">
                <div class="text-5xl mb-4">📋</div>
                <p class="text-gray-600 font-medium">No hay productos en esta categoría</p>
              </div>
            } @else {
              <!-- Grid de productos -->
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-28 md:pb-8">
                @for (product of selectedCategory()!.products; track product.id) {
                  <div
                    class="bg-white rounded-2xl shadow-sm border overflow-hidden transition-all"
                    [class.border-indigo-300]="cartQuantity(product.id) > 0"
                    [class.border-gray-100]="cartQuantity(product.id) === 0"
                  >
                    <!-- Imagen / placeholder (el backend del menú no provee imágenes) -->
                    <div class="relative">
                      <div class="w-full aspect-square bg-indigo-50 flex items-center justify-center text-4xl">
                        🍦
                      </div>
                      @if (cartQuantity(product.id) > 0) {
                        <span class="absolute top-2 right-2 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                          {{ cartQuantity(product.id) }}
                        </span>
                      }
                    </div>

                    <!-- Info + controles -->
                    <div class="p-3">
                      <p class="font-semibold text-gray-900 text-sm leading-tight">{{ product.name }}</p>
                      @if (product.description) {
                        <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ product.description }}</p>
                      }
                      <div class="flex items-center justify-between mt-2.5">
                        <p class="text-indigo-600 font-bold text-sm">$ {{ product.price | number:'1.2-2' }}</p>
                        <!-- Controles carrito -->
                        @if (cartQuantity(product.id) > 0) {
                          <div class="flex items-center gap-1">
                            <button
                              (click)="cart.decrementProduct(product.id)"
                              class="w-6 h-6 rounded-full bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-600 text-sm font-bold flex items-center justify-center transition-colors"
                            >
                              −
                            </button>
                            <span class="w-5 text-center text-xs font-bold text-gray-900">
                              {{ cartQuantity(product.id) }}
                            </span>
                            <button
                              (click)="cart.incrementProduct(product.id)"
                              class="w-6 h-6 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-bold flex items-center justify-center transition-colors"
                            >
                              +
                            </button>
                          </div>
                        } @else {
                          <button
                            (click)="cart.incrementProduct(product.id)"
                            class="w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold flex items-center justify-center transition-colors"
                          >
                            +
                          </button>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Panel carrito desktop -->
          <div class="hidden md:block w-80 shrink-0 sticky top-6">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 min-h-64">
              <app-cart />
            </div>
          </div>
        </div>

        <!-- FAB carrito mobile -->
        <div class="md:hidden">
          @if (!cartDrawerOpen()) {
            <button
              (click)="cartDrawerOpen.set(true)"
              class="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-indigo-700 transition-colors z-40"
            >
              🛒
              @if (cart.totalItems() > 0) {
                <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {{ cart.totalItems() }}
                </span>
              }
            </button>
          }
          @if (cartDrawerOpen()) {
            <div class="fixed inset-0 bg-black/40 z-40" (click)="cartDrawerOpen.set(false)"></div>
            <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 max-h-[80vh] overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
                <span class="text-base font-bold text-gray-900">Carrito</span>
                <button (click)="cartDrawerOpen.set(false)" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <app-cart />
            </div>
          }
        </div>
      }

      <!-- ══════════════════════════════════════ -->
      <!-- PANTALLA: ÓRDENES DE LA MESA           -->
      <!-- ══════════════════════════════════════ -->
      @if (view() === 'orders') {
        <div class="max-w-3xl mx-auto px-4 py-6">
          <!-- Header con volver + refrescar -->
          <div class="flex items-center justify-between gap-3 mb-6">
            <button
              (click)="view.set('categories')"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-medium text-sm transition-colors"
            >
              ← Menú
            </button>
            <h1 class="text-lg font-bold text-gray-900 flex-1 truncate">Órdenes de la mesa</h1>
            <button
              (click)="cart.loadActiveOrders()"
              [disabled]="cart.ordersLoading()"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors disabled:opacity-50"
            >
              ↻ Refrescar
            </button>
          </div>

          @if (cart.ordersError()) {
            <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
              {{ cart.ordersError() }}
            </div>
          }

          @if (cart.ordersLoading() && cart.orders().length === 0) {
            <div class="flex justify-center py-12">
              <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          } @else if (cart.orders().length === 0) {
            <div class="text-center py-16">
              <div class="text-5xl mb-4">🧾</div>
              <p class="text-gray-600 font-medium">Aún no hay órdenes para esta mesa</p>
            </div>
          } @else {
            <div class="space-y-4">
              @for (order of cart.orders(); track order.id) {
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <!-- Cabecera de la orden -->
                  <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(order.status)">
                          {{ statusLabel(order.status) }}
                        </span>
                        <span class="text-xs text-gray-500">
                          {{ order.scope === 'table' ? 'Mesa' : 'Individual' }}
                        </span>
                      </div>
                      @if (order.customer_name) {
                        <p class="text-xs text-gray-400 mt-0.5 truncate">{{ order.customer_name }}</p>
                      }
                    </div>
                    <span class="text-sm font-bold text-gray-900 shrink-0">$ {{ +order.total | number:'1.2-2' }}</span>
                  </div>

                  <!-- Detalle de ítems -->
                  <div class="px-4 py-3 space-y-1.5">
                    @for (item of order.items ?? []; track item.id) {
                      <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-700 truncate">{{ item.product_name }}</span>
                        <div class="flex items-center gap-3 shrink-0">
                          <span class="text-xs text-gray-400">× {{ item.quantity }}</span>
                          <span class="text-gray-600 w-16 text-right">$ {{ +item.subtotal | number:'1.2-2' }}</span>
                        </div>
                      </div>
                    } @empty {
                      <p class="text-sm text-gray-400">Sin ítems</p>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

    </div>
  `,
})
export class PublicMenuComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly menuApi = inject(MenuApiService);
  readonly cart = inject(MenuCartService);

  readonly view = signal<MenuView>('loading');
  readonly tableName = signal<string | null>(null);
  readonly customerName = signal<string>('');
  readonly categories = signal<MenuCategory[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly cartDrawerOpen = signal(false);
  readonly nameInput = signal<string>('');
  readonly nameError = signal<boolean>(false);
  readonly joining = signal(false);
  readonly selectedCategory = signal<MenuCategory | null>(null);
  readonly loadingProducts = signal(false);

  private code = '';

  constructor() {
    // When an order is placed (in <app-cart>), jump to the orders section so the
    // diner sees the just-created order. The flag resets on the next cart change.
    effect(() => {
      if (this.cart.lastOrderConfirmed()) {
        this.view.set('orders');
      }
    });
  }

  /** Quantity the current diner has of a product (drives the product badge). */
  cartQuantity(productId: string): number {
    return this.cart.myQuantityForProduct(productId);
  }

  /** Open the orders section, loading the active orders. */
  openOrders(): void {
    this.cart.loadActiveOrders();
    this.view.set('orders');
  }

  statusLabel(status: OrderStatus): string {
    return ORDER_STATUS[status]?.label ?? status;
  }

  statusClass(status: OrderStatus): string {
    return ORDER_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
  }

  async ngOnInit(): Promise<void> {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';

    // Resume a stored session (survives reloads); fall back to the name screen.
    if (this.menuApi.restoreToken(this.code)) {
      try {
        this.categories.set(await this.menuApi.getCategories());
        await this.cart.refresh();
        this.view.set('categories');
        return;
      } catch {
        this.menuApi.clearToken(this.code);
      }
    }
    this.view.set('name');
  }

  async confirmName(): Promise<void> {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set(true);
      return;
    }
    this.nameError.set(false);

    this.joining.set(true);
    try {
      const session = await this.menuApi.openSession(this.code, name);
      this.tableName.set(session.table_name);
      this.customerName.set(session.customer_name);
      this.categories.set(await this.menuApi.getCategories());
      await this.cart.refresh();
      this.view.set('categories');
    } catch (err) {
      this.handleSessionError(err);
    } finally {
      this.joining.set(false);
    }
  }

  async selectCategory(category: MenuCategory): Promise<void> {
    this.selectedCategory.set(category);
    this.view.set('products');

    if (category.products.length > 0) return; // already loaded

    this.loadingProducts.set(true);
    try {
      const products = await this.menuApi.getProducts(category.id);
      const updated = { ...category, products };
      this.selectedCategory.set(updated);
      this.categories.update(list => list.map(c => (c.id === category.id ? updated : c)));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.expireSession();
      }
    } finally {
      this.loadingProducts.set(false);
    }
  }

  private handleSessionError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 404) {
        this.errorMessage.set('Mesa no encontrada');
        this.view.set('error');
        return;
      }
      if (err.status === 409) {
        this.view.set('table-full');
        return;
      }
    }
    this.errorMessage.set(this.menuApi.extractError(err));
    this.view.set('error');
  }

  /** Session token rejected (401): clear it and return to the name screen. */
  private expireSession(): void {
    this.menuApi.clearToken(this.code);
    this.categories.set([]);
    this.selectedCategory.set(null);
    this.view.set('name');
  }
}
