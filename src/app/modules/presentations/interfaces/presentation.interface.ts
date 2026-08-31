/**
 * Presentación de catálogo compartido del tenant (spec 040): "8oz", "16oz"…
 * Distintas variantes de distintos productos pueden apuntar a la misma.
 * Espeja `PresentationResponse` del backend.
 */
export interface Presentation {
  id: string;
  name: string;
  active: boolean;
  /** Variantes ACTIVAS que la referencian — el alcance de cualquier regla sobre ella. */
  applicable_variant_count: number;
  created_at: string;
  updated_at?: string | null;
}

/** Campos editables del formulario. */
export interface PresentationForm {
  name: string;
}

/** `POST /presentations` (`PresentationCreate`). */
export interface PresentationCreatePayload {
  name: string;
}

/** `PATCH /presentations/{id}` (`PresentationUpdate`). */
export interface PresentationUpdatePayload {
  name?: string;
  active?: boolean;
}

/** Cuerpo del 409 de FR-020: la presentación está en uso por promociones activas. */
export interface PresentationInUseError {
  error: string;
  promotions: { id: string; name: string }[];
}
