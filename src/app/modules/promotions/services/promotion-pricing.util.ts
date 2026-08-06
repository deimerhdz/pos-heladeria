import { Promotion } from '../interfaces/promotion.interface';

/**
 * Réplica de `_valid_now()` del backend (`promotions/service.py`): decide si
 * una promoción está vigente en este instante (rango de fechas, día de
 * semana/mes, franja horaria). El cálculo real del descuento lo sigue
 * haciendo el backend; esto solo decide elegibilidad en el cliente.
 */
export function isPromoActiveNow(promo: Promotion, now: Date): boolean {
  if (!promo.active) return false;
  if (promo.starts_at && now < new Date(promo.starts_at)) return false;
  if (promo.ends_at && now > new Date(promo.ends_at)) return false;
  if (promo.days_of_week) {
    const allowed = promo.days_of_week.split(',').map((d) => d.trim());
    const weekday = (now.getDay() + 6) % 7; // JS 0=domingo..6=sábado → 0=lunes..6=domingo
    if (!allowed.includes(String(weekday))) return false;
  }
  if (promo.days_of_month) {
    const allowed = promo.days_of_month.split(',').map((d) => d.trim());
    if (!allowed.includes(String(now.getDate()))) return false;
  }
  const hhmm = now.toTimeString().slice(0, 5);
  if (promo.start_time && hhmm < promo.start_time.slice(0, 5)) return false;
  if (promo.end_time && hhmm > promo.end_time.slice(0, 5)) return false;
  return true;
}

export interface ProductDiscountMatch {
  promo: Promotion;
  amount: number;
}

/**
 * Mejor descuento `percent`/`fixed` vigente para un producto/categoría a un
 * precio base dado, o `null` si ninguna promoción aplica.
 *
 * `quantity` se omite (equivale a "sin mínimo") por defecto: sirve para
 * previsualizar antes de saber cuánto se va a pedir (p. ej. la insignia del
 * catálogo). Los llamadores que ya conocen la cantidad de la línea deben
 * pasarla para respetar `min_qty`.
 */
export function bestProductDiscount(
  promotions: Promotion[],
  now: Date,
  productId: string | undefined,
  categoryId: string | undefined,
  price: number,
  quantity: number = Infinity,
): ProductDiscountMatch | null {
  let best: ProductDiscountMatch | null = null;
  for (const promo of promotions) {
    if (promo.type !== 'percent' && promo.type !== 'fixed') continue;
    if (quantity < promo.min_qty) continue;
    if (!isPromoActiveNow(promo, now)) continue;
    const matches =
      promo.targets.length === 0 ||
      promo.targets.some((t) => t.product_id === productId || t.category_id === categoryId);
    if (!matches) continue;
    const amount =
      promo.type === 'percent' ? (price * Number(promo.value)) / 100 : Math.min(Number(promo.value), price);
    if (amount > 0 && (!best || amount > best.amount)) best = { promo, amount };
  }
  return best;
}

/** Precio final de una unidad tras aplicar el mejor descuento vigente (o el mismo precio si no hay). */
export function discountedUnitPrice(
  promotions: Promotion[],
  now: Date,
  productId: string | undefined,
  categoryId: string | undefined,
  price: number,
  quantity: number = Infinity,
): number {
  const match = bestProductDiscount(promotions, now, productId, categoryId, price, quantity);
  return match ? Math.max(0, price - match.amount) : price;
}

/**
 * Precio a mostrar cuando el descuento ya lo resolvió el backend (menú público
 * y carrito del comensal): el precio con descuento si vino, o el normal si no.
 * A diferencia de `discountedUnitPrice`, aquí el cliente no tiene los datos de
 * `Promotion` para calcularlo — solo decide cuál de los dos números pintar.
 */
export function effectivePrice(
  price: string | number,
  discountedPrice: string | number | null | undefined,
): number {
  return Number(discountedPrice ?? price);
}
