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
 * - `qty_price_presentation` (spec 040): precio de paquete por presentación de
 *   catálogo, reglas en `presentation_rules`. Como `combo`, se calcula agrupando
 *   varias líneas y NO entra en `AUTO_TYPES`.
 */
export type PromotionType =
  | 'percent'
  | 'fixed'
  | 'combo'
  | 'qty_price'
  | 'qty_price_presentation';

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

/**
 * Regla de una promoción `qty_price_presentation` (spec 040): una presentación
 * del catálogo, una cantidad mínima de paquete (≥1, `1` es válido) y el precio
 * total del paquete. No puede repetirse la misma presentación dentro de una
 * promoción (FR-006).
 */
export interface PresentationRuleForm {
  presentation_id: string;
  min_qty: number;
  pack_price: number;
}

/** Regla tal como la devuelve el backend, con el alcance ya resuelto (FR-005). */
export interface PresentationRule {
  presentation_id: string;
  presentation_name: string;
  min_qty: number;
  /** Decimal serializado como string (`"12000.00"`). */
  pack_price: string;
  /** Variantes ACTIVAS que referencian esa presentación ("Productos Aplicables"). */
  applicable_variant_count: number;
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
  /** Solo para `qty_price_presentation` (spec 040). */
  presentation_rules: PresentationRule[];
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
  /** Solo aplica cuando `type === 'qty_price_presentation'`; ≥1 regla, sin
   *  presentación repetida (spec 040). */
  presentationRules: PresentationRuleForm[];
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

/** Reglas por presentación en el payload de create/shape (spec 040). */
export interface PresentationRuleIn {
  presentation_id: string;
  min_qty: number;
  pack_price: number;
}

/** Flags de confirmación explícita de FR-017 (precio no uniforme) y FR-022 (la
 *  regla no representa un descuento real). Sin el flag, el 422 no deja guardar. */
export interface PresentationConfirmFlags {
  confirm_precio_no_uniforme?: boolean;
  confirm_sin_descuento?: boolean;
}

export interface PromotionCreatePayload
  extends PromotionScalars,
    PresentationConfirmFlags {
  type: PromotionType;
  /** El backend crea en `draft` por defecto; activar es explícito. */
  status: Extract<PromotionStatus, 'draft' | 'active'>;
  targets: PromotionTarget[];
  combo_items: ComboItem[];
  presentation_rules?: PresentationRuleIn[];
}

/**
 * `PATCH /promotions/{id}` solo acepta escalares. `type`, `targets` y
 * `combo_items` van por `PATCH /{id}/shape` y solo en borrador.
 */
export type PromotionUpdatePayload = Partial<PromotionScalars>;

export interface PromotionShapePayload extends PresentationConfirmFlags {
  type?: PromotionType;
  targets?: PromotionTarget[];
  combo_items?: ComboItem[];
  presentation_rules?: PresentationRuleIn[];
}

export interface PromotionStatusPayload {
  status: PromotionStatus;
}

export interface PromotionDuplicatePayload {
  name: string;
}

/** Cuerpo del 409 de FR-006 (spec 040): solape con otra promoción por presentación activa. */
export interface PresentationOverlapError {
  error: string;
  conflicts: { promotion_id: string; promotion_name: string; presentation_id: string }[];
}

/**
 * Cuerpo del 422 de FR-017 (precio no uniforme) o FR-022 (la regla no es un
 * descuento real). El frontend lee el detalle y, al confirmar, reenvía el mismo
 * payload con el flag correspondiente en `true`.
 */
export interface PresentationPriceCheckError {
  error: string;
  presentation_id: string;
  reference_unit_price: string;
  /** Presente solo en FR-017. */
  variants?: { variant_id: string; description: string; price: string }[];
  /** Presente solo en FR-022. */
  pack_unit_price?: string;
}
