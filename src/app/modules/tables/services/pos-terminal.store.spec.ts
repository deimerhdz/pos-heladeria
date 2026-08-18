import { currentNow, deriveTableStatus, newPendingIds } from './pos-terminal.store';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { Promotion } from '../../promotions/interfaces/promotion.interface';
import { discountedUnitPrice } from '../../promotions/services/promotion-pricing.util';

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
