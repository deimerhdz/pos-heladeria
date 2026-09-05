import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { LayoutService } from '../../dashboard/layout/layout.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PaymentValidationBlockComponent } from '../components/payment-validation-block.component';
import { VisibleInterval, startVisibleInterval } from '../../../core/realtime/visible-interval';

/**
 * Terminal POS de mesas (staff) -- diseño alineado al mockup de referencia
 * (`terminal-de-mesas/code.html`): cabecera de estado de terminal + sub-barra
 * de pestañas de tipo de orden y resumen de salón, dos tarjetas blancas
 * flotantes (mesas · detalle) sobre fondo gris, radio de 6px y sin sombras.
 *
 * Rediseño responsive: por debajo del breakpoint `lg` las dos tarjetas ya no
 * conviven lado a lado — se muestra una sola a la vez, según
 * `store.hasActiveSelection()`, con un botón de volver a la grilla. Desde
 * `lg` en adelante van lado a lado, igual que en el mockup.
 *
 * Feature 028 ("terminal híbrida por origen"): la columna central ya no tiene
 * pestañas — antes duplicaban la misma información ("Pedido de la mesa" /
 * "Pagos por confirmar") y el cajero tenía que acordarse de ir a mirar la
 * segunda. Ahora se decide sola según lo que tiene la mesa
 * (`store.centralState()`, ver `pos-terminal.store.ts`):
 *
 * - un pedido QR esperando validación de pago → `app-payment-validation-block`
 * - una mesa libre sin pedido en curso → bloque informativo en línea (spec
 *   045: ya no abre ningún armado de pedido embebido — para crear uno nuevo,
 *   el cajero usa el botón fijo de "Pedido de mostrador" o F3, que navegan a
 *   `manual-order-page.component.ts`)
 * - cualquier otro caso (armando un pedido, o uno ya en cocina) →
 *   `app-pos-order-panel`, sin cambios de contenido.
 *
 * Sin ninguna mesa ni pedido seleccionado, la tarjeta de detalle no renderiza
 * ni el panel central ni el de cobro -- muestra el estado vacío unificado del
 * mockup (ícono + atajos de teclado + CTA único "+ Crear pedido nuevo"), en
 * vez de dos placeholders independientes superpuestos.
 */
