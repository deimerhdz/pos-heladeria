import {
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
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Category, CategoryForm } from '../interfaces/category.interface';
import { CategoryService } from '../services/category.service';

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [ReactiveFormsModule],
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
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="px-6 py-5 space-y-4">
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

          <!-- Image URL -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              URL de imagen <span class="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="url"
              formControlName="image_url"
              placeholder="https://..."
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
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
              [disabled]="categoryService.loading()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ categoryService.loading() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class CategoryFormComponent implements OnChanges {
  @Input() category: Category | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly categoryService = inject(CategoryService);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl('', { nonNullable: true }),
    image_url: new FormControl('', { nonNullable: true }),
  });

  get nameControl(): AbstractControl {
    return this.form.controls.name;
  }

  ngOnChanges(): void {
    if (this.category) {
      this.form.setValue({
        name: this.category.name,
        description: this.category.description ?? '',
        image_url: this.category.image_url ?? '',
      });
    } else {
      this.form.reset();
    }
    this.nameControl.setValidators([
      Validators.required,
      this.uniqueNameValidator(),
    ]);
    this.nameControl.updateValueAndValidity();
  }

  private uniqueNameValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value as string).trim().toLowerCase();
      const exists = this.categoryService.categories().some(
        cat =>
          cat.name.toLowerCase() === value &&
          cat.id !== this.category?.id
      );
      return exists ? { duplicateName: true } : null;
    };
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const data: CategoryForm = {
      name: this.form.controls.name.value.trim(),
      description: this.form.controls.description.value.trim(),
      image_url: this.form.controls.image_url.value.trim(),
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
