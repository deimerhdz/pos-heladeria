import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CategoryService } from '../../categories/services/category.service';
import { MenuService } from '../../menu/services/menu.service';
import {
  MenuOptionGroup,
  Product,
  ProductForm,
  Variant,
} from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { VariantFormComponent } from '../components/variant-form.component';
import { ProductOptionGroupAssignComponent } from '../components/product-option-group-assign.component';
import { RecipeEditorComponent } from '../components/recipe-editor.component';

type Tab = 'info' | 'variants' | 'options' | 'recipe';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    VariantFormComponent,
    ProductOptionGroupAssignComponent,
    RecipeEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Breadcrumb / header -->
      <div class="flex items-center justify-between">
        <div>
          <a routerLink="/dashboard/products" class="text-xs text-gray-400 hover:text-gray-600">← Productos</a>
          <h1 class="text-xl font-bold text-gray-900 mt-0.5">{{ product()?.name ?? 'Producto' }}</h1>
        </div>
        @if (product(); as p) {
          <button (click)="toggleActive(p)"
            class="px-3 py-1.5 text-sm font-medium rounded-xl transition-colors"
            [class]="p.active ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'">
            {{ p.active ? 'Desactivar' : 'Activar' }}
          </button>
        }
      </div>

      @if (!product()) {
        <p class="text-sm text-gray-400">Cargando producto...</p>
      } @else {
        <!-- Tabs -->
        <div class="flex gap-1 border-b border-gray-200">
          @for (t of tabs; track t.key) {
            <button (click)="setTab(t.key)" class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
              [class]="tab() === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'">
              {{ t.label }}
            </button>
          }
        </div>

        @if (service.error()) {
          <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">{{ service.error() }}</p>
        }

        <!-- ===== INFO ===== -->
        @if (tab() === 'info') {
          <form [formGroup]="infoForm" (ngSubmit)="saveInfo()" class="bg-white rounded-xl border border-gray-100 p-6 space-y-4 max-w-2xl">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input formControlName="name" type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
              <select formControlName="category_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Seleccionar categoría...</option>
                @for (c of categoryService.categories(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de preparación *</label>
              <select formControlName="preparation_type"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="prepared">Preparado (al momento)</option>
                <option value="packaged">Empacado</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea formControlName="description" rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Imagen</label>
              <div class="flex items-center gap-3">
                @if (infoForm.value.image_url) {
                  <img [src]="infoForm.value.image_url" alt="" class="w-16 h-16 rounded-lg object-cover">
                } @else {
                  <div class="w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center text-2xl">🍦</div>
                }
                <input type="file" accept="image/*" (change)="onImageSelected($event)"
                  class="text-sm text-gray-500">
                @if (uploading()) { <span class="text-xs text-gray-400">Subiendo...</span> }
              </div>
            </div>

            <div class="pt-2">
              <button type="submit" [disabled]="infoForm.invalid || service.isSubmitting() || uploading()"
                class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {{ service.isSubmitting() ? 'Guardando...' : 'Guardar cambios' }}
              </button>
              @if (infoSaved()) { <span class="ml-3 text-sm text-green-600">Guardado ✓</span> }
            </div>
          </form>
        }

        <!-- ===== VARIANTES ===== -->
        @if (tab() === 'variants') {
          <div class="space-y-3">
            <div class="flex justify-end">
              <button (click)="openVariantForm(null)"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                + Nueva variante
              </button>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              @if (variants().length === 0) {
                <div class="flex flex-col items-center justify-center py-10">
                  <p class="text-sm text-gray-400">Sin variantes. Agrega al menos una con precio para venderlo.</p>
                </div>
              } @else {
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50">
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                      <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio</th>
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                      <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    @for (v of variants(); track v.id) {
                      <tr class="hover:bg-gray-50 transition-colors" [class.opacity-50]="!v.active">
                        <td class="px-4 py-3 font-medium text-gray-900">{{ v.name }}</td>
                        <td class="px-4 py-3 text-gray-500">{{ v.sku || '—' }}</td>
                        <td class="px-4 py-3 text-right font-semibold text-gray-900">{{ v.price | number:'1.2-2' }}</td>
                        <td class="px-4 py-3">
                          @if (v.active) {
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Activa</span>
                          } @else {
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactiva</span>
                          }
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center justify-end gap-1">
                            <button (click)="openVariantForm(v)"
                              class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">Editar</button>
                            <button (click)="toggleVariant(v)"
                              class="px-2 py-1 text-xs font-medium rounded-lg transition-colors"
                              [class]="v.active ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'">
                              {{ v.active ? 'Desactivar' : 'Activar' }}
                            </button>
                            <button (click)="removeVariant(v)"
                              class="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>
        }

        <!-- ===== OPCIONES ===== -->
        @if (tab() === 'options') {
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs text-gray-400 max-w-md">
                Los grupos asignados se leen del menú (solo productos activos con variantes). El backend aún no
                expone listar/quitar asignaciones.
              </p>
              <button (click)="showAssign.set(true)"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shrink-0">
                + Asignar grupo
              </button>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              @if (assignedGroups().length === 0) {
                <div class="flex flex-col items-center justify-center py-10">
                  <p class="text-sm text-gray-400">Sin grupos de opciones visibles para este producto.</p>
                </div>
              } @else {
                <ul class="divide-y divide-gray-50">
                  @for (g of assignedGroups(); track g.id) {
                    <li class="px-4 py-3">
                      <p class="font-medium text-gray-900">{{ g.name }} <span class="text-xs text-gray-400">({{ g.min_select }}–{{ g.max_select }})</span></p>
                      <p class="text-sm text-gray-500">{{ optionsLabel(g) }}</p>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        }

        <!-- ===== RECETA ===== -->
        @if (tab() === 'recipe') {
          <div class="space-y-3 max-w-2xl">
            @if (variants().length === 0) {
              <p class="text-sm text-gray-400">Primero crea variantes; la receta se define por variante.</p>
            } @else {
              <div class="bg-white rounded-xl border border-gray-100 p-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Variante</label>
                <select [value]="selectedVariantId()" (change)="selectVariant($event)"
                  class="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  @for (v of variants(); track v.id) {
                    <option [value]="v.id">{{ v.name }}</option>
                  }
                </select>
              </div>
              @if (selectedVariantId()) {
                <app-recipe-editor [variantId]="selectedVariantId()" [label]="selectedVariantName()"></app-recipe-editor>
              }
            }
          </div>
        }
      }
    </div>

    <!-- Modals -->
    @if (showVariantForm() && product()) {
      <app-variant-form [productId]="product()!.id" [variant]="selectedVariant()"
        (close)="showVariantForm.set(false)" (saved)="onVariantSaved()"></app-variant-form>
    }
    @if (showAssign() && product()) {
      <app-product-option-group-assign [productId]="product()!.id"
        (close)="showAssign.set(false)" (saved)="onAssigned()"></app-product-option-group-assign>
    }
  `,
})
export class ProductDetailComponent implements OnInit {
  readonly service = inject(ProductService);
  readonly categoryService = inject(CategoryService);
  private readonly menuService = inject(MenuService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'variants', label: 'Variantes' },
    { key: 'options', label: 'Grupos de opciones' },
    { key: 'recipe', label: 'Receta' },
  ];

  readonly tab = signal<Tab>('info');
  readonly product = signal<Product | null>(null);
  readonly variants = signal<Variant[]>([]);
  readonly uploading = signal(false);
  readonly infoSaved = signal(false);

  readonly showVariantForm = signal(false);
  readonly selectedVariant = signal<Variant | null>(null);

  readonly showAssign = signal(false);
  readonly assignedGroups = signal<MenuOptionGroup[]>([]);

  readonly selectedVariantId = signal('');
  readonly selectedVariantName = computed(
    () => this.variants().find((v) => v.id === this.selectedVariantId())?.name ?? '',
  );

  infoForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    category_id: ['', Validators.required],
    preparation_type: ['prepared', Validators.required],
    description: [''],
    image_url: [''],
  });

  private productId = '';

  async ngOnInit(): Promise<void> {
    this.productId = this.route.snapshot.paramMap.get('id') ?? '';
    if (this.categoryService.categories().length === 0) this.categoryService.loadCategories();
    await this.loadProduct();
    await this.loadVariants();
  }

  private async loadProduct(): Promise<void> {
    const p = await this.service.getProduct(this.productId);
    if (!p) {
      this.router.navigate(['/dashboard/products']);
      return;
    }
    this.product.set(p);
    this.infoForm.patchValue({
      name: p.name,
      category_id: p.category_id,
      preparation_type: p.preparation_type,
      description: p.description ?? '',
      image_url: p.image_url ?? '',
    });
  }

  private async loadVariants(): Promise<void> {
    const list = await this.service.loadVariants(this.productId);
    this.variants.set(list);
    if (list.length > 0 && !this.selectedVariantId()) {
      this.selectedVariantId.set(list[0].id);
    }
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'options') this.loadAssignedGroups();
  }

  // --- Info ---
  async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try {
      const url = await this.service.uploadProductImage(file);
      this.infoForm.patchValue({ image_url: url });
    } catch {
      this.service.error.set('No se pudo subir la imagen.');
    } finally {
      this.uploading.set(false);
    }
  }

  async saveInfo(): Promise<void> {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }
    const val = this.infoForm.value;
    const formData: ProductForm = {
      name: val.name.trim(),
      category_id: val.category_id,
      preparation_type: val.preparation_type,
      description: val.description ?? '',
      image_url: val.image_url ?? '',
    };
    const ok = await this.service.updateProduct(this.productId, formData);
    if (ok) {
      this.infoSaved.set(true);
      await this.loadProduct();
    }
  }

  async toggleActive(p: Product): Promise<void> {
    const ok = await this.service.toggleActive(p.id, p.active);
    if (ok) this.product.set({ ...p, active: !p.active });
  }

  // --- Variants ---
  openVariantForm(v: Variant | null): void {
    this.selectedVariant.set(v);
    this.showVariantForm.set(true);
  }

  async onVariantSaved(): Promise<void> {
    this.showVariantForm.set(false);
    await this.loadVariants();
  }

  async toggleVariant(v: Variant): Promise<void> {
    const ok = await this.service.updateVariant(v.id, { active: !v.active });
    if (ok) await this.loadVariants();
  }

  async removeVariant(v: Variant): Promise<void> {
    if (!confirm(`¿Eliminar la variante "${v.name}"?`)) return;
    const ok = await this.service.deleteVariant(v.id);
    if (ok) await this.loadVariants();
  }

  // --- Options ---
  private async loadAssignedGroups(): Promise<void> {
    await this.menuService.loadMenu();
    for (const cat of this.menuService.categories()) {
      const found = cat.products.find((p) => p.id === this.productId);
      if (found) {
        this.assignedGroups.set(found.option_groups);
        return;
      }
    }
    this.assignedGroups.set([]);
  }

  async onAssigned(): Promise<void> {
    this.showAssign.set(false);
    await this.loadAssignedGroups();
  }

  optionsLabel(g: MenuOptionGroup): string {
    if (g.options.length === 0) return 'Sin opciones';
    return g.options.map((o) => o.name).join(', ');
  }

  // --- Recipe ---
  selectVariant(event: Event): void {
    this.selectedVariantId.set((event.target as HTMLSelectElement).value);
  }
}
