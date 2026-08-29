import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosOrderPanelComponent } from './pos-order-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder } from '../interfaces/dining.interface';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';

const API = environment.apiBaseUrl;

/** Pedido con un solo ítem ya en cocina ('listo'), origen mesero. `paid` se
 *  fija por test (spec 029, Historia 1: "Anular" desaparece una vez pagado). */
function orderConItemListo(paid: boolean): DiningOrder {
  return {
    id: 'o1',
    channel: 'waiter',
    status: 'abierta',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    paid,
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'listo' }],
  } as DiningOrder;
}

/** Spec 029, Historia 1 (FR-007): un pedido ya pagado no se puede anular —
 *  el botón "Anular" deja de mostrarse en el panel de pedido. */
describe('PosOrderPanelComponent — anulación bloqueada tras pago', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const anularButton = (): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Anular',
    ) as HTMLButtonElement | undefined;

  it('no muestra "Anular" cuando el pedido seleccionado ya está pagado', () => {
    store.orders.set([orderConItemListo(true)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(anularButton()).toBeUndefined();
  });

  it('sí muestra "Anular" cuando el pedido seleccionado todavía no está pagado', () => {
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(anularButton()).toBeDefined();
  });
});

/** Spec 029, Historia 2 (FR-009/010/011): ningún control de descuento
 *  manual — el atajo F4 y su popover se retiraron por completo; el único
 *  descuento posible es el automático por promoción. */
describe('PosOrderPanelComponent — sin descuento manual', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no existe ningún botón/campo para aplicar un descuento manual', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Aplicar descuento');
    expect(texto).not.toContain('F4');
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();
  });

  it('el descuento mostrado en el total es siempre $0 sin promociones activas', () => {
    expect(store.totals().discount).toBe(0);
  });
});

/** Spec 049, FR-002: el resumen Subtotal/Descuento/Total se retiró de este
 *  panel — vive ahora en session-bill-panel.component.ts ("Cuenta de la
 *  mesa"). `store.totals()` en sí no cambia (sigue alimentando el panel de
 *  cuenta indirectamente vía `bill.split`), solo deja de renderizarse aquí. */
describe('PosOrderPanelComponent — sin resumen de totales (spec 049)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no muestra ninguna fila "Subtotal", "Descuento" ni "Total"', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Subtotal');
    expect(texto).not.toContain('Descuento');
    expect(texto).not.toContain('Total');
  });

  it('conserva "Marcar pedido listo" fuera del contenedor de totales retirado', () => {
    // orderConItemListo(false) ya tiene su único ítem 'listo': kitchenReady()
    // es true y el botón no se muestra (comportamiento ya existente, sin
    // relación con esta spec) — se necesita un ítem 'pendiente' para verlo.
    store.orders.set([
      { ...orderConItemListo(false), items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }] },
    ]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Marcar pedido listo');
  });
});

/** Spec 029, Historia 3 (FR-013): el encabezado del pedido distingue tres
 *  estados — "en preparación", "pago pendiente" y "listo para cobrar" —, ya
 *  no solo dos. */
