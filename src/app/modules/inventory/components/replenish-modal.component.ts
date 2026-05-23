import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductStock } from '../interfaces/inventory.interface';

export interface ReplenishData {
  quantity: number;
  reason: string;
}

@Component({
  selector: 'app-replenish-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      (click)="onBackdropClick($event)"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm z-50" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-gray-900">Reponer stock</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ product.name }}</p>
          </div>
          <button
            (click)="cancelled.emit()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- Info stock actual -->
        <div class="px-6 py-3 bg-gray-50 border-b border-gray-100 flex justify-between text-sm">
          <span class="text-gray-500">Stock actual</span>
          <span class="font-bold" [class]="product.stock === 0 ? 'text-red-600' : product.stock <= 5 ? 'text-yellow-600' : 'text-green-700'">
            {{ product.stock }} unidades
          </span>
        </div>

        <!-- Form -->
        <div class="px-6 py-5 space-y-4">
          <div>
            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Cantidad a agregar <span class="text-red-500">*</span>
            </label>
            <input
              type="number"
              [(ngModel)]="quantity"
              min="1"
              step="1"
              placeholder="0"
              class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
            />
            @if (quantity !== null && quantity <= 0) {
              <p class="mt-1 text-xs text-red-500">La cantidad debe ser mayor a 0.</p>
            }
          </div>

          <div>
            <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Motivo <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              [(ngModel)]="reason"
              placeholder="Ej: Compra a proveedor"
              class="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-indigo-400 transition-colors"
            />
          </div>

          @if (quantity > 0) {
            <div class="bg-indigo-50 rounded-xl px-4 py-3 flex justify-between text-sm">
              <span class="text-indigo-600">Nuevo stock estimado</span>
              <span class="font-bold text-indigo-700">{{ product.stock + quantity }} unidades</span>
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
            [class]="canConfirm()
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ReplenishModalComponent {
  @Input({ required: true }) product!: ProductStock;
  @Output() confirmed = new EventEmitter<ReplenishData>();
  @Output() cancelled = new EventEmitter<void>();

  quantity = 0;
  reason = '';

  canConfirm(): boolean {
    return this.quantity > 0 && this.reason.trim().length > 0;
  }

  confirm(): void {
    if (!this.canConfirm()) return;
    this.confirmed.emit({ quantity: this.quantity, reason: this.reason.trim() });
  }

  onBackdropClick(event: MouseEvent): void {
    this.cancelled.emit();
  }
}
