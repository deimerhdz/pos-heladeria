import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Table, TableForm } from '../interfaces/table.interface';
import { TableService } from '../services/table.service';

@Component({
  selector: 'app-table-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ table ? 'Editar mesa' : 'Nueva mesa' }}
          </h2>
          <button type="button" (click)="onCancel()" class="text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          <!-- Number -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Número <span class="text-red-500">*</span>
            </label>
            <input
              type="number"
              formControlName="number"
              placeholder="Ej: 1"
              min="1"
              [readOnly]="!!table"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 read-only:bg-gray-50 read-only:text-gray-500"
              [class.border-red-400]="numberControl.invalid && numberControl.touched"
              [class.border-gray-200]="!(numberControl.invalid && numberControl.touched)"
            />
            @if (numberControl.touched && numberControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El número es requerido</p>
            }
            @if (numberControl.touched && numberControl.errors?.['min']) {
              <p class="text-red-500 text-xs mt-1">El número debe ser mayor a 0</p>
            }
            @if (table) {
              <p class="text-xs text-gray-400 mt-1">El número de la mesa no se puede cambiar.</p>
            }
          </div>

          <!-- Name (optional) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              formControlName="name"
              placeholder="Ej: Terraza, Barra…"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p class="text-xs text-gray-400 mt-1">Opcional. Etiqueta para identificar la mesa.</p>
          </div>

          <!-- Service error -->
          @if (tableService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ tableService.error() }}
            </p>
          }

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="tableService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ tableService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TableFormComponent implements OnChanges {
  @Input() table: Table | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly tableService = inject(TableService);

  readonly form = new FormGroup({
    number: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    name: new FormControl<string>('', { nonNullable: true }),
  });

  get numberControl(): AbstractControl { return this.form.controls.number; }

  ngOnChanges(): void {
    this.tableService.error.set(null);
    if (this.table) {
      this.form.setValue({
        number: this.table.number,
        name: this.table.name ?? '',
      });
    } else {
      this.form.reset({ number: null, name: '' });
    }
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const data: TableForm = {
      number: this.form.controls.number.value!,
      name: this.form.controls.name.value.trim() || null,
    };

    if (this.table) {
      // Number is immutable; only the name is editable.
      await this.tableService.updateTable(this.table.id, data);
    } else {
      await this.tableService.createTable(data);
    }

    if (!this.tableService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
