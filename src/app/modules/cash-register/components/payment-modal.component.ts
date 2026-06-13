import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OrderWithItems } from '../../orders/interfaces/order.interface';
import { PaymentMethod } from '../interfaces/cash-register.interface';
import { PaymentFormData } from '../interfaces/payment.interface';

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      (click)="onBackdropClick($event)"
    >
      <!-- Modal -->
      <div
        class="bg-white rounded-2xl shadow-xl w-full max-w-md z-50"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-gray-900">Cobrar orden</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ order.table_name }}</p>
          </div>
          <button
            (click)="cancelled.emit()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- Order items -->
        <div class="px-6 py-4 border-b border-gray-100 max-h-48 overflow-y-auto">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ítems</p>
          <div class="space-y-2">
            @for (item of order.items; track item.id) {
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <span
                    class="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0"
                  >
                    {{ item.quantity }}
                  </span>
                  <span class="text-gray-700">{{ item.product_name }}</span>
                </div>
                <span class="text-gray-600 font-medium">S/ {{ item.subtotal.toFixed(2) }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Total -->
        <div
          class="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center"
        >
          <span class="text-sm font-semibold text-gray-600">Total</span>
          <span class="text-xl font-bold text-gray-900">S/ {{ order.total.toFixed(2) }}</span>
        </div>

        <!-- Payment form -->
        <div class="px-6 py-4 space-y-4">
          <!-- Payment method selector -->
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Método de pago
            </p>
            <div class="grid grid-cols-2 gap-2">
              <button
                (click)="setPaymentMethod('cash')"
                class="py-2.5 rounded-xl text-sm font-semibold border-2 transition-all"
                [class]="
                  paymentMethod() === 'cash'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                "
              >
                💵 Efectivo
              </button>
              <button
                (click)="setPaymentMethod('transfer')"
                class="py-2.5 rounded-xl text-sm font-semibold border-2 transition-all"
                [class]="
                  paymentMethod() === 'transfer'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                "
              >
                🏦 Transferencia
              </button>
            </div>
          </div>

          <!-- Monto recibido (solo efectivo) -->
          @if (paymentMethod() === 'cash') {
            <div>
              <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Monto recibido
              </label>
              <div class="relative">
                <span
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400"
                  >S/</span
                >
                <input
                  type="number"
                  [(ngModel)]="amountReceivedRaw"
                  (ngModelChange)="onAmountChange($event)"
                  min="0"
                  step="0.10"
                  placeholder="0.00"
                  class="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>

              <!-- Vuelto -->
              <div class="mt-2 flex justify-between items-center">
                <span class="text-xs text-gray-400">Vuelto</span>
                <span
                  class="text-sm font-bold"
                  [class]="change() >= 0 ? 'text-green-600' : 'text-red-500'"
                >
                  S/ {{ change() >= 0 ? change().toFixed(2) : '—' }}
                </span>
              </div>

              @if (amountReceived() > 0 && amountReceived() < order.total) {
                <p class="mt-1 text-xs text-red-500">El monto recibido es menor al total.</p>
              }
            </div>
          }
        </div>

        <!-- Actions -->
        <div class="px-6 pb-5 flex gap-3">
          <button
            (click)="cancelled.emit()"
            class="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:border-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            (click)="confirm()"
            [disabled]="!canConfirm()"
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            [class]="
              canConfirm()
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            "
          >
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PaymentModalComponent implements OnInit {
  @Input({ required: true }) order!: OrderWithItems;
  @Output() confirmed = new EventEmitter<PaymentFormData>();
  @Output() cancelled = new EventEmitter<void>();

  readonly paymentMethod = signal<PaymentMethod>('cash');
  readonly amountReceived = signal(0);
  amountReceivedRaw = 0;

  readonly change = () => this.amountReceived() - this.order.total;

  ngOnInit(): void {
    this.amountReceivedRaw = this.order.total;
    this.amountReceived.set(this.order.total);
  }

  setPaymentMethod(method: PaymentMethod): void {
    this.paymentMethod.set(method);
  }

  onAmountChange(value: number): void {
    this.amountReceived.set(Number(value) || 0);
  }

  canConfirm(): boolean {
    if (this.paymentMethod() === 'transfer') return true;
    return this.amountReceived() >= this.order.total;
  }

  confirm(): void {
    if (!this.canConfirm()) return;

    const isTransfer = this.paymentMethod() === 'transfer';
    this.confirmed.emit({
      orderId: this.order.id,
      amount: this.order.total,
      paymentMethod: this.paymentMethod(),
      changeGiven: isTransfer ? 0 : this.change(),
    });
  }

  onBackdropClick(event: MouseEvent): void {
    this.cancelled.emit();
  }
}