@Component({
  selector: 'app-table-sessions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PosTerminalStore],
  imports: [
    PosTablesPanelComponent,
    PosOrderPanelComponent,
    PosCheckoutPanelComponent,
    PaymentValidationBlockComponent,
  ],
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-[#f9fafb] h-[calc(100dvh-57px)]">
      <!-- Encabezado: estado de terminal, turno, reloj y acciones de sesión. -->
      <header class="h-14 bg-white border-b border-[#e5e7eb] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <div class="flex flex-col min-w-0">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#111827] truncate">Terminal de mesas</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="w-2 h-2 rounded-[6px] shrink-0" [class]="connectionDotClass()"></span>
              <span class="text-[11px] font-semibold text-[#4b5563] whitespace-nowrap">{{ connectionLabel() }}</span>
            </div>
          </div>
          <div class="hidden sm:block h-6 w-px bg-[#e5e7eb] mx-1"></div>
          <div class="hidden sm:flex items-center gap-2 text-[#4b5563]">
            <svg class="w-[18px] h-[18px] stroke-[#6b7280] shrink-0" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span class="text-[12px] font-medium text-[#4b5563] whitespace-nowrap">{{ shiftLabel() }}</span>
          </div>
        </div>

        <div class="hidden md:flex items-center gap-2 px-3 py-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] shrink-0">
          <span class="text-[12px] font-semibold text-[#111827] tabular-nums tracking-[-0.01em]">{{ clockLabel() }}</span>
          <span class="text-[#6b7280] text-[11px]">·</span>
          <span class="text-[11px] text-[#6b7280] tabular-nums">{{ dateLabel() }}</span>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span class="hidden sm:flex h-9 px-3 rounded-[6px] bg-[#f3f4f6] text-[#111827] font-semibold text-[12px] items-center">POS</span>
          <div class="hidden sm:block h-6 w-px bg-[#e5e7eb]"></div>
          @if (store.cashIsOpen()) {
            <div
              class="h-9 px-2.5 sm:px-3 rounded-[6px] bg-[#f3f4f6] flex items-center gap-1.5 text-[12px] font-medium text-[#15803d]"
              [title]="'Turno abierto' + (store.cashShift()?.user_name ? ' · ' + store.cashShift()?.user_name : '')"
            >
              <span class="w-2 h-2 rounded-[6px] bg-[#15803d] shrink-0"></span>
              <span class="hidden sm:inline whitespace-nowrap">Caja abierta</span>
            </div>
          } @else {
            <button
              (click)="goToCash()"
              title="Abrir turno de caja"
              class="h-9 px-2.5 sm:px-3 rounded-[6px] border border-[#e5e7eb] bg-transparent hover:bg-[#f3f4f6] flex items-center gap-1.5 text-[12px] font-medium text-[#4b5563] transition-colors"
            >
              <svg class="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
                <rect height="14" rx="2" width="20" x="2" y="5"></rect>
                <line x1="2" x2="22" y1="10" y2="10"></line>
              </svg>
              <span class="hidden sm:inline">Turno caja</span>
            </button>
          }
          <button
            (click)="onLockTerminal()"
            title="Bloquear terminal"
            class="h-9 w-9 rounded-[6px] border border-[#e5e7eb] bg-transparent hover:bg-[#f3f4f6] flex items-center justify-center text-[#4b5563] transition-colors"
          >
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
              <rect height="11" rx="2" ry="2" width="18" x="3" y="11"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </button>
        </div>
      </header>

      <!-- Sub-barra: pestañas de tipo de orden + resumen de salón. -->
      <div class="bg-white border-b border-[#e5e7eb] px-3 sm:px-4 py-2 sm:py-0 sm:h-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-3">
          <button
            (click)="layoutService.toggle()"
            [title]="layoutService.sidebarOpen() ? 'Ocultar menú de navegación' : 'Mostrar menú de navegación'"
            class="hidden sm:flex h-11 w-11 shrink-0 rounded-[6px] border border-[#e5e7eb] bg-white text-[#4b5563] hover:bg-[#f3f4f6] items-center justify-center transition-colors"
          >
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
              <rect height="18" rx="2" width="18" x="3" y="3"></rect>
              <path d="M9 3v18"></path>
            </svg>
          </button>
          <nav class="flex items-center gap-1 bg-[#f3f4f6] p-1 rounded-[6px] overflow-x-auto sm:overflow-visible">
            @for (t of orderTypeTabs; track t.key) {
              <button
                (click)="store.setOrderTypeTab(t.key)"
                class="shrink-0 h-9 px-3.5 rounded-[6px] text-[13px] flex items-center gap-2 transition-colors whitespace-nowrap"
                [class]="
                  store.orderTypeTab() === t.key
                    ? 'bg-white border border-[#e5e7eb] text-[#111827] font-semibold'
                    : 'text-[#4b5563] hover:text-[#111827] font-medium'
                "
              >
                {{ t.label }}
              </button>
            }
          </nav>
        </div>

        @if (store.orderTypeTab() === 'mesas') {
          <div class="flex items-center gap-2 sm:gap-3 bg-white px-3 sm:px-3.5 h-9 sm:h-10 rounded-[6px] border border-[#e5e7eb] text-[12px] sm:text-[13px] overflow-x-auto whitespace-nowrap shrink-0">
            <span class="font-medium text-[#111827]">{{ store.tableCounts().total }} mesas</span>
            <span class="text-[#6b7280]">·</span>
            <span class="text-[#4b5563]">{{ store.tableCounts().ocupadas }} ocupadas</span>
            <span class="text-[#6b7280]">·</span>
            <span class="text-[#15803d] font-semibold">{{ store.tableCounts().libres }} libres</span>
            <span class="text-[#6b7280]">·</span>
            <span class="text-[#7c3aed] font-semibold">{{ store.tableCounts().pendientes }} pendientes</span>
          </div>
        }
      </div>

      @if (store.loading()) {
        <div class="flex-1 flex items-center justify-center text-sm text-gray-400">Cargando terminal…</div>
      } @else {
        @if (store.error()) {
          <div class="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">{{ store.error() }}</div>
        }
        <div class="flex-1 flex flex-col lg:flex-row p-3 gap-3 min-h-0 overflow-y-auto lg:overflow-hidden">
          <!-- Tarjeta de mesas: visible siempre desde lg; por debajo se oculta
               en cuanto hay algo seleccionado (la tarjeta de detalle pasa a
               ocupar toda la pantalla). -->
          <div
            data-testid="mesas-column"
            class="flex-col min-h-0 flex-1 lg:flex-1 bg-white rounded-[6px] border border-[#e5e7eb] overflow-hidden"
            [class]="store.hasActiveSelection() ? 'hidden lg:flex' : 'flex'"
          >
            <app-pos-tables-panel />
          </div>

          <!-- Tarjeta de detalle: mesa/pedido seleccionado + cobro apilados
               (un único scroll) por debajo de lg; lado a lado desde lg,
               siempre visible ahí. Sin selección, muestra el estado vacío
               unificado del mockup en vez del panel central + cobro, con el
               mismo ancho fijo (~35%) del mockup -- con algo seleccionado,
               el panel de pedido y el de cobro necesitan bastante más
               ancho que eso, así que la tarjeta pasa a repartirse el
               espacio con la de mesas (flex-1) en vez de quedar angosta. -->
          <div
            data-testid="detail-column"
            class="flex-col min-h-0 bg-white rounded-[6px] border border-[#e5e7eb] overflow-hidden"
            [class]="
              store.hasActiveSelection()
                ? 'flex flex-1 lg:flex-1'
                : 'hidden lg:flex lg:w-[35%] lg:shrink-0'
            "
          >
            @if (store.effectiveCentralView() === 'mesa-libre') {
              <!-- Mesa libre seleccionada: un único panel (mensaje + CTA),
                   no el panel central informativo y el "Pedido de mostrador"
                   del cobro lado a lado repitiendo el mismo mensaje dos
                   veces -- crear el pedido nuevo es la ÚNICA acción posible
                   aquí, así que solo hace falta un botón, no dos paneles. -->
              <div class="h-full flex flex-col">
                <div class="lg:hidden shrink-0 px-4 pt-3">
                  <button
                    data-testid="page-back-button"
                    (click)="store.cancelSelection()"
                    class="px-3 py-1.5 text-[13px] border border-[#e5e7eb] rounded-[6px] text-[#4b5563] hover:bg-[#f3f4f6]"
                  >
                    ← Volver a mesas
                  </button>
                </div>
                <div class="flex-1 flex flex-col items-center justify-center text-center px-4">
                  <div class="w-14 h-14 rounded-[6px] bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center mb-4 text-2xl">
                    🍽️
                  </div>
                  <h3 class="text-[16px] font-semibold text-[#111827] tracking-[-0.01em] mb-1.5">
                    Mesa {{ store.selectedTable()?.number }} está libre
                  </h3>
                  <p class="text-[13px] text-[#4b5563] max-w-[300px] leading-relaxed">
                    Crea un pedido nuevo para empezar a tomar la comanda de esta mesa.
                  </p>
                </div>
                <div class="pt-3 border-t border-[#e5e7eb] shrink-0 px-4 pb-4">
                  <button
                    type="button"
                    (click)="goToNewOrder()"
                    class="w-full h-11 rounded-[6px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[15px] font-medium flex items-center justify-between px-4 transition-colors"
                  >
                    <div class="flex items-center gap-2">
                      <svg class="w-5 h-5 stroke-white" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" x2="12" y1="8" y2="16"></line>
                        <line x1="8" x2="16" y1="12" y2="12"></line>
                      </svg>
                      <span>+ Crear pedido nuevo</span>
                    </div>
                    <span class="px-2 py-0.5 bg-white/20 rounded-[6px] text-[11px] font-semibold uppercase tracking-wider text-white">[F3]</span>
                  </button>
                </div>
              </div>
            } @else if (store.hasActiveSelection()) {
              <div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-visible">
                <div class="flex flex-col bg-white lg:flex-1 lg:min-h-0">
                  <!-- Único botón de volver en móvil/tablet para los 3 estados
                       del panel central -- el de app-pos-order-panel queda
                       oculto por debajo de lg para no duplicarlo. -->
                  <div class="lg:hidden shrink-0 px-4 pt-3">
                    <button
                      data-testid="page-back-button"
                      (click)="store.cancelSelection()"
                      class="px-3 py-1.5 text-[13px] border border-[#e5e7eb] rounded-[6px] text-[#4b5563] hover:bg-[#f3f4f6]"
                    >
                      ← Volver a mesas
                    </button>
                  </div>
                  <!--
                    Sin pestañas propias (feature 028): la columna central se
                    decide sola según store.centralState() -- salvo que la mesa
                    tenga a la vez un pago pendiente y un pedido pagado/activo
                    (spec 048), caso en el que sí aparecen dos pestañas para que
                    el cajero pueda alternar entre ambos sin perder ninguno. El
                    botón de silenciar la campana vive aquí porque tiene que
                    verse pase lo que pase en el centro.
                  -->
                  <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#e5e7eb] shrink-0">
                    <span class="text-[13px] font-semibold text-[#4b5563]">
                      @if (store.hasPendingAndActiveOrders()) {
                        <div class="flex items-center gap-1">
                          <button
                            type="button"
                            (click)="store.centralPanelTab.set('validar-pago')"
                            class="px-2 py-1 rounded-[6px] transition-colors"
                            [class]="
                              store.centralPanelTab() === 'validar-pago'
                                ? 'bg-[#4f46e5] text-white'
                                : 'text-[#4b5563] hover:bg-[#f3f4f6]'
                            "
                          >
                            🔔 Pagos por confirmar
                          </button>
                          <button
                            type="button"
                            (click)="store.centralPanelTab.set('pedido')"
                            class="px-2 py-1 rounded-[6px] transition-colors"
                            [class]="
                              store.centralPanelTab() === 'pedido'
                                ? 'bg-[#4f46e5] text-white'
                                : 'text-[#4b5563] hover:bg-[#f3f4f6]'
                            "
                          >
                            Pedido de la mesa
                          </button>
                        </div>
                      } @else {
                        @switch (store.centralState()) {
                          @case ('validar-pago') { 🔔 Pagos por confirmar }
                          @default { Pedido de la mesa }
                        }
                      }
                    </span>
                    <button
                      (click)="store.sound.toggleMute()"
                      [title]="
                        store.sound.muted()
                          ? 'Activar el sonido de pedido nuevo'
                          : 'Silenciar el sonido de pedido nuevo'
                      "
                      class="px-2 py-1 rounded-[6px] text-base hover:bg-[#f3f4f6] transition-colors"
                    >
                      {{ store.sound.muted() ? '🔕' : '🔔' }}
                    </button>
                  </div>

                  @switch (store.effectiveCentralView()) {
                    @case ('validar-pago') {
                      <div class="flex-1 overflow-y-auto p-4">
                        <app-payment-validation-block
                          [orders]="store.pendingOfSelectedTable()"
                          [categories]="store.categories()"
                          [cashShiftId]="store.cashShiftId()"
                          (refresh)="store.reload()"
                        />
                      </div>
                    }
                    @default {
                      <app-pos-order-panel />
                    }
                  }
                </div>
                <app-pos-checkout-panel />
              </div>
            } @else {
              <!-- Mockup de referencia: estado vacío unificado (sin mesa ni
                   pedido seleccionado) -- ícono + atajos de teclado + CTA
                   único, en vez de dos placeholders independientes. -->
              <div class="h-full flex flex-col p-4">
                <div class="flex items-center justify-between border-b border-[#e5e7eb] pb-3 shrink-0">
                  <div class="flex items-center gap-2">
                    <svg class="w-[18px] h-[18px] stroke-[#4b5563]" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
                      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path>
                      <path d="M16 8h-8"></path>
                      <path d="M16 12h-8"></path>
                      <path d="M14 16h-6"></path>
                    </svg>
                    <span class="text-[11px] uppercase tracking-wider font-semibold text-[#4b5563]">Detalle de mesa / pedido</span>
                  </div>
                  <span class="text-[11px] uppercase tracking-wider font-medium text-[#6b7280]">Sin selección</span>
                </div>

                <div class="flex-1 flex flex-col items-center justify-center text-center px-4">
                  <div class="w-14 h-14 rounded-[6px] bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center mb-4">
                    <svg class="w-7 h-7 stroke-[#6b7280]" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
                      <rect height="18" rx="2" width="18" x="3" y="3"></rect>
                      <path d="M3 9h18"></path>
                      <path d="M9 21V9"></path>
                    </svg>
                  </div>
                  <h3 class="text-[16px] font-semibold text-[#111827] tracking-[-0.01em] mb-1.5">
                    Selecciona una mesa o un pedido para ver su detalle
                  </h3>
                  <p class="text-[13px] text-[#4b5563] max-w-[300px] leading-relaxed">
                    Toca cualquier mesa para abrir la comanda, añadir productos o proceder al cobro.
                  </p>

                  <div class="mt-6 p-3 bg-[#f9fafb] rounded-[6px] border border-[#e5e7eb] w-full max-w-[320px] text-left">
                    <div class="text-[11px] uppercase tracking-wider font-semibold text-[#4b5563] mb-2">Atajos de teclado</div>
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between text-[13px] text-[#111827] py-1 border-b border-[#e5e7eb]">
                        <span>Buscar mesa</span>
                        <span class="px-1.5 py-0.5 bg-white border border-[#e5e7eb] rounded-[6px] text-[11px] font-medium text-[#6b7280] tabular-nums">[F2]</span>
                      </div>
                      <div class="flex items-center justify-between text-[13px] text-[#111827] py-1 border-b border-[#e5e7eb]">
                        <span>Crear pedido nuevo</span>
                        <span class="px-1.5 py-0.5 bg-white border border-[#e5e7eb] rounded-[6px] text-[11px] font-medium text-[#6b7280] tabular-nums">[F3]</span>
                      </div>
                      <div class="flex items-center justify-between text-[13px] text-[#111827] py-1">
                        <span>Abrir turno de caja</span>
                        <span class="px-1.5 py-0.5 bg-white border border-[#e5e7eb] rounded-[6px] text-[11px] font-medium text-[#6b7280] tabular-nums">[F1]</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pt-3 border-t border-[#e5e7eb] shrink-0">
                  <button
                    type="button"
                    (click)="goToNewOrder()"
                    [disabled]="!store.newOrderTableId()"
                    [title]="!store.newOrderTableId() ? 'No hay ninguna mesa libre disponible' : ''"
                    class="w-full h-11 rounded-[6px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[15px] font-medium flex items-center justify-between px-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div class="flex items-center gap-2">
                      <svg class="w-5 h-5 stroke-white" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" x2="12" y1="8" y2="16"></line>
                        <line x1="8" x2="16" y1="12" y2="12"></line>
                      </svg>
                      <span>+ Crear pedido nuevo</span>
                    </div>
                    <span class="px-2 py-0.5 bg-white/20 rounded-[6px] text-[11px] font-semibold uppercase tracking-wider text-white">[F3]</span>
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>

    <!-- Diálogo de éxito -->
    @if (store.successOpen()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div class="text-center space-y-1">
            <div class="text-4xl">✅</div>
            <h2 class="text-lg font-bold text-gray-900">Pago registrado</h2>
            @if (store.lastSale(); as s) {
              <p class="text-sm text-gray-500">
                @if (store.lastReceipts().length > 1) {
                  Cuenta dividida en {{ store.lastReceipts().length }} pagos ·
                  {{ store.fmt(s.total) }}. El inventario se actualizó.
                } @else {
                  Venta de {{ store.fmt(s.total) }} ({{ s.customer }}) registrada. El inventario
                  se actualizó.
                }
              </p>
            }
          </div>

          @if (store.lastReceipts().length > 1) {
            <!-- Cada comensal pide su ticket: se imprime de a uno. -->
            <div class="border border-gray-100 rounded-xl divide-y divide-gray-100">
              @for (r of store.lastReceipts(); track r.saleId; let i = $index) {
                <div class="flex items-center justify-between gap-3 px-3 py-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">
                      {{ r.customerName || 'Comensal ' + (i + 1) }}
                    </p>
                    <p class="text-xs text-gray-400">{{ store.fmt(r.total) }}</p>
                  </div>
                  <button
                    (click)="store.printReceipt(i)"
                    class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0"
                  >
                    🧾 Imprimir
                  </button>
                </div>
              }
            </div>
          }

          <div class="flex gap-2 justify-center pt-1">
            @if (store.lastReceipts().length > 1) {
              <!-- Spec 029, Historia 4: el caso de un solo comprobante ya no
                   imprime desde aquí — duplicaba "Imprimir Factura" de la
                   barra lateral (D1 de research.md). El de cuenta dividida
                   sí se conserva: no hay equivalente en la barra lateral
                   para imprimir el ticket de cada comensal de una vez. -->
              <button
                (click)="store.printReceipt()"
                class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                🧾 Imprimir todos
              </button>
            }
            <button (click)="store.closeSuccess()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">Cerrar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TableSessionsComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  readonly layoutService = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly tablesPanel = viewChild(PosTablesPanelComponent);

  readonly orderTypeTabs = [
    { key: 'mesas' as const, label: 'Mesas' },
    { key: 'domicilios' as const, label: 'Domicilios' },
    { key: 'para-llevar' as const, label: 'Para llevar' },
  ];

  /** Reloj/fecha/turno de la barra superior -- un tick por minuto (no hace
   *  falta más precisión), pausado en segundo plano (mismo utilitario que ya
   *  usa el store para su sondeo). */
  readonly clockLabel = signal(this.formatClock(new Date()));
  readonly dateLabel = signal(this.formatDate(new Date()));
  readonly shiftLabel = signal(this.formatShift(new Date()));
  private clockTimer?: VisibleInterval;

  ngOnInit(): void {
    void this.store.init();
    this.clockTimer = startVisibleInterval(() => {
      const now = new Date();
      this.clockLabel.set(this.formatClock(now));
      this.dateLabel.set(this.formatDate(now));
      this.shiftLabel.set(this.formatShift(now));
    }, 30_000);
  }

  ngOnDestroy(): void {
    this.store.stop();
    this.clockTimer?.stop();
  }

  private formatClock(d: Date): string {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private formatDate(d: Date): string {
    return d.toLocaleDateString('es-CO');
  }

  /** "Turno {Mañana/Tarde/Noche}: {usuario}" -- mismo dato que ya muestra el
   *  header global del dashboard (AuthService.currentUser()), sin duplicar
   *  una identidad ficticia como la del mockup ("Carlos M."). */
  private formatShift(d: Date): string {
    const h = d.getHours();
    const periodo = h < 12 ? 'Mañana' : h < 19 ? 'Tarde' : 'Noche';
    const nombre = this.authService.currentUser()?.name;
    return nombre ? `Turno ${periodo}: ${nombre}` : `Turno ${periodo}`;
  }

  connectionDotClass(): string {
    return this.store.realtimeStatus() === 'open' ? 'bg-[#10b981]' : 'bg-[#f59e0b]';
  }

  connectionLabel(): string {
    return this.store.realtimeStatus() === 'open' ? 'En línea · Sincronizado' : 'Sincronizando…';
  }

  /** Botón/insignia de turno de caja del header: la apertura en sí vive en la
   *  página de caja (ese flujo ya existe ahí) -- aquí solo se navega, sin
   *  duplicar ese estado dentro de la terminal. */
  goToCash(): void {
    this.router.navigate(['/dashboard/caja']);
  }

  /** "Bloquear Terminal" del mockup: no existe ningún mecanismo de bloqueo de
   *  sesión/PIN en el backend todavía -- se deja el botón (fidelidad visual)
   *  pero avisa en vez de fingir una función que no está implementada. */
  onLockTerminal(): void {
    this.toast.info('El bloqueo de terminal todavía no está disponible.');
  }

  /** Mismo CTA que el panel de cobro ofrece con una mesa libre ya
   *  seleccionada (`store.newOrderTableId()`), aquí para el estado vacío sin
   *  ninguna selección. */
  goToNewOrder(): void {
    const tableId = this.store.newOrderTableId();
    if (!tableId) return;
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (document.activeElement?.tagName ?? '').toUpperCase();
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'F2') {
      e.preventDefault();
      this.tablesPanel()?.focusSearch();
    } else if (e.key === 'F3') {
      e.preventDefault();
      // Mismo gatillo que el CTA "+ Crear Orden Manual" (feature 028, T022;
      // ajuste posterior de spec 036: ahora navega a la vista dedicada de
      // armado de pedido en vez de abrir el catálogo embebido) — solo hace
      // algo si hay una mesa seleccionada.
      const tableId = this.store.selectedTableId();
      if (tableId) this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
    } else if (e.key === 'Escape') {
      if (this.store.catalogOpen()) this.store.closeCatalog();
      else this.store.cancelSelection();
    } else if (!typing && e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
      // Spec 029, Historia 4: solo el caso de cuenta dividida imprime desde
      // el diálogo de éxito — el de un solo comprobante ya no tiene acción
      // de impresión aquí (usa "Imprimir Factura" de la barra lateral).
      if (this.store.successOpen() && this.store.lastReceipts().length > 1) {
        e.preventDefault();
        this.store.printReceipt();
      }
    }
  }
}
