import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, ReplaySubject } from 'rxjs';
import { AuthApiService } from '../auth/auth-api.service';
import { TokenStorageService } from '../auth/token-storage.service';
import { decodeClaims, isExpired } from '../auth/jwt.util';
import { ApiErrorBody, BackendUser } from '../auth/auth.models';
import { displayNameFromEmail, mapBackendRole, User, UserRole } from '../interfaces/user.interface';

/**
 * Session state machine backed by the own backend (`{apiBaseUrl}/auth/*`).
 * Supabase Auth is no longer used. Preserves the `currentUser` / `isLoading` /
 * `authReady$` contract consumed by guards and `App`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly _authReady = new ReplaySubject<void>(1);

  readonly currentUser = signal<User | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly authReady$ = this._authReady.asObservable();

  /** Single shared refresh so concurrent 401s trigger only one network call. */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor() {
    this.restoreSession();
  }

  async login(email: string, password: string): Promise<{ error: string | null }> {
    try {
      const res = await firstValueFrom(this.authApi.login({ email, password }));
      this.tokenStorage.setTokens(res.access_token, res.refresh_token);

      const user = this.buildUserFromBackend(res.user);
      if (!user) {
        this.clearSession();
        return { error: 'Tu rol de usuario no es válido para este sistema.' };
      }
      this.currentUser.set(user);
      return { error: null };
    } catch (err) {
      return { error: this.extractError(err) };
    }
  }

  async logout(): Promise<void> {
    const access = this.tokenStorage.getAccessToken();
    if (access) {
      try {
        await firstValueFrom(this.authApi.logout(access));
      } catch {
        // Best-effort: clear the local session regardless of network outcome.
      }
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** Clear session and bounce to login (used by the interceptor on refresh failure). */
  forceLogout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Renew the access token with the stored refresh token. Returns `true` on
   * success. Concurrent callers share the same in-flight request.
   */
  tryRefresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refresh = this.tokenStorage.getRefreshToken();
    if (!refresh) return Promise.resolve(false);

    this.refreshInFlight = (async () => {
      try {
        const res = await firstValueFrom(this.authApi.refreshToken(refresh));
        this.tokenStorage.setTokens(res.access_token, res.refresh_token);
        const claims = decodeClaims(res.access_token);
        this.currentUser.set(claims ? this.buildUserFromBackend(claims.user) : null);
        return true;
      } catch {
        this.clearSession();
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  /** Rebuild the session from the stored JWT at startup, without a /me round-trip. */
  private restoreSession(): void {
    const access = this.tokenStorage.getAccessToken();
    const claims = access ? decodeClaims(access) : null;

    if (claims && !isExpired(claims)) {
      this.currentUser.set(this.buildUserFromBackend(claims.user));
      this.markReady();
      return;
    }

    const refresh = this.tokenStorage.getRefreshToken();
    const refreshClaims = refresh ? decodeClaims(refresh) : null;
    if (refresh && refreshClaims && !isExpired(refreshClaims)) {
      // Defer so this service finishes constructing before the HTTP call runs
      // through the interceptor (which injects AuthService).
      queueMicrotask(async () => {
        await this.tryRefresh();
        this.markReady();
      });
      return;
    }

    this.clearSession();
    this.markReady();
  }

  private buildUserFromBackend(backend: BackendUser): User | null {
    const role = mapBackendRole(backend.role);
    // Un super admin se identifica por el flag `is_super_admin`, no por un rol de
    // tenant: su `role` (p. ej. `SUPER_ADMIN`) puede no pertenecer al enum. Solo
    // es sesión inválida si el rol es desconocido y además no es super admin.
    if (!role && !backend.is_super_admin) return null;
    return {
      id: backend.uid,
      name: displayNameFromEmail(backend.email),
      email: backend.email,
      role: role ?? UserRole.ADMIN,
      tenantId: backend.tenant_id,
      isSuperAdmin: backend.is_super_admin,
    };
  }

  private clearSession(): void {
    this.tokenStorage.clear();
    this.currentUser.set(null);
  }

  private markReady(): void {
    this.isLoading.set(false);
    this._authReady.next();
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Credenciales incorrectas. Verifica tu email y contraseña.';
      }
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo iniciar sesión. Intenta de nuevo.';
    }
    return 'No se pudo iniciar sesión. Intenta de nuevo.';
  }
}
