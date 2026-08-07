import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CategoryService } from '../../categories/services/category.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { buildUnitLookup, formatQuantity } from '../../inventory/services/unit-lookup';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import {
  DeactivatedVariant,
  PreparationType,
  ProductDraft,
  RecipeLineDraft,
  VariantDraft,
  VariantOptionGroupDraft,
} from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';

/** Una fila del desglose: qué pasa si el cliente elige esta opción. */
interface SlotBreakdownRow {
  optionId: string;
  optionName: string;
  /** Vacío si la opción no tiene insumo ligado (no descontaría nada). */
  itemName: string;
  /** Cantidad total con unidad, ya resuelta: '80 g'. */
  amount: string;
  /** Desglose de la suma cuando la opción aporta consumo propio; vacío si no. */
  extra: string;
}

interface SlotBreakdown {
  rows: SlotBreakdownRow[];
  /** 'Helado chocolate, Helado fresa y 20 más'. */
  summary: string;
  /** Cuántas opciones activas no tienen insumo. */
  missing: number;
}

/**
 * Página unificada de crear/editar producto (rediseño del prototipo, adaptado al
 * backend real). Mantiene un draft en memoria — datos generales, toggle de
 * tamaños, receta por variante e grupos de opciones — y delega el guardado en
 * `ProductService.saveProduct`, que orquesta las llamadas planas del backend.
 */
