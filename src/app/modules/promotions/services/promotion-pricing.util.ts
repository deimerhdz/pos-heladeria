import { Promotion, PromotionTarget } from '../interfaces/promotion.interface';

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

export interface DiscountInfo {
  original: number;
  discounted: number;
  percent: number;
  amountOff: number;
  kind: 'percent' | 'fixed' | null;
}

/**
 * Info de descuento para mostrar en UI (insignia % o monto fijo + precio
 * tachado) a partir de los dos números ya resueltos por el backend — igual
 * que `effectivePrice`, el cliente no tiene el `Promotion` original, así
 * que el porcentaje siempre se deriva comparando `price` contra
 * `discountedPrice`. `kind` es opcional (el backend puede no mandarlo
 * todavía) y solo decide cómo se pinta la insignia (% vs. monto fijo) —
 * cualquier valor que no sea exactamente `'fixed'` cae al caso porcentual
 * de siempre, para no romper contra un backend sin desplegar.
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
  return { original, discounted, percent, amountOff: original - discounted, kind: kind === 'fixed' ? 'fixed' : 'percent' };
}

export type PromoStatus = 'live' | 'paused' | 'scheduled' | 'expired' | 'off';

/**
 * Estado visible de una promoción para la lista de administración. A
 * diferencia de `isPromoActiveNow` (que solo dice si aplica ahora mismo),
 * distingue por qué no aplica: todavía no empieza, ya terminó, está
 * apagada, o está encendida pero fuera de su horario/días. Delega en
 * `isPromoActiveNow` para la parte de día/hora; solo añade las
 * comparaciones de fecha futura/pasada que esa función no expone.
 */
export function getPromoStatus(promo: Promotion, now: Date): PromoStatus {
  if (!promo.active) return 'off';
  if (promo.starts_at && now < new Date(promo.starts_at)) return 'scheduled';
  if (promo.ends_at && now > new Date(promo.ends_at)) return 'expired';
  return isPromoActiveNow(promo, now) ? 'live' : 'paused';
}

export interface PromoScope {
  all: boolean;
  categoryIds: Set<string>;
  productIds: Set<string>;
}

/** Alcance de una promoción de tipo `percent`/`fixed` a partir de sus `targets`. */
export function scopeOf(promo: Promotion): PromoScope {
  const targets: PromotionTarget[] = promo.targets ?? [];
  return {
    all: targets.length === 0,
    categoryIds: new Set(targets.map((t) => t.category_id).filter((id): id is string => !!id)),
    productIds: new Set(targets.map((t) => t.product_id).filter((id): id is string => !!id)),
  };
}

/**
 * Si dos alcances pueden aplicar sobre el mismo producto en algún momento:
 * "toda la venta" se cruza con cualquier cosa, categorías/productos se
 * cruzan si comparten un id directo o si un producto de un lado cae en una
 * categoría del otro lado.
 */
export function scopesOverlap(
  a: PromoScope,
  b: PromoScope,
  categoryOfProduct: Map<string, string | null>,
): boolean {
  if (a.all || b.all) return true;
  for (const id of a.categoryIds) if (b.categoryIds.has(id)) return true;
  for (const id of a.productIds) if (b.productIds.has(id)) return true;
  for (const id of a.productIds) {
    const cat = categoryOfProduct.get(id);
    if (cat && b.categoryIds.has(cat)) return true;
  }
  for (const id of b.productIds) {
    const cat = categoryOfProduct.get(id);
    if (cat && a.categoryIds.has(cat)) return true;
  }
  return false;
}

/**
 * Primera promoción activa (live o paused, sin contar combos) cuyo alcance
 * se cruza con `target`. Se usa para avisar que solo se aplicará el
 * descuento mayor entre las dos.
 */
export function findOverlap(
  target: PromoScope,
  candidates: Promotion[],
  now: Date,
  categoryOfProduct: Map<string, string | null>,
): Promotion | null {
  for (const promo of candidates) {
    if (promo.type === 'combo') continue;
    const status = getPromoStatus(promo, now);
    if (status !== 'live' && status !== 'paused') continue;
    if (scopesOverlap(target, scopeOf(promo), categoryOfProduct)) return promo;
  }
  return null;
}
