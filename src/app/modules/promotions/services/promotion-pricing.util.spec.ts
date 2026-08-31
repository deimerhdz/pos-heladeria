import { Promotion } from '../interfaces/promotion.interface';
import {
  bestProductDiscount,
  findOverlaps,
  getPromoDisplay,
  inTimeWindow,
  isPromoActiveNow,
  scopeOf,
} from './promotion-pricing.util';

/**
 * Estas pruebas fijan el contrato que el frontend replica del backend
 * (`pos-backend/app/api/v1/promotions/service.py`). Si el motor de allá cambia,
 * estas son las que deben fallar primero.
 */
function promo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Promo',
    description: null,
    type: 'percent',
    value: '10',
    status: 'active',
    priority: 0,
    starts_at: null,
    ends_at: null,
    days_of_week: null,
    start_time: null,
    end_time: null,
    min_qty: 1,
    targets: [],
    combo_items: [],
    presentation_rules: [],
    ...overrides,
  };
}

/** Un `Date` local en el día/hora indicados (2026-08-10 es lunes). */
function at(day: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 7, day, h, m, 0);
}

describe('inTimeWindow', () => {
  it('acepta una ventana normal', () => {
    expect(inTimeWindow('18:00', '17:00', '19:00')).toBe(true);
    expect(inTimeWindow('20:00', '17:00', '19:00')).toBe(false);
  });

  it('soporta el cruce de medianoche', () => {
    // 22:00–02:00 era insatisfacible con la cadena AND anterior: la promoción
    // se listaba activa y descontaba cero para siempre.
    expect(inTimeWindow('23:30', '22:00', '02:00')).toBe(true);
    expect(inTimeWindow('01:00', '22:00', '02:00')).toBe(true);
    expect(inTimeWindow('12:00', '22:00', '02:00')).toBe(false);
  });

  it('sin ventana, siempre aplica', () => {
    expect(inTimeWindow('03:00', null, null)).toBe(true);
  });
});

describe('isPromoActiveNow', () => {
  it('exige status active: un borrador nunca descuenta', () => {
    expect(isPromoActiveNow(promo({ status: 'draft' }), at(10, '12:00'))).toBe(false);
    expect(isPromoActiveNow(promo({ status: 'paused' }), at(10, '12:00'))).toBe(false);
    expect(isPromoActiveNow(promo({ status: 'active' }), at(10, '12:00'))).toBe(true);
  });

  it('cubre el día completo de ends_at', () => {
    const p = promo({ ends_at: '2026-08-10T00:00:00' });
    expect(isPromoActiveNow(p, at(10, '23:00'))).toBe(true);
    expect(isPromoActiveNow(p, at(11, '00:30'))).toBe(false);
  });

  it('filtra por día de la semana con 0=lunes', () => {
    const martes = promo({ days_of_week: '1' });
    expect(isPromoActiveNow(martes, at(10, '12:00'))).toBe(false); // lunes
    expect(isPromoActiveNow(martes, at(11, '12:00'))).toBe(true); // martes
  });
});

