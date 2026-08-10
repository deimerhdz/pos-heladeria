/**
 * `buy_x_get_y` salió del dominio en el backend: mientras `_line_discount` le
 * devolviera 0, ser configurable solo servía para crear un "2x1" que no
 * descuenta (ver `models/promotion.py`).
 *
 * - `percent`: `value` = % de descuento (0..100) sobre el total de la línea.
 * - `fixed`: `value` = monto fijo de descuento por línea aplicable.
 * - `qty_price`: `min_qty` = unidades del paquete, `value` = precio total de ese
 *   paquete. Descuenta solo paquetes completos; el remanente va a precio normal.
 * - `combo`: `value` = precio del bundle, componentes en `combo_items`. Se
 *   selecciona explícitamente al vender; no participa del motor automático.
 */
export type PromotionType = 'percent' | 'fixed' | 'combo' | 'qty_price';

/**
 * Máquina de estados del backend (`PROMOTION_TRANSITIONS`). `draft` es el único
 * estado en el que se pueden cambiar `type`, `targets` y `combo_items`: una vez
 * activada, la promoción ya pudo explicar el descuento de una venta y
 * reescribir su forma reescribiría esa historia. `finished` es terminal.
 */
export type PromotionStatus = 'draft' | 'active' | 'paused' | 'finished';

export const PROMOTION_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  draft: ['active', 'finished'],
  active: ['paused', 'finished'],
  paused: ['active', 'finished'],
  finished: [],
};

/** Tipos que participan del motor automático (`AUTO_TYPES` del backend). */
export const AUTO_TYPES: PromotionType[] = ['percent', 'fixed', 'qty_price'];

/**
 * Destino de una promoción. `value` y `min_qty` son el precio y el tamaño de
 * paquete **de este destino**, y solo aplican a `qty_price`: en `null`, hereda
 * los de la promoción. Es lo que permite «2 Ensaladas Grandes por $12.000» y
 * «2 Pequeñas por $8.000» dentro de la misma promoción.
 *
 * Si una línea casa con un target de producto y con el de su categoría, **gana
 * el de producto** (regla de `_matching_target` en el backend).
 */
export interface PromotionTarget {
  product_id: string | null;
  category_id: string | null;
  /** Decimal: el backend lo serializa como string (`"12000.00"`) igual que
   *  `Promotion.value`, pero acepta un número al escribir. */
  value: string | number | null;
  min_qty: number | null;
}

/** Un destino tal como lo maneja el formulario: el id más su precio propio. */
export interface ScopeTarget {
  id: string;
  value: number | null;
  min_qty: number | null;
}

/** `true` si el destino define su propio paquete en vez de heredarlo. */
export function hasOwnPricing(t: ScopeTarget): boolean {
  return t.value != null || t.min_qty != null;
}

/** Componente de un combo: variante requerida + cantidad por unidad de combo. */
export interface ComboItem {
  product_variant_id: string;
  quantity: number;
}

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  value: string;
  status: PromotionStatus;
  /** Resuelve el conflicto cuando varias promociones aplican a la misma línea:
   *  mayor gana, empate por descuento mayor y luego por antigüedad. 0..1000. */
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  targets: PromotionTarget[];
  combo_items: ComboItem[];
}

/** Promoción que puede competir con esta sobre el mismo producto. */
export interface PromotionOverlap {
  id: string;
  name: string;
  priority: number;
}

/**
 * Respuesta de create/update/shape: la promoción más la **advertencia** de con
 * quién compite. No es un bloqueo — quien decide es `priority`.
 */
export interface PromotionWithOverlaps extends Promotion {
  overlaps: PromotionOverlap[];
}

/** Modelo del formulario (UI). */
export interface PromotionForm {
  name: string;
  description: string;
  type: PromotionType;
  value: number;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: number[]; // 0=lunes..6=domingo
  start_time: string | null;
  end_time: string | null;
  /**
   * Tamaño del paquete en `qty_price` (≥2); cantidad mínima en el resto. Es el
   * **defecto**: un destino con su propio `min_qty` lo pisa.
   */
  min_qty: number;
  categoryTargets: ScopeTarget[];
  productTargets: ScopeTarget[];
  /** Solo aplica cuando `type === 'combo'`; requiere ≥2 variantes distintas. */
  comboItems: ComboItem[];
}

/** Campos escalares comunes a create y update. */
interface PromotionScalars {
  name: string;
  description: string | null;
  value: number;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
}

export interface PromotionCreatePayload extends PromotionScalars {
  type: PromotionType;
  /** El backend crea en `draft` por defecto; activar es explícito. */
  status: Extract<PromotionStatus, 'draft' | 'active'>;
  targets: PromotionTarget[];
  combo_items: ComboItem[];
}

/**
 * `PATCH /promotions/{id}` solo acepta escalares. `type`, `targets` y
 * `combo_items` van por `PATCH /{id}/shape` y solo en borrador.
 */
export type PromotionUpdatePayload = Partial<PromotionScalars>;

export interface PromotionShapePayload {
  type?: PromotionType;
  targets?: PromotionTarget[];
  combo_items?: ComboItem[];
}

export interface PromotionStatusPayload {
  status: PromotionStatus;
}

export interface PromotionDuplicatePayload {
  name: string;
}
