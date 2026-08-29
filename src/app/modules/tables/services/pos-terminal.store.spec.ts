import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import {
  PosTerminalStore,
  currentNow,
  deriveTableStatus,
  newPendingIds,
  normalizeSearchTerm,
} from './pos-terminal.store';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { TableService } from './table.service';
import { Promotion } from '../../promotions/interfaces/promotion.interface';
import { discountedUnitPrice } from '../../promotions/services/promotion-pricing.util';
import { PromotionService } from '../../promotions/services/promotion.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { Sale } from '../../sales/interfaces/sales.interface';
import { MenuService } from '../../../core/services/menu.service';
import { MenuProduct } from '../../products/interfaces/product.interface';

const API = environment.apiBaseUrl;

function order(
  id: string,
  status: DiningOrder['status'],
  cocina: DiningOrderItem['estado_cocina'][] = [],
  paid?: boolean,
): DiningOrder {
  return {
    id,
    channel: 'qr',
    status,
    created_at: '2026-07-29T12:00:00',
    paid,
    items: cocina.map((estado_cocina, i) => ({
      id: `${id}-i${i}`,
      product_variant_id: 'v1',
      quantity: 1,
      unit_price: '4000',
      estado_cocina,
    })) as DiningOrderItem[],
  } as DiningOrder;
}

describe('newPendingIds', () => {
  it('detecta el pedido que aún no se había visto', () => {
    const nuevos = newPendingIds(new Set(['o1']), [
      order('o1', 'recibida'),
      order('o2', 'recibida'),
    ]);

    expect(nuevos).toEqual(['o2']);
  });

  it('no repite el aviso de un pedido ya conocido', () => {
    expect(newPendingIds(new Set(['o1']), [order('o1', 'recibida')])).toEqual([]);
  });

  it('ignora los pedidos que no esperan confirmación', () => {
    const nuevos = newPendingIds(new Set(), [
      order('o1', 'abierta'),
      order('o2', 'pagada'),
      order('o3', 'cancelada'),
    ]);

    expect(nuevos).toEqual([]);
  });

  it('no avisa cuando un pedido conocido se confirma', () => {
    // El contador baja, pero eso no es un pedido nuevo.
    expect(newPendingIds(new Set(['o1']), [order('o1', 'abierta')])).toEqual([]);
  });
});

describe('deriveTableStatus', () => {
  it('marca por confirmar la mesa con un pedido del QR sin aceptar', () => {
    // Era el fallo reportado: estas mesas se pintaban "Libre" con $ 0.
    expect(deriveTableStatus([order('o1', 'recibida', ['pendiente'])], 'ocupada')).toBe(
      'por_confirmar',
    );
  });

  // ── feature 028, T010/T037/T039: el badge "Por confirmar" es solo de QR ──
  describe('badge "Por confirmar" — solo canal qr (T010/T037/T039)', () => {
    function counterOrder(id: string, status: DiningOrder['status']): DiningOrder {
      return { ...order(id, status), channel: 'counter' };
    }

    it('NO marca por confirmar un pedido de mostrador en espera de armarse (hold_for_payment)', () => {
      // Un pedido `counter` también vive en `recibida` mientras el cajero lo
      // arma (feature 028), pero no tiene ningún pago que revisar: mostrarlo
      // como "Por confirmar" sería una falsa alarma para el resto del staff.
      expect(deriveTableStatus([counterOrder('o1', 'recibida')], 'ocupada')).not.toBe(
        'por_confirmar',
      );
    });

    it('caso mixto: un comensal ya confirmado y otro QR todavía pendiente → sigue "Por confirmar"', () => {
      const confirmado = order('o1', 'abierta', ['pendiente']);
      const pendiente = order('o2', 'recibida', ['pendiente']);

      expect(deriveTableStatus([confirmado, pendiente], 'ocupada')).toBe('por_confirmar');
    });

    it('caso mixto: un pedido de mostrador armándose junto a uno QR pendiente → sigue "Por confirmar"', () => {
      const mostrador = counterOrder('o1', 'recibida');
      const qrPendiente = order('o2', 'recibida', ['pendiente']);

      expect(deriveTableStatus([mostrador, qrPendiente], 'ocupada')).toBe('por_confirmar');
    });
  });

  it('ocupa la mesa aunque no haya pedidos si el backend la da por ocupada', () => {
    // Comensal que escaneó el QR y todavía no pidió nada.
    expect(deriveTableStatus([], 'ocupada')).toBe('ocupada');
    expect(deriveTableStatus([], 'reservada')).toBe('reservada');
  });

  it('deja libre la mesa sin pedidos ni sesión', () => {
    expect(deriveTableStatus([], 'libre')).toBe('libre');
  });

  it('prioriza el cobro pendiente sobre el estado de cocina', () => {
    expect(deriveTableStatus([order('o1', 'bloqueada', ['listo'])], 'ocupada')).toBe(
      'pago_pendiente',
    );
  });

  it('distingue preparación en curso de pedido listo', () => {
    expect(deriveTableStatus([order('o1', 'abierta', ['en_preparacion', 'listo'])], 'ocupada')).toBe(
      'en_preparacion',
    );
    expect(deriveTableStatus([order('o1', 'abierta', ['pendiente', 'listo'])], 'ocupada')).toBe(
      'en_preparacion',
    );
    // Spec 029: "listo" exige además el pago — sin él, `paid` (`o1`, tercer
    // arg de cocina omitido, cuarto `true`) es lo que hace la diferencia.
    expect(deriveTableStatus([order('o1', 'abierta', ['listo', 'listo'], true)], 'ocupada')).toBe(
      'listo',
    );
  });

  it('ignora los ítems anulados al mirar la preparación', () => {
    expect(deriveTableStatus([order('o1', 'abierta', ['anulado'])], 'ocupada')).toBe('ocupada');
  });

  // ── spec 029, Historia 3: "Listo" exige pago Y cocina, las dos a la vez ──
  describe('"Listo" exige pago (spec 029)', () => {
    it('cocina lista pero sin pagar → "Pago pendiente", no "Listo"', () => {
      // El caso real que motivó la spec: pedido de mesero ('abierta'),
      // cocina ya terminó, pero `paid` sigue `false` — nunca pasó por
      // `checkout_and_send`/`pay_order` todavía.
      expect(deriveTableStatus([order('o1', 'abierta', ['listo'], false)], 'ocupada')).toBe(
        'pago_pendiente',
      );
    });

    it('cocina lista y ya pagado → "Listo"', () => {
      expect(deriveTableStatus([order('o1', 'abierta', ['listo'], true)], 'ocupada')).toBe('listo');
    });

    it('pagado pero cocina todavía en curso → no muestra "Listo"', () => {
      expect(
        deriveTableStatus([order('o1', 'abierta', ['en_preparacion'], true)], 'ocupada'),
      ).toBe('en_preparacion');
    });

    it('varios pedidos: uno pagado y listo, otro listo pero sin pagar → sigue "Pago pendiente"', () => {
      const pagado = order('o1', 'abierta', ['listo'], true);
      const sinPagar = order('o2', 'abierta', ['listo'], false);
      expect(deriveTableStatus([pagado, sinPagar], 'ocupada')).toBe('pago_pendiente');
    });
  });
});

