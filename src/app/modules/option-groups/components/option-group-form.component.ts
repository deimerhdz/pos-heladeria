import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OptionGroup, OptionGroupForm } from '../../products/interfaces/product.interface';
import { OptionGroupService } from '../services/option-group.service';

@Component({
  selector: 'app-option-group-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            {{ group ? 'Editar grupo de opciones' : 'Nuevo grupo de opciones' }}
          </h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input formControlName="name" type="text" placeholder="Ej. Sabores"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Mínimo a elegir</label>
              <input formControlName="min_select" type="number" min="0" step="1"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Máximo a elegir</label>
              <input formControlName="max_select" type="number" min="1" step="1"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>
          <p class="text-xs text-gray-400">Ej. Sabores 1–3, Toppings 0–5. El mínimo obliga a elegir; el máximo limita.</p>

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
              {{ service.isSubmitting() ? 'Guardando...' : group ? 'Guardar cambios' : 'Crear grupo' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class OptionGroupFormComponent implements OnInit {
  /** Grupo a editar; `null` crea uno nuevo. */
  @Input() group: OptionGroup | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(OptionGroupService);
  private readonly fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    min_select: [0, [Validators.required, Validators.min(0)]],
    max_select: [1, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.service.error.set(null);
    if (this.group) {
      this.form.setValue({
        name: this.group.name,
        min_select: this.group.min_select,
        max_select: this.group.max_select,
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const val = this.form.value;
    const formData: OptionGroupForm = {
      name: val.name.trim(),
      min_select: Number(val.min_select),
      max_select: Number(val.max_select),
    };
    const ok = this.group
      ? await this.service.updateGroup(this.group.id, formData)
      : await this.service.createGroup(formData);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
