import {
  AUTO_TYPES,
  Promotion,
  PromotionTarget,
} from '../interfaces/promotion.interface';

/**
 * Ventana horaria con soporte para cruce de medianoche — port de
 * `_in_time_window()` (`promotions/service.py`). Una ventana `22:00`-`02:00`
 * era insatisfacible con la cadena AND de antes: exigía hora >= 22:00 **y**
 * hora <= 02:00 a la vez, así que la promoción se listaba activa y descontaba
 * cero para siempre.
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
 * Réplica de `_valid_now()` del backend (`promotions/service.py`): decide si
 * una promoción está vigente en este instante (estado, rango de fechas, día de
 * semana/mes, franja horaria). El cálculo real del descuento lo sigue haciendo
 * el backend; esto solo decide elegibilidad en el cliente.
 */
export function isPromoActiveNow(promo: Promotion, now: Date): boolean {
  if (promo.status !== 'active') return false;
  if (promo.starts_at && now < new Date(promo.starts_at)) return false;
  // `ends_at` llega como medianoche del día elegido en el selector "Hasta": se
  // compara por fecha para que "hasta el 04/08" cubra el 04/08 completo.
  if (promo.ends_at && dateKey(now) > promo.ends_at.slice(0, 10)) return false;
  if (promo.days_of_week) {
    const allowed = promo.days_of_week.split(',').map((d) => d.trim());
    const weekday = (now.getDay() + 6) % 7; // JS 0=domingo..6=sábado → 0=lunes..6=domingo
    if (!allowed.includes(String(weekday))) return false;
  }
  const hhmm = now.toTimeString().slice(0, 5);
  return inTimeWindow(hhmm, promo.start_time?.slice(0, 5) ?? null, promo.end_time?.slice(0, 5) ?? null);
}

export interface ProductDiscountMatch {
  promo: Promotion;
  amount: number;
}

/**
 * Destino que gobierna esta línea — port de `_matching_target()`. **El de
 * producto gana al de su categoría**, porque es el que lleva el precio propio
 * del paquete. Sin targets, la promoción es global y no hay destino.
 */
function matchingTarget(
  promo: Promotion,
  productId?: string,
  categoryId?: string,
): { applies: boolean; target: PromotionTarget | null } {
  if (promo.targets.length === 0) return { applies: true, target: null };

  let porCategoria: PromotionTarget | null = null;
  for (const t of promo.targets) {
    if (t.product_id && t.product_id === productId) return { applies: true, target: t };
    if (t.category_id && t.category_id === categoryId) porCategoria = t;
  }
  return porCategoria ? { applies: true, target: porCategoria } : { applies: false, target: null };
}

/**
 * Tamaño y precio del paquete — port de `_pack_terms()`. Viven **solo en el
 * destino**: `null` significa "sin definir", no "hereda". Sin términos no hay
 * descuento, igual que en el backend, para que la insignia del POS no prometa
 * lo que el cobro no va a aplicar.
 */
function packTerms(_promo: Promotion, target: PromotionTarget | null): [number, number] | null {
  if (!target || target.value == null || target.min_qty == null) return null;
  return [target.min_qty, Number(target.value)];
}

/**
 * Descuento que aplicaría una promoción sobre una línea — port de
 * `_line_discount()`.
 *
 * `qty_price` descuenta solo paquetes completos: el remanente se cobra a precio
 * normal, igual que los combos, para que una anulación parcial degrade suave.
 * El paquete sale del destino; un destino sin términos no descuenta.
 */
function lineDiscount(
  promo: Promotion,
  target: PromotionTarget | null,
  lineTotal: number,
  quantity: number,
  unitPrice: number,
): number {
  const value = Number(promo.value);
  if (promo.type === 'percent') return (lineTotal * value) / 100;
  if (promo.type === 'fixed') return Math.min(value, lineTotal);
  if (promo.type === 'qty_price') {
    if (!Number.isFinite(quantity)) return 0;
    const terms = packTerms(promo, target);
    if (terms === null) return 0;
    const [pack, price] = terms;
    const packs = Math.floor(quantity / pack);
    if (packs <= 0) return 0;
    const normal = unitPrice * pack * packs;
    return Math.max(0, normal - price * packs);
  }
  return 0;
}

