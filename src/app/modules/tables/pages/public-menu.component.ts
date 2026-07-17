import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MenuCategory, MenuProduct } from '../../products/interfaces/product.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { DiningCartService } from '../services/dining-cart.service';
import { buildMenuLookup } from '../services/menu-lookup';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { CartComponent } from '../components/cart.component';
import {
  ProductSelectComponent,
  ProductSelection,
} from '../components/product-select.component';

type MenuView = 'loading' | 'error' | 'name' | 'menu';

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [CartComponent, ProductSelectComponent],
  template: `
    <div class="min-h-screen bg-gray-50">

      <!-- Loading -->
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

      <!-- Name screen -->
      @if (view() === 'name') {
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            <div class="text-5xl mb-4">🍦</div>
            <h1 class="text-2xl font-bold text-gray-900 mb-1">¡Bienvenido!</h1>
            @if (tableLabel()) {
              <p class="text-indigo-600 font-medium">{{ tableLabel() }}</p>
            }
            <p class="text-sm text-gray-400 mb-6">Ingresa tu nombre para ver el menú</p>

            <div class="space-y-4 text-left">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">¿Cuál es tu nombre?</label>
                <input
                  type="text"
                  [value]="nameInput()"
                  (input)="nameInput.set($any($event.target).value)"
                  (keyup.enter)="confirmName()"
                  placeholder="Tu nombre"
                  class="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
                  [class.border-red-400]="nameError()"
                  [class.border-gray-200]="!nameError()"
                />
                @if (nameError()) {
                  <p class="text-red-500 text-xs mt-1">Por favor ingresa tu nombre para continuar</p>
                }
              </div>
              @if (errorMessage()) {
                <p class="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{{ errorMessage() }}</p>
              }
              <button
                (click)="confirmName()"
                [disabled]="joining()"
                class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {{ joining() ? 'Abriendo sesión...' : 'Continuar' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Menu -->
      @if (view() === 'menu') {
        <!-- Top bar -->
        <div class="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-bold text-gray-900 truncate">{{ tableLabel() }}</p>
              <p class="text-xs text-gray-400 truncate">Hola, {{ customerName() }} 👋</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              @if (myOrders().length > 0) {
                <button
                  (click)="ordersOpen.set(true)"
                  class="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-medium transition-colors"
                >
                  🧾 Mis pedidos
                  <span class="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-bold">{{ myOrders().length }}</span>
                </button>
              }
              <button
                (click)="exit()"
                class="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                🚪 Salir
              </button>
            </div>
          </div>
        </div>

        <div class="max-w-5xl mx-auto px-4 py-6 md:flex md:gap-6 md:items-start">
          <!-- Menu column -->
          <div class="flex-1 min-w-0">
            @if (orderSuccess()) {
              <div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5 text-center">
                <p class="text-green-700 font-medium text-sm">¡Pedido enviado! 🎉</p>
                <p class="text-green-600 text-xs mt-0.5">El personal lo atenderá pronto. Puedes seguir pidiendo.</p>
              </div>
            }

            @if (categories().length === 0) {
              <div class="text-center py-16">
                <div class="text-5xl mb-4">📋</div>
                <p class="text-gray-600 font-medium">El menú no tiene productos disponibles</p>
              </div>
            } @else {
              @for (category of categories(); track category.id) {
                <section class="mb-8">
                  <h2 class="text-lg font-bold text-gray-900 mb-3">{{ category.name }}</h2>
                  <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    @for (product of category.products; track product.id) {
                      <button
                        (click)="openProduct(product)"
                        class="text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:border-indigo-300 hover:shadow-md active:scale-[0.98] transition-all"
                      >
                        <div class="w-full aspect-square bg-indigo-50 flex items-center justify-center text-4xl overflow-hidden">
                          @if (product.image_url) {
                            <img [src]="product.image_url" [alt]="product.name" class="w-full h-full object-cover" />
                          } @else {
                            🍦
                          }
                        </div>
                        <div class="p-3">
                          <p class="font-semibold text-gray-900 text-sm leading-tight">{{ product.name }}</p>
                          @if (product.description) {
                            <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ product.description }}</p>
                          }
                          <p class="text-indigo-600 font-bold text-sm mt-1.5">{{ priceLabel(product) }}</p>
                        </div>
                      </button>
                    }
                  </div>
                </section>
              }
            }
          </div>

          <!-- Cart (desktop) -->
          <div class="hidden md:block w-80 shrink-0 sticky top-20">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 min-h-64">
              <app-cart [submitting]="submitting()" [error]="orderError()" (submitOrder)="sendOrder()" />
            </div>
          </div>
        </div>

        <!-- Cart FAB + drawer (mobile) -->
        <div class="md:hidden">
          @if (!cartDrawerOpen()) {
            <button
              (click)="cartDrawerOpen.set(true)"
              class="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-indigo-700 transition-colors z-40"
            >
              🛒
              @if (cart.count() > 0) {
                <span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {{ cart.count() }}
                </span>
              }
            </button>
          }
          @if (cartDrawerOpen()) {
            <div class="fixed inset-0 bg-black/40 z-40" (click)="cartDrawerOpen.set(false)"></div>
            <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 max-h-[80vh] overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
                <span class="text-base font-bold text-gray-900">Mi pedido</span>
                <button (click)="cartDrawerOpen.set(false)" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <app-cart [submitting]="submitting()" [error]="orderError()" (submitOrder)="sendOrder()" />
            </div>
          }
        </div>
      }

      <!-- Mis pedidos (drawer) -->
      @if (ordersOpen()) {
        <div class="fixed inset-0 bg-black/40 z-40" (click)="ordersOpen.set(false)"></div>
        <div class="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl z-50 flex flex-col">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 class="text-base font-bold text-gray-900">Mis pedidos</h2>
            <button (click)="ordersOpen.set(false)" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            @for (order of myOrders(); track order.id) {
              <div class="bg-gray-50 rounded-xl border border-gray-100 p-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🍳 En cocina</span>
                  <span class="text-xs text-gray-400">{{ orderTime(order) }}</span>
                </div>
                <ul class="space-y-1">
                  @for (item of order.items ?? []; track item.id) {
                    <li class="text-sm text-gray-700">
                      <span class="font-medium">{{ item.quantity }}×</span> {{ variantLabel(item.product_variant_id) }}
                      @if (optionLabels(item)) {
                        <span class="block text-xs text-gray-400 pl-5">{{ optionLabels(item) }}</span>
                      }
                    </li>
                  }
                </ul>
              </div>
            } @empty {
              <p class="text-center text-sm text-gray-400 py-8">Aún no has enviado pedidos</p>
            }
          </div>
          <div class="px-5 py-3 border-t border-gray-100">
            <p class="text-xs text-gray-400 text-center">El personal está preparando tus pedidos 🍨</p>
          </div>
        </div>
      }

      <!-- Product selection modal -->
      @if (selectedProduct()) {
        <app-product-select
          [product]="selectedProduct()!"
          (added)="onProductAdded($event)"
          (cancelled)="selectedProduct.set(null)"
        />
      }
    </div>
  `,
})
export class PublicMenuComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(DiningSessionService);
  readonly cart = inject(DiningCartService);

  readonly view = signal<MenuView>('loading');
  readonly categories = signal<MenuCategory[]>([]);
  readonly errorMessage = signal<string | null>(null);

  readonly tableNumber = signal<number | null>(null);
  readonly tableName = signal<string | null>(null);
  readonly customerName = signal<string>('');

  readonly nameInput = signal('');
  readonly nameError = signal(false);
  readonly joining = signal(false);

  readonly selectedProduct = signal<MenuProduct | null>(null);
  readonly cartDrawerOpen = signal(false);
  readonly submitting = signal(false);
  readonly orderError = signal<string | null>(null);
  readonly orderSuccess = signal(false);

  /** Orders this diner has submitted in this session (local; no public status API). */
  readonly myOrders = signal<DiningOrder[]>([]);
  readonly ordersOpen = signal(false);

  private readonly lookup = computed(() => buildMenuLookup(this.categories()));

  readonly tableLabel = computed(() => {
    const n = this.tableNumber();
    const name = this.tableName();
    if (n != null && name) return `Mesa ${n} · ${name}`;
    if (n != null) return `Mesa ${n}`;
    return name ?? '';
  });

  /** The URL token IS the table's UUID `qr_token` (used to open the session). */
  private token = '';
  private sessionId: string | null = null;

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';

    // Resolve the table + menu from the QR token.
    try {
      const { table, categories } = await this.api.resolveByToken(this.token);
      this.tableNumber.set(table.number);
      this.tableName.set(table.name);
      this.categories.set(categories);
    } catch (err) {
      this.handleResolveError(err);
      return;
    }

    // Resume a stored session (survives reloads) or ask for the name.
    const stored = this.api.restoreSession(this.token);
    if (stored) {
      this.sessionId = stored.sessionId;
      this.customerName.set(stored.customerName);
      this.restoreOrders();
      this.view.set('menu');
      return;
    }
    this.view.set('name');
  }

  priceLabel(product: MenuProduct): string {
    const prices = product.variants.map((v) => v.price);
    if (prices.length === 0) return '';
    const min = Math.min(...prices);
    return prices.length > 1 ? `Desde $ ${min.toFixed(2)}` : `$ ${min.toFixed(2)}`;
  }

  async confirmName(): Promise<void> {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set(true);
      return;
    }
    this.nameError.set(false);
    this.errorMessage.set(null);

    if (!this.token) {
      this.errorMessage.set('No se pudo identificar la mesa. Escanea el QR nuevamente.');
      return;
    }

    this.joining.set(true);
    try {
      const session = await this.api.openSession(this.token, name);
      this.sessionId = session.id;
      this.customerName.set(session.customer_name);
      this.api.storeSession(this.token, { sessionId: session.id, customerName: session.customer_name });
      this.view.set('menu');
    } catch (err) {
      this.errorMessage.set(this.api.extractError(err, 'No se pudo abrir la sesión de la mesa.'));
    } finally {
      this.joining.set(false);
    }
  }

  openProduct(product: MenuProduct): void {
    this.orderSuccess.set(false);
    this.selectedProduct.set(product);
  }

  onProductAdded(selection: ProductSelection): void {
    this.cart.add(
      selection.product,
      selection.variant,
      selection.options,
      selection.quantity,
      selection.notes,
    );
    this.selectedProduct.set(null);
  }

  async sendOrder(): Promise<void> {
    if (this.cart.isEmpty() || !this.sessionId) return;
    this.submitting.set(true);
    this.orderError.set(null);
    try {
      const order = await this.api.createOrder({
        channel: 'qr',
        dining_session_id: this.sessionId,
        items: this.cart.toOrderItems(),
      });
      this.myOrders.update((list) => [order, ...list]);
      this.persistOrders();
      this.cart.clear();
      this.orderSuccess.set(true);
      this.cartDrawerOpen.set(false);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.expireSession();
        return;
      }
      this.orderError.set(this.api.extractError(err, 'No se pudo enviar el pedido.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Diner-side exit. The backend only lets STAFF close a session
   * (`POST /orders/sessions/{id}/close` requires auth), so here we just clear the
   * local session and thank the diner; staff closes it server-side afterwards.
   */
  exit(): void {
    this.api.clearSession(this.token);
    this.clearOrders();
    this.cart.clear();
    this.sessionId = null;
    this.ordersOpen.set(false);
    this.errorMessage.set('Gracias por tu visita 🍦 El personal cerrará tu cuenta.');
    this.view.set('error');
  }

  variantLabel(variantId: string): string {
    return this.lookup().variantLabel(variantId);
  }

  optionLabels(item: DiningOrderItem): string {
    return (item.options ?? []).map((o) => this.lookup().optionLabel(o.option_id)).filter(Boolean).join(', ');
  }

  orderTime(order: DiningOrder): string {
    return new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Local persistence of submitted orders (no public status endpoint) ──────
  private ordersKey(): string {
    return `dining.orders.${this.token}`;
  }

  private persistOrders(): void {
    sessionStorage.setItem(this.ordersKey(), JSON.stringify(this.myOrders()));
  }

  private restoreOrders(): void {
    const raw = sessionStorage.getItem(this.ordersKey());
    if (!raw) return;
    try {
      this.myOrders.set(JSON.parse(raw) as DiningOrder[]);
    } catch {
      /* ignore corrupt storage */
    }
  }

  private clearOrders(): void {
    sessionStorage.removeItem(this.ordersKey());
  }

  private handleResolveError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 404) {
      this.errorMessage.set('Mesa no encontrada');
    } else {
      this.errorMessage.set(this.api.extractError(err, 'No se pudo cargar el menú.'));
    }
    this.view.set('error');
  }

  /** Session rejected (401): clear it and return to the name screen. */
  private expireSession(): void {
    this.api.clearSession(this.token);
    this.clearOrders();
    this.myOrders.set([]);
    this.sessionId = null;
    this.orderError.set(null);
    this.errorMessage.set('Tu sesión expiró. Ingresa tu nombre de nuevo.');
    this.view.set('name');
  }
}
