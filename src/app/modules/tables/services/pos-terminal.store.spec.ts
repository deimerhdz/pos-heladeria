import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosTerminalStore, currentNow, deriveTableStatus, newPendingIds } from './pos-terminal.store';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { Promotion } from '../../promotions/interfaces/promotion.interface';
import { discountedUnitPrice } from '../../promotions/services/promotion-pricing.util';
import { PromotionService } from '../../promotions/services/promotion.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { Sale } from '../../sales/interfaces/sales.interface';

const API = environment.apiBaseUrl;

function order(
  id: string,
  status: DiningOrder['status'],
  cocina: DiningOrderItem['estado_cocina'][] = [],
): DiningOrder {
  return {
    id,
    channel: 'qr',
    status,
    created_at: '2026-07-29T12:00:00',
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
    expect(deriveTableStatus([order('o1', 'abierta', ['listo', 'listo'])], 'ocupada')).toBe(
      'listo',
    );
  });

  it('ignora los ítems anulados al mirar la preparación', () => {
    expect(deriveTableStatus([order('o1', 'abierta', ['anulado'])], 'ocupada')).toBe('ocupada');
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
