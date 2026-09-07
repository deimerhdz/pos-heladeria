import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { TableSessionsComponent } from './table-sessions.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder } from '../interfaces/dining.interface';

/** spec 077 introdujo `AuthService → PushRegistrationService → SwPush` en el
 *  árbol de inyección de esta página; los TestBeds de este archivo no proveían
 *  `SwPush` y quedaron en `NG0201`. Ningún test de aquí ejercita push — basta
 *  con que el token resuelva (spec 078, decisión de implementación: stub local). */
const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };

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
        swPushStub,
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
        swPushStub,
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
        swPushStub,
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
        swPushStub,
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
        swPushStub,
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

  it('con una mesa seleccionada (con pedido en curso): la columna de mesas se oculta por debajo de lg y la de detalle queda visible', () => {
    // t1 sin pedidos caería en el estado "mesa-libre", que ya no muestra la
    // tarjeta de detalle en absoluto (ver el describe de más abajo) -- para
    // probar el colapso genérico hace falta una mesa con contenido real.
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(hasHiddenClass(mesasColumn())).toBe(true);
    expect(hasHiddenClass(detailColumn())).toBe(false);
  });

  it('bugfix: el CTA "+ Crear pedido nuevo" de la sub-barra sigue visible con una mesa/pedido seleccionado', () => {
    // Antes el botón vivía dentro de un `@if (!showingDetail())`, así que
    // desaparecía justo al seleccionar una mesa con pedido en curso -- se
    // reporta como bug porque el cajero pierde el acceso al CTA fijo
    // mientras trabaja sobre una mesa ya abierta.
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(hasHiddenClass(detailColumn())).toBe(false);
    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    );
    expect(cta).toBeTruthy();
  });

  it('el botón de volver de página llama a store.cancelSelection(), único para los 3 estados del panel central', () => {
    // t1 sin pedidos caería en "mesa-libre", que ya no tiene panel de
    // detalle (ni botón de volver) propio -- se le da un pedido para probar
    // el botón en un estado que sí renderiza la tarjeta de detalle.
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
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
 * repitiendo el mismo mensaje ("crea un pedido nuevo") dos veces. A pedido
 * del usuario, ese estado dejó de tener panel propio por completo -- la
 * tarjeta de detalle no renderiza nada (ver el describe de más abajo) y el
 * único CTA vive en la sub-barra junto al resumen de mesas.
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
        swPushStub,
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

// ── A pedido del usuario: sin panel vacío, CTA en la sub-barra ─────────────
describe('TableSessionsComponent — sin selección: sin panel de detalle vacío, CTA en la sub-barra', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
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

  it('sin selección, la tarjeta de detalle no renderiza ningún contenido (ni el estado vacío de antes)', () => {
    fixture.detectChanges();

    const detailColumn = fixture.nativeElement.querySelector('[data-testid="detail-column"]') as HTMLElement;
    expect(detailColumn.classList.contains('hidden')).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Sin selección');
    expect(fixture.nativeElement.textContent).not.toContain('Atajos de teclado');
  });

  it('sin selección, "Crear pedido nuevo" aparece en la sub-barra', () => {
    fixture.detectChanges();

    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement | undefined;
    expect(cta).toBeTruthy();
  });

  it('el CTA se queda en la sub-barra al seleccionar una mesa libre, ya que su panel de detalle tampoco se muestra', () => {
    fixture.detectChanges();
    const detailColumn = (): HTMLElement =>
      fixture.nativeElement.querySelector('[data-testid="detail-column"]');
    const findCta = (): HTMLButtonElement =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
      ) as HTMLButtonElement;

    // Sin selección: el único CTA vive en la sub-barra, fuera del detalle.
    expect(detailColumn().contains(findCta())).toBe(false);

    // Con t1 (libre, sin pedidos) seleccionada: cae en el estado "mesa-libre",
    // que ya no tiene panel de detalle propio -- el CTA sigue siendo el mismo
    // botón de la sub-barra (store.newOrderTableId() prioriza la mesa libre
    // seleccionada), y la tarjeta de detalle sigue sin mostrar nada.
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    expect(detailColumn().contains(findCta())).toBe(false);
    expect(detailColumn().classList.contains('hidden')).toBe(true);
  });
});

/**
 * spec 078 (US2, FR-007–FR-015): el CTA "Crear pedido nuevo" está fuera del
 * guard de pestaña — visible y habilitado en las tres pestañas y en los tres
 * anchos, con etiqueta de texto siempre. Desde "Domicilios" / "Para llevar"
 * navega a la ruta sin `:tableId` con `?tipo=`.
 */
describe('TableSessionsComponent — CTA "Crear pedido nuevo" en las 3 pestañas (spec 078, US2)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    router = TestBed.inject(Router);
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const cta = (): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement;

  for (const tab of ['mesas', 'domicilios', 'para-llevar'] as const) {
    it(`el CTA se renderiza con la pestaña en '${tab}' (sin tarjeta seleccionada) (FR-007)`, () => {
      store.setOrderTypeTab(tab);
      fixture.detectChanges();

      expect(cta()).toBeTruthy();
    });
  }

  it('la etiqueta "Crear pedido nuevo" es visible en los tres anchos — el <span> ya no lleva hidden sm:inline (FR-013, FR-015)', () => {
    fixture.detectChanges();

    const label = Array.from(cta().querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'Crear pedido nuevo',
    ) as HTMLSpanElement;
    expect(label).toBeTruthy();
    expect(label.className).not.toContain('hidden');
    expect(label.className).not.toContain('sm:inline');
  });

  it("pulsarlo con la pestaña en 'domicilios' navega a la ruta sin :tableId con tipo=domicilio", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    cta().click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'domicilio' } },
    );
  });

  it("pulsarlo con la pestaña en 'para-llevar' navega con tipo=para-llevar", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    cta().click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'para-llevar' } },
    );
  });

  it("pulsarlo con la pestaña en 'mesas' y una mesa libre seleccionada navega con :tableId, sin tipo (FR-010)", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('mesas');
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    cta().click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it("el CTA solo se deshabilita por falta de mesa libre en la pestaña 'mesas' (FR-007, FR-012)", () => {
    store.setOrderTypeTab('mesas');
    fixture.detectChanges();
    expect(cta().disabled).toBe(true); // sin mesa libre seleccionada

    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();
    expect(cta().disabled).toBe(false); // Domicilio no exige mesa

    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();
    expect(cta().disabled).toBe(false);
  });
});
