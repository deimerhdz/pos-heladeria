import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Ingredient, RecordMovementForm } from '../interfaces/ingredient.interface';
import { IngredientsService } from '../services/ingredients.service';

type MovementKind = 'income' | 'expense';

const MOVEMENT_OPTIONS: { value: MovementKind; label: string }[] = [
  { value: 'income', label: 'Entrada de stock' },
  { value: 'expense', label: 'Salida de stock' },
];

@Component({
  selector: 'app-ingredient-movement-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" (click)="onBackdrop($event)">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 class="text-base font-bold text-gray-900">Registrar movimiento</h2>
            <p class="text-sm text-gray-500 mt-0.5">{{ ingredient?.name }}</p>
          </div>
          <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-4">
          <!-- Tipo de movimiento -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de movimiento *</label>
            <select formControlName="type"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              @for (opt of options; track opt.value) {
                <option [value]="opt.value">{{ opt.label }}</option>
              }
            </select>
          </div>

          <!-- Cantidad -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
            <input formControlName="quantity" type="number" min="1" step="1" placeholder="0"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Motivo -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <input formControlName="reason" type="text" placeholder="Describe el motivo del movimiento"
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
              {{ service.isSubmitting() ? 'Guardando...' : 'Registrar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class IngredientMovementModalComponent implements OnChanges {
  @Input() ingredient: Ingredient | null = null;
  @Input() defaultType: MovementKind = 'income';
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(IngredientsService);
  private readonly fb = inject(FormBuilder);

  readonly options = MOVEMENT_OPTIONS;
  form: FormGroup = this.buildForm();

  ngOnChanges(): void {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      type: [this.defaultType, Validators.required],
      quantity: [null, [Validators.required, Validators.min(1)]],
      reason: ['', Validators.required],
    });
  }

  onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close.emit();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.ingredient) return;

    const val = this.form.value;
    const formData: RecordMovementForm = {
      type: val.type,
      quantity: Number(val.quantity),
      reason: val.reason.trim(),
    };

    await this.service.recordMovement(this.ingredient.id, formData);

    if (!this.service.error()) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