describe('bestProductDiscount', () => {
  it('gana la de mayor prioridad, no la de mayor descuento', () => {
    const grande = promo({ id: 'grande', value: '50', priority: 0 });
    const prioritaria = promo({ id: 'prioritaria', value: '10', priority: 50 });

    const match = bestProductDiscount([grande, prioritaria], at(10, '12:00'), 'prod', 'cat', 1000, 1);

    expect(match?.promo.id).toBe('prioritaria');
  });

  it('a igual prioridad, desempata el descuento mayor', () => {
    const chica = promo({ id: 'chica', value: '10' });
    const grande = promo({ id: 'grande', value: '30' });

    const match = bestProductDiscount([chica, grande], at(10, '12:00'), 'prod', 'cat', 1000, 1);

    expect(match?.promo.id).toBe('grande');
  });

  it('qty_price descuenta solo paquetes completos y deja el remanente a precio normal', () => {
    // 3 unidades por $10.000, con precio unitario $5.000. El precio vive en el
    // destino: la promoción ya no tiene paquete propio.
    const pack = promo({
      type: 'qty_price',
      targets: [{ product_id: 'prod', category_id: null, value: '10000', min_qty: 3 }],
    });

    // 7 unidades = 2 paquetes (6 uds) + 1 suelta.
    const match = bestProductDiscount([pack], at(10, '12:00'), 'prod', 'cat', 5000, 7);

    // Normal de lo cubierto: 5000*3*2 = 30.000; paquetes: 10.000*2 = 20.000.
    expect(match?.amount).toBe(10000);
  });

  it('qty_price no aplica por debajo del tamaño del paquete', () => {
    const pack = promo({
      type: 'qty_price',
      targets: [{ product_id: 'prod', category_id: null, value: '10000', min_qty: 3 }],
    });
    expect(bestProductDiscount([pack], at(10, '12:00'), 'prod', 'cat', 5000, 2)).toBeNull();
  });

  it('ignora los combos: se seleccionan explícitamente al vender', () => {
    const combo = promo({ type: 'combo', value: '15000' });
    expect(bestProductDiscount([combo], at(10, '12:00'), 'prod', 'cat', 20000, 1)).toBeNull();
  });

  it('respeta los targets', () => {
    const soloOtro = promo({ targets: [{ product_id: 'otro', category_id: null, value: null, min_qty: null }] });
    expect(bestProductDiscount([soloOtro], at(10, '12:00'), 'prod', 'cat', 1000, 1)).toBeNull();

    const suCategoria = promo({ targets: [{ product_id: null, category_id: 'cat', value: null, min_qty: null }] });
    expect(bestProductDiscount([suCategoria], at(10, '12:00'), 'prod', 'cat', 1000, 1)).not.toBeNull();
  });
});


describe('precio de paquete por destino', () => {
  // Replica del caso real: categoría a 2x$10.000 y la Grande a 2x$12.000.
  const conOverride = promo({
    type: 'qty_price',
    value: '10000',
    min_qty: 2,
    targets: [
      { product_id: null, category_id: 'cat', value: '10000', min_qty: 2 },
      { product_id: 'grande', category_id: null, value: '12000', min_qty: 2 },
    ],
  });

  it('el destino de producto gana al de su categoría', () => {
    // Grande: 2 x 16.000 = 32.000, paquete propio a 12.000 -> 20.000.
    const m = bestProductDiscount([conOverride], at(10, '12:00'), 'grande', 'cat', 16000, 2);
    expect(m?.amount).toBe(20000);
  });

  it('un producto sin fila propia usa el precio de su categoría', () => {
    // Pequeña: 2 x 9.000 = 18.000, con el 10.000 de la categoría -> 8.000.
    const m = bestProductDiscount([conOverride], at(10, '12:00'), 'pequena', 'cat', 9000, 2);
    expect(m?.amount).toBe(8000);
  });

  it('un destino sin precio no descuenta, nunca la línea entera', () => {
    // El fallo seguro: `value` de la promoción es inerte en qty_price, así que
    // caer a él descontaría el 100 %.
    const sinPrecio = promo({
      type: 'qty_price',
      value: '0',
      targets: [{ product_id: 'prod', category_id: null, value: null, min_qty: null }],
    });
    expect(bestProductDiscount([sinPrecio], at(10, '12:00'), 'prod', 'cat', 5000, 4)).toBeNull();

    // Y un paquete global, sin destinos, tampoco.
    const global = promo({ type: 'qty_price', value: '0', min_qty: 2, targets: [] });
    expect(bestProductDiscount([global], at(10, '12:00'), 'prod', 'cat', 5000, 4)).toBeNull();
  });

  it('el destino también manda en el tamaño del paquete', () => {
    const tresPorVeinte = promo({
      type: 'qty_price',
      value: '10000',
      min_qty: 2,
      targets: [{ product_id: 'pequena', category_id: null, value: '20000', min_qty: 3 }],
    });
    // 2 unidades ya no arman el paquete de 3.
    expect(bestProductDiscount([tresPorVeinte], at(10, '12:00'), 'pequena', 'cat', 9000, 2)).toBeNull();
    // 4 = un paquete de 3 (27.000 -> 20.000) y una suelta.
    const m = bestProductDiscount([tresPorVeinte], at(10, '12:00'), 'pequena', 'cat', 9000, 4);
    expect(m?.amount).toBe(7000);
  });
});

