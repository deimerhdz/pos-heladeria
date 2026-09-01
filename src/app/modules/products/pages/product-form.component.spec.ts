import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type { VariantDraft } from '../interfaces/product.interface';
import { environment } from '../../../../environments/environment';
import { ProductFormComponent } from './product-form.component';
import { CategoryService } from '../../categories/services/category.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';

const API = environment.apiBaseUrl;
const PRODUCTS = `${API}/products`;
const VARIANTS = `${API}/variants`;

function makeSummary(partial: Partial<PlanSummary>): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, compras: true, promociones: true },
    ...partial,
  };
}

/**
 * Por defecto, plan CON el módulo Inventario -- así los tests de spec 027 (switch
 * habilitado, sin gating por plan en juego) siguen pasando sin tocarlos. Los tests de
 * gating por plan (spec 064, US5) lo redefinen explícitamente a `inventario: false`.
 */
const planSummary = signal<PlanSummary | null>(makeSummary({}));

/** Drain pending microtasks so the next request in a chained flow gets dispatched. */
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Los cuatro servicios de datos de referencia (categorías, insumos, unidades, grupos
 * de opciones) no son lo que este spec verifica — son colaboradores. Se reemplazan por
 * fakes livianos para no depender de la sincronización real de sus queries de
 * TanStack, dejando `ProductService` como el único backend real de HTTP en juego.
 */
class FakeCategoryService {
  allCategories = signal<{ id: string; name: string }[]>([{ id: 'c1', name: 'Helados' }]);
  loadAllCategories(): void {}
}
class FakeInventoryService {
  allItems = signal<unknown[]>([]);
  loadAllItems(): void {}
}
class FakeUnitMeasureService {
  unitMeasures = signal<unknown[]>([]);
  async loadUnitMeasures(): Promise<void> {}
}
class FakeOptionGroupService {
  groups = signal<unknown[]>([]);
  async loadGroups(): Promise<void> {}
}

