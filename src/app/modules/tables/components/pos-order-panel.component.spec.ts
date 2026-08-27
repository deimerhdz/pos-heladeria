import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PosOrderPanelComponent } from './pos-order-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder } from '../interfaces/dining.interface';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';

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