/**
 * La campana tras reconectar.
 *
 * `announcePending` es lo único que puede sonar, y decide comparando **ids**
 * contra los ya vistos. El tiempo real no la alimenta directamente: un evento
 * dispara una recarga y la recarga pasa por aquí. Estos tests fijan esa
 * propiedad, que es la que evita que el replay de eventos tras una reconexión
 * vuelva a sonar por pedidos que el cajero ya atendió.
 */
describe('newPendingIds tras una reconexión', () => {
  it('el replay de un pedido ya visto no vuelve a sonar', () => {
    const vistos = new Set(['o1', 'o2']);
    const orders = [order('o1', 'recibida'), order('o2', 'recibida')];

    // Lo que llega en el replay es exactamente lo que ya estaba.
    expect(newPendingIds(vistos, orders)).toEqual([]);
  });

  it('pero un pedido nuevo entre los repetidos sí suena, y solo ese', () => {
    const vistos = new Set(['o1']);
    const orders = [order('o1', 'recibida'), order('o2', 'recibida')];

    expect(newPendingIds(vistos, orders)).toEqual(['o2']);
  });

  it('un pedido que entró y se confirmó dentro de la misma ventana ya no cuenta', () => {
    // Es el motivo de comparar ids y no cantidades: el contador vuelve a su
    // sitio, pero el aviso debió sonar cuando entró.
    expect(newPendingIds(new Set(['o1']), [order('o1', 'abierta')])).toEqual([]);
  });
});

describe('currentNow — A-09, guarda usada por combos/productDiscountBadges/cartView/orderSubtotal', () => {
  it('antes del primer sync (ready() false), devuelve null en vez del reloj del dispositivo', () => {
    const promotionService = { ready: () => false, now: () => new Date('2026-01-01T00:00:00Z') };

    expect(currentNow(promotionService)).toBeNull();
  });

  it('tras el sync, devuelve promotionService.now(), no el reloj del sistema de pruebas', () => {
    // Reloj real del entorno de pruebas: 2026-08-18T22:30 UTC. `now()` del
    // doble de PromotionService dice otra cosa — la única forma de que el
    // resultado coincida con el doble es que currentNow no use Date.now().
    const serverInstant = new Date('2026-08-15T17:30:00Z');
    const promotionService = { ready: () => true, now: () => serverInstant };

    expect(currentNow(promotionService)).toBe(serverInstant);
  });
});