describe('ProductFormComponent', () => {
  let fixture: ComponentFixture<ProductFormComponent>;
  let component: ProductFormComponent;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;

  /** Arranca el componente en modo "producto nuevo" (sin `id` en la ruta). */
  async function createNew(): Promise<void> {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit
    await tick();
    await tick();
    await tick();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());
  beforeEach(() => planSummary.set(makeSummary({})));

  const switchButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[role="switch"][title*="descuenta insumos"]');

  const text = (): string => fixture.nativeElement.textContent as string;

  it('un producto nuevo abre con el switch de inventario apagado por defecto', async () => {
    await createNew();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(switchButton().getAttribute('aria-checked')).toBe('false');
  });

  it('la sección de insumos fijos aparece deshabilitada mientras el switch está apagado, pero "Sabores a elegir" sigue disponible (spec 064, FR-006)', async () => {
    await createNew();

    expect(text()).not.toContain('Insumos fijos');
    // A diferencia del comportamiento anterior a spec 064: "Sabores a elegir" (selector
    // de grupo, min/max) ya NO depende del switch de inventario -- un producto sin
    // inventario puede seguir ofreciendo sabores/toppings con precio.
    expect(text()).toContain('Sabores a elegir');
    expect(text()).toContain('Activa "Maneja inventario"');
  });

  it('activar el switch habilita la sección de insumos fijos y la parte de inventario de "Sabores a elegir"', async () => {
    await createNew();

    switchButton().click();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(text()).toContain('Insumos fijos');
    expect(text()).toContain('Sabores a elegir');
    expect(text()).not.toContain('Activa "Maneja inventario"');
  });

  it('sin inventario, se puede agregar un grupo de opciones y fijar min/max, pero no aparece el input de cantidad ni el detalle de insumo', async () => {
    await createNew();
    const localId = component.activeVariant()!.localId;

    component.addGroup(localId);
    component.setGroupField(localId, 0, 'option_group_id', 'g1');
    component.setGroupField(localId, 0, 'min_select', 1);
    component.setGroupField(localId, 0, 'max_select', 1);
    fixture.detectChanges();

    expect(component.activeVariant()!.optionGroups.length).toBe(1);
    expect(component.activeVariant()!.optionGroups[0].option_group_id).toBe('g1');
    expect(text()).toContain('elige');
    // "descuenta" (verbo) también aparece en la descripción siempre visible del switch
    // ("...este producto descuenta al venderse") -- se verifica la frase completa que
    // solo existe junto al input de cantidad_per_option, para no dar un falso negativo.
    expect(text()).not.toContain('por cada uno');
    expect(text()).not.toContain('Descuenta de:');
  });

  it('activar el switch sobre un grupo ya elegido revela la cantidad de consumo y el detalle de insumo', async () => {
    await createNew();
    const localId = component.activeVariant()!.localId;
    component.addGroup(localId);
    component.setGroupField(localId, 0, 'option_group_id', 'g1');
    fixture.detectChanges();

    switchButton().click();
    fixture.detectChanges();

    expect(text()).toContain('por cada uno');
    expect(text()).toContain('Descuenta de:');
  });

  it('advierte de inmediato si el switch está activado y ninguna presentación tiene insumos (FR-013)', async () => {
    await createNew();
    expect(text()).not.toContain('no podrá venderse');

    switchButton().click();
    fixture.detectChanges();

    expect(text()).toContain('Este producto no podrá venderse hasta que se le configure al menos un insumo');
  });

  it('la advertencia desaparece en cuanto se agrega un insumo fijo', async () => {
    await createNew();
    switchButton().click();
    fixture.detectChanges();
    expect(component.showsInventoryWarning()).toBe(true);

    component.addRecipeLine(component.activeVariant()!.localId);
    component.setRecipeField(component.activeVariant()!.localId, 0, 'inventory_item_id', 'i1');
    component.setRecipeField(component.activeVariant()!.localId, 0, 'quantity', 1);
    fixture.detectChanges();

    expect(component.showsInventoryWarning()).toBe(false);
    expect(text()).not.toContain('no podrá venderse');
  });

  /** Enciende el switch y agrega un insumo fijo a la presentación activa. */
  function activarConInsumo(): void {
    switchButton().click();
    fixture.detectChanges();
    const localId = component.activeVariant()!.localId;
    component.addRecipeLine(localId);
    component.setRecipeField(localId, 0, 'inventory_item_id', 'i1');
    component.setRecipeField(localId, 0, 'quantity', 1);
    fixture.detectChanges();
  }

  it('apagar el switch de un producto sin insumos configurados no pide confirmación', async () => {
    await createNew();
    switchButton().click(); // enciende, sin insumos
    fixture.detectChanges();

    const confirm = TestBed.inject(ConfirmService);
    switchButton().click(); // apaga
    fixture.detectChanges();

    expect(confirm.state()).toBeNull();
    expect(component.draft().tracks_inventory).toBe(false);
  });

  it('apagar el switch con insumos configurados pide confirmación explícita (FR-014)', async () => {
    await createNew();
    activarConInsumo();

    const confirm = TestBed.inject(ConfirmService);
    switchButton().click(); // intenta apagar
    fixture.detectChanges();

    expect(confirm.state()).not.toBeNull();
    expect(confirm.state()?.title).toContain('Desactivar');
    // El switch todavía no cambió: la confirmación está pendiente de respuesta.
    expect(component.draft().tracks_inventory).toBe(true);
  });

  it('cancelar la confirmación deja el switch activado y los insumos intactos', async () => {
    await createNew();
    activarConInsumo();
    const confirm = TestBed.inject(ConfirmService);

    switchButton().click();
    fixture.detectChanges();
    confirm.respond(false);
    await tick();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(component.activeVariant()!.recipe.length).toBe(1);
    expect(text()).toContain('Insumos fijos');
  });

  it('aceptar la confirmación apaga el switch sin borrar los insumos, y reactivar no vuelve a preguntar', async () => {
    await createNew();
    activarConInsumo();
    const confirm = TestBed.inject(ConfirmService);

    switchButton().click();
    fixture.detectChanges();
    confirm.respond(true);
    await tick();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(component.activeVariant()!.recipe.length).toBe(1); // insumo conservado en memoria
    expect(text()).not.toContain('Insumos fijos'); // sección deshabilitada

    // Reactivar el switch: no pide confirmación y muestra el insumo tal como quedó.
    switchButton().click();
    fixture.detectChanges();

    expect(confirm.state()).toBeNull();
    expect(component.draft().tracks_inventory).toBe(true);
    expect(component.activeVariant()!.recipe.length).toBe(1);
    expect(text()).toContain('Insumos fijos');
  });

  it('guardar un producto nuevo sin insumos no produce ningún error de validación', async () => {
    await createNew();
    component.setField('name', 'Domicilio');
    component.setField('category_id', 'c1');
    fixture.detectChanges();

    const savePromise = component.save();

    // Spec 043: una sola petición trae el producto y la presentación "Único" por
    // defecto (con su receta/grupos vacíos) — ya no hace falta ningún paso aparte.
    const created = http.expectOne(PRODUCTS);
    expect(created.request.method).toBe('POST');
    expect(created.request.body.tracks_inventory).toBe(false);
    expect(created.request.body.variants).toEqual([
      { name: 'Único', price: 0, recipe: [], option_groups: [] },
    ]);
    created.flush({
      id: 'p1',
      category_id: 'c1',
      name: 'Domicilio',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: false,
      created_at: '2026-08-19T00:00:00',
      variants: [],
    });

    await savePromise;
    expect(component.service.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/products']);
  });

  // ── Bug 4 — "Copiar insumos" solo con inventario activo (FR-021 a FR-024) ─

  /** Arranca en modo edición para `id`, con dos presentaciones ya guardadas
   *  (una con un insumo) y `tracks_inventory` según `tracksInventory`. */
  async function createEdit(id: string, tracksInventory: boolean): Promise<void> {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit
    await tick();

    http.expectOne(`${PRODUCTS}/${id}`).flush({
      id,
      category_id: 'c1',
      name: 'Cono doble',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: tracksInventory,
      created_at: '2026-08-19T00:00:00',
    });
    await tick();

    http.expectOne(`${PRODUCTS}/${id}/variants`).flush([
      { id: 'v1', product_id: id, name: 'Grande', sku: null, price: '8000', active: true },
      { id: 'v2', product_id: id, name: 'Pequeña', sku: null, price: '5000', active: true },
    ]);
    await tick();

    // v1 ya tiene un insumo guardado; v2 no.
    http.expectOne(`${VARIANTS}/v1/recipe`).flush([
      { inventory_item_id: 'i1', quantity: '1', unit_measure_id: 'u1' },
    ]);
    http.expectOne(`${VARIANTS}/v1/option-groups`).flush([]);
    await tick();
    http.expectOne(`${VARIANTS}/v2/recipe`).flush([]);
    http.expectOne(`${VARIANTS}/v2/option-groups`).flush([]);
    await tick();
    fixture.detectChanges();
  }

  /** El botón "Copiar insumos..." de la presentación activa, o `null` si no está. */
  const copyButton = (): HTMLButtonElement | null =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.includes('Copiar insumos'),
    ) ?? null;

  // Spec 064 cambia deliberadamente el criterio de visibilidad de este botón: antes
  // (spec 027) exigía `tracks_inventory=true` porque copiaba "insumos y sabores" y
  // ambos vivían detrás del mismo switch. Ahora "Sabores a elegir" (selector de grupo,
  // min/max) ya no depende del switch (FR-006) -- el botón sigue teniendo sentido sin
  // inventario (copiar a qué grupos ofrece cada tamaño), así que su condición pasa a
  // ser solo `hasSizes && variants.length > 1`, sin importar `tracks_inventory`.

  it('el botón "Copiar insumos..." aparece con hasSizes && variants.length > 1, aunque tracks_inventory esté apagado', async () => {
    await createNew();
    component.toggleHasSizes(); // hasSizes=true, 3 variantes — switch de inventario sigue apagado
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(component.draft().hasSizes && component.draft().variants.length > 1).toBe(true);
    expect(copyButton()).not.toBeNull();
  });

  it('el botón "Copiar insumos..." también aparece con tracks_inventory=true, en las mismas condiciones', async () => {
    await createNew();
    component.toggleHasSizes();
    await component.toggleTracksInventory();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(copyButton()).not.toBeNull();
    expect(copyButton()!.textContent).toContain('Copiar insumos');
  });

  it('el botón no depende de toggleTracksInventory(): permanece visible al encender y apagar', async () => {
    await createNew();
    component.toggleHasSizes();
    fixture.detectChanges();
    expect(copyButton()).not.toBeNull();

    await component.toggleTracksInventory(); // enciende
    fixture.detectChanges();
    expect(copyButton()).not.toBeNull();

    await component.toggleTracksInventory(); // apaga (sin insumos configurados: no pide confirmación)
    fixture.detectChanges();
    expect(copyButton()).not.toBeNull();
  });

  it('en edición, el botón aparece igual con tracks_inventory=false o =true', async () => {
    await createEdit('p9', false);
    expect(component.draft().hasSizes).toBe(true); // 2 variantes ya guardadas
    expect(copyButton()).not.toBeNull();
  });

  it('en edición, con tracks_inventory=true el botón aparece igual que en creación', async () => {
    await createEdit('p9', true);

    expect(component.draft().hasSizes).toBe(true);
    expect(copyButton()).not.toBeNull();
  });

  // ── Orden de presentaciones por arrastre (spec 042) ──────────────────────

  const drop = (previousIndex: number, currentIndex: number) =>
    ({ previousIndex, currentIndex }) as CdkDragDrop<VariantDraft[]>;

  it('arrastrar reordena draft().variants de inmediato, sin ninguna llamada al backend', async () => {
    await createEdit('p9', true); // v1 Grande, v2 Pequeña (ese orden)

    expect(component.draft().variants.map((v) => v.name)).toEqual(['Grande', 'Pequeña']);

    component.onVariantDrop(drop(0, 1));
    fixture.detectChanges();

    expect(component.draft().variants.map((v) => v.name)).toEqual(['Pequeña', 'Grande']);
    // Puramente local: ninguna petición pendiente por el solo hecho de arrastrar.
    http.expectNone((r) => r.url.endsWith('/variants/reorder'));
  });

  it('soltar en la misma posición no cambia nada', async () => {
    await createEdit('p9', true);
    const before = component.draft().variants.map((v) => v.name);

    component.onVariantDrop(drop(1, 1));
    fixture.detectChanges();

    expect(component.draft().variants.map((v) => v.name)).toEqual(before);
  });

  it('guardar tras arrastrar persiste el nuevo orden en una sola llamada atómica', async () => {
    await createEdit('p9', true);
    component.onVariantDrop(drop(0, 1)); // Grande, Pequeña → Pequeña, Grande
    fixture.detectChanges();

    const savePromise = component.save();

    // Spec 043: una sola petición PATCH trae producto + presentaciones en el orden
    // ya arrastrado -- el orden de `variants[]` en el body reemplaza al endpoint de
    // reordenamiento por separado (spec 042).
    const req = http.expectOne(`${PRODUCTS}/p9`);
    expect(req.request.method).toBe('PATCH');
    const ids = (req.request.body.variants as Array<{ id?: string }>).map((v) => v.id);
    expect(ids).toEqual(['v2', 'v1']); // Pequeña (v2) primero tras arrastrar
    req.flush({
      id: 'p9', category_id: 'c1', name: 'Cono doble', description: null,
      preparation_type: 'prepared', image_url: null, active: true, available: true,
      tracks_inventory: true, created_at: '2026-08-19T00:00:00', variants: [],
    });

    await savePromise;
    expect(component.service.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/products']);
  });

  // ── Guardado unificado de producto (spec 043) ────────────────────────────

  it('restaurar una presentación desactivada solo la trae al draft, sin ninguna llamada de escritura', async () => {
    await createEdit('p9', true);
    component.draft.update((d) => ({
      ...d,
      deactivated: [{ id: 'v3', name: 'Mediana', price: 4000 }],
    }));

    const restorePromise = component.restoreVariant({ id: 'v3', name: 'Mediana', price: 4000 });

    // Solo lectura (sin cambios, spec 043 no toca los GET) -- research.md Decisión 4:
    // ya no hay ningún PATCH /variants/v3 disparado por el solo hecho de restaurar.
    http.expectOne(`${VARIANTS}/v3/recipe`).flush([]);
    http.expectOne(`${VARIANTS}/v3/option-groups`).flush([]);
    http.expectNone(`${VARIANTS}/v3`);

    await restorePromise;

    expect(component.draft().variants.map((v) => v.name)).toContain('Mediana');
    expect(component.draft().deactivated).toEqual([]);
  });

  // ── Gating por plan del switch de inventario (spec 064, US5) ─────────────

  it('sin el módulo Inventario en el plan, el switch aparece deshabilitado', async () => {
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    await createNew();

    expect(switchButton().disabled).toBe(true);
  });

  it('sin el módulo Inventario, hacer click en el switch deshabilitado no cambia nada', async () => {
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    await createNew();

    switchButton().click(); // no-op: el navegador nunca dispara (click) sobre [disabled]
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(false);
  });

  it('un producto existente con tracks_inventory=true conserva ese valor visible aunque el switch esté deshabilitado sin el módulo', async () => {
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    await createEdit('p9', true);

    expect(component.draft().tracks_inventory).toBe(true);
    expect(switchButton().getAttribute('aria-checked')).toBe('true');
    expect(switchButton().disabled).toBe(true);
    // sectionsEnabled() combina el switch con el plan: sin módulo, ni "Insumos fijos" ni
    // la parte de inventario de "Sabores a elegir" se muestran, aunque el switch siga en
    // `true` (dato preservado, FR-013) -- research.md Decisión 5.
    expect(text()).not.toContain('Insumos fijos');
  });

  it('con el módulo Inventario incluido, el switch funciona con normalidad (sin regresión)', async () => {
    planSummary.set(makeSummary({ modules: { inventario: true, compras: true, promociones: true } }));
    await createNew();

    expect(switchButton().disabled).toBe(false);
    switchButton().click();
    fixture.detectChanges();
    expect(component.draft().tracks_inventory).toBe(true);
  });
});
