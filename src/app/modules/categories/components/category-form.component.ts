import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  computed,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Category, CategoryForm } from '../interfaces/category.interface';
import { CategoryService } from '../services/category.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { Presentation } from '../../presentations/interfaces/presentation.interface';
import { PresentationService } from '../../presentations/services/presentation.service';

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [ReactiveFormsModule, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ category ? 'Editar categoría' : 'Nueva categoría' }}
          </h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <app-mi-icon name="close" ariaLabel="Cerrar" [size]="20" />
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
              placeholder="Ej: Helados"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="nameControl.invalid && nameControl.touched"
              [class.border-gray-200]="!(nameControl.invalid && nameControl.touched)"
            />
            @if (nameControl.touched && nameControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
            }
            @if (nameControl.touched && nameControl.errors?.['duplicateName']) {
              <p class="text-red-500 text-xs mt-1">Ya existe una categoría con ese nombre</p>
            }
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Descripción <span class="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              formControlName="description"
              placeholder="Breve descripción de la categoría"
              rows="3"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            ></textarea>
          </div>

          <!-- Order -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Orden <span class="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="number"
              formControlName="display_order"
              placeholder="Automático"
              min="0"
              step="1"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p class="text-gray-400 text-xs mt-1">
              Define la posición en el filtro del Menú QR: a mayor valor, aparece primero. Si se
              deja vacío, la categoría se ubicará primero en el filtro.
            </p>
          </div>

          <!-- Presentaciones asociadas (spec 083, FR-004) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Presentaciones <span class="text-gray-400 font-normal">(opcional)</span>
            </label>
            <p class="text-gray-400 text-xs mb-2">
              Todo producto nuevo creado en esta categoría nacerá con una variante por cada
              presentación marcada aquí.
            </p>
            @if (presentationOptions().length === 0) {
              <p class="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-2">
                Sin presentaciones en el catálogo. Créalas primero desde "Presentaciones".
              </p>
            } @else {
              <div
                class="border border-gray-200 rounded-lg max-h-[180px] overflow-y-auto divide-y divide-gray-50"
              >
                @for (p of presentationOptions(); track p.id) {
                  <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      [checked]="selectedPresentationIds.has(p.id)"
                      (change)="togglePresentation(p.id)"
                    />
                    <span class="flex-1" [class.text-gray-400]="!p.active">
                      {{ p.name }}
                    </span>
                    @if (!p.active) {
                      <span class="text-xs text-gray-400">inactiva</span>
                    }
                  </label>
                }
              </div>
            }
          </div>

          <!-- Service error -->
          @if (categoryService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ categoryService.error() }}
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
              [disabled]="categoryService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ categoryService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class CategoryFormComponent implements OnChanges, OnInit {
  @Input() category: Category | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly categoryService = inject(CategoryService);
  readonly presentationService = inject(PresentationService);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', { nonNullable: true }),
    display_order: new FormControl<number | null>(null),
  });

  get nameControl(): AbstractControl {
    return this.form.controls.name;
  }

  /** spec 083 (FR-004): ids seleccionados fuera del FormGroup, mismo patrón que el
   *  checkbox-list de variantes de `promotions-page.component.ts` (arrays planos). */
  selectedPresentationIds = new Set<string>();

  /** Opciones del picker: presentaciones activas + cualquiera ya asociada (aunque esté
   *  inactiva), para no perderla al guardar sin querer (contracts/categoria-herencia-producto.md). */
  readonly presentationOptions = computed<Presentation[]>(() => {
    const all = this.presentationService.allPresentations();
    const options = all.filter((p) => p.active || this.selectedPresentationIds.has(p.id));
    return [...options].sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    if (this.presentationService.allPresentations().length === 0) {
      this.presentationService.loadAllPresentations();
    }
  }

  ngOnChanges(): void {
    this.categoryService.otherError.set(null);
    if (this.category) {
      this.form.setValue({
        name: this.category.name,
        description: this.category.description ?? '',
        display_order: this.category.display_order,
      });
      this.selectedPresentationIds = new Set(this.category.presentations.map((p) => p.id));
    } else {
      this.form.reset();
      this.selectedPresentationIds = new Set();
    }
    this.nameControl.setValidators([Validators.required, this.uniqueNameValidator()]);
    this.nameControl.updateValueAndValidity();
  }

  togglePresentation(id: string): void {
    if (this.selectedPresentationIds.has(id)) {
      this.selectedPresentationIds.delete(id);
    } else {
      this.selectedPresentationIds.add(id);
    }
  }

  private uniqueNameValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value as string).trim().toLowerCase();
      const exists = this.categoryService
        .allCategories()
        .some((cat) => cat.name.toLowerCase() === value && cat.id !== this.category?.id);
      return exists ? { duplicateName: true } : null;
    };
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const data: CategoryForm = {
      name: this.form.controls.name.value.trim(),
      description: this.form.controls.description.value.trim(),
      display_order: this.form.controls.display_order.value,
      presentation_ids: [...this.selectedPresentationIds],
    };

    if (this.category) {
      await this.categoryService.updateCategory(this.category.id, data);
    } else {
      await this.categoryService.createCategory(data);
    }

    if (!this.categoryService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
