import { Promotion } from '../interfaces/promotion.interface';

/**
 * spec 063 — modelo por conjunto explícito de variantes. Este util se reduce a:
 *  - vigencia local (`inTimeWindow` / `isPromoActiveNow`) — port de `_valid_now`;
 *  - `getPromoDisplay` (insignia de la lista de administración);
 *  - `effectivePrice` / `discountInfo` — elegir cuál de los dos números que ya
 *    resolvió el backend pintar.
 *
 * Se van: `bestProductDiscount` / `discountedUnitPrice` (cálculo local por
 * targets, A-58/A-60) y `findOverlaps` (el solape real lo bloquea el backend con
 * 409, ya no hay panel de advertencia, A-59). El descuento efectivo de la
 * terminal viene del **preview del cobro** del backend, no de un cálculo local
 * (FR-023, research.md D10).
 */
export function inTimeWindow(current: string, start: string | null, end: string | null): boolean {
  if (!start && !end) return true;
  if (!start) return current <= end!;
  if (!end) return current >= start;
  if (start <= end) return start <= current && current <= end;
  return current >= start || current <= end;
}

/** `YYYY-MM-DD` de un `Date` en hora local. */
function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Réplica de `_valid_now()` del backend: decide si una promoción está vigente en
 * este instante (estado, rango de fechas, día de semana, franja horaria). El
 * cálculo real del descuento lo hace el backend.
 */
export function isPromoActiveNow(promo: Promotion, now: Date): boolean {
  if (promo.status !== 'active') return false;
  if (promo.starts_at && now < new Date(promo.starts_at)) return false;
  if (promo.ends_at && dateKey(now) > promo.ends_at.slice(0, 10)) return false;
  if (promo.days_of_week) {
    const allowed = promo.days_of_week.split(',').map((d) => d.trim());
    const weekday = (now.getDay() + 6) % 7; // JS 0=domingo..6=sábado → 0=lunes..6=domingo
    if (!allowed.includes(String(weekday))) return false;
  }
  const hhmm = now.toTimeString().slice(0, 5);
  return inTimeWindow(hhmm, promo.start_time?.slice(0, 5) ?? null, promo.end_time?.slice(0, 5) ?? null);
}

/**
 * Precio a mostrar cuando el descuento ya lo resolvió el backend (menú público,
 * carrito del comensal, terminal): el precio con descuento si vino, o el normal
 * si no.
 */
export function effectivePrice(
  price: string | number,
  discountedPrice: string | number | null | undefined,
): number {
  return Number(discountedPrice ?? price);
}

export interface DiscountInfo {
  original: number;
  discounted: number;
  percent: number;
  amountOff: number;
  kind: 'percent' | 'fixed' | null;
}

/**
 * Info de descuento para la insignia de UI (% + precio tachado) a partir de los
 * dos números que resolvió el backend.
 */
export function discountInfo(
  price: number,
  discountedPrice: number | null | undefined,
  kind?: string | null,
): DiscountInfo | null {
  if (discountedPrice == null) return null;
  const original = Number(price);
  const discounted = Number(discountedPrice);
  if (original <= 0 || discounted >= original) return null;
  const percent = Math.round((1 - discounted / original) * 100);
  if (percent <= 0) return null;
  return {
    original,
    discounted,
    percent,
    amountOff: original - discounted,
    kind: kind === 'fixed' ? 'fixed' : 'percent',
  };
}

/**
 * Estado que se muestra en la lista de administración. Separa el `status`
 * persistido de la vigencia derivada: una promoción `active` puede no descontar
 * porque todavía no empieza, ya venció, o está fuera de su franja.
 */
export type PromoDisplay =
  | 'draft'
  | 'live'
  | 'out_of_window'
  | 'scheduled'
  | 'expired'
  | 'paused'
  | 'finished';

export function getPromoDisplay(promo: Promotion, now: Date): PromoDisplay {
  if (promo.status === 'draft') return 'draft';
  if (promo.status === 'paused') return 'paused';
  if (promo.status === 'finished') return 'finished';
  if (promo.starts_at && now < new Date(promo.starts_at)) return 'scheduled';
  if (promo.ends_at && dateKey(now) > promo.ends_at.slice(0, 10)) return 'expired';
  return isPromoActiveNow(promo, now) ? 'live' : 'out_of_window';
}
