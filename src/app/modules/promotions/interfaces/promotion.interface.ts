/**
 * spec 063 — modelo por **conjunto explícito de variantes**. Los tipos vivos
 * quedan en dos (decisión de negocio A-58…A-65, registro-de-anomalias.md):
 *
 * - `percent`: `value` = % de descuento (0 < value ≤ 100).
 * - `package_price`: `value` = precio total de `min_qty` unidades cualesquiera
 *   del conjunto de variantes.
 *
 * `Promotion.type` puede además traer un tipo viejo (`combo` / `qty_price` /
 * `qty_price_presentation` / `fixed`) **solo** en promociones `finished` que la
 * migración `063a` cerró (FR-025); el formulario nunca las edita.
 */
export type PromotionType = 'percent' | 'package_price';

/** Cualquier `type` que el backend puede serializar (incluye los `finished` de
 *  tipo viejo: `combo` / `qty_price` / `qty_price_presentation` / `fixed`). */
export type PromotionTypeAny = string;

/**
 * Máquina de estados del backend (`PROMOTION_TRANSITIONS`). `draft` es el único
 * estado en el que se pueden cambiar `type` y el conjunto de variantes.
 * `finished` es terminal.
 */
export type PromotionStatus = 'draft' | 'active' | 'paused' | 'finished';

export const PROMOTION_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  draft: ['active', 'finished'],
  active: ['paused', 'finished'],
  paused: ['active', 'finished'],
  finished: [],
};

/** Una variante del conjunto elegible, con su precio normal vigente (FR-005). */
export interface PromotionVariant {
  product_variant_id: string;
  description: string;
  /** Decimal serializado como string (`"8000.00"`). */
  unit_price: string;
}

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: PromotionTypeAny;
  value: string;
  status: PromotionStatus;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  /** Marca de "finalizada por la migración de la spec 063" (FR-025). */
  closed_by_refactor_at: string | null;
  /** Condición en lenguaje llano (FR-005); `null` para una `finished` de tipo viejo. */
  condition_text: string | null;
  variants: PromotionVariant[];
}

/** Modelo del formulario (UI). */
export interface PromotionForm {
  name: string;
  description: string;
  type: PromotionType;
  value: number;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: number[]; // 0=lunes..6=domingo
  start_time: string | null;
  end_time: string | null;
  /** `package_price`: tamaño del paquete (≥1). `percent`: cantidad mínima. */
  min_qty: number;
  /** Conjunto explícito de variantes elegibles (FR-001): ≥1, sin repetidos. */
  variantIds: string[];
}

/** Campos escalares comunes a create y update. */
interface PromotionScalars {
  name: string;
  description: string | null;
  value: number;
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
  /** FR-012: obligatoria al crear. */
  starts_at: string;
  variant_ids: string[];
}

/**
 * `PATCH /promotions/{id}` solo acepta escalares (FR-018: `value` / `min_qty`
 * bloqueados fuera de `draft`, lo valida el backend). `type` / `variant_ids` van
 * por `PATCH /{id}/shape` y solo en borrador.
 */
export type PromotionUpdatePayload = Partial<PromotionScalars>;

export interface PromotionShapePayload {
  type?: PromotionType;
  variant_ids?: string[];
}

export interface PromotionStatusPayload {
  status: PromotionStatus;
}

export interface PromotionDuplicatePayload {
  name: string;
}

/**
 * Cuerpo del 409 de FR-014 (solape real bloqueado): nombra la(s) promoción(es)
 * en conflicto y las variantes compartidas.
 */
export interface OverlapConflictError {
  error: string;
  conflicts: {
    promotion_id: string;
    promotion_name: string;
    variant_ids: string[];
  }[];
}

/** Cuerpo del 409 de FR-016: el precio de paquete no representa un descuento. */
export interface PackageNotDiscountError {
  error: string;
  value: string;
  min_qty: number;
  cheapest_unit_price: string;
  variant_id: string;
}