describe('getPromoDisplay', () => {
  it('distingue activa-pero-fuera-de-horario de activa-aplicando', () => {
    const happyHour = promo({ start_time: '17:00', end_time: '19:00' });
    expect(getPromoDisplay(happyHour, at(10, '18:00'))).toBe('live');
    expect(getPromoDisplay(happyHour, at(10, '12:00'))).toBe('out_of_window');
  });

  it('el estado persistido manda sobre la vigencia', () => {
    expect(getPromoDisplay(promo({ status: 'draft' }), at(10, '12:00'))).toBe('draft');
    expect(getPromoDisplay(promo({ status: 'paused' }), at(10, '12:00'))).toBe('paused');
    expect(getPromoDisplay(promo({ status: 'finished' }), at(10, '12:00'))).toBe('finished');
  });

  it('marca programada y vencida', () => {
    expect(getPromoDisplay(promo({ starts_at: '2026-09-01T00:00:00' }), at(10, '12:00'))).toBe(
      'scheduled',
    );
    expect(getPromoDisplay(promo({ ends_at: '2026-08-01T00:00:00' }), at(10, '12:00'))).toBe(
      'expired',
    );
  });
});

describe('findOverlaps', () => {
  const catMap = new Map<string, string | null>([['prodA', 'catA']]);

  function target(p: Promotion) {
    return { ...p, scope: scopeOf(p) };
  }

  it('una promoción global choca con cualquier alcance', () => {
    const global = promo({ id: 'global' });
    const puntual = promo({ id: 'puntual', targets: [{ product_id: 'prodA', category_id: null, value: null, min_qty: null }] });

    expect(findOverlaps(target(global), [puntual], catMap).map((p) => p.id)).toEqual(['puntual']);
  });

  it('un producto choca con la categoría que lo contiene', () => {
    const porProducto = promo({ id: 'a', targets: [{ product_id: 'prodA', category_id: null, value: null, min_qty: null }] });
    const porCategoria = promo({ id: 'b', targets: [{ product_id: null, category_id: 'catA', value: null, min_qty: null }] });

    expect(findOverlaps(target(porProducto), [porCategoria], catMap)).toHaveLength(1);
  });

  it('rangos de fecha disjuntos no se solapan', () => {
    const agosto = promo({ id: 'a', starts_at: '2026-08-01', ends_at: '2026-08-31' });
    const octubre = promo({ id: 'b', starts_at: '2026-10-01', ends_at: '2026-10-31' });

    expect(findOverlaps(target(agosto), [octubre], catMap)).toHaveLength(0);
  });

  it('días de semana disjuntos no se solapan, pero un CSV nulo no restringe', () => {
    const lunes = promo({ id: 'a', days_of_week: '0' });
    const martes = promo({ id: 'b', days_of_week: '1' });
    const todos = promo({ id: 'c', days_of_week: null });

    expect(findOverlaps(target(lunes), [martes], catMap)).toHaveLength(0);
    expect(findOverlaps(target(lunes), [todos], catMap)).toHaveLength(1);
  });

  it('ignora combos y finalizadas', () => {
    const base = promo({ id: 'a' });
    const combo = promo({ id: 'combo', type: 'combo' });
    const finalizada = promo({ id: 'fin', status: 'finished' });

    expect(findOverlaps(target(base), [combo, finalizada], catMap)).toHaveLength(0);
  });
});
