import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { PublicMenuService, PublicMenuData } from '../services/public-menu.service';
import { CartService } from '../services/cart.service';
import { CartComponent } from '../components/cart.component';

type MenuView = 'loading' | 'error' | 'name' | 'joining' | 'table-full' | 'active-session' | 'menu';

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

      <!-- Mesa llena -->
      @if (view() === 'table-full') {
        <div class="flex flex-col items-center justify-center min-h-screen px-4 text-center">
          <div class="text-6xl mb-4">🪑</div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Mesa llena</h1>
          <p class="text-gray-500 text-sm max-w-xs">
            Esta mesa alcanzó su capacidad máxima de comensales.
            Por favor espera a que se libere un lugar.
          </p>
          @if (menuData()) {
            <p class="text-indigo-600 font-medium mt-4 text-sm">{{ menuData()!.table.name }}</p>
          }
        </div>
      }

      <!-- Pantalla de nombre -->
      @if (view() === 'name') {
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            <div class="text-5xl mb-4">🍦</div>
            <h1 class="text-2xl font-bold text-gray-900 mb-1">¡Bienvenido!</h1>
            <p class="text-sm text-indigo-600 font-medium mb-6">{{ menuData()!.table.name }}</p>

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
                    Uniéndote...
                  </span>
                } @else {
                  Continuar
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Pantalla sesión activa -->
      @if (view() === 'active-session') {
        @let session = cart.activeSession()!;
        <div class="min-h-screen flex items-center justify-center px-4 py-8">
          <div class="w-full max-w-sm">
            <!-- Header -->
            <div class="text-center mb-6">
              <div class="text-4xl mb-2">🍦</div>
              <h1 class="text-xl font-bold text-gray-900">Sesión activa</h1>
              <p class="text-indigo-600 font-medium text-sm mt-0.5">{{ menuData()!.table.name }}</p>
              <div class="mt-2 flex items-center justify-center gap-1.5">
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                  👥 {{ session.memberCount }} de {{ session.capacity }} personas
                </span>
              </div>
            </div>

            <!-- Aviso cuenta solicitada -->
            @if (session.orderStatus === 'bill_requested') {
              <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-center">
                <p class="text-amber-700 font-medium text-sm">La cuenta está siendo procesada</p>
                <p class="text-amber-600 text-xs mt-0.5">No es posible agregar más ítems</p>
              </div>
            }

            <!-- Ítems ya pedidos -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
              <h2 class="text-sm font-semibold text-gray-700 mb-3">Pedido actual de la mesa</h2>
              @if (session.items.length === 0) {
                <p class="text-sm text-gray-400 text-center py-3">Sin ítems aún</p>
              } @else {
                <div class="space-y-2">
                  @for (item of session.items; track $index) {
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-gray-700">{{ item.product_name }}</span>
                      <div class="flex items-center gap-2 text-right">
                        <span class="text-gray-400 text-xs">×{{ item.quantity }}</span>
                        <span class="font-medium text-indigo-600">$ {{ item.subtotal | number:'1.2-2' }}</span>
                      </div>
                    </div>
                  }
                </div>
                <div class="border-t border-gray-100 mt-3 pt-3 flex justify-between text-sm font-semibold">
                  <span class="text-gray-600">Total mesa</span>
                  <span class="text-gray-900">$ {{ session.total | number:'1.2-2' }}</span>
                </div>
              }
            </div>

            <!-- Botón ver menú -->
            <button
              (click)="goToMenu()"
              [disabled]="session.orderStatus === 'bill_requested'"
              class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Ver menú y agregar más
            </button>

            @if (session.orderStatus === 'bill_requested') {
              <p class="text-center text-xs text-gray-400 mt-3">La cuenta ya fue solicitada</p>
            }
          </div>
        </div>
      }

      <!-- Menú público -->
      @if (view() === 'menu' && menuData()) {
        <div class="max-w-5xl mx-auto px-4 py-8 md:flex md:gap-6 md:items-start">

          <!-- Columna de productos -->
          <div class="flex-1 min-w-0">
            <div class="text-center mb-8">
              <div class="text-4xl mb-2">🍦</div>
              <h1 class="text-3xl font-bold text-gray-900">Menú</h1>
              <p class="text-indigo-600 font-medium mt-1">{{ menuData()!.table.name }}</p>
              <p class="text-sm text-gray-400 mt-0.5">Hola, {{ cart.customerName() }} 👋</p>
              @if (cart.activeSession()) {
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 mt-1">
                  👥 {{ cart.activeSession()!.memberCount }} de {{ cart.activeSession()!.capacity }} en mesa
                </span>
              }
            </div>

            @if (menuData()!.categories.length === 0) {
              <div class="text-center py-16">
                <div class="text-5xl mb-4">📋</div>
                <p class="text-gray-600 font-medium">El menú no tiene productos disponibles en este momento</p>
              </div>
            }

            @for (category of menuData()!.categories; track category.id) {
              <div class="mb-8">
                <h2 class="text-lg font-bold text-gray-800 mb-3 pb-2 border-b-2 border-indigo-100">
                  {{ category.name }}
                </h2>
                <div class="space-y-3">
                  @for (product of category.products; track product.id) {
                    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
                      @if (product.image_url) {
                        <img [src]="product.image_url" [alt]="product.name" class="w-16 h-16 rounded-lg object-cover shrink-0" />
                      } @else {
                        <div class="w-16 h-16 rounded-lg bg-indigo-50 flex items-center justify-center text-2xl shrink-0">🍦</div>
                      }
                      <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-900 text-sm">{{ product.name }}</p>
                        @if (product.description) {
                          <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ product.description }}</p>
                        }
                      </div>
                      <div class="flex flex-col items-end gap-1.5 shrink-0">
                        <p class="text-indigo-600 font-bold text-sm">$ {{ product.price | number:'1.2-2' }}</p>
                        @if (cartQuantity(product.id) > 0) {
                          <div class="flex items-center gap-1">
                            <button
                              (click)="cart.removeItem(product.id)"
                              class="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-600 text-sm font-bold flex items-center justify-center transition-colors"
                            >
                              −
                            </button>
                            <span class="w-5 text-center text-sm font-semibold">{{ cartQuantity(product.id) }}</span>
                            <button
                              (click)="cart.addItem(product)"
                              class="w-7 h-7 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-bold flex items-center justify-center transition-colors"
                            >
                              +
                            </button>
                          </div>
                        } @else {
                          <button
                            (click)="cart.addItem(product)"
                            class="w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold flex items-center justify-center transition-colors"
                          >
                            +
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <p class="text-center text-xs text-gray-400 mt-8 mb-24 md:mb-8">
              Consulta disponibilidad con nuestro personal
            </p>
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
            <div
              class="fixed inset-0 bg-black/40 z-40"
              (click)="cartDrawerOpen.set(false)"
            ></div>
            <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 max-h-[80vh] overflow-y-auto">
              <div class="flex items-center justify-between mb-4">
                <span class="text-base font-bold text-gray-900">Carrito</span>
                <button
                  (click)="cartDrawerOpen.set(false)"
                  class="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ✕
                </button>
              </div>
              <app-cart />
            </div>
          }
        </div>
      }

    </div>
  `,
})
export class PublicMenuComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly publicMenuService = inject(PublicMenuService);
  readonly cart = inject(CartService);

  readonly view = signal<MenuView>('loading');
  readonly menuData = signal<PublicMenuData | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly cartDrawerOpen = signal(false);
  readonly nameInput = signal<string>('');
  readonly nameError = signal<boolean>(false);
  readonly joining = signal(false);

  private readonly cartMap = computed(() => {
    const map = new Map<string, number>();
    for (const item of this.cart.items()) {
      map.set(item.product.id, item.quantity);
    }
    return map;
  });

  cartQuantity(productId: string): number {
    return this.cartMap().get(productId) ?? 0;
  }

  async confirmName(): Promise<void> {
    const name = this.nameInput().trim();
    if (!name) {
      this.nameError.set(true);
      return;
    }
    this.nameError.set(false);
    this.cart.setCustomerName(name);

    const session = this.cart.activeSession();

    if (!session) {
      // No active session — go directly to menu
      this.view.set('menu');
      return;
    }

    // Check capacity before joining
    if (session.memberCount >= session.capacity) {
      this.view.set('table-full');
      return;
    }

    // Join the session
    this.joining.set(true);
    const joined = await this.cart.joinSession();
    this.joining.set(false);

    if (!joined) {
      // Table became full between check and join
      this.view.set('table-full');
      return;
    }

    this.view.set('active-session');
  }

  goToMenu(): void {
    this.view.set('menu');
  }

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    const data = await this.publicMenuService.getMenuByCode(code);

    if (!data) {
      this.errorMessage.set('Mesa no encontrada');
      this.view.set('error');
      return;
    }

    if (!data.table.is_active) {
      this.errorMessage.set('Esta mesa no está disponible');
      this.view.set('error');
      return;
    }

    this.menuData.set(data);
    await this.cart.setTable(data.table.id);

    const session = this.cart.activeSession();

    if (this.cart.isRejoin()) {
      // Already a member of this session — go straight to menu (or active-session if bill_requested)
      if (session?.orderStatus === 'bill_requested') {
        this.view.set('active-session');
      } else {
        this.view.set('menu');
      }
      return;
    }

    if (session && session.memberCount >= session.capacity) {
      // Table is full — block access
      this.view.set('table-full');
      return;
    }

    // Check if user already has a name saved
    if (this.cart.customerName()) {
      if (session) {
        // Has name, has session, not rejoin → join automatically
        if (session.memberCount >= session.capacity) {
          this.view.set('table-full');
          return;
        }
        this.joining.set(true);
        const joined = await this.cart.joinSession();
        this.joining.set(false);

        if (!joined) {
          this.view.set('table-full');
          return;
        }
        this.view.set('active-session');
      } else {
        this.view.set('menu');
      }
      return;
    }

    // No name yet — show name screen
    this.view.set('name');
  }
}
