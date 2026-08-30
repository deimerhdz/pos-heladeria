import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MenuCategory, MenuProduct } from '../../products/interfaces/product.interface';
import { DinerService, DinerSessionExpiredError } from '../services/diner.service';
import { DinerTokenStore } from '../services/diner-token.store';
import { DiningCartService } from '../services/dining-cart.service';
import { buildMenuLookup } from '../services/menu-lookup';
import { DiscountInfo, discountInfo, effectivePrice } from '../../promotions/services/promotion-pricing.util';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { DinerPaymentAttempt, DinerPaymentMethod } from '../interfaces/diner.interface';
import { VisibleInterval, startVisibleInterval } from '../../../core/realtime/visible-interval';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  esperaConfirmacion,
  kitchenStatusClass,
  kitchenStatusLabel,
  orderStatusClass,
  orderStatusLabel,
  puedeCancelarComensal,
} from '../../orders/order-status.util';
import { CartComponent } from '../components/cart.component';
import { MoneyPipe } from '../../../shared/money.pipe';
import { formatMoney } from '../../../shared/money';
import { IconComponent } from '../../../shared/icon/icon.component';
import { normalizeText } from '../../../shared/normalize-text';
import {
  ProductSelectComponent,
  ProductSelection,
} from '../components/product-select.component';

type MenuView = 'loading' | 'error' | 'name' | 'menu' | 'exited';
/** Secciones navegables dentro de la vista `menu`, reflejadas en el query param `v`. */
type MenuSection = 'carta' | 'pedidos';
/**
 * Nombre del query param de sección. **No puede ser `s`**: ese lo usa
 * `DinerTokenStore` para el token de sesión del comensal.
 */
const SECTION_PARAM = 'v';

