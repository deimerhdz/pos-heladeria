import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PaymentValidationBlockComponent } from '../components/payment-validation-block.component';
import { PosTerminalHeaderComponent } from '../components/pos-terminal-header.component';

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
 * A pedido del usuario, sin ninguna mesa ni pedido seleccionado la tarjeta de
 * detalle ya no se muestra en absoluto (antes tenía su propio estado vacío
 * con ícono + atajos de teclado) -- la de mesas ocupa todo el ancho, y el CTA
 * "+ Crear pedido nuevo" vive ahora en la sub-barra, junto al resumen de
 * mesas.
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
    PosTerminalHeaderComponent,
  ],
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-[#f9fafb] h-[calc(100dvh-57px)]">
      <!-- Encabezado: estado de terminal, turno, reloj y acciones de sesión
           (extraído a un componente compartido con manual-order-page.component.ts). -->
      <app-pos-terminal-header />

      <!-- Sub-barra: pestañas de tipo de orden + resumen de salón. -->
      <div class="bg-white border-b border-[#e5e7eb] px-3 sm:px-4 py-2 sm:py-0 sm:h-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-3">
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
          <!-- A pedido del usuario: "+ Crear pedido nuevo" es un CTA fijo de
               la sub-barra -- debe seguir visible sin importar si hay una
               mesa/pedido seleccionado (antes se ocultaba con
               showingDetail(), lo que lo hacía desaparecer justo cuando el
               cajero quería crear otro pedido desde una mesa ya abierta). -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              (click)="goToNewOrder()"
              [disabled]="!store.newOrderTableId()"
              [title]="!store.newOrderTableId() ? 'No hay ninguna mesa libre disponible' : ''"
              class="h-9 sm:h-10 px-3 sm:px-3.5 rounded-[6px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[12px] sm:text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" x2="12" y1="8" y2="16"></line>
                <line x1="8" x2="16" y1="12" y2="12"></line>
              </svg>
              <span class="hidden sm:inline">Crear pedido nuevo</span>
              <span class="hidden md:inline px-1.5 py-0.5 bg-white/20 rounded-[6px] text-[10px] font-semibold uppercase tracking-wider">[F3]</span>
            </button>
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
            [class]="showingDetail() ? 'hidden lg:flex' : 'flex'"
          >
            <app-pos-tables-panel />
          </div>

          <!-- Tarjeta de detalle: mesa/pedido seleccionado + cobro siempre
               apilados en una sola columna (un único scroll), a pedido del
               usuario -- antes iban lado a lado desde lg. Sin nada real que
               mostrar -- ni selección, ni una mesa libre sin pedidos -- esta
               tarjeta no se muestra en absoluto (antes tenía un estado vacío
               propio en cada uno de esos dos casos) -- la de mesas (ya
               flex-1) ocupa todo el ancho. -->
          <div
            data-testid="detail-column"
            class="flex-col min-h-0 bg-white rounded-[6px] border border-[#e5e7eb] overflow-hidden"
            [class]="showingDetail() ? 'flex flex-1 lg:flex-1' : 'hidden'"
          >
            @if (showingDetail()) {
              <!-- A pedido del usuario: "Pedido de la mesa" y "Cuenta de la
                   mesa" siempre se apilan en una sola columna (antes iban
                   lado a lado desde lg) -- aplica igual a mesas, para llevar
                   y domicilio, ya que los tres pasan por este mismo bloque. -->
              <div class="flex-1 flex flex-col min-h-0 overflow-y-auto">
                <div class="flex flex-col bg-white flex-1 min-h-0 lg:flex-1 lg:min-h-0">
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
  private readonly router = inject(Router);
  private readonly tablesPanel = viewChild(PosTablesPanelComponent);

  readonly orderTypeTabs = [
    { key: 'mesas' as const, label: 'Mesas' },
    { key: 'domicilios' as const, label: 'Domicilios' },
    { key: 'para-llevar' as const, label: 'Para llevar' },
  ];

  ngOnInit(): void {
    void this.store.init();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  /** Mismo CTA que el panel de cobro ofrece con una mesa libre ya
   *  seleccionada (`store.newOrderTableId()`), aquí para el estado vacío sin
   *  ninguna selección. */
  goToNewOrder(): void {
    const tableId = this.store.newOrderTableId();
    if (!tableId) return;
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  /** A pedido del usuario: una mesa libre sin ningún pedido no cuenta como
   *  "hay algo que mostrar" -- ya no tiene su propio panel (antes mostraba
   *  un mensaje + CTA propios). Sin contenido real que mostrar, se trata
   *  igual que "sin selección": la grilla de mesas ocupa todo el ancho y el
   *  CTA "Crear pedido nuevo" vive en la sub-barra (que ya usa
   *  `store.newOrderTableId()`, y por lo tanto sigue apuntando a esta misma
   *  mesa si es la seleccionada). */
  showingDetail(): boolean {
    return this.store.hasActiveSelection() && this.store.effectiveCentralView() !== 'mesa-libre';
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
