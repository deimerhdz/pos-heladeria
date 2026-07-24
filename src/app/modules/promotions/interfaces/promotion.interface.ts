export type PromotionType = 'percent' | 'fixed' | 'buy_x_get_y' | 'combo' | 'qty_price';

export interface PromotionTarget {
  product_id: string | null;
  category_id: string | null;
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
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  buy_qty: number | null;
  get_qty: number | null;
  targets: PromotionTarget[];
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
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  categoryIds: string[];
  productIds: string[];
}

export interface PromotionCreatePayload {
  name: string;
  type: PromotionType;
  value: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  min_qty: number;
  targets: PromotionTarget[];
}

export type PromotionUpdatePayload = Partial<
  Pick<
    PromotionCreatePayload,
    'name' | 'value' | 'active' | 'starts_at' | 'ends_at' | 'days_of_week' | 'start_time' | 'end_time' | 'min_qty'
  >
>;