/** Sondeo de respaldo cuando el stream de tiempo real está caído. */
const ORDERS_POLL_MS = 10_000;
/** Con el stream sano basta un latido lento: es red de seguridad, no la fuente. */
const ORDERS_POLL_SSE_MS = 60_000;
/** Agrupa la ráfaga de eventos de una misma acción en una sola recarga. */
const REFRESH_DEBOUNCE_MS = 250;

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [CartComponent, ProductSelectComponent, IconComponent, MoneyPipe],
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

      <!-- Acceso finalizado (Bug 1): tras "Salir" explícito, ni recargar, "Atrás"/
           "Adelante" ni reabrir la misma URL en esta pestaña deben ofrecer de nuevo
           el flujo de acceso — la única vía prevista es volver a escanear el QR
           físico de la mesa (FR-002 a FR-006). Sin botón ni enlace hacia
           confirmName()/openSession() a propósito. -->
      @if (view() === 'exited') {
        <div class="flex flex-col items-center justify-center min-h-screen px-4 text-center">
          @if (businessLogo()) {
            <img
              [src]="businessLogo()"
              [alt]="businessName() ?? ''"
              class="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border border-gray-100"
            />
          }
          <h1 class="text-xl font-bold text-gray-800">
            {{ businessName() ? '¡Gracias por tu visita a ' + businessName() + '!' : '¡Gracias por tu visita!' }}
          </h1>
          <p class="text-gray-500 text-sm mt-2">
            Acceso finalizado, vuelve a escanear el código QR de tu mesa
          </p>
        </div>
      }

      <!-- Name screen -->
      @if (view() === 'name') {
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            @if (businessLogo()) {
              <img
                [src]="businessLogo()"
                [alt]="businessName() ?? ''"
                class="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border border-gray-100"
              />
            } @else {
              <div class="text-5xl mb-4">🍦</div>
            }
            <h1 class="text-2xl font-bold text-gray-900 mb-1">
              {{ businessName() ? '¡Bienvenido a ' + businessName() + '!' : '¡Bienvenido!' }}
            </h1>
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
            <div class="flex items-center gap-2.5 min-w-0">
              @if (businessLogo()) {
                <img
                  [src]="businessLogo()"
                  [alt]="businessName() ?? ''"
                  class="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0"
                />
              }
              <div class="min-w-0">
                <p class="font-bold text-gray-900 truncate">{{ tableLabel() }}</p>
                <p class="text-xs text-gray-400 truncate">Hola, {{ customerName() }} 👋</p>
              </div>
            </div>
          </div>

          <!-- Segunda fila: lupa + pestañas de categoría. Va dentro de la cabecera
               para compartir su sticky top-0 en vez de calcular un desplazamiento.
               Las pestañas son de la carta; en "Mis pedidos" van el título de sección. -->
          @if (section() === 'pedidos') {
            <div class="max-w-5xl mx-auto px-4 py-2.5 border-t border-gray-50">
              <h1 class="text-sm font-bold text-gray-900">Mis pedidos</h1>
            </div>
          } @else if (categories().length > 0) {
            <div class="max-w-5xl mx-auto px-4 flex items-center gap-2 border-t border-gray-50">
              @if (searchOpen()) {
                <div class="flex items-center gap-2 w-full py-2">
                  <span class="w-5 h-5 block text-gray-400 shrink-0"><app-icon name="search" /></span>
                  <!-- type=text y no search: el navegador añade su propia ✕ y quedaban
                       dos aspas seguidas. inputmode conserva el teclado de búsqueda. -->
                  <input
                    type="text"
                    inputmode="search"
                    autofocus
                    [value]="search()"
                    (input)="search.set($any($event.target).value)"
                    placeholder="Buscar producto…"
                    class="flex-1 min-w-0 py-1.5 text-sm bg-transparent focus:outline-none"
                  />
                  <button (click)="closeSearch()" class="shrink-0 text-gray-400 hover:text-gray-600 px-1">✕</button>
                </div>
              } @else {
                <button
                  (click)="openSearch()"
                  aria-label="Buscar producto"
                  class="shrink-0 p-2 -ml-1 text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  <span class="w-5 h-5 block"><app-icon name="search" /></span>
                </button>
                <nav class="flex-1 min-w-0 overflow-x-auto">
                  <div class="flex gap-1 min-w-max">
                    @for (category of categories(); track category.id) {
                      <button
                        (click)="selectCategory(category.id)"
                        class="px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
                        [class]="activeCategory()?.id === category.id
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-gray-500 hover:text-gray-700'"
                      >
                        {{ category.name }}
                      </button>
                    }
                  </div>
                </nav>
              }
            </div>
          }
        </div>

        <!-- pb-24: deja sitio a la barra inferior fija, o taparía la última fila. -->
        <div class="max-w-5xl mx-auto px-4 py-6 pb-24 md:flex md:gap-6 md:items-start">
          <!-- Menu column -->
          <div class="flex-1 min-w-0">
            @if (section() === 'pedidos') {
              <div class="space-y-3">
                @for (order of myOrders(); track order.id) {
                  <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(order)">
                        {{ statusLabel(order) }}
                      </span>
                      <span class="text-xs text-gray-400">{{ orderTime(order) }}</span>
                    </div>

                    @if (esperaConfirmacion(order)) {
                      <p class="text-xs text-violet-600 mb-2">
                        Esperando a que el personal lo acepte.
                      </p>
                    }

                    <ul class="space-y-1">
                      @for (item of order.items ?? []; track item.id) {
                        <li class="text-sm text-gray-700">
                          <span class="font-medium">{{ item.quantity }}×</span> {{ variantLabel(item.product_variant_id) }}
                          @if (optionLabels(item)) {
                            <span class="block text-xs text-gray-400 pl-5">{{ optionLabels(item) }}</span>
                          }
                          @if (!esperaConfirmacion(order) && item.estado_cocina !== 'anulado') {
                            <span class="block text-xs pl-5" [class]="kitchenClass(item)">
                              {{ kitchenLabel(item) }}
                            </span>
                          }
                        </li>
                      }
                    </ul>

                    <!-- Pago (spec 024/025): solo aplica mientras la orden sigue
                         'recibida'. Todo pedido nace ya con su intento de pago
                         adjunto (spec 025) — el único caso sin
                         current_payment_attempt es un pedido creado antes de
                         este cambio (research.md spec 025, Decisión 7), que no
                         tiene ningún camino de UI para resolverlo aquí. -->
                    @if (order.status === 'recibida' && order.current_payment_attempt) {
                      <div class="mt-3 pt-3 border-t border-gray-100">
                        @if (order.current_payment_attempt.status === 'confirmado') {
                          <p class="text-xs text-emerald-700 font-medium text-center">
                            ✓ Pago confirmado — {{ order.current_payment_attempt.payment_method_name }}
                          </p>
                        } @else if (order.current_payment_attempt.status === 'rechazado') {
                          <div class="text-center">
                            <p class="text-xs text-red-600 mb-1.5">
                              Tu comprobante fue rechazado. Puedes intentar de nuevo.
                            </p>
                            <button
                              (click)="openPayment(order)"
                              class="w-full py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              Reintentar pago
                            </button>
                          </div>
                        } @else if (order.current_payment_attempt.is_cash) {
                          <p class="text-xs text-amber-700 text-center">
                            💵 Vas a pagar en efectivo — el personal confirmará al recibirlo.
                          </p>
                        } @else if (order.current_payment_attempt.receipt_file_url) {
                          <p class="text-xs text-amber-700 text-center">
                            📤 Comprobante enviado — esperando revisión del personal.
                          </p>
                        } @else {
                          <button
                            (click)="openPayment(order)"
                            class="w-full py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                          >
                            📎 Subir comprobante
                          </button>
                        }
                      </div>
                    }

                    @if (canCancel(order)) {
                      <button
                        (click)="cancelOrder(order)"
                        [disabled]="cancelling() === order.id"
                        class="mt-3 w-full py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        {{ cancelling() === order.id ? 'Cancelando...' : 'Cancelar pedido' }}
                      </button>
                    }
                  </div>
                } @empty {
                  <!-- Un panel se cerraba con la ✕; una página necesita su propia salida. -->
                  <div class="text-center py-16">
                    <div class="text-5xl mb-4">🧾</div>
                    <p class="text-gray-600 font-medium">Aún no has enviado pedidos</p>
                    <button
                      (click)="goToSection('carta')"
                      class="mt-4 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Ver la carta
                    </button>
                  </div>
                }

                @if (orderError()) {
                  <p class="text-xs text-red-600 text-center">{{ orderError() }}</p>
                }
                @if (myOrders().length > 0) {
                  <p class="text-xs text-gray-400 text-center pt-2">Se actualiza solo cada pocos segundos 🍨</p>
                }
              </div>
            } @else if (categories().length === 0) {
              <div class="text-center py-16">
                <div class="text-5xl mb-4">📋</div>
                <p class="text-gray-600 font-medium">El menú no tiene productos disponibles</p>
              </div>
            } @else if (visibleProducts().length === 0) {
              <div class="text-center py-16">
                <div class="text-5xl mb-4">🔍</div>
                <p class="text-gray-600 font-medium">
                  @if (searchOpen() && search()) {
                    Ningún producto coincide con «{{ search() }}»
                  } @else {
                    Esta categoría no tiene productos disponibles
                  }
                </p>
              </div>
            } @else {
              @if (searchOpen() && search()) {
                <p class="text-sm text-gray-400 mb-3">
                  {{ visibleProducts().length }} resultado(s) en toda la carta
                </p>
              }
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                @for (product of visibleProducts(); track product.id) {
                  <button
                    (click)="openProduct(product)"
                    class="text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:border-indigo-300 hover:shadow-md active:scale-[0.98] transition-all"
                  >
                    <div class="relative w-full aspect-square bg-indigo-50 flex items-center justify-center text-4xl overflow-hidden">
                      @if (productDiscount(product); as disc) {
                        <span class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          @if (disc.kind === 'fixed') {
                            🏷️ -{{ disc.amountOff | money }}
                          } @else {
                            🏷️ -{{ disc.percent }}%
                          }
                        </span>
                      }
                      @if (product.image_url) {
                        <img [src]="product.image_url" [alt]="product.name" class="w-full h-full object-cover" />
                      } @else {
                        <span class="w-10 h-10 text-gray-300"><app-icon name="image-off" /></span>
                      }
                    </div>
                    <div class="p-3">
                      <p class="font-semibold text-gray-900 text-sm leading-tight">{{ product.name }}</p>
                      @if (product.description) {
                        <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ product.description }}</p>
                      }
                      @if (productDiscount(product); as disc) {
                        <p class="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span class="text-gray-400 text-xs line-through">{{ priceWithPrefix(product, disc.original) }}</span>
                          <span class="text-indigo-600 font-bold text-sm">{{ priceWithPrefix(product, disc.discounted) }}</span>
                        </p>
                      } @else {
                        <p class="text-indigo-600 font-bold text-sm mt-1.5">{{ priceLabel(product) }}</p>
                      }
                    </div>
                  </button>
                }
              </div>
            }
          </div>

          <!-- Cart (desktop). top-32: la cabecera creció con la fila de categorías. -->
          <div class="hidden md:block w-80 shrink-0 sticky top-32">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 min-h-64">
              <app-cart
                [error]="orderError()"
                (submitOrder)="sendOrder()"
                (quantityChanged)="changeQuantity($event.itemId, $event.quantity)"
              />
            </div>
          </div>
        </div>

        <!-- Cart drawer (mobile). El botón flotante se fue a la barra inferior. -->
        <div class="md:hidden">
          @if (cartDrawerOpen()) {
            <div class="fixed inset-0 bg-black/40 z-40" (click)="cartDrawerOpen.set(false)"></div>
            <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl z-50 p-5 max-h-[80vh] overflow-y-auto">
              <!-- El título lo pone app-cart; aquí solo el cierre, o salía dos veces. -->
              <div class="flex items-center justify-end -mb-2">
                <button (click)="cartDrawerOpen.set(false)" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>
              <app-cart
                [error]="orderError()"
                (submitOrder)="sendOrder()"
                (quantityChanged)="changeQuantity($event.itemId, $event.quantity)"
              />
            </div>
          }
        </div>

        <!-- Barra inferior. z-30: por debajo de overlays (z-40) y paneles (z-50), para
             no quedar flotando sobre un panel abierto. -->
        <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30">
          <div class="max-w-5xl mx-auto grid grid-cols-4 md:grid-cols-3">
            <button (click)="goHome()"
              class="flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              [class]="section() === 'carta' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'">
              <span class="w-5 h-5 block"><app-icon name="home" /></span>
              <span class="text-[11px] font-medium">Inicio</span>
            </button>

            <!-- Siempre presente, con globito solo si hay pedidos: un destino de
                 navegación que aparece y desaparece desconcierta. -->
            <button (click)="goToSection('pedidos')"
              class="relative flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              [class]="section() === 'pedidos' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'">
              <span class="relative">
                <span class="w-5 h-5 block"><app-icon name="receipt" /></span>
                @if (myOrders().length > 0) {
                  <span class="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {{ myOrders().length }}
                  </span>
                }
              </span>
              <span class="text-[11px] font-medium">Mis pedidos</span>
            </button>

            <!-- En md+ el carrito ya está fijo en la columna lateral. -->
            <button (click)="cartDrawerOpen.set(true)" class="md:hidden relative flex flex-col items-center gap-0.5 py-2.5 text-gray-500 hover:text-indigo-600 transition-colors">
              <span class="relative">
                <span class="w-5 h-5 block"><app-icon name="cart" /></span>
                @if (cart.count() > 0) {
                  <span class="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {{ cart.count() }}
                  </span>
                }
              </span>
              <span class="text-[11px] font-medium">Carrito</span>
            </button>

            <button (click)="confirmExit()" class="flex flex-col items-center gap-0.5 py-2.5 text-gray-500 hover:text-red-600 transition-colors">
              <span class="w-5 h-5 block"><app-icon name="exit" /></span>
              <span class="text-[11px] font-medium">Salir</span>
            </button>
          </div>
        </nav>
      }


      <!-- Product selection modal -->
      @if (selectedProduct()) {
        <app-product-select
          [product]="selectedProduct()!"
          (added)="onProductAdded($event)"
          (cancelled)="selectedProduct.set(null)"
        />
      }

      <!-- Modal de reintento de pago tras rechazo (spec 024, Historia 5 — sin
           cambios). Solo se abre desde "Reintentar pago" sobre un pedido ya
           existente; el pago inicial ahora pasa por la revisión de abajo. -->
      @if (payingOrder(); as order) {
        <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm">
            <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 class="text-base font-semibold text-gray-900">¿Cómo vas a pagar?</h2>
              <button (click)="closePayment()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
            </div>
            <div class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              @if (paymentError()) {
                <p class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{{ paymentError() }}</p>
              }

              @if (!activeAttempt()) {
                <!-- Paso 1: elegir método -->
                @if (paymentMethods().length === 0) {
                  <p class="text-sm text-gray-400 text-center py-4">Cargando métodos de pago…</p>
                } @else {
                  <div class="space-y-2">
                    @for (m of paymentMethods(); track m.id) {
                      <button
                        (click)="choosePaymentMethod(order, m)"
                        [disabled]="paymentSubmitting()"
                        class="w-full flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-40 transition-colors text-left"
                      >
                        {{ m.is_cash ? '💵' : '📲' }} {{ m.name }}
                      </button>
                    }
                  </div>
                }
              } @else if (!selectedMethod()?.is_cash) {
                <!-- Paso 2 (transferencia): datos de pago + subir comprobante -->
                @if (selectedMethod()?.payment_info; as info) {
                  <div class="bg-indigo-50 rounded-xl p-3 space-y-1">
                    @for (key of objectKeys(info); track key) {
                      <p class="text-sm text-indigo-900">
                        <span class="font-medium capitalize">{{ key }}:</span> {{ info[key] }}
                      </p>
                    }
                  </div>
                }
                <label class="block">
                  <span class="text-xs font-medium text-gray-700">Sube tu comprobante</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    (change)="onReceiptSelected($event)"
                    [disabled]="paymentSubmitting()"
                    class="mt-1 w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
                  />
                </label>
                @if (paymentSubmitting()) {
                  <p class="text-xs text-gray-400 text-center">Subiendo comprobante…</p>
                }
              } @else {
                <p class="text-sm text-gray-600 text-center py-2">
                  Elegiste efectivo — el personal confirmará el pago cuando recibas tu pedido.
                </p>
              }
            </div>
          </div>
        </div>
      }

    </div>
  `,
})
export class PublicMenuComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DinerService);
  private readonly tokenStore = inject(DinerTokenStore);
  private readonly realtime = inject(RealtimeService);

  constructor() {
    // El sondeo se relaja cuando el stream está sano y vuelve al ritmo de antes
    // en cuanto se cae. Al recuperarse, además, una recarga inmediata: lo que
    // pasara mientras estuvo caído no llegó por eventos.
    effect(() => {
      const abierto = this.realtime.status() === 'open';
      this.pollHandle?.setPeriod(abierto ? ORDERS_POLL_SSE_MS : ORDERS_POLL_MS);
    });
  }
  readonly cart = inject(DiningCartService);

  readonly view = signal<MenuView>('loading');
  readonly categories = signal<MenuCategory[]>([]);
  readonly errorMessage = signal<string | null>(null);

  readonly tableNumber = signal<number | null>(null);
  readonly tableName = signal<string | null>(null);
  /** Branding del negocio, que viaja dentro de la respuesta del menú del QR. */
  readonly businessName = signal<string | null>(null);
  readonly businessLogo = signal<string | null>(null);
  /**
   * Nombre a saludar. Se lee del carrito, no de un estado propio: el backend lo
   * devuelve en `GET /cart`, así que sobrevive a la recarga de la página.
   */
  readonly customerName = computed(() => this.cart.dinerName());

  readonly nameInput = signal('');
  readonly nameError = signal(false);
  readonly joining = signal(false);

  readonly selectedProduct = signal<MenuProduct | null>(null);
  readonly cartDrawerOpen = signal(false);
  readonly orderError = signal<string | null>(null);

  /**
   * Pedidos de este comensal. Se refrescan desde `GET /cart/orders`, nunca se
   * reconstruyen con estado local: el avance de cocina solo lo sabe el backend.
   */
  readonly myOrders = signal<DiningOrder[]>([]);
  /**
   * Sección visible. Sale del query param `v` para que quede en el historial: desde
   * "Mis pedidos", el botón atrás del teléfono devuelve a la carta en vez de sacar al
   * comensal del menú.
   */
  readonly section = signal<MenuSection>('carta');
  /** Id del pedido que se está cancelando (para deshabilitar su botón). */
  readonly cancelling = signal<string | null>(null);

  // ── Pagos: reintento tras rechazo (spec 024, Historia 5 — sin cambios) ─────
  /** Orden para la que está abierto el modal de reintento, o `null` si está
   *  cerrado. Solo aplica a un pedido ya existente cuyo intento más reciente
   *  fue rechazado — la orden ya trae su primer intento desde que nace
   *  (spec 025), así que este modal ya no cubre el pago inicial. */
  readonly payingOrder = signal<DiningOrder | null>(null);
  readonly paymentMethods = signal<DinerPaymentMethod[]>([]);
  readonly selectedMethod = signal<DinerPaymentMethod | null>(null);
  /** El intento ya creado en este modal — controla si se muestra la
   *  selección de método (paso 1) o la carga de comprobante (paso 2). */
  readonly activeAttempt = signal<DinerPaymentAttempt | null>(null);
  readonly paymentSubmitting = signal(false);
  readonly paymentError = signal<string | null>(null);

  /** Categoría abierta en las pestañas. Se fija a la primera al cargar el menú. */
  readonly activeCategoryId = signal<string | null>(null);
  /** La lupa sustituye las pestañas por el input: en un móvil no caben las dos. */
  readonly searchOpen = signal(false);
  readonly search = signal('');

  /**
   * Cae en la primera categoría si no hay ninguna elegida. Así no hay que sincronizar
   * el signal al cargar el menú ni al reanudar sesión: la carta nunca se ve vacía.
   */
  readonly activeCategory = computed<MenuCategory | null>(
    () =>
      this.categories().find((c) => c.id === this.activeCategoryId()) ??
      // TS tipa el índice como no-nulo, pero con la carta vacía es `undefined`:
      // el tipo explícito conserva ese caso y justifica el `?.` de la plantilla.
      this.categories()[0] ??
      null,
  );

  /**
   * Lo que se pinta en la rejilla.
   *
   * Buscando se ignora la pestaña y se recorre **toda** la carta: quien escribe un
   * nombre quiere ese producto, no ese producto dentro de la categoría que dejó
   * abierta.
   */
  readonly visibleProducts = computed<MenuProduct[]>(() => {
    const q = normalizeText(this.search());
    if (this.searchOpen() && q) {
      return this.categories()
        .flatMap((c) => c.products)
        .filter((p) => normalizeText(p.name).includes(q));
    }
    return this.activeCategory()?.products ?? [];
  });

  private readonly lookup = computed(() => buildMenuLookup(this.categories()));

  readonly tableLabel = computed(() => {
    const n = this.tableNumber();
    const name = this.tableName();
    if (n != null && name) return `Mesa ${n} · ${name}`;
    if (n != null) return `Mesa ${n}`;
    return name ?? '';
  });

  /** Token **firmado** del QR (JWT): lleva tenant + mesa. */
  private token = '';
  private pollHandle: VisibleInterval | null = null;
  /** Bajas de los handlers de tiempo real. */
  private rtOff: (() => void)[] = [];
  private refreshHandle: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';

    // La sección la manda la URL, no el estado: así el botón atrás la deshace y una
    // recarga estando en "Mis pedidos" vuelve ahí.
    this.route.queryParamMap.subscribe((params) => {
      this.section.set(params.get(SECTION_PARAM) === 'pedidos' ? 'pedidos' : 'carta');
    });

    // 1. Resolver mesa + menú desde el token firmado.
    try {
      const { table, business, categories } = await this.api.resolveByToken(this.token);
      this.tableNumber.set(table.number);
      this.tableName.set(table.name);
      this.businessName.set(business?.name ?? null);
      this.businessLogo.set(business?.logo_url ?? null);
      this.categories.set(categories);
      this.cart.indexMenu(categories);
    } catch (err) {
      this.handleResolveError(err);
      return;
    }

    // 2. ¿Este acceso ya fue cerrado explícitamente en esta pestaña? Si es así,
    //    no se ofrece el flujo de nombre — el único camino de vuelta es volver a
    //    escanear el QR físico (FR-002 a FR-006; `research.md` Decisión 1).
    if (this.tokenStore.isExited(this.token)) {
      this.view.set('exited');
      return;
    }

    // 3. ¿Hay sesión que restaurar? Se comprueba contra el backend, no contra
    //    el estado local: un 401 aquí significa "vuelve a escanear el QR".
    if (!this.tokenStore.token()) {
      this.view.set('name');
      return;
    }
    try {
      await Promise.all([this.cart.load(), this.refreshOrders()]);
      this.view.set('menu');
      this.startPolling();
      this.connectRealtime();
    } catch {
      // Token inválido, sesión cerrada o mesa ya cobrada.
      this.expireSession('Tu sesión terminó. Ingresa tu nombre de nuevo.');
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.disconnectRealtime();
  }

  priceLabel(product: MenuProduct): string {
    const prices = product.variants.map((v) => effectivePrice(v.price, v.discounted_price));
    if (prices.length === 0) return '';
    return this.priceWithPrefix(product, Math.min(...prices));
  }

  /**
   * Un precio de la tarjeta, con el "Desde" delante si el producto tiene varias
   * presentaciones y el de la tarjeta es solo la más barata.
   */
  priceWithPrefix(product: MenuProduct, price: number): string {
    const prefijo = product.variants.length > 1 ? 'Desde ' : '';
    return prefijo + formatMoney(price);
  }

  /**
   * Descuento de la MISMA presentación que `priceLabel` ya muestra (la de
   * menor precio efectivo), para que la insignia % y el precio tachado
   * nunca contradigan el número pintado en el tile. Si solo una
   * presentación que no es la más barata tiene descuento, el tile no
   * muestra insignia — misma simplificación que `priceLabel` ya hace al
   * colapsar todas las presentaciones a un solo precio representativo.
   */
  productDiscount(product: MenuProduct): DiscountInfo | null {
    if (product.variants.length === 0) return null;
    const cheapest = product.variants.reduce(
      (min, v) =>
        effectivePrice(v.price, v.discounted_price) < effectivePrice(min.price, min.discounted_price) ? v : min,
      product.variants[0],
    );
    return discountInfo(cheapest.price, cheapest.discounted_price, cheapest.discount_kind);
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
      // Si la mesa ya tiene sesión activa, esto **une** al comensal a ella.
      await this.api.openSession(this.token, name);
      // El nombre a mostrar sale de aquí: el carrito trae el `display_label` ya
      // desambiguado ("Ana (2)"), el mismo que ven cocina y staff.
      await this.cart.load();
      await this.refreshOrders();
      this.view.set('menu');
      this.startPolling();
      this.connectRealtime();
    } catch (err) {
      this.errorMessage.set(this.api.extractError(err, 'No se pudo unirte a la mesa.'));
    } finally {
      this.joining.set(false);
    }
  }

  openProduct(product: MenuProduct): void {
    this.selectedProduct.set(product);
  }

  // --- Categorías y búsqueda ---

  selectCategory(categoryId: string): void {
    this.activeCategoryId.set(categoryId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openSearch(): void {
    this.searchOpen.set(true);
  }

  /** Cierra el buscador y limpia: reabrirlo con el texto anterior desconcierta. */
  closeSearch(): void {
    this.searchOpen.set(false);
    this.search.set('');
  }

  // --- Barra inferior ---

  /**
   * Cambia de sección por la URL, no por estado suelto: es lo que mete la sección en
   * el historial del navegador.
   *
   * `queryParamsHandling: 'merge'` **no es opcional**: el token de sesión del comensal
   * viaja en el param `s` (ver `DinerTokenStore`) y reemplazar los params lo borraría,
   * echando al comensal de su propia mesa.
   */
  goToSection(section: MenuSection): void {
    this.cartDrawerOpen.set(false);
    this.closeSearch();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [SECTION_PARAM]: section === 'carta' ? null : section },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** "Inicio": vuelve a la carta, sin tocar la categoría que venía mirando. */
  goHome(): void {
    this.goToSection('carta');
  }

  /**
   * Salir pide confirmación: en la cabecera era un botón apartado, pero en la barra
   * queda a un dedo del carrito y un toque de más cerraría la sesión y el pedido.
   * Se usa `confirm` nativo porque `app-confirm-dialog` solo vive en el dashboard.
   */
  confirmExit(): void {
    const aviso = this.myOrders().length
      ? 'Vas a salir de la mesa. Tus pedidos ya enviados siguen en cocina. ¿Continuar?'
      : '¿Seguro que quieres salir de la mesa?';
    if (confirm(aviso)) this.exit();
  }

  async onProductAdded(selection: ProductSelection): Promise<void> {
    this.selectedProduct.set(null);
    this.orderError.set(null);
    try {
      await this.cart.add(
        selection.product,
        selection.variant,
        selection.options,
        selection.quantity,
        selection.notes,
      );
    } catch (err) {
      this.showCartError(err);
    }
  }

  /** Cambia la cantidad de una línea (el carrito vive en el backend). */
  async changeQuantity(itemId: string, quantity: number): Promise<void> {
    this.orderError.set(null);
    try {
      await this.cart.setQuantity(itemId, quantity);
    } catch (err) {
      this.showCartError(err);
    }
  }

  async removeLine(itemId: string): Promise<void> {
    this.orderError.set(null);
    try {
      await this.cart.remove(itemId);
    } catch (err) {
      this.showCartError(err);
    }
  }

  /**
   * "Enviar pedido" ya no abre un modal: navega a la vista de pasos de
   * revisión y pago (spec 034) — el pedido solo nace cuando el comensal
   * completa el paso de pago que le corresponde, ahí.
   */
  sendOrder(): void {
    if (this.cart.isEmpty()) return;
    this.router.navigate(['/menu/t', this.token, 'checkout']);
  }

  /** ¿Puede el comensal cancelar este pedido? Cocina aún no lo ha empezado. */
  canCancel(order: DiningOrder): boolean {
    return puedeCancelarComensal(order);
  }

  esperaConfirmacion(order: DiningOrder): boolean {
    return esperaConfirmacion(order);
  }

  statusLabel(order: DiningOrder): string {
    return orderStatusLabel(order.status);
  }

  statusClass(order: DiningOrder): string {
    return orderStatusClass(order.status);
  }

  kitchenLabel(item: DiningOrderItem): string {
    return kitchenStatusLabel(item.estado_cocina);
  }

  kitchenClass(item: DiningOrderItem): string {
    return kitchenStatusClass(item.estado_cocina);
  }

  async cancelOrder(order: DiningOrder): Promise<void> {
    this.orderError.set(null);
    this.cancelling.set(order.id);
    try {
      await this.api.cancelMyOrder(order.id, 'Cancelado por el comensal');
      await this.refreshOrders();
    } catch (err) {
      if (err instanceof DinerSessionExpiredError) {
        this.expireSession(err.message);
        return;
      }
      // 409 = cocina ya empezó: se refresca para que el botón desaparezca.
      this.orderError.set(this.api.extractError(err, 'No se pudo cancelar el pedido.'));
      await this.refreshOrders().catch(() => undefined);
    } finally {
      this.cancelling.set(null);
    }
  }

  // ── Pagos (spec 024) ──────────────────────────────────────────────────────

  objectKeys(obj: Record<string, string>): string[] {
    return Object.keys(obj);
  }

  /**
   * Abre el modal de pago para una orden. Si ya hay un intento `pendiente`
   * de transferencia sin comprobante (reingreso a la pantalla), salta
   * directo al paso de subir el archivo en vez de pedir el método de nuevo.
   */
  async openPayment(order: DiningOrder): Promise<void> {
    this.paymentError.set(null);
    this.selectedMethod.set(null);
    this.activeAttempt.set(null);
    this.payingOrder.set(order);

    const current = order.current_payment_attempt;
    if (current && current.status === 'pendiente' && !current.is_cash) {
      this.activeAttempt.set({
        id: current.id,
        order_id: order.id,
        payment_method_id: '',
        status: current.status,
        receipt_file_url: current.receipt_file_url,
        created_at: '',
      });
    }

    if (this.paymentMethods().length === 0) {
      try {
        this.paymentMethods.set(await this.api.getPaymentMethods());
      } catch (err) {
        this.paymentError.set(this.api.extractError(err, 'No se pudieron cargar los métodos de pago.'));
      }
    }
  }

  closePayment(): void {
    this.payingOrder.set(null);
    this.selectedMethod.set(null);
    this.activeAttempt.set(null);
    this.paymentError.set(null);
  }

  async choosePaymentMethod(order: DiningOrder, method: DinerPaymentMethod): Promise<void> {
    this.paymentSubmitting.set(true);
    this.paymentError.set(null);
    try {
      const attempt = await this.api.createPaymentAttempt(order.id, method.id);
      this.selectedMethod.set(method);
      if (method.is_cash) {
        // Efectivo: nada más que hacer del lado del comensal — el cajero
        // registra el monto al recibir el pedido.
        await this.refreshOrders();
        this.closePayment();
        return;
      }
      this.activeAttempt.set(attempt);
    } catch (err) {
      if (err instanceof DinerSessionExpiredError) {
        this.expireSession(err.message);
        return;
      }
      this.paymentError.set(this.api.extractError(err, 'No se pudo iniciar el pago.'));
    } finally {
      this.paymentSubmitting.set(false);
    }
  }

  async onReceiptSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const attempt = this.activeAttempt();
    if (!file || !attempt) return;

    this.paymentSubmitting.set(true);
    this.paymentError.set(null);
    try {
      const presign = await this.api.presignReceipt(attempt.id, file.type);
      await this.api.uploadReceiptFile(presign.upload_url, file);
      await this.api.attachReceipt(attempt.id, presign.public_url);
      await this.refreshOrders();
      this.closePayment();
    } catch (err) {
      if (err instanceof DinerSessionExpiredError) {
        this.expireSession(err.message);
        return;
      }
      this.paymentError.set(this.api.extractError(err, 'No se pudo subir el comprobante.'));
    } finally {
      this.paymentSubmitting.set(false);
      input.value = '';
    }
  }

  /**
   * Salida del comensal.
   *
   * Avisa al backend para que deje de contarlo como presente: si era el último y
   * no pidió nada, la mesa queda libre en el acto. Si la llamada falla se sigue
   * adelante igual — el barrido lo resuelve solo, y bloquear la salida por un
   * error de red sería peor que la fuga.
   *
   * Además marca este `:token` como acceso cerrado (Bug 1, FR-001/FR-002): sin
   * esa marca, un reload/"Atrás"/"Adelante" en la misma pestaña volvería a
   * ofrecer el flujo de nombre como si fuera un primer acceso.
   */
  async exit(): Promise<void> {
    this.stopPolling();
    this.disconnectRealtime();
    try {
      await this.api.leave();
    } catch {
      /* best-effort: el barrido cierra la sesión de todos modos */
    } finally {
      this.tokenStore.markExited(this.token);
    }
    this.cart.clear();
    this.cart.clearDiner();
    this.myOrders.set([]);
    this.section.set('carta');
    this.view.set('exited');
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

  // ── Historial (fuente única: el backend, por polling) ─────────────────────

  private async refreshOrders(): Promise<void> {
    this.myOrders.set(await this.api.myOrders());
  }

  private startPolling(): void {
    this.stopPolling();
    // El sondeo **no desaparece** con SSE, se relaja: el evento `error` de
    // EventSource no lleva código de estado, así que el 401 de `GET /cart/orders`
    // sigue siendo la única señal fiable de "tu mesa se cerró". Sin él, un
    // comensal cuya sesión murió se quedaría mirando una pantalla congelada.
    //
    // Con la pestaña oculta se detiene igual, así que en segundo plano el coste
    // es cero.
    this.pollHandle = startVisibleInterval(() => {
      this.refreshOrders().catch((err) => {
        if (err instanceof DinerSessionExpiredError) {
          this.expireSession('Tu sesión terminó. Ingresa tu nombre de nuevo.');
        }
      });
    }, this.pollPeriod());
  }

  private stopPolling(): void {
    this.pollHandle?.stop();
    this.pollHandle = null;
  }

  /** Con el stream sano basta un sondeo de respaldo; sin él, el ritmo de antes. */
  private pollPeriod(): number {
    return this.realtime.status() === 'open' ? ORDERS_POLL_SSE_MS : ORDERS_POLL_MS;
  }

  // ── Tiempo real ───────────────────────────────────────────────────────────

  /**
   * Conecta el stream y refresca ante cualquier evento de sus pedidos.
   *
   * **No se parchea `myOrders` localmente.** Es una lista completa que ya viene
   * resuelta del backend; un merge por ítem sería lógica nueva con sus propios
   * bugs a cambio de poco: refrescar por evento son ~15-20 peticiones en toda la
   * comida, frente a las 360 del sondeo a 10 s.
   */
  private connectRealtime(): void {
    const token = this.tokenStore.token();
    if (!token) return;

    const refrescar = () => this.scheduleRefresh();
    this.rtOff.push(
      this.realtime.on('order.created', refrescar),
      this.realtime.on('order.confirmed', refrescar),
      this.realtime.on('order.item_kitchen_changed', refrescar),
      this.realtime.on('order.item_voided', refrescar),
      this.realtime.on('order.cancelled', refrescar),
      this.realtime.on('resync', refrescar),
      this.realtime.on('reconnected', refrescar),
      // La mesa se cobró o la barrió el scheduler: se acabó la sesión.
      this.realtime.on('session.closed', () =>
        this.expireSession('La mesa se cerró. ¡Gracias por tu visita!'),
      ),
    );
    this.realtime.connectDiner(token);
  }

  private disconnectRealtime(): void {
    for (const off of this.rtOff) off();
    this.rtOff = [];
    this.realtime.disconnect();
    if (this.refreshHandle !== null) {
      clearTimeout(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  /**
   * Agrupa la ráfaga de eventos de una misma acción en una sola recarga.
   *
   * Confirmar un pedido dispara `order.confirmed` + `session.bill_changed` casi a
   * la vez, y el replay tras reconectar puede traer una decena de golpe: sin
   * esto serían N peticiones idénticas.
   */
  private scheduleRefresh(): void {
    if (this.refreshHandle !== null) return;
    this.refreshHandle = setTimeout(() => {
      this.refreshHandle = null;
      this.refreshOrders().catch(() => undefined);
    }, REFRESH_DEBOUNCE_MS);
  }

  // ── Errores ──────────────────────────────────────────────────────────────

  /** Muestra el conflicto de stock señalando el insumo concreto que falta. */
  private showCartError(err: unknown): void {
    if (err instanceof DinerSessionExpiredError) {
      this.expireSession(err.message);
      return;
    }
    const stock = this.api.stockConflict(err);
    this.orderError.set(
      stock
        ? `No queda suficiente ${stock.insumo} para esa cantidad.`
        : this.api.extractError(err, 'No se pudo actualizar el carrito.'),
    );
  }

  private handleResolveError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.errorMessage.set('Este QR no es válido. Pide ayuda al personal.');
    } else if (err instanceof HttpErrorResponse && err.status === 404) {
      this.errorMessage.set('Mesa no encontrada');
    } else {
      this.errorMessage.set(this.api.extractError(err, 'No se pudo cargar el menú.'));
    }
    this.view.set('error');
  }

  /**
   * La sesión dejó de valer: se descarta el token y se vuelve a pedir nombre.
   *
   * Segundo camino hacia el formulario de nombre además de `ngOnInit`
   * (`research.md` Decisión 2): si este `:token` ya está marcado como un acceso
   * que el propio comensal cerró explícitamente, respeta ese estado en vez de
   * reabrir el flujo de nombre — un `401` tardío no debe pisar la marca de
   * `exit()`.
   */
  private expireSession(message: string): void {
    this.stopPolling();
    this.disconnectRealtime();
    this.tokenStore.clear();
    this.cart.clear();
    this.cart.clearDiner();
    this.myOrders.set([]);
    this.orderError.set(null);
    if (this.tokenStore.isExited(this.token)) {
      this.view.set('exited');
      return;
    }
    this.errorMessage.set(message);
    this.view.set('name');
  }
}
