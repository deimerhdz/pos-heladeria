/** Request body for `POST /api/v1/auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Identity object as returned by the backend (login response and JWT claims). */
export interface BackendUser {
  email: string;
  uid: string;
  tenant_id: number | null;
  is_super_admin: boolean;
  /** Role in UPPERCASE: `ADMIN` | `CASHIER` | `STAFF`. */
  role: string;
}

/** Response body of `POST /api/v1/auth/login`. */
export interface LoginResponse {
  message: string;
  access_token: string;
  refresh_token: string;
  user: BackendUser;
}

/**
 * Response of `GET /api/v1/auth/refresh-token`. The body is not documented in
 * the OpenAPI spec, so this is defensive: at minimum an `access_token`, and a
 * possibly-rotated `refresh_token`.
 */
export interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  message?: string;
}

/** Decoded JWT payload. Access token has `refresh: false`; refresh token `true`. */
export interface JwtClaims {
  user: BackendUser;
  /** Expiration as a UNIX timestamp (seconds). */
  exp: number;
  jti: string;
  refresh: boolean;
}

/** FastAPI error envelope (`{ "detail": "..." }`). */
export interface ApiErrorBody {
  detail?: string;
  message?: string;
}
