import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { TableSessionsComponent } from './table-sessions.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder } from '../interfaces/dining.interface';

/** Spec 029, Historia 2: el atajo F4 (descuento manual) se retiró por
 *  completo — presionarlo ya no dispara ninguna acción. No se llama
 *  `fixture.detectChanges()` a propósito: evita `ngOnInit()`/`store.init()`
 *  (que dispara varias peticiones HTTP no relacionadas con este atajo) — se
 *  ejercita `onKey()` directamente sobre la instancia del componente. */
describe('TableSessionsComponent — atajo F4 retirado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
  });

  it('F4 no produce ningún efecto observable', () => {
    const event = new KeyboardEvent('keydown', { key: 'F4', cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    expect(() => fixture.componentInstance.onKey(event)).not.toThrow();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

/** Spec 029, Historia 4 (FR-001): el diálogo de éxito ya no imprime el caso
 *  de un solo comprobante — duplicaba "Imprimir Factura" de la barra
 *  lateral. El caso de cuenta dividida (varios comprobantes) sí se
 *  conserva. `store.init()` se anula (`vi.spyOn`) para poder llamar
 *  `fixture.detectChanges()` y renderizar el diálogo sin disparar las
 *  peticiones HTTP de `ngOnInit`, ajenas a lo que prueba este bloque.
 *
 *  `TableSessionsComponent` declara `providers: [PosTerminalStore]` en su
 *  propio `@Component` (instancia aislada por componente, no la del
 *  `TestBed`) — hay que tomar el store desde `fixture.componentInstance`,
 *  no desde `TestBed.inject`, o el mock de `init()` queda sobre una
 *  instancia distinta a la que usa el componente. */
describe('TableSessionsComponent — diálogo de éxito sin botón duplicado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const printButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).filter((b) =>
      (b as HTMLButtonElement).textContent?.includes('🧾'),
    ) as HTMLButtonElement[];

  it('un solo comprobante: no ofrece ningún botón de impresión en el diálogo', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 10000, customer: 'Consumidor Final' });
    store.lastReceipts.set([{ saleId: 's1', customerName: null, total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number]]);
    fixture.detectChanges();

    expect(printButtons()).toHaveLength(0);
  });

  it('cuenta dividida: conserva "Imprimir todos" y el botón por comensal', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 20000, customer: 'Mostrador' });
    store.lastReceipts.set([
      { saleId: 's1', customerName: 'Ana', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
      { saleId: 's2', customerName: 'Beto', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
    ]);
    fixture.detectChanges();

    const textos = printButtons().map((b) => b.textContent?.trim());
    expect(textos).toContain('🧾 Imprimir todos');
    expect(textos.filter((t) => t === '🧾 Imprimir')).toHaveLength(2);
  });
});

/**
 * Ajuste posterior a spec 036: F3 ("+ Crear Orden Manual") ya no llama a
 * `store.startManualOrder()` (que abría el catálogo embebido) — navega a la
 * vista dedicada `manual-order-page.component.ts`. No se llama
 * `fixture.detectChanges()` a propósito (mismo motivo que el bloque F4 de
 * arriba): evita `ngOnInit()`/`store.init()`.
 */
