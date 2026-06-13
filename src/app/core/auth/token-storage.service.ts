import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'pos.access_token';
const REFRESH_TOKEN_KEY = 'pos.refresh_token';

/**
 * Encapsulates persistence of the backend JWT pair in `localStorage`, keeping
 * storage keys in one place. Tokens survive reloads and tabs.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setTokens(accessToken: string, refreshToken?: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}
