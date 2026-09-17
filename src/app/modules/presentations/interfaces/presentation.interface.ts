/** Mirrors the backend `PresentationResponse`. */
export interface Presentation {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the presentation form. */
export interface PresentationForm {
  name: string;
}

/** Request body for `POST /presentations` (`PresentationCreate`). */
export interface PresentationCreatePayload {
  name: string;
}

/** Request body for `PATCH /presentations/{id}` (`PresentationUpdate`). */
export interface PresentationUpdatePayload {
  name?: string;
  active?: boolean;
}
