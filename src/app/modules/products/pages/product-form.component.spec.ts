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
import { environment } from '../../../../environments/environment';
import { ProductFormComponent } from './product-form.component';
import { CategoryService } from '../../categories/services/category.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';

const API = environment.apiBaseUrl;
const PRODUCTS = `${API}/products`;
const VARIANTS = `${API}/variants`;

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

  const switchButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[role="switch"][title*="descuenta insumos"]');

  const text = (): string => fixture.nativeElement.textContent as string;

  it('un producto nuevo abre con el switch de inventario apagado por defecto', async () => {
    await createNew();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(switchButton().getAttribute('aria-checked')).toBe('false');
  });

  it('la sección de insumos aparece deshabilitada mientras el switch está apagado', async () => {
    await createNew();

    expect(text()).not.toContain('Insumos fijos');
    expect(text()).not.toContain('Sabores a elegir');
    expect(text()).toContain('Activa "Maneja inventario"');
  });

  it('activar el switch habilita la sección de insumos', async () => {
    await createNew();

    switchButton().click();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(text()).toContain('Insumos fijos');
    expect(text()).toContain('Sabores a elegir');
    expect(text()).not.toContain('Activa "Maneja inventario"');
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

    // El switch sigue apagado (default): el payload de creación lo refleja.
    const created = http.expectOne(PRODUCTS);
    expect(created.request.method).toBe('POST');
    expect(created.request.body.tracks_inventory).toBe(false);
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
    });
    await tick();

    http.expectOne(`${PRODUCTS}/p1/variants`).flush([
      { id: 'v1', product_id: 'p1', name: 'Single', sku: null, price: '0', active: true },
    ]);
    await tick();

    http.expectOne(`${VARIANTS}/v1`).flush({
      id: 'v1', product_id: 'p1', name: 'Único', sku: null, price: '0', active: true,
    });
    await tick();

    const recipe = http.expectOne(`${VARIANTS}/v1/recipe`);
    expect(recipe.request.body).toEqual({ items: [] });
    recipe.flush({});
    await tick();

    const groups = http.expectOne(`${VARIANTS}/v1/option-groups`);
    expect(groups.request.body).toEqual({ groups: [] });
    groups.flush({});

    await savePromise;
    expect(component.service.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/products']);
  });
});
