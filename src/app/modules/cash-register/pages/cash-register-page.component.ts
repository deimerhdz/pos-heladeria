import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { OrderWithItems } from '../../orders/interfaces/order.interface';
import { OrdersService } from '../../orders/services/orders.service';
import { PaymentModalComponent } from '../components/payment-modal.component';
import { PaymentFormData } from '../interfaces/payment.interface';
import { CashRegisterService } from '../services/cash-register.service';

@Component({
  selector: 'app-cash-register-page',
  standalone: true,
  imports: [FormsModule, DatePipe, PaymentModalComponent],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Módulo de Caja</h1>
        <p class="text-gray-500 text-sm mt-1">Gestión de apertura, cobros y cierre de caja</p>
      </div>

      @if (cashService.isLoading()) {
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center animate-pulse">
          <p class="text-gray-400">Cargando caja...</p>
        </div>
      } @else if (!cashService.currentSession()) {
        <!-- CAJA CERRADA -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-md mx-auto">
          <div class="px-6 py-5 border-b border-gray-100 text-center">
            <p class="text-4xl mb-2">🔒</p>
            <h2 class="text-lg font-bold text-gray-900">Caja cerrada</h2>
            <p class="text-sm text-gray-400 mt-1">Abre la caja para comenzar a cobrar</p>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div>
              <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Monto de apertura (S/)
              </label>
              <input
                type="number"
                [(ngModel)]="openingAmount"
                min="0"
                step="0.50"
                placeholder="0.00"
                class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
              />
            </div>
            @if (cashService.error()) {
              <p class="text-xs text-red-500">{{ cashService.error() }}</p>
            }
            <button
              (click)="openCash()"
              [disabled]="openingAmount < 0"
              class="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Abrir Caja
            </button>
          </div>
        </div>
      } @else {
        <!-- CAJA ABIERTA -->

        <!-- Status card -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Estado</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              <span class="text-sm font-semibold text-green-700">Abierta</span>
            </div>
            <p class="text-xs text-gray-400 mt-2">
              Desde {{ cashService.currentSession()!.opened_at | date:'HH:mm' }}
            </p>
          </div>

          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Ventas del día</p>
            <p class="text-2xl font-bold text-gray-900 mt-1">
              S/ {{ cashService.todaySalesTotal().toFixed(2) }}
            </p>
            <p class="text-xs text-gray-400 mt-1">{{ cashService.todayPayments().length }} cobros</p>
          </div>

          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-center">
            @if (confirmingClose()) {
              <div class="text-center space-y-2 w-full">
                <p class="text-sm font-semibold text-gray-700">¿Cerrar la caja?</p>
                <p class="text-xs text-gray-400">
                  Cierre: S/ {{ (cashService.currentSession()!.opening_amount + cashService.todaySalesTotal()).toFixed(2) }}
                </p>
                <div class="flex gap-2">
                  <button
                    (click)="confirmingClose.set(false)"
                    class="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    (click)="closeCash()"
                    class="flex-1 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            } @else {
              <button
                (click)="confirmingClose.set(true)"
                class="w-full py-2.5 text-sm font-semibold rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                🔒 Cerrar Caja
              </button>
            }
          </div>
        </div>

        <!-- Error global -->
        @if (cashService.error()) {
          <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p class="text-sm text-red-600">{{ cashService.error() }}</p>
          </div>
        }

        <!-- Órdenes por cobrar -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-gray-800">Órdenes por cobrar</h2>
            @if (collectableOrders().length > 0) {
              <span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold animate-pulse">
                {{ collectableOrders().length }} pendiente(s)
              </span>
            }
          </div>

          @if (ordersService.isLoading()) {
            <p class="px-5 py-6 text-center text-sm text-gray-400 animate-pulse">Cargando órdenes...</p>
          } @else if (collectableOrders().length === 0) {
            <p class="px-5 py-8 text-center text-sm text-gray-400">Sin órdenes pendientes de cobro</p>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (order of collectableOrders(); track order.id) {
                <div class="px-5 py-3 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-700 shrink-0">
                      {{ order.table_name.charAt(0) }}
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-gray-800">{{ order.table_name }}</p>
                      <p class="text-xs text-gray-400">
                        {{ order.status === 'bill_requested' ? 'Cuenta solicitada' : 'Listo para cobrar' }}
                      </p>
                    </div>
                  </div>
                  <span class="text-sm font-bold text-gray-800 shrink-0">S/ {{ order.total.toFixed(2) }}</span>
                  <button
                    (click)="startPayment(order.id)"
                    [disabled]="loadingOrderId() === order.id"
                    class="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-xl hover:bg-green-700 transition-colors shrink-0 disabled:opacity-60"
                  >
                    {{ loadingOrderId() === order.id ? '...' : 'Cobrar' }}
                  </button>
                </div>
              }
            </div>
          }
        </div>

        <!-- Cobros del día -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div class="px-5 py-4 border-b border-gray-100">
            <h2 class="text-sm font-semibold text-gray-800">Cobros del día</h2>
          </div>
          @if (cashService.todayPayments().length === 0) {
            <p class="px-5 py-6 text-center text-sm text-gray-400">Aún no hay cobros registrados</p>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (payment of cashService.todayPayments(); track payment.id) {
                <div class="px-5 py-3 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-sm">
                      {{ payment.payment_method === 'cash' ? '💵' : '💳' }}
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-gray-800">{{ payment.table_name }}</p>
                      <p class="text-xs text-gray-400">{{ payment.paid_at | date:'HH:mm' }}</p>
                    </div>
                  </div>
                  <span class="text-sm font-bold text-green-700">S/ {{ payment.amount.toFixed(2) }}</span>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Payment Modal -->
    @if (activeOrder()) {
      <app-payment-modal
        [order]="activeOrder()!"
        (confirmed)="onPaymentConfirmed($event)"
        (cancelled)="closeModal()"
      />
    }
  `,
})
export class CashRegisterPageComponent implements OnInit, OnDestroy {
  readonly cashService = inject(CashRegisterService);
  readonly ordersService = inject(OrdersService);

  openingAmount = 0;
  readonly confirmingClose = signal(false);
  readonly activeOrder = signal<OrderWithItems | null>(null);
  readonly loadingOrderId = signal<string | null>(null);
  readonly paymentError = signal<string | null>(null);

  private realtimeChannel: RealtimeChannel | null = null;

  readonly collectableOrders = () =>
    this.ordersService.orders().filter(
      o => o.status === 'ready' || o.status === 'bill_requested'
    );

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.cashService.loadCurrentSession(),
      this.ordersService.loadOrders(),
    ]);

    this.realtimeChannel = this.ordersService.subscribeToOrders(() => {
      this.ordersService.loadOrders();
    });
  }

  ngOnDestroy(): void {
    this.realtimeChannel?.unsubscribe();
  }

  async openCash(): Promise<void> {
    await this.cashService.openCashRegister(this.openingAmount);
  }

  async closeCash(): Promise<void> {
    await this.cashService.closeCashRegister();
    this.confirmingClose.set(false);
  }

  async startPayment(orderId: string): Promise<void> {
    this.loadingOrderId.set(orderId);
    const order = await this.ordersService.loadOrderWithItems(orderId);
    this.loadingOrderId.set(null);
    if (order) {
      this.activeOrder.set(order);
    }
  }

  async onPaymentConfirmed(data: PaymentFormData): Promise<void> {
    await this.cashService.processPayment(data);
    if (!this.cashService.error()) {
      this.activeOrder.set(null);
      await this.ordersService.loadOrders();
    }
  }

  closeModal(): void {
    this.activeOrder.set(null);
    this.cashService.error.set(null);
  }
}