describe('discountedUnitPrice guardado por currentNow — A-09, patrón usado por cartView/orderSubtotal', () => {
  function promo(overrides: Partial<Promotion> = {}): Promotion {
    return {
      id: overrides.id ?? 'p1',
      name: overrides.name ?? 'Promo',
      description: null,
      type: 'percent',
      value: '20',
      status: 'active',
      priority: 0,
      starts_at: null,
      ends_at: null,
      days_of_week: null,
      start_time: '17:00',
      end_time: '19:00',
      min_qty: 1,
      targets: [],
      combo_items: [],
      ...overrides,
    };
  }

  /** El mismo patrón que aplican cartView/orderSubtotal tras la corrección:
   *  sin hora sincronizada, ningún descuento de previsualización. */
  function unitPriceComoEnElStore(
    promotionService: { ready(): boolean; now(): Date },
    promos: Promotion[],
    price: number,
  ): number {
    const now = currentNow(promotionService);
    if (now === null) return price;
    return discountedUnitPrice(promos, now, 'p1', 'c1', price, 1);
  }

  it('sin sync (ready() false), el carrito no aplica descuento de previsualización (FR-004)', () => {
    // El reloj del dispositivo diría "dentro de ventana" si se usara, pero no
    // hay sync todavía: no se llama a discountedUnitPrice en absoluto.
    const promotionService = { ready: () => false, now: () => new Date('2026-08-15T17:30:00Z') };
    const promos = [promo({ targets: [{ product_id: 'p1', category_id: null, value: null, min_qty: null }] })];

    expect(unitPriceComoEnElStore(promotionService, promos, 10000)).toBe(10000);
  });

  it('tras sync, el precio refleja el descuento con la hora del servidor, no el reloj local (FR-002, CA2)', () => {
    // Reloj "local" simulado fuera de ventana (22:30); servidor (mock) dice
    // que son las 17:30 — dentro de la ventana 17:00-19:00 de la promo.
    const promotionService = { ready: () => true, now: () => new Date('2026-08-15T17:30:00') };
    const promos = [promo({ targets: [{ product_id: 'p1', category_id: null, value: null, min_qty: null }] })];

    expect(unitPriceComoEnElStore(promotionService, promos, 10000)).toBe(8000);
  });
});

// ── feature 028, T010: `pendingOrders` (bloque de validación de pagos) ──────
describe('PosTerminalStore.pendingOrders — solo canal qr', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('incluye los pedidos qr en recibida y excluye los de mostrador (hold_for_payment)', () => {
    store.orders.set([
      order('qr1', 'recibida'),
      { ...order('counter1', 'recibida'), channel: 'counter' },
      order('qr2', 'abierta'),
    ]);

    expect(store.pendingOrders().map((o) => o.id)).toEqual(['qr1']);
  });
});

/**
 * Bugfix (gap de spec 035, A-52): una orden `'pagada'` con toda la cocina en
 * `'listo'` seguía contando como consumo vivo de la mesa antes del fix, pero
 * `activeOrders`/`tableOrders` la excluían justo en ese momento -- la mesa se
 * veía "libre" con la sesión todavía abierta. Ver spec 047.
 */
describe('PosTerminalStore — orden "pagada" ya lista sigue visible (gap spec 035, A-52)', () => {
  let store: PosTerminalStore;
  let tableService: TableService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    tableService.tables.set([
      { id: 't1', number: 3, name: null, qr_token: 'qr-t1', active: true, status: 'ocupada' },
    ]);
  });

  it('centralState no cae a "mesa-libre" tras marcar listo un pedido de mostrador ya cobrado', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo', 'listo'], true), channel: 'counter', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    expect(store.centralState()).toBe('pedido');
  });

  it('tablesView pinta "Listo", no "Ocupada", para esa mesa', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo', 'listo'], true), channel: 'counter', dining_table_id: 't1' },
    ]);

    const fila = store.tablesView().find((t) => t.id === 't1');
    expect(fila?.statusLabel).toBe('Listo');
  });
});

/**
 * Spec 048: cuando la mesa tiene a la vez un pago pendiente de confirmar y
 * un pedido pagado/activo, el cajero necesita poder ver ambos -- antes de
 * este fix, `centralState()` le daba prioridad absoluta al pago pendiente y
 * el pedido pagado quedaba inalcanzable.
 */
