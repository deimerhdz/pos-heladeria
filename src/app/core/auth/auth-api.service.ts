import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, RefreshResponse } from './auth.models';

/**
 * Thin typed transport for the backend auth endpoints. Holds no state; the
 * session lifecycle lives in `AuthService`.
 *
 * `refreshToken`/`logout` pass the bearer header explicitly because the auth
 * interceptor intentionally skips these routes (refresh uses the *refresh*
 * token, not the access token).
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  login(req: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, req);
  }

  refreshToken(refreshToken: string): Observable<RefreshResponse> {
    return this.http.get<RefreshResponse>(`${this.base}/auth/refresh-token`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${refreshToken}` }),
    });
  }

  logout(accessToken: string): Observable<unknown> {
    return this.http.get(`${this.base}/auth/logout`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${accessToken}` }),
    });
  }
}
