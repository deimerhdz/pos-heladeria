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
import { CheckoutPreview, DiningOrder } from '../interfaces/dining.interface';
import { ConfirmService } from '../../../shared/feedback/confirm.service';

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
    // spec 073: el effect del componente pide `POST /orders/draft-preview` en
    // cada cambio del borrador. Por defecto se simula un fallo — la pantalla
    // cae a `store.totals()` (subtotal local, sin descuento — FR-015), que es
    // exactamente lo que estos tests preexistentes esperan ver. Los tests
    // propios de US5 (más abajo) usan el endpoint real.
    vi.spyOn(TestBed.inject(DiningSessionService), 'draftPreview').mockRejectedValue(
      new Error('draft-preview no mockeado en este test'),
    );
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

  // ── spec 055: "Para Llevar" habilitada, "Domicilio" sigue deshabilitada ───

  function botonTipoOrden(texto: string): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes(texto),
    ) as HTMLButtonElement;
  }

  function botonConfirmar(): HTMLButtonElement {
    return botonTipoOrden('Confirmar y Enviar');
  }

  it('"Para Llevar" y "Domicilio" ya no son placeholders deshabilitados (spec 055 FR-008, spec 056 FR-001)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(botonTipoOrden('Para Llevar').disabled).toBe(false);
    expect(botonTipoOrden('Domicilio').disabled).toBe(false);
  });

  it('al seleccionar "Para Llevar", el bloque "Mesas" desaparece (FR-009)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    botonTipoOrden('Para Llevar').click();
    fixture.detectChanges();

    expect(clienteHeading()).toBeTruthy();
    const mesasHeading = Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Mesas',
    );
    expect(mesasHeading).toBeUndefined();
    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeNull();
  });

  it('con "Para Llevar" y el carrito no vacío, "Confirmar y Enviar" se habilita sin ninguna mesa seleccionada (FR-009)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    botonTipoOrden('Para Llevar').click();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(store.selectedTableId()).toBeNull();
    expect(botonConfirmar().disabled).toBe(false);
  });

  it('con "En Mesa" y ninguna mesa seleccionada, "Confirmar y Enviar" sigue deshabilitado aunque haya productos (FR-009, no regresión)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
    expect(botonConfirmar().disabled).toBe(true);
  });

  it('al seleccionar "Para Llevar", el campo Cliente muestra "Consumidor final" por defecto (FR-010)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    botonTipoOrden('Para Llevar').click();
    fixture.detectChanges();

    expect(campoCliente().value).toBe('Consumidor final');
    expect(campoCliente().readOnly).toBe(true);
  });

  // ── spec 056: "Domicilio" habilitada con sus propios campos ──────────────

  /** Los campos de "Domicilio" (a diferencia de "Cliente" en Mesa/Para
   *  Llevar) no están envueltos en un `<div class="relative">`: el input es
   *  el `nextElementSibling` directo del `<h3>` de su etiqueta. */
  function campoDomicilio(etiqueta: string): HTMLInputElement {
    const heading = Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === etiqueta,
    ) as HTMLElement;
    return heading.nextElementSibling as HTMLInputElement;
  }

  function seleccionarDomicilio(): void {
    botonTipoOrden('Domicilio').click();
    fixture.detectChanges();
  }

  it('al seleccionar "Domicilio", el bloque "Mesas" desaparece y no exige mesa (FR-002)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    seleccionarDomicilio();

    const mesasHeading = Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Mesas',
    );
    expect(mesasHeading).toBeUndefined();
    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeNull();
  });

  it('al seleccionar "Domicilio", muestra Cliente/Dirección/Teléfono/Valor del domicilio vacíos, sin readOnly (FR-003, FR-004, FR-005, FR-006)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();

    expect(campoDomicilio('Cliente').value).toBe('');
    expect(campoDomicilio('Cliente').readOnly).toBe(false);
    expect(campoDomicilio('Dirección').value).toBe('');
    expect(campoDomicilio('Teléfono').value).toBe('');
    expect(campoDomicilio('Valor del domicilio').value).toBe('');
  });

  it('con "Domicilio", "Confirmar y Enviar" está deshabilitado si falta Cliente, Dirección, o el valor del domicilio (FR-007)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    // Sin nada diligenciado: deshabilitado.
    expect(botonConfirmar().disabled).toBe(true);

    store.customerName.set('Ana Torres');
    fixture.detectChanges();
    expect(botonConfirmar().disabled).toBe(true); // falta dirección y valor

    store.deliveryAddress.set('Cra 45 #12-30');
    fixture.detectChanges();
    expect(botonConfirmar().disabled).toBe(true); // falta valor del domicilio

    store.deliveryFee.set(6000);
    fixture.detectChanges();
    expect(botonConfirmar().disabled).toBe(false); // teléfono nunca es obligatorio (FR-008)
  });

  it('con "Domicilio" y los tres campos obligatorios diligenciados, el valor del domicilio se refleja en el total (FR-009)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    store.customerName.set('Ana Torres');
    store.deliveryAddress.set('Cra 45 #12-30');
    store.deliveryFee.set(6000);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Domicilio');
    expect(store.totals().total).toBe(11000);
  });

  it('"Domicilio" crea el pedido con order_type DELIVERY y los datos de entrega (FR-010)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    store.customerName.set('Ana Torres');
    store.deliveryAddress.set('Cra 45 #12-30');
    store.deliveryFee.set(6000);
    fixture.detectChanges();

    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    botonConfirmar().click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalled();
    // El "Cliente" de Domicilio no debe quedar sobrescrito por el default de
    // "Consumidor final" (research.md Decisión 8, applyDefaultCustomerName).
    expect(store.customerName()).toBe('Ana Torres');
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
        channel: 'POS',
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

/**
 * spec 073, US5 (FR-013 a FR-015a): la pantalla de armado muestra el total con
 * descuento del borrador (backend), recalculado en cada cambio; si al confirmar
 * el total cambió, pide una segunda confirmación.
 */
describe('ManualOrderPageComponent — desglose del borrador (spec 073, US5)', () => {
  let fixture: ComponentFixture<ManualOrderPageComponent>;
  let store: PosTerminalStore;
  let api: DiningSessionService;
  let router: Router;

  function preview(subtotal: string, discount: string, total: string, deliveryFee = '0'): CheckoutPreview {
    return { subtotal, discount, delivery_fee: deliveryFee, total, promotion_evaluated_at: '2026-09-02T19:59:00Z' };
  }

  function setup(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
      ],
    });
    fixture = TestBed.createComponent(ManualOrderPageComponent);
    store = fixture.componentInstance.store;
    api = TestBed.inject(DiningSessionService);
    router = TestBed.inject(Router);
    TestBed.inject(HttpTestingController); // se drena implícitamente (mock de draftPreview)
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  }

  function addCono(qty: number): void {
    for (let i = 0; i < qty; i++) {
      store.addDraftFromSelection({
        product: { id: 'p1', name: 'Cono' } as never,
        variant: { id: 'v1', price: 8000 } as never,
        options: [],
        quantity: 1,
        notes: null,
      });
    }
    fixture.detectChanges();
  }

  const summaryText = (): string => fixture.nativeElement.textContent as string;

  it('Scenario 1: 1 cono → Total $8.000 sin fila de descuento', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('8000', '0', '8000'));
    fixture.detectChanges();

    addCono(1);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    expect(summaryText()).toContain('8.000');
    expect(summaryText()).not.toContain('Descuento');
  });

  it('Scenario 2: 2 conos → Subtotal 16.000 / Descuento −8.000 / Total 8.000', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('16000', '8000', '8000'));
    fixture.detectChanges();

    addCono(2);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    const t = summaryText();
    expect(t).toContain('Descuento');
    expect(t).toContain('16.000');
    expect(t).toContain('8.000');
  });

  it('Scenario 4 (FR-015): si el draft-preview falla, muestra el subtotal sin descuento + aviso y NO deshabilita "Confirmar y Enviar"', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockRejectedValue(new Error('sin conexión'));
    vi.spyOn(store, 'setOrderTypeTab').mockImplementation((t) => store.orderTypeTab.set(t));
    store.setOrderTypeTab('para-llevar'); // no exige mesa
    fixture.detectChanges();

    addCono(2);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    expect(summaryText()).toContain('El descuento se confirma al cobrar');
    // subtotal local (2 x 8000), sin descuento aplicado
    expect(summaryText()).toContain('16.000');

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
  });

  it('Scenario 5 (FR-015a): si el total cambió al confirmar, pide una segunda confirmación antes de crear el pedido', async () => {
    setup();
    const draftSpy = vi.spyOn(api, 'draftPreview')
      .mockResolvedValueOnce(preview('16000', '8000', '8000'))  // al armar el borrador
      .mockResolvedValue(preview('16000', '0', '16000'));       // al confirmar: venció la franja
    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(store, 'setOrderTypeTab').mockImplementation((t) => store.orderTypeTab.set(t));
    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    addCono(2);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(store.draftPreview()?.total).toBe('8000');

    const confirmSvc = TestBed.inject(ConfirmService);
    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar y Enviar'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await new Promise((r) => setTimeout(r));

    expect(confirmSvc.state()).not.toBeNull();
    expect(confirmSvc.state()!.title).toContain('El total cambió');
    confirmSvc.respond(false);
    await new Promise((r) => setTimeout(r));

    expect(createSpy).not.toHaveBeenCalled();
    expect(draftSpy).toHaveBeenCalled();
  });
});