describe('PosTerminalStore — pestañas cuando coexisten pago pendiente y pedido pagado (spec 048)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('con una orden pagada y otra pendiente en la misma mesa, hasPendingAndActiveOrders() es true y effectiveCentralView() empieza en "validar-pago"', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo'], true), channel: 'counter', dining_table_id: 't1' },
      { ...order('o2', 'recibida'), channel: 'qr', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    expect(store.hasPendingAndActiveOrders()).toBe(true);
    expect(store.effectiveCentralView()).toBe('validar-pago');
  });

  it('al elegir la pestaña "pedido", effectiveCentralView() cambia sin tocar centralState()', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo'], true), channel: 'counter', dining_table_id: 't1' },
      { ...order('o2', 'recibida'), channel: 'qr', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    store.centralPanelTab.set('pedido');

    expect(store.effectiveCentralView()).toBe('pedido');
    expect(store.centralState()).toBe('validar-pago');
  });

  it('con solo uno de los dos tipos de pedido, no hay pestañas y effectiveCentralView() coincide con centralState()', () => {
    store.orders.set([{ ...order('o1', 'recibida'), channel: 'qr', dining_table_id: 't1' }]);
    store.selectedTableId.set('t1');

    expect(store.hasPendingAndActiveOrders()).toBe(false);
    expect(store.effectiveCentralView()).toBe(store.centralState());
  });

  it('al seleccionar otra mesa, centralPanelTab() vuelve a "validar-pago"', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo'], true), channel: 'counter', dining_table_id: 't1' },
      { ...order('o2', 'recibida'), channel: 'qr', dining_table_id: 't1' },
      { ...order('o3', 'pagada', ['listo'], true), channel: 'counter', dining_table_id: 't2' },
    ]);
    store.selectTable('t1');
    store.centralPanelTab.set('pedido');
    expect(store.centralPanelTab()).toBe('pedido');

    store.selectTable('t2');

    expect(store.centralPanelTab()).toBe('validar-pago');
  });
});

/**
 * T033 (FR-012): resolver la venta de un pedido ya facturado, sea QR o de
 * mostrador, cobrado en esta pestaña o en otra (o tras recargar la página).
 * Se prueba directamente sobre el store —sin componente ni click— porque
 * `printOrderInvoice` termina en `printReceiptHtml` (iframe + `window.print`),
 * que esta suite no ejercita de punta a punta (ver nota en
 * `pos-checkout-panel.component.spec.ts`); `resolveSaleForOrder` es la parte
 * de caché/red/errores, separada a propósito para poder probarla sola.
 */
describe('PosTerminalStore.resolveSaleForOrder', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;

  const sale = (): Sale =>
    ({ id: 's1', total: '10000', status: 'paid', sold_at: '2026-08-20', items: [], payments: [] }) as unknown as Sale;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => http.verify());

  it('si la venta ya está en caché (recién cobrada en esta pestaña), no pega a la red', async () => {
    store.checkoutSaleByOrderId.set({ o1: sale() });

    const found = await store.resolveSaleForOrder('o1');

    expect(found?.id).toBe('s1');
    http.expectNone(`${API}/invoices?order_id=o1`);
  });

  it('si no está en caché, la busca por order_id → factura → venta completa', async () => {
    const promise = store.resolveSaleForOrder('o1');

    const invoiceReq = http.expectOne((r) => r.url === `${API}/invoices` && r.params.get('order_id') === 'o1');
    invoiceReq.flush([{ id: 'inv1', sale_id: 's1' }]);
    // La segunda petición sale de un `await` dentro de `findSaleForOrder`:
    // hace falta ceder el microtask antes de que `expectOne` la vea.
    await Promise.resolve();
    const saleReq = http.expectOne(`${API}/sales/s1`);
    saleReq.flush(sale());

    const found = await promise;
    expect(found?.id).toBe('s1');
    // Queda en caché para la próxima vez (p. ej. reimprimir dos veces seguidas).
    expect(store.checkoutSaleByOrderId()['o1']?.id).toBe('s1');
  });

  it('si el pedido no tiene ninguna factura emitida, avisa por toast y no revienta', async () => {
    const promise = store.resolveSaleForOrder('o1');

    const invoiceReq = http.expectOne((r) => r.url === `${API}/invoices` && r.params.get('order_id') === 'o1');
    invoiceReq.flush([]);

    const found = await promise;
    expect(found).toBeNull();
    expect(toast.toasts().some((t) => t.kind === 'error' && t.text.includes('factura'))).toBe(true);
  });
});

/**
 * Hotfix de spec 029: `billOrphan` (el aviso "No se puede cobrar esta mesa
 * — su sesión está cerrada") contaba cualquier pedido no terminal como
 * "sin cobrar", sin mirar `paid` — un pedido ya pagado (que nunca llega a
 * `status === 'pagada'` en el camino QR/mostrador) disparaba el aviso
 * aunque ya estuviera resuelto.
 */
describe('PosTerminalStore.loadSessionBill — billOrphan (hotfix spec 029)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin sesión pero con un pedido ya pagado → NO marca huérfano', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['listo'], true), dining_table_id: 't1' }]);

    const promise = store.loadSessionBill('t1');
    const req = http.expectOne(`${API}/table-sessions`);
    req.flush([]); // sin sesiones activas para esta mesa
    await promise;

    expect(store.billOrphan()).toBe(false);
  });

  it('sin sesión y con un pedido genuinamente sin pagar → sí marca huérfano', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['listo'], false), dining_table_id: 't1' }]);

    const promise = store.loadSessionBill('t1');
    const req = http.expectOne(`${API}/table-sessions`);
    req.flush([]);
    await promise;

    expect(store.billOrphan()).toBe(true);
  });
});

