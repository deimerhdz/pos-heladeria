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
          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              formControlName="name"
              placeholder="Ej: Mesa 1"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="nameControl.invalid && nameControl.touched"
              [class.border-gray-200]="!(nameControl.invalid && nameControl.touched)"
            />
            @if (nameControl.touched && nameControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
            }
          </div>

          <!-- Capacity -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Capacidad <span class="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="number"
              formControlName="capacity"
              placeholder="Ej: 4"
              min="1"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="capacityControl.invalid && capacityControl.touched"
              [class.border-gray-200]="!(capacityControl.invalid && capacityControl.touched)"
            />
            @if (capacityControl.touched && capacityControl.errors?.['min']) {
              <p class="text-red-500 text-xs mt-1">La capacidad debe ser mayor a 0</p>
            }
          </div>

          @if (table) {
            <p class="text-xs text-gray-400">Código QR: <span class="font-mono font-medium text-gray-600">{{ table.code }}</span> (inmutable)</p>
          }

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
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, { validators: [Validators.min(1)] }),
  });

  get nameControl(): AbstractControl { return this.form.controls.name; }
  get capacityControl(): AbstractControl { return this.form.controls.capacity; }

  ngOnChanges(): void {
    this.tableService.error.set(null);
    if (this.table) {
      this.form.setValue({
        name: this.table.name,
        capacity: this.table.capacity,
      });
    } else {
      this.form.reset();
    }
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const data: TableForm = {
      name: this.form.controls.name.value.trim(),
      capacity: this.form.controls.capacity.value ?? null,
    };

    if (this.table) {
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
