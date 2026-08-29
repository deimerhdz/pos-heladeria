import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { ManualOrderPageComponent } from './manual-order-page.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';
import { MenuService } from '../../../core/services/menu.service';
import { MenuCategory, MenuProduct } from '../../products/interfaces/product.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { DiningOrder } from '../interfaces/dining.interface';

const API = environment.apiBaseUrl;

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'libre', ...partial };
}

/** Producto de catálogo mínimo para spec 051 (imagen en tarjeta/detalle). */
function menuProduct(partial: Partial<MenuProduct>): MenuProduct {
  return {
    id: 'p1',
    name: 'Producto Test',
    description: null,
    image_url: null,
    variants: [{ id: 'v1', name: 'Único', price: 4000 } as MenuProduct['variants'][number]],
    option_groups: [],
    available: true,
    ...partial,
  };
}

function menuCategory(products: MenuProduct[]): MenuCategory {
  return { id: 'c1', name: 'Categoría Test', products };
}

/** Vista dedicada de armado de pedido nuevo (ajuste posterior a spec 036).
 *  `store.init()` se anula (`vi.spyOn`) para no disparar las peticiones
 *  HTTP de `ngOnInit` ajenas a lo que prueba este spec — mismo patrón que
 *  `table-sessions.component.spec.ts`. `PosTerminalStore` es component-level
 *  (`providers` propio), así que se toma desde `fixture.componentInstance`,
 *  no desde `TestBed.inject`. */