/**
 * Mejor promoción automática vigente para un producto/categoría a un precio
 * base dado, o `null` si ninguna aplica. Port de `best_line_discount()`: gana
 * la de mayor `priority`, se desempata por descuento mayor. (El tercer
 * desempate del backend es `created_at`, que la lista no expone.)
 *
 * `quantity` se omite (equivale a "sin mínimo") por defecto: sirve para
 * previsualizar antes de saber cuánto se va a pedir (p. ej. la insignia del
 * catálogo). Los llamadores que ya conocen la cantidad de la línea deben
 * pasarla para respetar `min_qty`. Nota: con `quantity` infinita un
 * `qty_price` no puede cuantificarse y queda fuera de la previsualización.
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
  let bestKey: [number, number] | null = null;

  for (const promo of promotions) {
    if (!AUTO_TYPES.includes(promo.type)) continue;
    if (!isPromoActiveNow(promo, now)) continue;

    const { applies, target } = matchingTarget(promo, productId, categoryId);
    if (!applies) continue;
    // El mínimo sale del destino; sin términos, la promoción no descuenta.
    let minimo = promo.min_qty;
    if (promo.type === 'qty_price') {
      const terms = packTerms(promo, target);
      if (terms === null) continue;
      minimo = terms[0];
    }
    if (quantity < minimo) continue;

    const units = Number.isFinite(quantity) ? quantity : 1;
    const amount = lineDiscount(promo, target, price * units, quantity, price);
    if (amount <= 0) continue;

    const key: [number, number] = [promo.priority, amount];
    if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
      bestKey = key;
      best = { promo, amount };
    }
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
  if (!match) return price;
  const units = Number.isFinite(quantity) ? quantity : 1;
  return Math.max(0, price - match.amount / units);
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

/**
 * Estado que se muestra en la lista de administración. Separa el estado
 * *persistido* (`status`, lo que decide el backend) del *derivado de la
 * vigencia*: una promoción puede estar `active` y aun así no descontar porque
 * todavía no empieza, ya venció, o es martes a las 3 y solo aplica de 5 a 7.
 * Esa distinción es la que evita el reporte "la promo está activa pero no
 * descuenta".
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

export interface PromoScope {
  all: boolean;
  categoryIds: Set<string>;
  productIds: Set<string>;
}

/** Alcance de una promoción automática a partir de sus `targets`. */
export function scopeOf(promo: Promotion): PromoScope {
  const targets: PromotionTarget[] = promo.targets ?? [];
  return {
    all: targets.length === 0,
    categoryIds: new Set(targets.map((t) => t.category_id).filter((id): id is string => !!id)),
    productIds: new Set(targets.map((t) => t.product_id).filter((id): id is string => !!id)),
  };
}

/**
 * Si dos alcances pueden aplicar sobre el mismo producto en algún momento —
 * port de `_scope_overlap()`: "toda la venta" se cruza con cualquier cosa,
 * categorías/productos se cruzan si comparten un id directo o si un producto
 * de un lado cae en una categoría del otro lado.
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

/** Vigencia de una promoción, en la forma que necesitan las comparaciones de solapamiento. */
export interface OverlapWindow {
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}

/** Port de `_ranges_overlap()`: sin fechas, se solapan. */
function rangesOverlap(a: OverlapWindow, b: OverlapWindow): boolean {
  if (a.starts_at && b.ends_at && a.starts_at.slice(0, 10) > b.ends_at.slice(0, 10)) return false;
  if (b.starts_at && a.ends_at && b.starts_at.slice(0, 10) > a.ends_at.slice(0, 10)) return false;
  return true;
}

/** Port de `_csv_overlap()`: un CSV nulo no restringe, así que se solapa con todo. */
function csvOverlap(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const setB = new Set(b.split(',').map((x) => x.trim()));
  return a.split(',').some((x) => setB.has(x.trim()));
}

/** Port de `_times_overlap()`. */
function timesOverlap(a: OverlapWindow, b: OverlapWindow): boolean {
  if (!a.start_time || !b.start_time) return true;
  const aStart = a.start_time.slice(0, 5);
  const bStart = b.start_time.slice(0, 5);
  const aEnd = a.end_time?.slice(0, 5) ?? null;
  const bEnd = b.end_time?.slice(0, 5) ?? null;
  return inTimeWindow(aStart, bStart, bEnd) || inTimeWindow(bStart, aStart, aEnd);
}

/**
 * Promociones que pueden competir por la misma línea — port de
 * `find_overlaps()` (`promotions/service.py`), para que el aviso de la tabla
 * diga lo mismo que el panel `overlaps` que el backend devuelve al guardar.
 *
 * **Advierte, no bloquea.** Un bloqueo duro haría imposibles los propios casos
 * de uso del negocio: "10% en todos los granizados" y "20% los martes" se
 * solapan los martes sobre los granizados. Para eso existe `priority`.
 */
export function findOverlaps(
  target: OverlapWindow & { scope: PromoScope },
  candidates: Promotion[],
  categoryOfProduct: Map<string, string | null>,
): Promotion[] {
  return candidates.filter(
    (c) =>
      AUTO_TYPES.includes(c.type) &&
      c.status !== 'finished' &&
      rangesOverlap(target, c) &&
      csvOverlap(target.days_of_week, c.days_of_week) &&
      timesOverlap(target, c) &&
      scopesOverlap(target.scope, scopeOf(c), categoryOfProduct),
  );
}
