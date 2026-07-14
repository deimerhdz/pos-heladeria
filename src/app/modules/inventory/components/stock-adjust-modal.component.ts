import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdjustForm, InventoryItem } from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';

@Component({
  selector: 'app-stock-adjust-modal',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">Ajustar stock</h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="p-6 space-y-4">
          @if (item) {
            <div class="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p class="text-sm font-medium text-gray-900">{{ item.name }}</p>
              <p class="text-xs text-gray-500 mt-0.5">
                Stock actual: <span class="font-semibold text-gray-700">{{ item.current_stock | number:'1.0-3' }}</span>
              </p>
            </div>
          }

          <!-- Dirección -->
          <div class="grid grid-cols-2 gap-3">
            <button type="button" (click)="setDirection('in')"
              class="py-2 rounded-xl text-sm font-medium border transition-colors"
              [class]="form.value.direction === 'in'
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'">
              Entrada (+)
            </button>
            <button type="button" (click)="setDirection('out')"
              class="py-2 rounded-xl text-sm font-medium border transition-colors"
              [class]="form.value.direction === 'out'
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'">
              Salida (−)
            </button>
          </div>

          <!-- Cantidad -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
            <input formControlName="quantity" type="number" min="0" step="0.001" placeholder="0"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Motivo -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <input formControlName="reason" type="text" placeholder="Ej. merma, conteo físico, corrección"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          @if (service.error()) {
            <p class="text-red-600 text-sm">{{ service.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="close.emit()"
              class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" [disabled]="form.invalid || service.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ service.isSubmitting() ? 'Guardando...' : 'Registrar ajuste' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class StockAdjustModalComponent implements OnChanges {
  @Input() item: InventoryItem | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(InventoryService);
  private readonly fb = inject(FormBuilder);

  form: FormGroup = this.buildForm();

  ngOnChanges(): void {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      direction: ['in', Validators.required],
      quantity: [null, [Validators.required, Validators.min(0.001)]],
      reason: [''],
    });
  }

  setDirection(direction: 'in' | 'out'): void {
    this.form.patchValue({ direction });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.item) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const formData: AdjustForm = {
      direction: val.direction,
      quantity: Number(val.quantity),
      reason: val.reason?.trim() || null,
    };

    const ok = await this.service.adjustStock(this.item.id, formData);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
