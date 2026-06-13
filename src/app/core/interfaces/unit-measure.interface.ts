/** Mirrors the backend `UnitMeasureResponse`. */
export interface UnitMeasure {
  id: string;
  name: string;
  abbreviation: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the unit-measure form. */
export interface UnitMeasureForm {
  name: string;
  abbreviation: string;
}

/** Request body for `POST /unit-measures` (`UnitMeasureCreate`). */
export interface UnitMeasureCreatePayload {
  name: string;
  abbreviation: string;
}

/** Request body for `PATCH /unit-measures/{id}` (`UnitMeasureUpdate`). */
export interface UnitMeasureUpdatePayload {
  name?: string;
  abbreviation?: string;
  active?: boolean;
}