/**
 * Reporte del usuario: crear un pedido de mostrador, recargar la página y
 * volver a seleccionar la mesa dejaba el panel central como "Pedido nuevo
 * sin guardar" aunque el pedido ya existía con productos. Causa raíz:
 * `activeOrders` (de la que depende `selectTable()` para auto-seleccionar)
 * excluía TODO pedido `'recibida'` sin mirar el canal — un pedido de
 * mostrador `hold_for_payment` vive en `'recibida'` mientras se arma, pero sí
 * es editable/seleccionable, a diferencia de uno del QR sin confirmar.
 */
describe('PosTerminalStore.selectTable', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('un pedido de mostrador "recibida" (hold_for_payment) SÍ se auto-selecciona', () => {
    store.orders.set([
      { ...order('o1', 'recibida', ['pendiente']), channel: 'counter', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.selectedOrder()?.id).toBe('o1');
  });

  it('un pedido QR "recibida" (por confirmar) NO se auto-selecciona', () => {
    store.orders.set([
      { ...order('o1', 'recibida', ['pendiente']), channel: 'qr', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.selectedOrder()).toBeNull();
  });

  it('una mesa sin pedidos no selecciona ninguno', () => {
    store.orders.set([]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.selectedOrder()).toBeNull();
  });
});

describe('PosTerminalStore.voidPersistedItem — spec 029, Historia 1', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    confirm = TestBed.inject(ConfirmService);
  });

  afterEach(() => http.verify());

  it('el 409 de un pedido ya pagado se muestra con el mensaje del backend, sin excepción no controlada', async () => {
    const promise = store.voidPersistedItem('i1');
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/items/i1/void`);
    req.flush(
      { detail: 'El pedido ya fue pagado y no puede anularse' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(promise).resolves.toBeUndefined(); // no relanza — el error ya quedó en el toast
    expect(
      toast.toasts().some((t) => t.kind === 'error' && t.text === 'El pedido ya fue pagado y no puede anularse'),
    ).toBe(true);
  });
});

/**
 * Spec 029, hotfix #4: `cancel_order` ya existía en el backend (sin venta ni
 * movimiento de caja) pero no tenía ningún botón en la Terminal de Mesas —
 * la única acción sobre un pedido al confirmar el pago era cobrarlo.
 */
describe('PosTerminalStore.rejectOrder', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    confirm = TestBed.inject(ConfirmService);
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), dining_table_id: 't1' }]);
    store.selectedOrderId.set('o1');
  });

  afterEach(() => http.verify());

  it('sin pedido seleccionado, no hace nada', async () => {
    store.selectedOrderId.set(null);
    await store.rejectOrder();
  });

  it('si el cajero cancela el aviso, no llama al backend ni pierde la selección', async () => {
    const promise = store.rejectOrder();
    confirm.respond(false);

    await promise;
    expect(store.selectedOrderId()).toBe('o1');
  });

  it('con confirmación, cancela el pedido con un motivo fijo (T: wiring)', async () => {
    const promise = store.rejectOrder();
    confirm.respond(true);
    await Promise.resolve();

    // Mismo patrón que "Liberar Mesa" (T035): al probar solo la forma del
    // pedido y su conexión, se responde con un error en vez de perseguir
    // toda la cascada de `reload()` (mesas + pedidos + cuenta de sesión).
    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.body).toEqual({ motivo: 'Rechazado desde terminal' });
    req.flush({ detail: 'boom' }, { status: 409, statusText: 'Conflict' });

    await promise;
  });

  it('si el backend rechaza (pedido ya pagado), lo muestra con el mensaje del backend', async () => {
    const promise = store.rejectOrder();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    req.flush(
      { detail: 'El pedido ya fue pagado y no puede rechazarse' },
      { status: 409, statusText: 'Conflict' },
    );

    await promise;
    expect(
      toast
        .toasts()
        .some((t) => t.kind === 'error' && t.text === 'El pedido ya fue pagado y no puede rechazarse'),
    ).toBe(true);
  });
});

/**
 * Spec 044: `reload()` refrescaba `orders()` pero nunca volvía a calcular
 * `selectedOrderId` — al confirmar/aprobar un pago QR pendiente, el pedido
 * dejaba de estar excluido de `activeOrders()`, pero la selección se quedaba
 * en `null` (desde que se eligió la mesa mientras el pedido aún era
 * `recibida`+`qr`) hasta que el cajero volvía a tocar la tarjeta.
 */
describe('PosTerminalStore.reload — resincroniza la selección tras confirmar un pago', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Deja correr los microtasks pendientes entre una tanda de `flush()` y la
   *  siguiente petición que dispara `reload()` internamente (mismo patrón que
   *  `product.service.spec.ts`/`product-form.component.spec.ts`). */
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('mesa con un único pedido QR pendiente: al confirmarse el pago, reload() selecciona ese pedido sin que el cajero vuelva a tocar la tarjeta', async () => {
    store.orders.set([
      { ...order('o1', 'recibida', ['pendiente']), channel: 'qr', dining_table_id: 't1' },
    ]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedOrder()).toBeNull(); // línea base: excluido mientras está pendiente

    const promise = store.reload();
    http.expectOne(`${API}/orders/tables`).flush([]);
    http
      .expectOne((r) => r.url === `${API}/orders`)
      .flush([{ ...order('o1', 'abierta', ['pendiente']), channel: 'qr', dining_table_id: 't1' }]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);
    await promise;

    expect(store.selectedOrder()?.id).toBe('o1');
  });

  it('mesa con dos pedidos activos y uno ya elegido a mano: reload() no cambia la selección mientras siga vigente', async () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'counter', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'counter', dining_table_id: 't1' },
    ]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    store.selectOrder('o2');
    expect(store.selectedOrder()?.id).toBe('o2');

    const promise = store.reload();
    http.expectOne(`${API}/orders/tables`).flush([]);
    http
      .expectOne((r) => r.url === `${API}/orders`)
      .flush([
        { ...order('o1', 'abierta', ['pendiente']), channel: 'counter', dining_table_id: 't1' },
        { ...order('o2', 'abierta', ['pendiente']), channel: 'counter', dining_table_id: 't1' },
      ]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);
    await promise;

    expect(store.selectedOrder()?.id).toBe('o2');
  });
});

/**
 * Bugfix (gap de spec 035, A-52): `marcarListo()` llama a `reload()`, que
 * dispara `resyncSelectedOrder()` -- antes del fix, un pedido `'pagada'`
 * dejaba de aparecer en `ordersOfTable()` justo al terminar de cocinar, así
 * que la selección se perdía en el mismo `reload()` que confirmaba el
 * "Marcar pedido listo". Ver spec 047.
 */
describe('PosTerminalStore.marcarListo — pedido "pagada" no desaparece (gap spec 035, A-52)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tras marcarListo(), el pedido pagado sigue seleccionado y centralState sigue en "pedido"', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente'], true), channel: 'counter', dining_table_id: 't1' },
    ]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    // `selectTable()` de una mesa con un pedido `paid` precarga su venta real
    // (bugfix "Ya pagado" en Cuenta de la mesa) — sin sale encontrada aquí,
    // que es justo lo que este test no necesita.
    http.expectOne((r) => r.url === `${API}/invoices`).flush([]);
    expect(store.selectedOrderId()).toBe('o1');

    const promise = store.marcarListo();

    // PATCH por ítem, no `POST /orders/{id}/ready` — ese endpoint rechaza con
    // 409 justo cuando `status === 'pagada'` (A-16), que es el caso de este
    // test (pedido de mostrador cobrado por adelantado).
    const kitchenReq = http.expectOne(`${API}/orders/items/o1-i0/kitchen`);
    expect(kitchenReq.request.method).toBe('PATCH');
    kitchenReq.flush({ id: 'o1-i0', estado_cocina: 'listo' });
    await tick();

    http.expectOne(`${API}/orders/tables`).flush([]);
    http
      .expectOne((r) => r.url === `${API}/orders`)
      .flush([{ ...order('o1', 'pagada', ['listo'], true), channel: 'counter', dining_table_id: 't1' }]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);

    await promise;

    expect(store.selectedOrderId()).toBe('o1');
    expect(store.centralState()).toBe('pedido');
  });

  it('marcarListo() no llama a "ready" y en cambio hace PATCH por cada ítem pendiente, sin chocar con el 409 de A-16', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente', 'pendiente'], true), channel: 'counter', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    const promise = store.marcarListo();

    http.expectOne(`${API}/orders/items/o1-i0/kitchen`).flush({ id: 'o1-i0', estado_cocina: 'listo' });
    await tick();
    http.expectOne(`${API}/orders/items/o1-i1/kitchen`).flush({ id: 'o1-i1', estado_cocina: 'listo' });
    await tick();

    http.expectOne(`${API}/orders/tables`).flush([]);
    http.expectOne((r) => r.url === `${API}/orders`).flush([]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);

    await promise;

    http.expectNone(`${API}/orders/o1/ready`);
  });
});

/**
 * Spec 029, hotfix #3: `ensureReadyToCharge` existía sin ningún test — nadie
 * la llamaba (huérfana, ver `pos-checkout-panel.component.ts`, ahora
 * conectada como `beforeCharge` de `app-session-bill-panel` para el cobro
 * por sesión de mesa). Resuelve de una vez, con un solo aviso, los productos
 * que sigan sin marcar como listos antes de cobrar — la alternativa era que
 * `close_session` rechazara con 409 y el cajero tuviera que ir a otra
 * pantalla a marcarlos uno a uno.
 */
describe('PosTerminalStore.ensureReadyToCharge', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    confirm = TestBed.inject(ConfirmService);
  });

  afterEach(() => http.verify());

  it('con todos los ítems ya listos, resuelve true de inmediato sin preguntar ni pegar a la red', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['listo']), dining_table_id: 't1' }]);
    store.sessionBill.set({
      table_session_id: 'ts1', dining_table_id: 't1', total: '4000', order_ids: ['o1'], split: [],
    });

    await expect(store.ensureReadyToCharge()).resolves.toBe(true);
  });

  it('con ítems sin marcar, pregunta y —si el cajero confirma— los marca listos y recarga', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), dining_table_id: 't1' }]);
    store.sessionBill.set({
      table_session_id: 'ts1', dining_table_id: 't1', total: '4000', order_ids: ['o1'], split: [],
    });

    const promise = store.ensureReadyToCharge();
    confirm.respond(true);
    await Promise.resolve();

    const readyReq = http.expectOne(`${API}/orders/o1/ready`);
    readyReq.flush({ ...order('o1', 'abierta', ['listo']), dining_table_id: 't1' });
    await new Promise((resolve) => setTimeout(resolve));

    const reloadReq = http.expectOne((r) => r.url === `${API}/orders` && r.params.get('active_sessions_only') === 'true');
    reloadReq.flush([]);

    await expect(promise).resolves.toBe(true);
  });

  it('si el cajero cancela el aviso, resuelve false sin marcar nada', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), dining_table_id: 't1' }]);
    store.sessionBill.set({
      table_session_id: 'ts1', dining_table_id: 't1', total: '4000', order_ids: ['o1'], split: [],
    });

    const promise = store.ensureReadyToCharge();
    confirm.respond(false);

    await expect(promise).resolves.toBe(false);
  });
});

// ── spec 036, FR-001/FR-003: pestaña de tipo de orden ──────────────────────
describe('PosTerminalStore.orderTypeTab / setOrderTypeTab', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('empieza en "mesas"', () => {
    expect(store.orderTypeTab()).toBe('mesas');
  });

  it('setOrderTypeTab cambia la pestaña activa', () => {
    store.setOrderTypeTab('domicilios');
    expect(store.orderTypeTab()).toBe('domicilios');

    store.setOrderTypeTab('para-llevar');
    expect(store.orderTypeTab()).toBe('para-llevar');

    store.setOrderTypeTab('mesas');
    expect(store.orderTypeTab()).toBe('mesas');
  });
});

// ── spec 036, FR-007: buscador por nombre del catálogo embebido ────────────
describe('PosTerminalStore.catalogSearchText / setCatalogSearchText / catalogProductsFiltered', () => {
  let store: PosTerminalStore;
  let menuService: MenuService;

  function product(id: string, name: string): MenuProduct {
    return {
      id,
      name,
      description: null,
      image_url: null,
      variants: [],
      option_groups: [],
      available: true,
    };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    menuService = TestBed.inject(MenuService);
  });

  it('setCatalogSearchText actualiza catalogSearchText', () => {
    expect(store.catalogSearchText()).toBe('');
    store.setCatalogSearchText('malta');
    expect(store.catalogSearchText()).toBe('malta');
  });

  it('sin texto de búsqueda devuelve catalogProducts() completo', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Cat', products: [product('p1', 'Malteada'), product('p2', 'Helado')] },
    ]);
    store.catalogCategoryId.set('c1');

    expect(store.catalogProductsFiltered().map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('filtra por nombre insensible a mayúsculas y acentos', () => {
    menuService.categories.set([
      {
        id: 'c1',
        name: 'Cat',
        products: [product('p1', 'Malteada de Café'), product('p2', 'Helado de vainilla')],
      },
    ]);
    store.catalogCategoryId.set('c1');

    store.setCatalogSearchText('CAFE');
    expect(store.catalogProductsFiltered().map((p) => p.id)).toEqual(['p1']);
  });

  it('combina categoría (ya existente) + búsqueda por nombre por intersección', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [product('p1', 'Malteada de fresa')] },
      { id: 'c2', name: 'Postres', products: [product('p2', 'Malteada de fresa (postre)')] },
    ]);
    store.catalogCategoryId.set('c1');
    store.setCatalogSearchText('fresa');

    expect(store.catalogProductsFiltered().map((p) => p.id)).toEqual(['p1']);
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    menuService.categories.set([{ id: 'c1', name: 'Cat', products: [product('p1', 'Malteada')] }]);
    store.catalogCategoryId.set('c1');

    store.setCatalogSearchText('xyz-no-existe');
    expect(store.catalogProductsFiltered()).toEqual([]);
  });
});

describe('normalizeSearchTerm', () => {
  it('ignora mayúsculas y acentos', () => {
    expect(normalizeSearchTerm('Café')).toBe(normalizeSearchTerm('cafe'));
    expect(normalizeSearchTerm('MALTEADA')).toBe('malteada');
  });

  it('recorta espacios en los extremos', () => {
    expect(normalizeSearchTerm('  helado  ')).toBe('helado');
  });
});

/**
 * Spec 049: cabecera + pestañas del nuevo panel de pedido. `showAllOrders`,
 * `ordersView` y `selectedTableStatusMeta` se prueban aquí directo sobre el
 * store, sin pasar por `selectTable()` (evita mockear `GET /table-sessions`
 * cuando no aporta nada a lo que se está probando) — mismo criterio que
 * `describe('PosTerminalStore — pestañas cuando coexisten...')` (spec 048).
 */
describe('PosTerminalStore — cabecera y pestañas del panel de pedido (spec 049)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('orderTabs() rotula "Pedido 1"/"Pedido 2" por posición, no por nombre de cliente', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1', customer_name: 'Ana' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1', customer_name: 'Luis' },
    ]);
    store.selectedTableId.set('t1');

    expect(store.orderTabs()).toEqual([
      { id: 'o1', label: 'Pedido 1' },
      { id: 'o2', label: 'Pedido 2' },
    ]);
  });

  it('ordersView() devuelve una tarjeta por pedido, con sus ítems y si le falta algo por preparar', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['listo']), channel: 'waiter', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    const cards = store.ordersView();
    expect(cards.length).toBe(2);
    expect(cards[0].order.id).toBe('o1');
    expect(cards[0].pending).toBe(false);
    expect(cards[0].items.length).toBe(1);
    expect(cards[1].order.id).toBe('o2');
    expect(cards[1].pending).toBe(true);
  });

  it('selectedTableStatusMeta() es null sin mesa seleccionada', () => {
    expect(store.selectedTableStatusMeta()).toBeNull();
  });

  it('marcarListo(orderId) opera sobre ese pedido aunque no sea el seleccionado', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    // Se corta con un error antes del reload (fuera de alcance de este test,
    // ver describe de marcarListo/gap spec 035 para ese flujo completo) — lo
    // único que interesa aquí es a qué pedido apuntó la petición (PATCH por
    // ítem, no "ready" — ver bugfix del botón "Marcar pedido listo", A-16).
    const promise = store.marcarListo('o2');
    http.expectOne(`${API}/orders/items/o2-i0/kitchen`).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await promise;

    http.verify();
  });

  it('avanzarItem busca la línea en cualquier pedido de la mesa, no solo en el seleccionado', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.orders.set([
      { ...order('o1', 'abierta', ['listo']), channel: 'waiter', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    const itemId = store.ordersView()[1].items[0].key;
    const promise = store.avanzarItem(itemId);
    http
      .expectOne(`${API}/orders/items/${itemId}/kitchen`)
      .flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await promise;

    http.verify();
  });

  it('voidPersistedCombo busca el pedido dueño del combo aunque no sea el seleccionado', async () => {
    const http = TestBed.inject(HttpTestingController);
    const confirm = TestBed.inject(ConfirmService);
    const conItemDeCombo: DiningOrder = {
      ...order('o2', 'abierta', []),
      channel: 'waiter',
      dining_table_id: 't1',
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente', combo_id: 'c1' },
      ] as DiningOrderItem[],
    };
    store.orders.set([
      { ...order('o1', 'abierta', ['listo']), channel: 'waiter', dining_table_id: 't1' },
      conItemDeCombo,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    const promise = store.voidPersistedCombo('c1');
    confirm.respond(true);
    await Promise.resolve();
    http.expectOne(`${API}/orders/items/i1/void`).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await promise;

    http.verify();
  });
});

/**
 * Bugfix reportado sobre spec 049: "Cuenta de la mesa" mostraba Subtotal y
 * Total en $0, sin fila de Descuento, cuando el único pedido de la mesa ya
 * estaba pagado (`bill.split` del backend excluye a propósito lo ya
 * cobrado — evita facturarlo dos veces al cerrar la sesión). Este bloque
 * cubre el resumen aparte de "Ya pagado" que se agrega para ese caso.
 */
describe('PosTerminalStore.selectedTablePaidSummary — "Ya pagado" (bugfix spec 049)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('null sin mesa seleccionada o sin ningún pedido pagado', () => {
    expect(store.selectedTablePaidSummary()).toBeNull();

    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'waiter', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    expect(store.selectedTablePaidSummary()).toBeNull();
  });

  it('selectTable() de una mesa con un pedido pagado precarga su venta real y la refleja en el resumen', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente'], true), channel: 'counter', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedTablePaidSummary()).toBeNull(); // aún sin cargar

    http
      .expectOne((r) => r.url === `${API}/invoices`)
      .flush([{ sale_id: 's1' }]);
    await tick();
    http
      .expectOne(`${API}/sales/s1`)
      .flush({ id: 's1', subtotal: '8000', discount: '1000', total: '7000' });
    await tick();

    expect(store.selectedTablePaidSummary()).toEqual({ subtotal: 8000, discount: 1000, total: 7000 });
  });

  it('no reintenta ni repite la búsqueda al volver a seleccionar la misma mesa', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente'], true), channel: 'counter', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    http.expectOne((r) => r.url === `${API}/invoices`).flush([{ sale_id: 's1' }]);
    await tick();
    http.expectOne(`${API}/sales/s1`).flush({ id: 's1', subtotal: '8000', discount: '0', total: '8000' });
    await tick();

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    // Sin una segunda petición a /invoices — ya se intentó para ese pedido.

    expect(store.selectedTablePaidSummary()).toEqual({ subtotal: 8000, discount: 0, total: 8000 });
  });
});
