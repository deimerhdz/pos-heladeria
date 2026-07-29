import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'pos.diner.session_token';

/** Nombre del query param que permite reingresar desde un enlace compartido. */
export const DINER_TOKEN_PARAM = 's';

/**
 * Guarda el `session_token` del comensal (anónimo, sin login).
 *
 * Orden de lectura: **query param → localStorage**. El param gana para que
 * abrir el enlace compartido en otro dispositivo reingrese a esa sesión en vez
 * de crear un comensal nuevo.
 *
 * Nota: el documento de contrato menciona una cookie `httpOnly` como almacén
 * principal, pero el backend devuelve el token en el cuerpo JSON (no con
 * `Set-Cookie`) y una cookie httpOnly no se puede escribir desde JS. Mientras
 * el backend no emita la cookie, `localStorage` es el almacén real.
 */
@Injectable({ providedIn: 'root' })
export class DinerTokenStore {
  /** Token vigente, o `null` si el comensal aún no tiene sesión. */
  readonly token = signal<string | null>(this.read());

  /** Lee el token del query param (si viene) o de `localStorage`. */
  private read(): string | null {
    try {
      const fromUrl = new URLSearchParams(location.search).get(DINER_TOKEN_PARAM);
      if (fromUrl) {
        localStorage.setItem(STORAGE_KEY, fromUrl);
        return fromUrl;
      }
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      // Modo privado / storage bloqueado: la sesión no sobrevive a la recarga,
      // pero el flujo sigue funcionando en memoria.
      return null;
    }
  }

  set(token: string): void {
    this.token.set(token);
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {
      /* sin persistencia: se mantiene solo en memoria */
    }
  }

  /** Descarta el token. Se llama ante cualquier `401` del comensal. */
  clear(): void {
    this.token.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nada que limpiar */
    }
  }

  /** Enlace para compartir/reingresar, con el token en el query param. */
  shareUrl(): string | null {
    const t = this.token();
    if (!t) return null;
    const url = new URL(location.href);
    url.searchParams.set(DINER_TOKEN_PARAM, t);
    return url.toString();
  }
}
