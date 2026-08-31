import {
  discountInfo,
  effectivePrice,
  getPromoDisplay,
  inTimeWindow,
  isPromoActiveNow,
} from './promotion-pricing.util';
import { Promotion } from '../interfaces/promotion.interface';

/**
 * spec 063 — el util se redujo a vigencia local + insignia + elección de precio.
 * `bestProductDiscount` / `discountedUnitPrice` / `findOverlaps` se fueron
 * (A-58/A-59/A-60): el descuento y el bloqueo de solape los resuelve el backend.
 */
function promo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'p1',
    name: 'promo',
    description: null,
    type: 'percent',
    value: '10',
    status: 'active',
    starts_at: null,
    ends_at: null,
    days_of_week: null,
    start_time: null,
    end_time: null,
    min_qty: 1,
    closed_by_refactor_at: null,
    condition_text: '10% en estas 3 variantes',
    variants: [],
    ...overrides,
  };
}

describe('inTimeWindow', () => {
  it('ventana que cruza medianoche', () => {
    expect(inTimeWindow('23:00', '22:00', '02:00')).toBe(true);
    expect(inTimeWindow('01:00', '22:00', '02:00')).toBe(true);
    expect(inTimeWindow('15:00', '22:00', '02:00')).toBe(false);
  });
  it('sin ventana, siempre dentro', () => {
    expect(inTimeWindow('03:00', null, null)).toBe(true);
  });
});

describe('isPromoActiveNow', () => {
  const now = new Date('2026-08-05T13:00:00'); // miércoles

  it('solo estado active', () => {
    expect(isPromoActiveNow(promo({ status: 'draft' }), now)).toBe(false);
    expect(isPromoActiveNow(promo({ status: 'active' }), now)).toBe(true);
  });

  it('respeta días de la semana', () => {
    expect(isPromoActiveNow(promo({ days_of_week: '2' }), now)).toBe(true); // miércoles = 2
    expect(isPromoActiveNow(promo({ days_of_week: '0' }), now)).toBe(false);
  });
});

describe('getPromoDisplay', () => {
  const now = new Date('2026-08-05T13:00:00');

  it('draft / finished / live', () => {
    expect(getPromoDisplay(promo({ status: 'draft' }), now)).toBe('draft');
    expect(getPromoDisplay(promo({ status: 'finished' }), now)).toBe('finished');
    expect(getPromoDisplay(promo({ status: 'active' }), now)).toBe('live');
  });

  it('fuera de ventana horaria', () => {
    expect(getPromoDisplay(promo({ start_time: '20:00', end_time: '22:00' }), now)).toBe(
      'out_of_window',
    );
  });
});

describe('effectivePrice / discountInfo', () => {
  it('elige el precio con descuento si vino', () => {
    expect(effectivePrice(10000, 9000)).toBe(9000);
    expect(effectivePrice(10000, null)).toBe(10000);
  });

  it('discountInfo deriva el porcentaje', () => {
    expect(discountInfo(10000, 9000)?.percent).toBe(10);
    expect(discountInfo(10000, null)).toBeNull();
    expect(discountInfo(10000, 10000)).toBeNull();
  });
});