describe('TableSessionsComponent — atajo F3 navega a la vista de armado de pedido (ajuste posterior)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    router = TestBed.inject(Router);
  });

  it('con una mesa seleccionada, F3 navega a la vista dedicada', () => {
    fixture.componentInstance.store.selectedTableId.set('t1');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const event = new KeyboardEvent('keydown', { key: 'F3', cancelable: true });
    fixture.componentInstance.onKey(event);

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it('sin mesa seleccionada, F3 no navega', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const event = new KeyboardEvent('keydown', { key: 'F3', cancelable: true });
    fixture.componentInstance.onKey(event);

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

/**
 * Spec 048: cuando la mesa tiene a la vez un pago pendiente de confirmar y
 * un pedido pagado/activo, el encabezado del panel central ofrece dos
 * pestañas para alternar entre ambos, en vez de mostrar solo el pago
 * pendiente (que dejaba el pedido pagado inalcanzable).
 */
describe('TableSessionsComponent — pestañas cuando coexisten pago pendiente y pedido pagado (spec 048)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const tabButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).filter((b) =>
      ['🔔 Pagos por confirmar', 'Pedido de la mesa'].includes(
        (b as HTMLButtonElement).textContent?.trim() ?? '',
      ),
    ) as HTMLButtonElement[];

  const pagadaOrder: DiningOrder = {
    id: 'o1',
    channel: 'POS',
    status: 'pagada',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-28T10:00:00',
    paid: true,
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'listo' }],
  } as DiningOrder;

  const pendienteOrder: DiningOrder = {
    id: 'o2',
    channel: 'QR_MENU',
    status: 'recibida',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-28T10:05:00',
    items: [],
  } as DiningOrder;

  it('con ambos tipos de pedido en la mesa, aparecen las dos pestañas y se puede alternar entre ambos bloques', () => {
    store.orders.set([pagadaOrder, pendienteOrder]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const botones = tabButtons();
    expect(botones.map((b) => b.textContent?.trim())).toEqual([
      '🔔 Pagos por confirmar',
      'Pedido de la mesa',
    ]);
    expect(fixture.nativeElement.querySelector('app-payment-validation-block')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeFalsy();

    botones.find((b) => b.textContent?.includes('Pedido de la mesa'))!.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-payment-validation-block')).toBeFalsy();

    tabButtons()
      .find((b) => b.textContent?.includes('Pagos por confirmar'))!
      .click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-payment-validation-block')).toBeTruthy();
  });

  it('con solo un pago pendiente (sin pedido pagado), no aparecen pestañas', () => {
    store.orders.set([pendienteOrder]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(tabButtons()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('app-payment-validation-block')).toBeTruthy();
  });

  it('con solo un pedido pagado (sin nada pendiente), no aparecen pestañas', () => {
    store.orders.set([pagadaOrder]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(tabButtons()).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeTruthy();
  });
});

/**
 * Rediseño responsive: en escritorio (breakpoint lg y superior) la grilla de
 * mesas y el panel de detalle conviven siempre lado a lado, igual que antes.
 * Por debajo de lg, jsdom no evalúa media queries -- se afirma sobre las
 * clases `hidden`/`flex` que decide `store.hasActiveSelection()`, que es lo
 * que realmente controla cuál de las dos columnas se ve en cada tamaño.
 */
describe('TableSessionsComponent — colapso móvil de la grilla de mesas y el panel de detalle', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const mesasColumn = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="mesas-column"]');
  const detailColumn = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="detail-column"]');
  // La utilidad `hidden` se busca como clase propia, no como subcadena --
  // ambas tarjetas también llevan `overflow-hidden` (mockup: esquinas
  // redondeadas recortan el contenido), que contiene la subcadena "hidden"
  // pero no es la clase de visibilidad que decide store.hasActiveSelection().
  const hasHiddenClass = (el: HTMLElement): boolean => el.classList.contains('hidden');

  it('sin selección: la columna de mesas queda visible por debajo de lg y la de detalle oculta', () => {
    fixture.detectChanges();

    expect(hasHiddenClass(mesasColumn())).toBe(false);
    expect(hasHiddenClass(detailColumn())).toBe(true);
  });

  it('con una mesa seleccionada: la columna de mesas se oculta por debajo de lg y la de detalle queda visible', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(hasHiddenClass(mesasColumn())).toBe(true);
    expect(hasHiddenClass(detailColumn())).toBe(false);
  });

  it('el botón de volver de página llama a store.cancelSelection(), único para los 3 estados del panel central', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    const cancelSpy = vi.spyOn(store, 'cancelSelection');

    const backButton = fixture.nativeElement.querySelector(
      '[data-testid="page-back-button"]',
    ) as HTMLButtonElement;
    expect(backButton).not.toBeNull();
    backButton.click();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('sin selección, el botón de volver de página no se muestra', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="page-back-button"]')).toBeNull();
  });
});

/**
 * Bugfix reportado sobre el rediseño: al seleccionar una mesa libre (sin
 * ningún pedido), el panel central informativo ("Mesa N está libre...") y el
 * "Pedido de mostrador" + botón del panel de cobro aparecían lado a lado
 * repitiendo el mismo mensaje ("crea un pedido nuevo") dos veces. Ahora ese
 * estado se resuelve en un único panel con un solo CTA.
 */
describe('TableSessionsComponent — mesa libre seleccionada: un único panel, no dos mensajes repetidos', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  it('no renderiza el panel de cobro (app-pos-checkout-panel) para una mesa libre', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(store.centralState()).toBe('mesa-libre');
    expect(fixture.nativeElement.querySelector('app-pos-checkout-panel')).toBeNull();
  });

  it('muestra un solo botón "+ Crear pedido nuevo", no el heading duplicado "Pedido de mostrador"', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Pedido de mostrador');
    const ctaButtons = Array.from(fixture.nativeElement.querySelectorAll('button')).filter((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    );
    expect(ctaButtons).toHaveLength(1);
  });

  it('el CTA único navega a la vista de armado de pedido para esa mesa', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement;
    cta.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });
});