describe('ManualOrderPageComponent', () => {
  let fixture: ComponentFixture<ManualOrderPageComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let router: Router;
  let http: HttpTestingController;

  function createComponent(tableId: string | null): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(tableId ? { tableId } : {}) } },
        },
      ],
    });

    fixture = TestBed.createComponent(ManualOrderPageComponent);
    store = fixture.componentInstance.store;
    tableService = TestBed.inject(TableService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  }

  afterEach(() => http.verify());

  /** Helpers para el select buscable de mesas (spec 053). */
  function abrirSelectorMesas(): void {
    const boton = fixture.nativeElement.querySelector('app-searchable-select button') as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();
  }

  function opcionesMesas(): HTMLLIElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('app-searchable-select li')) as HTMLLIElement[];
  }

  /** Helpers para el campo "Cliente" (spec 054). */
  function clienteHeading(): HTMLElement {
    return Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Cliente',
    ) as HTMLElement;
  }

  function campoCliente(): HTMLInputElement {
    return clienteHeading().nextElementSibling!.querySelector('input') as HTMLInputElement;
  }

  function botonEditarCliente(): HTMLButtonElement {
    return clienteHeading().nextElementSibling!.querySelector('button') as HTMLButtonElement;
  }

  function editarCliente(texto: string): void {
    botonEditarCliente().click();
    fixture.detectChanges();
    const input = campoCliente();
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function buscarEnSelectorMesas(texto: string): void {
    const input = fixture.nativeElement.querySelector('app-searchable-select input') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('al iniciar, selecciona la mesa del parámetro de ruta', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(store.selectedTableId()).toBe('t1');
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Mesa 3');
  });

  it('solo "En Mesa" está habilitada — "Para Llevar"/"Domicilio" son placeholders deshabilitados', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const paraLlevar = buttons.find((b) => b.textContent?.includes('Para Llevar'));
    const domicilio = buttons.find((b) => b.textContent?.includes('Domicilio'));
    expect(paraLlevar?.disabled).toBe(true);
    expect(domicilio?.disabled).toBe(true);
  });

  it('el listado de mesas tiene un título propio "Mesas", distinguible del encabezado "Tipo de Orden" (US3, FR-004/FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const tipoOrdenHeading = fixture.nativeElement.querySelector('h2') as HTMLElement | null;
    expect(tipoOrdenHeading?.textContent).toContain('Tipo de Orden');

    const mesasHeading = Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Mesas',
    ) as HTMLElement | undefined;
    expect(mesasHeading).toBeTruthy();
    expect(mesasHeading!.tagName).not.toBe(tipoOrdenHeading!.tagName);
  });

  it('la barra superior solo contiene "Volver a la Terminal", sin "Tipo de Orden" (spec 052, US1, FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const backButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Volver a la Terminal'),
    ) as HTMLButtonElement;
    const topBar = backButton.closest('div') as HTMLElement;
    expect(topBar.textContent).not.toContain('Tipo de Orden');
  });

  it('"Tipo de Orden", "Mesas" y "Nueva orden" viven en el mismo panel derecho (spec 052, US1, FR-001/FR-002/FR-006)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const rightPanel = fixture.nativeElement.querySelector('.border-l.bg-white') as HTMLElement | null;
    expect(rightPanel).toBeTruthy();
    expect(rightPanel!.textContent).toContain('Tipo de Orden');
    expect(rightPanel!.textContent).toContain('Mesas');
    expect(rightPanel!.textContent).toContain('Nueva orden');
    expect(rightPanel!.textContent).toContain('Confirmar y Enviar');
    expect(rightPanel!.textContent).not.toContain('Volver a la Terminal');
  });

  it('el panel derecho es más ancho que antes (spec 052, US2, FR-007)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const rightPanel = fixture.nativeElement.querySelector('.border-l.bg-white') as HTMLElement;
    expect(rightPanel.classList.contains('sm:w-[400px]')).toBe(true);
    expect(rightPanel.classList.contains('sm:w-[320px]')).toBe(false);
  });

  it('la tarjeta de catálogo muestra la imagen del producto cuando tiene image_url (US1, FR-001)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      menuCategory([menuProduct({ id: 'p1', name: 'Fresa Salvaje', image_url: 'https://cdn.test/fresa.jpg' })]),
    ]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img[alt="Fresa Salvaje"]') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('fresa.jpg');
  });

  it('la tarjeta de catálogo muestra un ícono de respaldo cuando el producto no tiene image_url (US1, FR-002)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([menuCategory([menuProduct({ id: 'p1', name: 'Sin Foto', image_url: null })])]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-icon[name="image-off"]')).toBeTruthy();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Sin Foto');
  });

  it('al seleccionar un producto con imagen desde el catálogo, el detalle también la muestra (US2, FR-003)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      menuCategory([menuProduct({ id: 'p1', name: 'Fresa Salvaje', image_url: 'https://cdn.test/fresa.jpg' })]),
    ]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const card = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Fresa Salvaje'),
    ) as HTMLButtonElement;
    card.click();
    fixture.detectChanges();

    const modalImg = fixture.nativeElement.querySelector('app-product-select img') as HTMLImageElement | null;
    expect(modalImg).toBeTruthy();
    expect(modalImg!.src).toContain('fresa.jpg');
  });

  it('al seleccionar un producto sin imagen desde el catálogo, el detalle se abre sin imagen rota (US2)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([menuCategory([menuProduct({ id: 'p1', name: 'Sin Foto', image_url: null })])]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const card = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Sin Foto'),
    ) as HTMLButtonElement;
    card.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-product-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-product-select img')).toBeNull();
  });

  it('el selector de mesas permite buscar y cambiar a otra mesa libre, pero no a una ocupada (spec 053, US1, FR-002/FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't2', number: 2, status: 'libre' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    store.orders.set([
      {
        id: 'o1',
        channel: 'waiter',
        status: 'abierta',
        dining_table_id: 't3',
        created_at: '2026-08-21T10:00:00',
        items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente' }],
      } as unknown as ReturnType<PosTerminalStore['orders']>[number],
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    buscarEnSelectorMesas('2');
    const opcionM2 = opcionesMesas().find((li) => li.textContent?.includes('Mesa 2'));
    opcionM2!.click();
    fixture.detectChanges();
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedTableId()).toBe('t2');

    abrirSelectorMesas();
    const opcionM3 = opcionesMesas().find((li) => li.textContent?.includes('Mesa 3'));
    opcionM3!.click();
    fixture.detectChanges();
    expect(store.selectedTableId()).toBe('t2');
  });

  it('el listado de mesas ya no es una rejilla de botones, sino un select buscable (spec 053, US1, FR-001)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.grid-cols-4')).toBeNull();
  });

  it('el listado del select muestra el nombre y el estado de cada mesa (spec 053, US2, FR-003)', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    const opciones = opcionesMesas();
    const libre = opciones.find((li) => li.textContent?.includes('Mesa 1'));
    const ocupada = opciones.find((li) => li.textContent?.includes('Mesa 3'));
    expect(libre?.textContent).toContain('Libre');
    expect(ocupada?.textContent).toContain('Ocupada');
  });

  it('cuando la mesa tiene un nombre personalizado, el número sigue apareciendo en el listado (corrección posterior a spec 053)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 1, name: 'Terraza', status: 'libre' })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    const opcion = opcionesMesas().find((li) => li.textContent?.includes('Terraza'));
    expect(opcion?.textContent).toContain('Mesa 1');
    expect(opcion?.textContent).toContain('Terraza');
    expect(opcion?.textContent).toContain('Libre');
  });

  it('hacer clic sobre una mesa ocupada no la selecciona ni cierra el listado (spec 053, US2, FR-004)', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    const ocupada = opcionesMesas().find((li) => li.textContent?.includes('Mesa 3'));
    ocupada!.click();
    fixture.detectChanges();

    expect(store.selectedTableId()).toBe('t1');
    expect(fixture.nativeElement.querySelector('app-searchable-select ul')).toBeTruthy();
  });

  it('agregar un producto al draft se refleja en el resumen, con Impuesto siempre en $0 (FR-011)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Granizado Fresa Salvaje' } as never,
      variant: { id: 'v1', price: 4500 } as never,
      options: [],
      quantity: 2,
      notes: null,
    });
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Granizado Fresa Salvaje');
    expect(texto).toContain('Impuesto');
    expect(store.totals().tax).toBe(0);
  });

  it('"Confirmar y Enviar" está deshabilitado con el carrito vacío', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });

  it('"Confirmar y Enviar" crea el pedido y navega de vuelta a la Terminal de Mesas', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(true);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
  });

  it('si la creación falla, no navega', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('"← Volver a la Terminal" navega de vuelta sin crear ningún pedido', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const backButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Volver a la Terminal'),
    ) as HTMLButtonElement;
    backButton.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('el campo Cliente muestra "Consumidor final" por defecto, en solo lectura (spec 054, US1, FR-001/FR-002)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const input = campoCliente();
    expect(input.value).toBe('Consumidor final');
    expect(input.readOnly).toBe(true);
  });

  it('el botón de edición vuelve editable el campo Cliente (spec 054, US2, FR-003)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    botonEditarCliente().click();
    fixture.detectChanges();

    expect(campoCliente().readOnly).toBe(false);
  });

  it('editar y perder el foco actualiza el nombre del cliente y cierra la edición (spec 054, US2, FR-004)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    editarCliente('María Pérez');
    campoCliente().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(campoCliente().value).toBe('María Pérez');
    expect(campoCliente().readOnly).toBe(true);
  });

  it('si se deja vacío al perder el foco, el campo Cliente vuelve a "Consumidor final" (spec 054, US2, FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    editarCliente('');
    campoCliente().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(campoCliente().value).toBe('Consumidor final');
    expect(campoCliente().readOnly).toBe(true);
  });

  it('al confirmar sin editar, se envía "Consumidor final" como customer_name (spec 054, US3, FR-006)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const diningSessionService = TestBed.inject(DiningSessionService);
    const createSpy = vi
      .spyOn(diningSessionService, 'createManualOrder')
      .mockResolvedValue({ id: 'o9' } as DiningOrder);
    vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'Consumidor final' }));
  });

  it('al confirmar tras editar, se envía el nombre editado como customer_name (spec 054, US3, FR-006)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    editarCliente('María Pérez');
    campoCliente().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    const diningSessionService = TestBed.inject(DiningSessionService);
    const createSpy = vi
      .spyOn(diningSessionService, 'createManualOrder')
      .mockResolvedValue({ id: 'o9' } as DiningOrder);
    vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'María Pérez' }));
  });

  it('confirmar con el campo Cliente vacío en modo edición (sin perder el foco) igual envía "Consumidor final" (spec 054, US3, FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    editarCliente('');
    // Sin blur: el mesero confirma mientras el campo sigue en modo edición y vacío.

    const diningSessionService = TestBed.inject(DiningSessionService);
    const createSpy = vi
      .spyOn(diningSessionService, 'createManualOrder')
      .mockResolvedValue({ id: 'o9' } as DiningOrder);
    vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'Consumidor final' }));
  });
});
