import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosTablesPanelComponent } from './pos-tables-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';

function table(partial: Partial<Table>): Table {
  return {
    id: 't1',
    number: 1,
    name: null,
    qr_token: 'tok',
    active: true,
    status: 'libre',
    ...partial,
  };
}

/** Spec 036, Historia 1: pestañas de tipo de orden + filtro de ocupación ya
 *  existente sin cambios de comportamiento. */
describe('PosTablesPanelComponent', () => {
  let fixture: ComponentFixture<PosTablesPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosTablesPanelComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: PromotionService,
          useValue: {
            loadActive: () => {},
            activePromotions: () => [],
            ready: () => false,
            now: () => new Date(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(PosTablesPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const tabButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === label,
    ) as HTMLButtonElement | undefined;

  it('muestra las 3 pestañas de tipo de orden', () => {
    fixture.detectChanges();

    expect(tabButton('Mesas')).toBeDefined();
    expect(tabButton('Domicilios')).toBeDefined();
    expect(tabButton('Para llevar')).toBeDefined();
  });

  it('"Mesas" está activa por defecto y muestra la grilla de mesas ya existente', () => {
    tableService.tables.set([table({ id: 't1', number: 5 })]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mesa 5');
    expect(fixture.nativeElement.querySelector('input[placeholder*="Buscar mesa"]')).not.toBeNull();
  });

  it('"Domicilios" muestra un listado vacío con mensaje claro, no la grilla de mesas', () => {
    tableService.tables.set([table({ id: 't1', number: 5 })]);
    fixture.detectChanges();

    tabButton('Domicilios')!.click();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Mesa 5');
    expect(text.toLowerCase()).toContain('domicilio');
    expect(store.orderTypeTab()).toBe('domicilios');
  });

  it('"Para llevar" muestra un listado vacío con mensaje claro, no la grilla de mesas', () => {
    tableService.tables.set([table({ id: 't1', number: 5 })]);
    fixture.detectChanges();

    tabButton('Para llevar')!.click();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Mesa 5');
    expect(text.toLowerCase()).toContain('para llevar');
    expect(store.orderTypeTab()).toBe('para-llevar');
  });

  it('el filtro de ocupación ya existente sigue funcionando sin cambios en "Mesas"', () => {
    tableService.tables.set([table({ id: 't1', number: 1, status: 'libre' })]);
    fixture.detectChanges();

    expect(tabButton('Libres')).toBeDefined();
    expect(tabButton('Ocupadas')).toBeDefined();
    expect(tabButton('Pendientes')).toBeDefined();
    expect(tabButton('Todas')).toBeDefined();

    tabButton('Ocupadas')!.click();
    fixture.detectChanges();

    expect(store.filter()).toBe('ocupadas');
    // Mesa libre no debe aparecer bajo el filtro "Ocupadas" (comportamiento
    // ya existente, sin tocar).
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Mesa 1');
  });

  it('volver a "Mesas" restaura la grilla y conserva el filtro de ocupación activo', () => {
    tableService.tables.set([table({ id: 't1', number: 1, status: 'libre' })]);
    fixture.detectChanges();

    tabButton('Domicilios')!.click();
    fixture.detectChanges();
    tabButton('Mesas')!.click();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mesa 1');
    expect(store.filter()).toBe('todas');
  });

  it('la grilla de mesas es un carrusel (una sola fila) con flechas de desplazamiento', () => {
    tableService.tables.set([table({ id: 't1', number: 1 }), table({ id: 't2', number: 2 })]);
    fixture.detectChanges();

    const carousel = fixture.nativeElement.querySelector('[class*="overflow-x-auto"]') as HTMLElement;
    expect(carousel).not.toBeNull();
    // jsdom no implementa Element.scrollBy ni hace layout real (clientWidth
    // siempre da 0) — se definen ambos antes de espiar/hacer clic.
    carousel.scrollBy = vi.fn();
    Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 800 });
    const scrollBySpy = vi.spyOn(carousel, 'scrollBy');

    const prevButton = fixture.nativeElement.querySelector(
      'button[aria-label="Ver mesas anteriores"]',
    ) as HTMLButtonElement;
    const nextButton = fixture.nativeElement.querySelector(
      'button[aria-label="Ver más mesas"]',
    ) as HTMLButtonElement;
    expect(prevButton).not.toBeNull();
    expect(nextButton).not.toBeNull();

    nextButton.click();
    expect(scrollBySpy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    const forwardOptions = scrollBySpy.mock.calls[0][0] as ScrollToOptions;
    expect(forwardOptions.left).toBeGreaterThan(0);

    prevButton.click();
    const backwardOptions = scrollBySpy.mock.calls[1][0] as ScrollToOptions;
    expect(backwardOptions.left).toBeLessThan(0);
  });

  const tableCard = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  it('seleccionar una mesa libre solo la selecciona, sin navegar (spec 045: la tarjeta solo muestra el pedido)', () => {
    tableService.tables.set([table({ id: 't1', number: 3, status: 'libre' })]);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const selectSpy = vi.spyOn(store, 'selectTable');

    tableCard('Mesa 3')!.click();

    expect(selectSpy).toHaveBeenCalledWith('t1');
    expect(navigateSpy).not.toHaveBeenCalled();
    // selectTable() dispara la carga de la cuenta de la mesa (comportamiento
    // ya existente, sin cambios) — se resuelve para no dejar la petición abierta.
    http.expectOne(`${environment.apiBaseUrl}/table-sessions`).flush([]);
  });

  it('seleccionar una mesa ocupada sigue llamando a store.selectTable() sin cambios (no navega)', () => {
    tableService.tables.set([table({ id: 't1', number: 3, status: 'ocupada' })]);
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'abierta',
        dining_table_id: 't1',
        created_at: '2026-08-21T10:00:00',
        items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente' }],
      } as unknown as ReturnType<PosTerminalStore['orders']>[number],
    ]);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const selectSpy = vi.spyOn(store, 'selectTable');

    tableCard('Mesa 3')!.click();

    expect(selectSpy).toHaveBeenCalledWith('t1');
    expect(navigateSpy).not.toHaveBeenCalled();
    // selectTable() dispara la carga de la cuenta de la mesa (comportamiento
    // ya existente, sin cambios) — se resuelve para no dejar la petición abierta.
    http.expectOne(`${environment.apiBaseUrl}/table-sessions`).flush([]);
  });
});
