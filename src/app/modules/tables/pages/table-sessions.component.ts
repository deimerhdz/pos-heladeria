import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PosCatalogDrawerComponent } from '../components/pos-catalog-drawer.component';
import { PaymentValidationBlockComponent } from '../components/payment-validation-block.component';
import { ManualOrderPanelComponent } from '../components/manual-order-panel.component';

/**
 * Terminal POS de mesas (staff): 3 columnas — mesas · pedido · cobro — con
 * catálogo en drawer, diálogo de éxito y atajos de teclado (F2/F3/ESC/Ctrl+P).
 * `F4` (descuento manual) se retiró en spec 029, Historia 2 — prohibición
 * absoluta, sin excepción de rol.
 *
 * Feature 028 ("terminal híbrida por origen"): la columna central ya no tiene
 * pestañas — antes duplicaban la misma información ("Pedido de la mesa" /
 * "Pagos por confirmar") y el cajero tenía que acordarse de ir a mirar la
 * segunda. Ahora se decide sola según lo que tiene la mesa
 * (`store.centralState()`, ver `pos-terminal.store.ts`):
 *
 * - un pedido QR esperando validación de pago → `app-payment-validation-block`
 * - una mesa libre sin pedido en curso → `app-manual-order-panel` (CTA / F3)
 * - cualquier otro caso (armando un pedido, o uno ya en cocina) →
 *   `app-pos-order-panel`, sin cambios de contenido.
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
    PosCatalogDrawerComponent,
    PaymentValidationBlockComponent,
    ManualOrderPanelComponent,
  ],
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-gray-50 h-[calc(100dvh-57px)]">
      <!-- Barra superior -->
      <div class="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg">🪑</span>
          <span class="font-bold text-gray-900 truncate">Terminal de mesas</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="hidden lg:flex gap-3 text-[11px] text-gray-400">
            <span>F2 Buscar</span><span>F3 Orden manual</span><span>ESC Cancelar</span>
          </div>
        </div>
      </div>

      @if (store.loading()) {
        <div class="flex-1 flex items-center justify-center text-sm text-gray-400">Cargando terminal…</div>
      } @else {
        @if (store.error()) {
          <div class="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">{{ store.error() }}</div>
        }
        <div class="flex-1 flex min-h-0">
          <app-pos-tables-panel />
          <div class="flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white">
            <!--
              Sin pestañas (feature 028): la columna central se decide sola
              según store.centralState(). El botón de silenciar la campana
              vive aquí porque tiene que verse pase lo que pase en el centro.
            -->
            <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 shrink-0">
              <span class="text-sm font-semibold text-gray-500">
                @switch (store.centralState()) {
                  @case ('validar-pago') { 🔔 Pagos por confirmar }
                  @case ('mesa-libre') { Mesa libre }
                  @default { Pedido de la mesa }
                }
              </span>
              <button
                (click)="store.sound.toggleMute()"
                [title]="
                  store.sound.muted()
                    ? 'Activar el sonido de pedido nuevo'
                    : 'Silenciar el sonido de pedido nuevo'
                "
                class="px-2 py-1 rounded-lg text-base hover:bg-gray-50 transition-colors"
              >
                {{ store.sound.muted() ? '🔕' : '🔔' }}
              </button>
            </div>

            @switch (store.centralState()) {
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
              @case ('mesa-libre') {
                <app-manual-order-panel />
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

    @if (store.catalogOpen()) {
      <app-pos-catalog-drawer />
    }

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
  private readonly tablesPanel = viewChild(PosTablesPanelComponent);

  ngOnInit(): void {
    void this.store.init();
  }

  ngOnDestroy(): void {
    this.store.stop();
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
      // Mismo gatillo que el CTA "+ Crear Orden Manual" (feature 028, T022):
      // solo hace algo si hay una mesa libre seleccionada — `startManualOrder`
      // ya se cuida de eso.
      this.store.startManualOrder();
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
