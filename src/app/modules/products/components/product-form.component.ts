import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Product, ProductForm } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../../categories/services/category.service';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ product ? 'Editar producto' : 'Nuevo producto' }}
          </h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
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
              placeholder="Ej: Helado de Vainilla"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="nameControl.invalid && nameControl.touched"
              [class.border-gray-200]="!(nameControl.invalid && nameControl.touched)"
            />
            @if (nameControl.touched && nameControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
            }
          </div>

          <!-- Category -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Categoría <span class="text-red-500">*</span>
            </label>
            <select
              formControlName="category_id"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              [class.border-red-400]="categoryControl.invalid && categoryControl.touched"
              [class.border-gray-200]="!(categoryControl.invalid && categoryControl.touched)"
            >
              <option value="">Selecciona una categoría</option>
              @for (cat of activeCategories(); track cat.id) {
                <option [value]="cat.id">{{ cat.name }}</option>
              }
            </select>
            @if (categoryControl.touched && categoryControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">La categoría es requerida</p>
            }
          </div>

          <!-- Price -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Precio <span class="text-red-500">*</span>
            </label>
            <input
              type="number"
              formControlName="price"
              placeholder="0.00"
              step="0.01"
              min="0.01"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="priceControl.invalid && priceControl.touched"
              [class.border-gray-200]="!(priceControl.invalid && priceControl.touched)"
            />
            @if (priceControl.touched && priceControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El precio es requerido</p>
            }
            @if (priceControl.touched && priceControl.errors?.['min']) {
              <p class="text-red-500 text-xs mt-1">El precio debe ser mayor a 0</p>
            }
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Descripción <span class="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              formControlName="description"
              placeholder="Breve descripción del producto"
              rows="3"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            ></textarea>
          </div>

          <!-- Image upload -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Imagen del producto <span class="text-gray-400 font-normal">(opcional)</span>
            </label>

            <!-- Preview -->
            <div class="mb-2">
              @if (previewUrl()) {
                <img
                  [src]="previewUrl()!"
                  alt="Vista previa"
                  class="w-24 h-24 object-cover rounded-xl border border-gray-200"
                />
              } @else if (product?.image_url) {
                <img
                  [src]="product!.image_url!"
                  [alt]="product!.name"
                  class="w-24 h-24 object-cover rounded-xl border border-gray-200"
                />
              } @else {
                <div class="w-24 h-24 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 text-3xl">
                  🖼️
                </div>
              }
            </div>

            <!-- File input -->
            <input
              type="file"
              accept="image/*"
              class="hidden"
              #fileInput
              (change)="onFileSelected($event)"
            />
            <button
              type="button"
              (click)="fileInput.click()"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {{ selectedFile() ? selectedFile()!.name : (product?.image_url ? 'Cambiar imagen' : 'Seleccionar imagen') }}
            </button>

            @if (fileSizeError()) {
              <p class="text-red-500 text-xs mt-1">La imagen no debe superar 5 MB</p>
            }
          </div>

          <!-- Stock inicial (solo al crear) -->
          @if (!product) {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Stock inicial <span class="text-gray-400 font-normal">(unidades)</span>
              </label>
              <input
                type="number"
                formControlName="stock"
                placeholder="0"
                min="0"
                step="1"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          }

          <!-- Service error -->
          @if (productService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ productService.error() }}
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
              [disabled]="productService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ productService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class ProductFormComponent implements OnChanges, OnInit, OnDestroy {
  @Input() product: Product | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);

  readonly activeCategories = this.categoryService.categories;

  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly fileSizeError = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    price: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    description: new FormControl('', { nonNullable: true }),
    stock: new FormControl<number>(0, { nonNullable: true, validators: [Validators.min(0)] }),
  });

  get nameControl(): AbstractControl { return this.form.controls.name; }
  get categoryControl(): AbstractControl { return this.form.controls.category_id; }
  get priceControl(): AbstractControl { return this.form.controls.price; }

  ngOnInit(): void {
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories();
    }
  }

  ngOnChanges(): void {
    this.productService.error.set(null);
    this.selectedFile.set(null);
    this.fileSizeError.set(false);
    this.revokePreview();

    if (this.product) {
      this.form.setValue({
        name: this.product.name,
        category_id: this.product.category_id,
        price: this.product.price,
        description: this.product.description ?? '',
        stock: this.product.stock ?? 0,
      });
    } else {
      this.form.reset({ stock: 0 });
    }
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;

    this.fileSizeError.set(false);

    if (file.size > 5 * 1024 * 1024) {
      this.fileSizeError.set(true);
      (event.target as HTMLInputElement).value = '';
      return;
    }

    this.revokePreview();
    this.selectedFile.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.fileSizeError()) return;

    const file = this.selectedFile();
    let imageUrl: string | null = this.product?.image_url ?? null;

    if (file) {
      this.productService.isSubmitting.set(true);
      this.productService.error.set(null);

      try {
        if (this.product?.image_url) {
          await this.productService.deleteProductImage(this.product.image_url);
        }
        imageUrl = await this.productService.uploadProductImage(file);
      } catch (e: any) {
        this.productService.error.set(e?.message ?? 'Error al subir la imagen');
        this.productService.isSubmitting.set(false);
        return;
      }
    }

    const data: ProductForm = {
      name: this.form.controls.name.value.trim(),
      category_id: this.form.controls.category_id.value,
      price: this.form.controls.price.value!,
      description: this.form.controls.description.value.trim(),
      image_url: imageUrl ?? '',
      stock: this.form.controls.stock.value,
    };

    if (this.product) {
      await this.productService.updateProduct(this.product.id, data);
    } else {
      await this.productService.createProduct(data);
    }

    // If BD failed after uploading a new file, remove the orphan
    if (this.productService.error() && file && imageUrl) {
      await this.productService.deleteProductImage(imageUrl);
      return;
    }

    if (!this.productService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set(null);
    }
  }
}