describe('PosOrderPanelComponent — encabezado de tres estados (spec 029)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function orderCon(estado: 'pendiente' | 'listo', paid: boolean): DiningOrder {
    return {
      id: 'o1',
      channel: 'waiter',
      status: 'abierta',
      version: 1,
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      paid,
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: estado }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
  });

  afterEach(() => http.verify());

  it('cocina en curso → "en preparación", sin importar el pago', () => {
    store.orders.set([orderCon('pendiente', false)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('en preparación');
  });

  it('cocina lista pero sin pagar → "pago pendiente"', () => {
    store.orders.set([orderCon('listo', false)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('pago pendiente');
  });

  it('cocina lista y pagado → "listo para cobrar"', () => {
    store.orders.set([orderCon('listo', true)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('listo para cobrar');
  });
});

/** Pedido sin ítems, origen mesero, todavía sin cocina — mesa ocupada
 *  "armando pedido" (spec 036, Historia 2). */
function orderVacio(channel: DiningOrder['channel'] = 'waiter', paid = false): DiningOrder {
  return {
    id: 'o1',
    channel,
    status: 'abierta',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    paid,
    items: [],
  } as DiningOrder;
}

/** Spec 036, Historia 2: el catálogo se embebe en el mismo panel central en
 *  vez de abrirse como overlay de pantalla completa. */
describe('PosOrderPanelComponent — catálogo embebido (spec 036, Historia 2)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderVacio()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const findButton = (text: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;

  it('pulsar "+ Agregar producto" embebe el catálogo en el mismo panel, sin overlay de pantalla completa', () => {
    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();

    expect(store.catalogOpen()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Catálogo de productos');
    expect(el.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('seleccionar un producto desde el catálogo regresa a la lista de ítems, ahora con el producto agregado', () => {
    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();
    expect(store.catalogOpen()).toBe(true);

    // Simula completar la selección de variante/opciones ya existente
    // (`app-product-select`), que llama a `addDraftFromSelection()`.
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Malteada de fresa' } as never,
      variant: { id: 'v1', price: 8000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(store.catalogOpen()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).not.toContain('Catálogo de productos');
  });

  it('decidir no agregar nada y volver conserva los ítems ya agregados', () => {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Ya agregado' } as never,
      variant: { id: 'v1', price: 8000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();
    expect(store.catalogOpen()).toBe(true);

    findButton('← Volver a la lista')!.click();
    fixture.detectChanges();

    expect(store.catalogOpen()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ya agregado');
  });
});

/** Spec 036, US2, escenario 5: una orden QR de solo lectura ("Resumen de
 *  Cuenta") no ofrece "+ Agregar producto" — mismo criterio que ya usa
 *  `pos-checkout-panel.component.ts` (`getSidebarMode`). */
describe('PosOrderPanelComponent — sin catálogo para una orden QR de solo lectura (spec 036)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function ordenQrPagadaConCocinaPendiente(): DiningOrder {
    // spec 035 (A-52): una orden 'pagada' con ítems aún sin terminar de
    // preparar sigue contando como consumo vivo de la mesa → `pos-order-panel`
    // la muestra (estado 'pedido'), pero es de solo lectura (getSidebarMode).
    return {
      id: 'o1',
      channel: 'qr',
      status: 'pagada',
      version: 1,
      dining_table_id: 't1',
      customer_name: 'Ana',
      created_at: '2026-08-21T10:00:00',
      paid: true,
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'en_preparacion' }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([ordenQrPagadaConCocinaPendiente()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no ofrece el botón "+ Agregar producto"', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('＋ Agregar producto');
  });
});

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'ocupada', ...partial };
}

function pendingOrder(id: string, tableId: string): DiningOrder {
  return {
    id,
    channel: 'qr',
    status: 'recibida',
    dining_table_id: tableId,
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    items: [],
  } as DiningOrder;
}

/**
 * Spec 045: sin mesa seleccionada, este panel ya no muestra la sección
 * global "Pagos por confirmar" (spec 036 FR-004, retirada) — solo un
 * placeholder informativo único.
 */
describe('PosOrderPanelComponent — placeholder cuando no hay mesa seleccionada (spec 045)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin mesa seleccionada, muestra un único placeholder informativo (sin "Pagos por confirmar")', () => {
    tableService.tables.set([table({ id: 't1', number: 4 })]);
    store.orders.set([pendingOrder('o1', 't1')]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Pagos por confirmar');
    expect(texto).toContain('Selecciona una mesa');
  });

  it('con una mesa/pedido seleccionado, ya no muestra "Pagos por confirmar" (solo el detalle del pedido)', () => {
    tableService.tables.set([table({ id: 't1', number: 4 })]);
    store.orders.set([
      {
        id: 'o2',
        channel: 'waiter',
        status: 'abierta',
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-21T10:00:00',
        paid: false,
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o2');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Pagos por confirmar');
  });
});

/** Spec 049: cabecera de solo lectura + pestañas "Todos los pedidos"/"Pedido N". */
describe('PosOrderPanelComponent — cabecera y pestañas (spec 049)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let http: HttpTestingController;

  function ordenSimple(
    id: string,
    estado: 'pendiente' | 'listo',
    customerName: string | null = 'Deimer Hernandez',
  ): DiningOrder {
    return {
      id,
      channel: 'waiter',
      status: 'abierta',
      dining_table_id: 't1',
      customer_name: customerName,
      created_at: '2026-08-21T08:10:00',
      paid: false,
      items: [{ id: `${id}-i1`, product_variant_id: 'v1', quantity: 2, unit_price: '4000', estado_cocina: estado }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
    tableService.tables.set([table({ id: 't1', number: 2, status: 'ocupada' })]);
  });

  afterEach(() => http.verify());

  const findButton = (text: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;

  it('la cabecera muestra mesa, chip de estado y cliente como texto, sin ningún input editable', () => {
    store.orders.set([ordenSimple('o1', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    // `selectedOrderId` se fija directo (patrón ya usado en este archivo);
    // `customerName` normalmente lo copia `selectTable()`/`selectOrder()`
    // desde `order.customer_name`, así que se fija igual aquí a propósito.
    store.customerName.set('Deimer Hernandez');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mesa 2');
    // Con un ítem 'pendiente', el chip refleja el estado derivado real
    // ("En preparación", `deriveTableStatus`), no el estado crudo de la mesa
    // ("Ocupada") — mismo criterio ya usado por la grilla (`tablesView()`).
    expect(el.textContent).toContain('En preparación');
    expect(el.textContent).toContain('Deimer Hernandez');
    expect(el.querySelector('input[type="text"]')).toBeNull();
  });

  it('con dos pedidos activos aparecen "Todos los pedidos (2)", "Pedido 1", "Pedido 2", con "Todos los pedidos" activa por defecto', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.showAllOrders.set(true);
    fixture.detectChanges();

    expect(findButton('Todos los pedidos (2)')).toBeDefined();
    expect(findButton('Pedido 1')).toBeDefined();
    expect(findButton('Pedido 2')).toBeDefined();
    expect(store.showAllOrders()).toBe(true);
  });

  it('en "Todos los pedidos" se ven ambas tarjetas a la vez, cada una con su hora y su pastilla de estado', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.showAllOrders.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2x');
    expect(el.textContent).toContain('Listo');
    expect(el.textContent).toContain('Pendiente');
    // 2x por cada una de las dos tarjetas.
    expect(el.textContent!.match(/2x/g)?.length).toBe(2);
  });

  it('elegir "Pedido 1" muestra solo esa tarjeta y oculta la de "Pedido 2"', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.showAllOrders.set(true);
    fixture.detectChanges();

    findButton('Pedido 1')!.click();
    fixture.detectChanges();

    expect(store.showAllOrders()).toBe(false);
    expect(store.selectedOrderId()).toBe('o1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent!.match(/2x/g)?.length).toBe(1);
  });

  it('"+ Agregar producto" no aparece en "Todos los pedidos" pero sí dentro de una pestaña individual', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.showAllOrders.set(true);
    fixture.detectChanges();
    expect(findButton('＋ Agregar producto')).toBeUndefined();

    findButton('Pedido 1')!.click();
    fixture.detectChanges();
    expect(findButton('＋ Agregar producto')).toBeDefined();
  });

  it('con un único pedido activo no aparece ningún selector de pestañas', () => {
    store.orders.set([ordenSimple('o1', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Todos los pedidos');
    expect(fixture.nativeElement.textContent).not.toContain('Pedido 1');
  });

  it('marcar listo desde una tarjeta que no es la seleccionada por defecto afecta al pedido correcto', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1'); // seleccionado: o1 (ya "listo", sin botón)
    store.showAllOrders.set(true);
    fixture.detectChanges();

    // El único botón "Marcar pedido listo" visible es el de la tarjeta o2
    // (la única "Pendiente"); confirma que apunta a ese pedido, no al
    // seleccionado.
    findButton('Marcar pedido listo')!.click();
    // PATCH por ítem (bugfix A-16), no "ready" — ver marcarListo().
    http.expectOne(`${API}/orders/items/o2-i1/kitchen`).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
  });

  it('spec 049, FR-001: no existe ningún control "+ Nuevo pedido" con varios pedidos activos', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(findButton('+ Nuevo pedido')).toBeUndefined();
    expect(fixture.nativeElement.textContent).not.toContain('Nuevo pedido');
  });
});
