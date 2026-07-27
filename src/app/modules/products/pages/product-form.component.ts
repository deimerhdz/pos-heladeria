import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CategoryService } from '../../categories/services/category.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { PreparationType, ProductDraft, VariantDraft } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';

/**
 * Página unificada de crear/editar producto (rediseño del prototipo, adaptado al
 * backend real). Mantiene un draft en memoria — datos generales, toggle de
 * tamaños, receta por variante e grupos de opciones — y delega el guardado en
 * `ProductService.saveProduct`, que orquesta las llamadas planas del backend.
 */
@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [RouterLink, FormsModule, SearchableSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-3xl mx-auto space-y-5">
      <div>
        <a routerLink="/dashboard/products" class="text-xs text-gray-400 hover:text-gray-600">← Volver al catálogo</a>
        <div class="flex items-center justify-between mt-1">
          <h1 class="text-2xl font-bold text-gray-900">{{ draft().id ? 'Editar producto' : 'Nuevo producto' }}</h1>
          @if (draft().id) {
            <button (click)="toggleActive()"
              class="px-3 py-1.5 text-sm font-medium rounded-xl transition-colors"
              [class]="productActive() ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'">
              {{ productActive() ? 'Desactivar' : 'Activar' }}
            </button>
          }
        </div>
      </div>

      @if (loading()) {
        <p class="text-sm text-gray-400">Cargando producto…</p>
      } @else {
        @if (service.error()) {
          <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ service.error() }}</div>
        }

        <!-- ===== Datos generales ===== -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Datos generales</h3>
          <div class="flex flex-col sm:flex-row gap-5">
            <div class="shrink-0">
              @if (previewUrl() ?? draft().image_url; as img) {
                <img [src]="img" alt="" class="w-32 h-32 rounded-xl object-cover border border-gray-100" />
              } @else {
                <div class="w-32 h-32 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-3xl">🍦</div>
              }
              <label class="mt-2 block text-xs text-indigo-600 hover:text-indigo-700 cursor-pointer">
                {{ uploading() ? 'Subiendo…' : 'Cambiar imagen' }}
                <input type="file" accept="image/*" (change)="onImageSelected($event)" class="hidden" [disabled]="uploading()" />
              </label>
              @if (pendingImage()) {
                <p class="mt-1 text-[11px] text-gray-400">Se subirá al guardar</p>
                <button type="button" (click)="clearPendingImage()" class="text-[11px] text-red-600 hover:text-red-700">Cancelar imagen</button>
              }
            </div>
            <div class="flex-1 space-y-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre</label>
                <input [value]="draft().name" (input)="setField('name', $any($event.target).value)" placeholder="Ej. Copa de Helado"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoría</label>
                <select [ngModel]="draft().category_id" (ngModelChange)="setField('category_id', $event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Seleccionar categoría…</option>
                  @for (c of categoryService.categories(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de preparación</label>
                <select [ngModel]="draft().preparation_type" (ngModelChange)="setField('preparation_type', $event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="prepared">Preparado (al momento)</option>
                  <option value="packaged">Empacado</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descripción</label>
                <textarea [value]="draft().description" (input)="setField('description', $any($event.target).value)" rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"></textarea>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== Variantes de tamaño ===== -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Variantes de tamaño</h3>
              <p class="text-xs text-gray-500 mt-1">Actívalo si este producto se vende en más de un tamaño, cada uno con su receta.</p>
            </div>
            <button type="button" (click)="toggleHasSizes()" role="switch" [attr.aria-checked]="draft().hasSizes"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0"
              [class]="draft().hasSizes ? 'bg-indigo-600' : 'bg-gray-300'">
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" [class]="draft().hasSizes ? 'left-[22px]' : 'left-0.5'"></span>
            </button>
          </div>

          @if (draft().hasSizes) {
            <div class="flex flex-wrap gap-2.5 mt-4">
              @for (v of draft().variants; track v.localId) {
                <div class="flex items-center gap-1.5 border-2 rounded-xl px-2.5 py-1.5"
                  [class]="v.localId === activeLocalId() ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'">
                  <input [value]="v.name" (input)="setVariantField(v.localId, 'name', $any($event.target).value)"
                    class="w-24 bg-transparent font-semibold text-sm outline-none" />
                  <span class="text-gray-400 text-sm">$</span>
                  <input type="number" min="0" [value]="v.price" (input)="setVariantField(v.localId, 'price', +$any($event.target).value)"
                    class="w-20 bg-transparent text-sm outline-none" />
                  @if (draft().variants.length > 1) {
                    <button type="button" (click)="removeVariant(v.localId)" class="text-gray-400 hover:text-red-500 text-base leading-none">×</button>
                  }
                </div>
              }
              <button type="button" (click)="addVariant()"
                class="border-2 border-dashed border-gray-300 rounded-xl px-4 py-1.5 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                + Agregar tamaño
              </button>
            </div>
          } @else {
            <div class="mt-4 max-w-xs">
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Precio</label>
              <div class="flex items-center gap-1.5 border border-gray-300 rounded-xl px-3 py-2">
                <span class="text-gray-400 text-sm">$</span>
                <input type="number" min="0" [value]="draft().variants[0].price"
                  (input)="setVariantField(draft().variants[0].localId, 'price', +$any($event.target).value)"
                  class="w-full text-sm outline-none" />
              </div>
            </div>
          }
        </section>

        <!-- ===== Receta ===== -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="text-sm font-semibold text-gray-900">
            Receta @if (draft().hasSizes && activeVariant()) { <span class="text-gray-400 font-normal">— {{ activeVariant()!.name }}</span> }
          </h3>
          <p class="text-xs text-gray-500 mt-1 mb-4">Los insumos que consume cada venta de esta variante. El stock se descuenta por insumo.</p>

          @if (draft().hasSizes) {
            <div class="flex flex-wrap gap-2 mb-4">
              @for (v of draft().variants; track v.localId) {
                <button type="button" (click)="activeLocalId.set(v.localId)"
                  class="px-4 py-1.5 rounded-lg border text-sm font-semibold transition-colors"
                  [class]="v.localId === activeLocalId() ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'">
                  {{ v.name }}
                </button>
              }
            </div>
          }

          @if (activeVariant(); as av) {
            <div class="space-y-2">
              @if (av.recipe.length === 0) {
                <p class="text-sm text-gray-400">Sin insumos. Agrega los que consume esta variante.</p>
              }
              @for (line of av.recipe; track $index) {
                <div class="flex items-center gap-2">
                  <app-searchable-select [ngModel]="line.inventory_item_id"
                    (ngModelChange)="setRecipeField(av.localId, $index, 'inventory_item_id', $event)"
                    [options]="inventoryOptions()" placeholder="Insumo…" class="flex-1" />
                  <input type="number" min="0" step="0.001" [value]="line.quantity"
                    (input)="setRecipeField(av.localId, $index, 'quantity', +$any($event.target).value)" placeholder="Cant."
                    class="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  <span class="w-12 text-xs text-gray-400">{{ unitAbbr(line.inventory_item_id) }}</span>
                  <button type="button" (click)="removeRecipeLine(av.localId, $index)"
                    class="px-2 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg">✕</button>
                </div>
              }
              <button type="button" (click)="addRecipeLine(av.localId)"
                class="mt-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">+ Agregar línea de receta</button>
            </div>
          }
        </section>

        <!-- ===== Grupos de opciones (seleccionables) ===== -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="text-sm font-semibold text-gray-900">Grupos de opciones</h3>
          <p class="text-xs text-gray-500 mt-1 mb-4">Grupos de los que el cliente elige (ej. sabores). Se crean en su propio módulo; aquí se asignan al producto.</p>

          @if (draft().optionGroups.length > 0) {
            <ul class="divide-y divide-gray-50 mb-3 border border-gray-100 rounded-xl overflow-hidden">
              @for (g of draft().optionGroups; track g.option_group_id) {
                <li class="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span class="text-sm font-medium text-gray-900">{{ g.name }}</span>
                    <span class="text-xs text-gray-400 ml-2">elige {{ g.min_select }}–{{ g.max_select }}</span>
                  </div>
                  <button type="button" (click)="removeGroup(g.option_group_id)" class="text-xs font-medium text-red-600 hover:text-red-700">Quitar</button>
                </li>
              }
            </ul>
          }

          <div class="flex flex-wrap items-center gap-2">
            <app-searchable-select [ngModel]="newGroupId()" (ngModelChange)="newGroupId.set($event)"
              [options]="assignableGroupOptions()" placeholder="Agregar grupo existente…" class="flex-1 min-w-48" />
            <button type="button" (click)="addGroup()" [disabled]="!newGroupId()"
              class="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40 transition-colors">
              + Asignar
            </button>
          </div>
        </section>

        <!-- ===== Acciones ===== -->
        <div class="flex justify-end gap-3 pb-2">
          <button type="button" (click)="cancel()"
            class="px-5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="button" (click)="save()" [disabled]="!canSave() || service.isSubmitting() || uploading()"
            class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {{ service.isSubmitting() ? 'Guardando…' : 'Guardar producto' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ProductFormComponent implements OnInit, OnDestroy {
  readonly service = inject(ProductService);
  readonly categoryService = inject(CategoryService);
  readonly inventoryService = inject(InventoryService);
  private readonly optionGroupService = inject(OptionGroupService);
  private readonly unitMeasureService = inject(UnitMeasureService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private lidCounter = 0;

  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly productActive = signal(true);
  /** Imagen elegida pero aún NO subida (se sube al guardar para evitar huérfanos). */
  readonly pendingImage = signal<File | null>(null);
  /** Preview local (`URL.createObjectURL`) de la imagen pendiente. */
  readonly previewUrl = signal<string | null>(null);
  readonly activeLocalId = signal('');
  readonly newGroupId = signal('');
  readonly draft = signal<ProductDraft>(this.emptyDraft());

  readonly activeVariant = computed(
    () => this.draft().variants.find((v) => v.localId === this.activeLocalId()) ?? null,
  );

  /** Grupos activos que aún no están en el draft (para el selector de asignación). */
  readonly assignableGroups = computed(() => {
    const used = new Set(this.draft().optionGroups.map((g) => g.option_group_id));
    return this.optionGroupService.groups().filter((g) => g.active && !used.has(g.id));
  });

  /** Opciones para el select con buscador de grupos de opciones asignables. */
  readonly assignableGroupOptions = computed(() =>
    this.assignableGroups().map((g) => ({
      id: g.id,
      label: `${g.name} (elige ${g.min_select}–${g.max_select})`,
    })),
  );

  private readonly unitByItem = computed(() => {
    const units = new Map(this.unitMeasureService.unitMeasures().map((u) => [u.id, u.abbreviation]));
    const map = new Map<string, string>();
    for (const item of this.inventoryService.items()) {
      map.set(item.id, units.get(item.unit_measure_id) ?? '');
    }
    return map;
  });

  /** Opciones para el select con buscador de insumos de la receta. */
  readonly inventoryOptions = computed(() =>
    this.inventoryService.items().map((i) => ({ id: i.id, label: i.name })),
  );

  readonly canSave = computed(() => {
    const d = this.draft();
    return (
      d.name.trim().length > 0 &&
      !!d.category_id &&
      d.variants.length > 0 &&
      d.variants.every((v) => Number(v.price) >= 0)
    );
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    // Se esperan los datos de referencia ANTES de armar el draft: los `<select>`
    // con valor preseleccionado (categoría, insumo de receta) necesitan que sus
    // `<option>` ya existan cuando se aplica `[value]`, o quedan en blanco.
    await Promise.all([
      this.categoryService.categories().length === 0 ? this.categoryService.loadCategories() : null,
      this.inventoryService.items().length === 0 ? this.inventoryService.loadItems() : null,
      this.unitMeasureService.unitMeasures().length === 0
        ? this.unitMeasureService.loadUnitMeasures()
        : null,
      this.optionGroupService.groups().length === 0 ? this.optionGroupService.loadGroups() : null,
    ]);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const draft = await this.service.getProductDraft(id);
      if (!draft) {
        this.loading.set(false);
        this.router.navigate(['/dashboard/products']);
        return;
      }
      this.draft.set(draft);
      this.productActive.set(draft.active);
      this.activeLocalId.set(draft.variants[0]?.localId ?? '');
    } else {
      const d = this.emptyDraft();
      this.draft.set(d);
      this.activeLocalId.set(d.variants[0].localId);
    }
    this.loading.set(false);
  }

  private emptyDraft(): ProductDraft {
    const v: VariantDraft = { id: null, localId: this.nextLid(), name: 'Único', price: 0, recipe: [] };
    return {
      id: null,
      name: '',
      category_id: '',
      description: '',
      preparation_type: 'prepared',
      image_url: '',
      active: true,
      hasSizes: false,
      variants: [v],
      optionGroups: [],
      originalOptionGroupIds: [],
    };
  }

  private nextLid(): string {
    return 'l' + ++this.lidCounter;
  }

  setField<K extends keyof ProductDraft>(field: K, value: string): void {
    this.draft.update((d) => ({ ...d, [field]: value as ProductDraft[K] }));
  }

  /**
   * Sólo prepara la imagen (preview local); NO la sube. La subida ocurre en
   * `save()`, de modo que si el usuario cancela o se sale, no queda un objeto
   * huérfano en R2.
   */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite reelegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.service.error.set('El archivo debe ser una imagen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.service.error.set('La imagen supera el máximo de 5 MB.');
      return;
    }
    this.service.error.set(null);
    this.revokePreview();
    this.pendingImage.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
  }

  clearPendingImage(): void {
    this.revokePreview();
    this.pendingImage.set(null);
    this.previewUrl.set(null);
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  // --- Variantes ---
  toggleHasSizes(): void {
    this.draft.update((d) => {
      if (!d.hasSizes) {
        const base = d.variants[0];
        const copy = (name: string): VariantDraft => ({
          id: null,
          localId: this.nextLid(),
          name,
          price: base.price,
          recipe: base.recipe.map((r) => ({ ...r })),
        });
        const variants = [{ ...base, name: 'Grande' }, copy('Mediana'), copy('Pequeña')];
        this.activeLocalId.set(variants[0].localId);
        return { ...d, hasSizes: true, variants };
      }
      const only = { ...d.variants[0], name: 'Único' };
      this.activeLocalId.set(only.localId);
      return { ...d, hasSizes: false, variants: [only] };
    });
  }

  addVariant(): void {
    const nv: VariantDraft = { id: null, localId: this.nextLid(), name: 'Nuevo tamaño', price: 0, recipe: [] };
    this.draft.update((d) => ({ ...d, variants: [...d.variants, nv] }));
    this.activeLocalId.set(nv.localId);
  }

  removeVariant(localId: string): void {
    this.draft.update((d) => {
      if (d.variants.length <= 1) return d;
      const variants = d.variants.filter((v) => v.localId !== localId);
      if (this.activeLocalId() === localId) this.activeLocalId.set(variants[0].localId);
      return { ...d, variants };
    });
  }

  setVariantField(localId: string, field: 'name' | 'price', value: string | number): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) => (v.localId === localId ? { ...v, [field]: value } : v)),
    }));
  }

  // --- Receta ---
  addRecipeLine(localId: string): void {
    const first = this.inventoryService.items()[0]?.id ?? '';
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, recipe: [...v.recipe, { inventory_item_id: first, quantity: 1 }] } : v,
      ),
    }));
  }

  removeRecipeLine(localId: string, index: number): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, recipe: v.recipe.filter((_, i) => i !== index) } : v,
      ),
    }));
  }

  setRecipeField(
    localId: string,
    index: number,
    field: 'inventory_item_id' | 'quantity',
    value: string | number,
  ): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? { ...v, recipe: v.recipe.map((l, i) => (i === index ? { ...l, [field]: value } : l)) }
          : v,
      ),
    }));
  }

  unitAbbr(itemId: string): string {
    return this.unitByItem().get(itemId) ?? '';
  }

  // --- Grupos de opciones ---
  addGroup(): void {
    const g = this.optionGroupService.groups().find((x) => x.id === this.newGroupId());
    if (!g) return;
    this.draft.update((d) => ({
      ...d,
      optionGroups: [
        ...d.optionGroups,
        {
          option_group_id: g.id,
          name: g.name,
          min_select: g.min_select,
          max_select: g.max_select,
          assigned: false,
        },
      ],
    }));
    this.newGroupId.set('');
  }

  removeGroup(optionGroupId: string): void {
    this.draft.update((d) => ({
      ...d,
      optionGroups: d.optionGroups.filter((g) => g.option_group_id !== optionGroupId),
    }));
  }

  // --- Acciones ---
  async toggleActive(): Promise<void> {
    const id = this.draft().id;
    if (!id) return;
    const ok = await this.service.toggleActive(id, this.productActive());
    if (ok) this.productActive.update((a) => !a);
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.service.isSubmitting() || this.uploading()) return;

    // Sube la imagen pendiente ahora (una sola vez); si falla, aborta sin guardar.
    const file = this.pendingImage();
    if (file) {
      this.uploading.set(true);
      this.service.error.set(null);
      try {
        const url = await this.service.uploadProductImage(file);
        this.draft.update((d) => ({ ...d, image_url: url }));
        this.clearPendingImage();
      } catch {
        this.service.error.set('No se pudo subir la imagen.');
        return;
      } finally {
        this.uploading.set(false);
      }
    }

    const id = await this.service.saveProduct(this.draft());
    if (id) this.router.navigate(['/dashboard/products']);
  }

  cancel(): void {
    this.router.navigate(['/dashboard/products']);
  }
}
