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

const API = environment.apiBaseUrl;

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'libre', ...partial };
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

  it('el selector de mesas permite cambiar a otra mesa libre, pero no a una ocupada', async () => {
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

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const m2 = buttons.find((b) => b.textContent?.includes('M2'));
    const m3 = buttons.find((b) => b.textContent?.includes('M3'));
    expect(m3?.disabled).toBe(true);
    expect(m2?.disabled).toBe(false);

    m2!.click();
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedTableId()).toBe('t2');
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
});
