export type PromotionType = 'percent' | 'fixed' | 'buy_x_get_y' | 'combo' | 'qty_price';

export interface PromotionTarget {
  product_id: string | null;
  category_id: string | null;
}

/** Componente de un combo: variante requerida + cantidad por unidad de combo. */
export interface ComboItem {
  product_variant_id: string;
  quantity: number;
}

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  value: string;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  days_of_month: string | null;
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  buy_qty: number | null;
  get_qty: number | null;
  targets: PromotionTarget[];
  combo_items: ComboItem[];
}

/** Modelo del formulario (UI). */
export interface PromotionForm {
  name: string;
  type: PromotionType;
  value: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: number[]; // 0=lunes..6=domingo
  days_of_month: number[]; // 1..31
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  categoryIds: string[];
  productIds: string[];
  /** Solo aplica cuando `type === 'combo'`; requiere ≥2 variantes distintas. */
  comboItems: ComboItem[];
}

export interface PromotionCreatePayload {
  name: string;
  type: PromotionType;
  value: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  days_of_month: string | null;
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  targets: PromotionTarget[];
  combo_items: ComboItem[];
}

export type PromotionUpdatePayload = Partial<
  Pick<
    PromotionCreatePayload,
    | 'name'
    | 'value'
    | 'active'
    | 'starts_at'
    | 'ends_at'
    | 'days_of_week'
    | 'days_of_month'
    | 'start_time'
    | 'end_time'
    | 'min_qty'
  >
>;