@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe, SearchableSelectComponent],
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

        <!-- ===== Tamaños del producto =====
             Todo lo de una presentación vive junto: precio, insumos fijos y sabores a
             elegir. Antes estaba repartido en tres secciones y obligaba a ir y venir
             entre ellas para configurar un solo tamaño. -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Tamaños del producto</h3>
              <p class="text-xs text-gray-500 mt-1">Cada tamaño tiene su precio, sus insumos y cuántos sabores puede elegir el cliente.</p>
            </div>
            <button type="button" (click)="toggleHasSizes()" role="switch" [attr.aria-checked]="draft().hasSizes"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0"
              [class]="draft().hasSizes ? 'bg-indigo-600' : 'bg-gray-300'"
              title="Actívalo si este producto se vende en más de un tamaño">
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" [class]="draft().hasSizes ? 'left-[22px]' : 'left-0.5'"></span>
            </button>
          </div>

          @if (draft().hasSizes) {
            <div class="flex flex-wrap gap-2 mt-4">
              @for (v of draft().variants; track v.localId) {
                <button type="button" (click)="activeLocalId.set(v.localId)"
                  class="px-4 py-1.5 rounded-lg border text-sm font-semibold transition-colors"
                  [class]="v.localId === activeLocalId() ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'">
                  {{ v.name }}
                </button>
              }
              <button type="button" (click)="addVariant()"
                class="border-2 border-dashed border-gray-300 rounded-lg px-4 py-1.5 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                + Agregar tamaño
              </button>
            </div>
          }

          <!-- Presentaciones retiradas: siguen ocupando su nombre, así que la salida es
               restaurarlas, no volver a crearlas. -->
          @if (draft().deactivated.length) {
            <div class="mt-4 border-t border-gray-100 pt-4">
              <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Presentaciones desactivadas</h4>
              <p class="text-xs text-gray-400 mt-0.5 mb-2">No se venden ni salen en la carta. Restaurar se aplica de inmediato.</p>
              <ul class="space-y-1.5">
                @for (dv of draft().deactivated; track dv.id) {
                  <li class="flex items-center gap-3 text-sm">
                    <span class="text-gray-700">{{ dv.name }}</span>
                    <span class="text-gray-400">$ {{ dv.price | number: '1.0-0' }}</span>
                    <button type="button" (click)="restoreVariant(dv)" [disabled]="service.isSubmitting()"
                      class="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50">
                      Restaurar
                    </button>
                  </li>
                }
              </ul>
            </div>
          }

          @if (activeVariant(); as av) {
            <div class="mt-4 space-y-5">
              <!-- Nombre y precio del tamaño -->
              <div class="flex flex-wrap items-end gap-3">
                @if (draft().hasSizes) {
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre</label>
                    <input [value]="av.name" (input)="setVariantField(av.localId, 'name', $any($event.target).value)"
                      class="w-40 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                }
                <div>
                  <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Precio</label>
                  <div class="flex items-center gap-1.5 border border-gray-300 rounded-xl px-3 py-2 w-36">
                    <span class="text-gray-400 text-sm">$</span>
                    <input type="number" min="0" [value]="av.price"
                      (input)="setVariantField(av.localId, 'price', +$any($event.target).value)"
                      class="w-full text-sm outline-none" />
                  </div>
                </div>
                @if (draft().hasSizes && draft().variants.length > 1) {
                  <button type="button" (click)="removeVariant(av.localId)"
                    class="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    Eliminar tamaño
                  </button>
                }
              </div>

              <!-- Insumos fijos -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Insumos fijos</h4>
                <p class="text-xs text-gray-400 mt-0.5 mb-2">Se descuentan siempre que se venda este tamaño.</p>
                <div class="space-y-2">
                  @if (av.recipe.length === 0) {
                    <p class="text-sm text-gray-400">Ninguno todavía.</p>
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
                    class="text-sm font-medium text-indigo-600 hover:text-indigo-700">+ Agregar insumo</button>
                </div>
              </div>

              <!-- Sabores a elegir -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Sabores a elegir</h4>
                <p class="text-xs text-gray-400 mt-0.5 mb-2">El cliente elige, y se descuenta la cantidad indicada del insumo de <strong>cada</strong> opción que elija.</p>
                <div class="space-y-3">
                  @if (av.optionGroups.length === 0) {
                    <p class="text-sm text-gray-400">Ninguno. Este tamaño no pide elegir nada.</p>
                  }
                  @for (g of av.optionGroups; track $index) {
                    @let bd = groupBreakdown(g);
                    <div class="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <app-searchable-select [ngModel]="g.option_group_id"
                          (ngModelChange)="setGroupField(av.localId, $index, 'option_group_id', $event)"
                          [options]="groupOptionsFor(av.localId, $index)" placeholder="Grupo…" class="flex-1 min-w-40" />
                        <button type="button" (click)="removeGroup(av.localId, $index)"
                          class="px-2 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg">✕</button>
                      </div>

                      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 text-sm">
                        <span class="text-gray-600">elige</span>
                        <input type="number" min="0" [value]="g.min_select"
                          (input)="setGroupField(av.localId, $index, 'min_select', +$any($event.target).value)"
                          class="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <span class="text-gray-600">a</span>
                        <input type="number" min="1" [value]="g.max_select"
                          (input)="setGroupField(av.localId, $index, 'max_select', +$any($event.target).value)"
                          class="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <span class="text-gray-600 ml-2">descuenta</span>
                        <input type="number" min="0" step="0.001" [value]="g.quantity_per_option"
                          (input)="setGroupField(av.localId, $index, 'quantity_per_option', +$any($event.target).value)"
                          class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <span class="text-gray-500 text-xs">{{ groupUnit(g) }} por cada uno</span>
                        @if (groupTotalHint(g); as hint) {
                          <span class="text-xs font-semibold text-gray-700">{{ hint }}</span>
                        }
                      </div>

                      @if (groupError(g); as err) {
                        <p class="text-xs text-red-600 mt-1.5">{{ err }}</p>
                      }
                      @for (w of groupWarnings(g); track w) {
                        <p class="text-xs text-amber-700 mt-1.5">⚠ {{ w }}</p>
                      }

                      @if (g.option_group_id) {
                        <div class="mt-2 pt-2 border-t border-amber-200/70">
                          <div class="flex items-start justify-between gap-3">
                            <p class="text-xs text-gray-500 min-w-0">
                              <span class="font-medium text-gray-600">Descuenta de:</span>
                              {{ bd.summary }}
                              @if (bd.missing > 0) {
                                <span class="text-amber-700 font-medium">· ⚠ {{ bd.missing }} sin insumo</span>
                              }
                            </p>
                            <a routerLink="/dashboard/ajustes/grupos-opciones" target="_blank" rel="noopener"
                              class="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                              title="Se abre en otra pestaña para no perder los cambios sin guardar">
                              Editar grupo ↗
                            </a>
                          </div>

                          @if (bd.rows.length > 0) {
                            <button type="button" (click)="toggleGroupDetail(av.localId, $index)"
                              class="mt-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                              {{ isGroupOpen(av.localId, $index) ? 'Ocultar detalle ▴' : 'Ver detalle (' + bd.rows.length + ') ▾' }}
                            </button>

                            @if (isGroupOpen(av.localId, $index)) {
                              <div class="mt-2 rounded-lg bg-white border border-gray-100 overflow-hidden">
                                <table class="w-full text-xs">
                                  <thead class="bg-gray-50 text-gray-500">
                                    <tr>
                                      <th class="text-left font-medium px-3 py-1.5">Si elige…</th>
                                      <th class="text-left font-medium px-3 py-1.5">Descuenta de</th>
                                      <th class="text-right font-medium px-3 py-1.5">Cantidad</th>
                                    </tr>
                                  </thead>
                                  <tbody class="divide-y divide-gray-100">
                                    @for (r of bd.rows; track r.optionId) {
                                      <tr [class]="r.itemName ? '' : 'bg-amber-50'">
                                        <td class="px-3 py-1.5 text-gray-700">{{ r.optionName }}</td>
                                        <td class="px-3 py-1.5" [class]="r.itemName ? 'text-gray-600' : 'text-amber-700'">
                                          {{ r.itemName || 'Sin insumo asignado' }}
                                        </td>
                                        <td class="px-3 py-1.5 text-right whitespace-nowrap"
                                          [class]="r.itemName ? 'text-gray-900 font-medium' : 'text-amber-700'">
                                          {{ r.itemName ? r.amount : 'no descuenta' }}
                                          @if (r.itemName && r.extra) {
                                            <span class="block text-gray-400 font-normal">{{ r.extra }}</span>
                                          }
                                        </td>
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                              </div>
                            }
                          }
                        </div>
                      }
                    </div>
                  }
                  <button type="button" (click)="addGroup(av.localId)"
                    class="text-sm font-medium text-amber-600 hover:text-amber-700">+ Agregar sabores a elegir</button>
                </div>
              </div>

              @if (draft().hasSizes && draft().variants.length > 1) {
                <button type="button" (click)="copyConfigToOthers(av.localId)"
                  class="text-xs font-medium text-gray-500 hover:text-indigo-600 border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg px-3 py-2 transition-colors">
                  Copiar insumos y sabores de «{{ av.name }}» a los otros tamaños
                </button>
              }
            </div>
          }
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
  readonly draft = signal<ProductDraft>(this.emptyDraft());
  /**
   * Desgloses abiertos, por `${variantLocalId}:${índice}`. La clave lleva la variante
   * porque el mismo grupo puede estar en varios tamaños con cantidades distintas, y
   * son desgloses distintos.
   */
  private readonly openGroups = signal<ReadonlySet<string>>(new Set());

  readonly activeVariant = computed(
    () => this.draft().variants.find((v) => v.localId === this.activeLocalId()) ?? null,
  );

  private readonly unitLookup = computed(() =>
    buildUnitLookup(this.inventoryService.allItems(), this.unitMeasureService.unitMeasures()),
  );

  /** Opciones para el select con buscador de insumos de la receta. */
  readonly inventoryOptions = computed(() =>
    this.inventoryService.allItems().map((i) => ({ id: i.id, label: i.name })),
  );

  /**
   * Grupos elegibles en una fila: los activos, menos los que ya usa **esta misma
   * presentación** (salvo el de la propia fila, que debe seguir seleccionable).
   */
  groupOptionsFor(localId: string, index: number) {
    const variant = this.draft().variants.find((v) => v.localId === localId);
    const usados = new Set(
      (variant?.optionGroups ?? [])
        .filter((_, i) => i !== index)
        .map((g) => g.option_group_id),
    );
    return this.optionGroupService
      .groups()
      .filter((g) => g.active && !usados.has(g.id))
      .map((g) => ({ id: g.id, label: g.name }));
  }

  readonly canSave = computed(() => {
    const d = this.draft();
    return (
      d.name.trim().length > 0 &&
      !!d.category_id &&
      d.variants.length > 0 &&
      d.variants.every((v) => Number(v.price) >= 0) &&
      // Una fila sin grupo o con min/max incoherentes la rechaza el backend con 422;
      // mejor bloquear el botón que perder el guardado a medias.
      d.variants.every((v) => v.optionGroups.every((g) => !this.groupError(g)))
    );
  });

  /** Mensaje de configuración inválida de una fila, o null si está bien. */
  groupError(g: VariantOptionGroupDraft): string | null {
    if (!g.option_group_id) return 'Elige un grupo.';
    if (Number(g.min_select) < 0) return 'El mínimo no puede ser negativo.';
    if (Number(g.max_select) < 1) return 'El máximo debe ser al menos 1.';
    if (Number(g.max_select) < Number(g.min_select)) {
      return 'El máximo no puede ser menor que el mínimo.';
    }
    const disponibles = this.groupOptions(g.option_group_id).filter((o) => o.active).length;
    if (Number(g.min_select) > disponibles) {
      return `Este grupo solo tiene ${disponibles} opción(es) activa(s): el cliente no podría elegir ${g.min_select}.`;
    }
    return null;
  }

  /** Unidad de lo que descuenta un grupo, si todas sus opciones la comparten. */
  groupUnit(g: VariantOptionGroupDraft): string {
    if (!g.option_group_id) return '';
    const units = new Set(
      this.groupOptions(g.option_group_id)
        .filter((o) => o.inventory_item_id)
        .map((o) => this.unitAbbr(o.inventory_item_id)),
    );
    return units.size === 1 ? [...units][0] : '';
  }

  /**
   * Lo que se descontará por venta, escrito entero: `2 sabores × 120 g = 240 g`.
   *
   * Es el guardarraíl contra el dedazo. Un 6000 tecleado en vez de 60 se ve raro en un
   * campo suelto, pero salta a la vista cuando el total dice "12000 g por venta".
   * Solo se muestra si el número es determinista (`min = max`).
   */
  groupTotalHint(g: VariantOptionGroupDraft): string | null {
    if (!g.option_group_id) return null;
    const n = Number(g.min_select) || 0;
    if (n <= 0 || n !== Number(g.max_select)) return null;

    const delTamano = Number(g.quantity_per_option) || 0;
    // Sin cantidad propia del tamaño manda la de la opción, que puede variar entre
    // opciones; entonces no hay un total único que mostrar.
    if (delTamano <= 0) return null;

    const unidad = this.groupUnit(g);
    const total = formatQuantity(delTamano * n);
    const cada = formatQuantity(delTamano);
    const u = unidad ? ` ${unidad}` : '';
    return n === 1
      ? `= ${total}${u} por venta`
      : `${n} × ${cada}${u} = ${total}${u} por venta`;
  }

  /**
   * Avisos que no impiden guardar pero casi siempre son un error de captura.
   * Se devuelven todos para no ir descubriéndolos de uno en uno.
   */
  groupWarnings(g: VariantOptionGroupDraft): string[] {
    if (!g.option_group_id) return [];
    const avisos: string[] = [];
    const options = this.groupOptions(g.option_group_id).filter((o) => o.active);
    const delTamano = Number(g.quantity_per_option) || 0;

    // (a) El fallo simétrico del doble descuento, y más silencioso: vender sin mover
    // stock. Ocurre si ni el tamaño ni las opciones ponen cantidad.
    if (delTamano <= 0) {
      const conPropia = options.filter(
        (o) => o.inventory_item_id && Number(o.item_quantity) > 0,
      );
      if (conPropia.length === 0) {
        avisos.push(
          'Nadie define cuánto descontar: elegir aquí no moverá el inventario. ' +
            'Pon una cantidad por sabor.',
        );
      } else if (conPropia.length < options.length) {
        avisos.push(
          `Solo ${conPropia.length} de ${options.length} opciones traen cantidad propia; ` +
            'el resto no descontará nada.',
        );
      }
    }

    // (b) Dedazo de magnitud: pedir más de lo que hay en la despensa entera.
    if (delTamano > 0) {
      const stocks = options
        .map((o) => this.inventoryService.allItems().find((i) => i.id === o.inventory_item_id))
        .filter((i): i is NonNullable<typeof i> => !!i)
        .map((i) => Number(i.current_stock));
      const mayor = stocks.length ? Math.max(...stocks) : 0;
      if (stocks.length > 0 && delTamano > mayor) {
        const u = this.groupUnit(g);
        avisos.push(
          `${formatQuantity(delTamano)}${u ? ` ${u}` : ''} supera el stock de todos los ` +
            `sabores (el mayor tiene ${formatQuantity(mayor)}${u ? ` ${u}` : ''}). ` +
            '¿Es la cantidad correcta?',
        );
      }
    }

    return avisos;
  }

  /**
   * Qué descontaría cada opción del grupo si el cliente la elige.
   *
   * Es la respuesta a "¿sobre qué insumo estoy aplicando este grupo?": el insumo vive
   * en cada opción (otro módulo) y la cantidad aquí, así que sin este cruce la fila no
   * dice de dónde sale el stock.
   *
   * La cantidad replica `plan_line_consumption` del backend:
   * `quantity_per_option` si el tamaño la define, y si no la de la opción. **Nunca se
   * suman**, y la tabla lo dice fila por fila: sin eso, ver un "80 g" configurado en el
   * sabor invita a pensar que se acumula con el del tamaño.
   */
  groupBreakdown(g: VariantOptionGroupDraft): SlotBreakdown {
    const empty: SlotBreakdown = { rows: [], summary: '', missing: 0 };
    if (!g.option_group_id) return empty;

    // Solo activas: una opción desactivada no se puede elegir, así que no descuenta.
    const options = this.groupOptions(g.option_group_id).filter((o) => o.active);
    if (options.length === 0) return { ...empty, summary: 'este grupo no tiene opciones activas.' };

    const lookup = this.unitLookup();
    const delTamano = Number(g.quantity_per_option) || 0;
    const mandaElTamano = delTamano > 0;

    const rows: SlotBreakdownRow[] = options.map((o) => {
      const propia = Number(o.item_quantity) || 0;
      // La misma regla que el backend: manda el tamaño y, si no la define, la opción.
      const efectiva = mandaElTamano ? delTamano : propia;
      const unit = lookup.abbrOf(o.inventory_item_id);
      return {
        optionId: o.id,
        optionName: o.name,
        itemName: lookup.nameOf(o.inventory_item_id),
        amount: efectiva > 0
          ? `${formatQuantity(efectiva)}${unit ? ` ${unit}` : ''}`
          : 'no descuenta',
        // Se explica solo cuando hay un valor propio en juego: o se está ignorando
        // (para que nadie lo cuente dos veces) o es el que manda.
        extra: propia > 0
          ? mandaElTamano
            ? `reemplaza los ${formatQuantity(propia)} del sabor`
            : 'viene del sabor, no del tamaño'
          : '',
      };
    });

    // Las problemáticas primero: son las que hay que ir a arreglar.
    rows.sort((a, b) => Number(!!a.itemName) - Number(!!b.itemName));

    const named = rows.filter((r) => r.itemName).map((r) => r.itemName);
    const shown = named.slice(0, 2).join(', ');
    const rest = named.length - 2;
    const summary = named.length
      ? rest > 0
        ? `${shown} y ${rest} más`
        : shown
      : 'ningún insumo — este grupo no descuenta nada.';

    return { rows, summary, missing: rows.length - named.length };
  }

  isGroupOpen(localId: string, index: number): boolean {
    return this.openGroups().has(`${localId}:${index}`);
  }

  toggleGroupDetail(localId: string, index: number): void {
    const key = `${localId}:${index}`;
    this.openGroups.update((open) => {
      const next = new Set(open);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  private groupOptions(groupId: string | null) {
    if (!groupId) return [];
    return this.optionGroupService.groups().find((g) => g.id === groupId)?.options ?? [];
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    // Se esperan los datos de referencia ANTES de armar el draft: los `<select>`
    // con valor preseleccionado (categoría, insumo de receta) necesitan que sus
    // `<option>` ya existan cuando se aplica `[value]`, o quedan en blanco.
    await Promise.all([
      this.categoryService.categories().length === 0 ? this.categoryService.loadCategories() : null,
      this.inventoryService.allItems().length === 0 ? this.inventoryService.loadAllItems() : null,
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
    return {
      id: null,
      name: '',
      category_id: '',
      description: '',
      preparation_type: 'prepared',
      image_url: '',
      active: true,
      hasSizes: false,
      variants: [this.newVariant('Único')],
      deactivated: [],
    };
  }

  private newVariant(name: string, price = 0): VariantDraft {
    return {
      id: null,
      localId: this.nextLid(),
      name,
      price,
      recipe: [],
      optionGroups: [],
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
        // Los tamaños nuevos heredan también los grupos, no solo los insumos: si no,
        // habría que volver a elegirlos uno por uno en cada tamaño.
        const copy = (name: string): VariantDraft => ({
          ...this.newVariant(name, base.price),
          recipe: base.recipe.map((r) => ({ ...r })),
          optionGroups: base.optionGroups.map((g) => ({ ...g })),
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
    // Parte de una copia del tamaño activo: casi siempre se ajusta el precio y las
    // cantidades, no se empieza de cero.
    const base = this.activeVariant();
    const nv: VariantDraft = {
      ...this.newVariant('Nuevo tamaño', base?.price ?? 0),
      recipe: (base?.recipe ?? []).map((r) => ({ ...r })),
      optionGroups: (base?.optionGroups ?? []).map((g) => ({ ...g })),
    };
    this.draft.update((d) => ({ ...d, variants: [...d.variants, nv] }));
    this.activeLocalId.set(nv.localId);
  }

  /** Propaga insumos y grupos del tamaño activo al resto (los precios no se tocan). */
  copyConfigToOthers(localId: string): void {
    const source = this.draft().variants.find((v) => v.localId === localId);
    if (!source) return;
    const otros = this.draft().variants.filter((v) => v.localId !== localId);
    if (otros.length === 0) return;
    const ok = confirm(
      `Se reemplazarán los insumos y los sabores de ${otros.map((v) => v.name).join(', ')} ` +
        `por los de «${source.name}». Los precios no cambian. ¿Continuar?`,
    );
    if (!ok) return;
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? v
          : {
              ...v,
              recipe: source.recipe.map((r) => ({ ...r })),
              optionGroups: source.optionGroups.map((g) => ({ ...g })),
            },
      ),
    }));
  }

  /**
   * Devuelve una presentación desactivada a la carta y la trae al draft con su id real,
   * su receta y sus grupos — así el guardado la actualiza (`PATCH`) en vez de intentar
   * crearla otra vez, que es justo el choque que la constraint de nombre rechaza.
   *
   * A diferencia del resto del formulario, se aplica en el momento: reactivar es la
   * operación que libera el nombre, y diferirla al «Guardar» dejaría al usuario sin
   * salida cuando el guardado es precisamente lo que está fallando.
   */
  async restoreVariant(dv: DeactivatedVariant): Promise<void> {
    const enUso = this.draft().variants.some(
      (v) => v.name.trim().toLowerCase() === dv.name.trim().toLowerCase(),
    );
    if (enUso) {
      this.service.error.set(
        `Ya tienes un tamaño llamado «${dv.name}». Renómbralo o quítalo antes de restaurar este.`,
      );
      return;
    }

    const ok = await this.service.restoreVariant(dv.id);
    if (!ok) return; // el banner ya muestra el error

    const [recipe, optionGroups] = await Promise.all([
      this.service.getVariantRecipe(dv.id),
      this.service.getVariantOptionGroups(dv.id),
    ]);
    const restored: VariantDraft = {
      id: dv.id,
      localId: dv.id,
      name: dv.name,
      price: dv.price,
      recipe,
      optionGroups,
    };
    this.draft.update((d) => {
      const variants = [...d.variants, restored];
      return {
        ...d,
        variants,
        hasSizes: d.hasSizes || variants.length > 1,
        deactivated: d.deactivated.filter((x) => x.id !== dv.id),
      };
    });
    this.activeLocalId.set(restored.localId);
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

  // --- Insumos fijos ---
  addRecipeLine(localId: string): void {
    const line: RecipeLineDraft = {
      inventory_item_id: this.inventoryService.allItems()[0]?.id ?? null,
      quantity: 1,
    };
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, recipe: [...v.recipe, line] } : v,
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
          ? {
              ...v,
              recipe: v.recipe.map((l, i) =>
                i === index
                  ? { ...l, [field]: field === 'quantity' ? value : (value as string) || null }
                  : l,
              ),
            }
          : v,
      ),
    }));
  }

  unitAbbr(itemId: string | null): string {
    return this.unitLookup().abbrOf(itemId);
  }

  // --- Sabores a elegir (grupos de la presentación) ---
  addGroup(localId: string): void {
    // Preselecciona el primer grupo activo que esta presentación no use ya.
    const variant = this.draft().variants.find((v) => v.localId === localId);
    const usados = new Set((variant?.optionGroups ?? []).map((g) => g.option_group_id));
    const candidato = this.optionGroupService
      .groups()
      .find((g) => g.active && !usados.has(g.id));
    const nuevo: VariantOptionGroupDraft = {
      option_group_id: candidato?.id ?? null,
      name: candidato?.name ?? '',
      // Arranca en "elige exactamente 1": es el caso normal y evita que un grupo
      // opcional pase inadvertido y no descuente nada.
      min_select: 1,
      max_select: 1,
      quantity_per_option: 0,
    };
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, optionGroups: [...v.optionGroups, nuevo] } : v,
      ),
    }));
  }

  removeGroup(localId: string, index: number): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? { ...v, optionGroups: v.optionGroups.filter((_, i) => i !== index) }
          : v,
      ),
    }));
  }

  setGroupField(
    localId: string,
    index: number,
    field: 'option_group_id' | 'min_select' | 'max_select' | 'quantity_per_option',
    value: string | number,
  ): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? {
              ...v,
              optionGroups: v.optionGroups.map((g, i) => {
                if (i !== index) return g;
                if (field !== 'option_group_id') return { ...g, [field]: value };
                const id = (value as string) || null;
                // El nombre se guarda resuelto para poder mostrarlo sin volver a buscar.
                const found = this.optionGroupService.groups().find((x) => x.id === id);
                return { ...g, option_group_id: id, name: found?.name ?? '' };
              }),
            }
          : v,
      ),
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
    if (id) {
      this.router.navigate(['/dashboard/products']);
      return;
    }
    // Si el guardado chocó con una presentación desactivada, hay que ponerle el botón
    // «Restaurar» delante: puede no estar en pantalla si la desactivó otro usuario, o
    // en otra pestaña, después de que se cargara este formulario. Se refresca solo esa
    // lista, no el draft entero, para no perder lo que lleva escrito.
    const conflict = this.service.lastVariantConflict();
    const productId = this.draft().id;
    if (conflict && !conflict.active && productId) {
      const deactivated = await this.service.loadDeactivated(productId);
      this.draft.update((d) => ({ ...d, deactivated }));
    }
  }

  cancel(): void {
    this.router.navigate(['/dashboard/products']);
  }
}
