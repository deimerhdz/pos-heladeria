import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface PublicKeyResponse {
  public_key: string;
}

export type PushRegistrationResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'needs-reload' | 'error' };

/**
 * Alta/baja de la suscripción push del navegador (spec 077, RF-004).
 *
 * `SwPush` ya resuelve pedir permiso y `pushManager.subscribe()` contra el
 * Service Worker registrado (`push-sw.js`, que a su vez envuelve el que
 * genera `@angular/service-worker`) — este servicio solo conecta ese flujo
 * con `POST`/`DELETE /notifications/push/subscriptions`.
 */
@Injectable({ providedIn: 'root' })
export class PushRegistrationService {
  private readonly http = inject(HttpClient);
  private readonly swPush = inject(SwPush);
  private readonly baseUrl = `${environment.apiBaseUrl}/notifications/push`;

  /** `false` en navegadores sin soporte, o si el Service Worker está
   * deshabilitado (p. ej. en desarrollo — `app.config.ts`). */
  get supported(): boolean {
    return this.swPush.isEnabled;
  }

  /**
   * Pide permiso (si el navegador todavía no decidió) y registra la
   * suscripción contra el backend.
   *
   * Corrección post-implementación (spec 077): en la primera visita del
   * navegador, el Service Worker recién instalado todavía **no controla
   * esta página** (comportamiento estándar de la Push API — nunca reclama
   * páginas ya cargadas salvo que llame `clients.claim()`, y `ngsw-worker.js`
   * deliberadamente no lo hace). Si se llamara a `requestSubscription()` en
   * ese momento, la promesa se queda esperando indefinidamente sin ningún
   * error — así que se detecta ese caso primero y se pide recargar, en vez
   * de colgarse en silencio.
   */
  async register(): Promise<PushRegistrationResult> {
    if (!this.swPush.isEnabled) return { ok: false, reason: 'unsupported' };
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller === null
    ) {
      return { ok: false, reason: 'needs-reload' };
    }
    try {
      // La clave VAPID sale siempre del backend (`GET .../push/public-key`),
      // nunca hardcodeada en el frontend: es la misma para todos los tenants,
      // pero rotarla no debe exigir un redeploy de `pos-heladeria`.
      const { public_key } = await firstValueFrom(
        this.http.get<PublicKeyResponse>(`${this.baseUrl}/public-key`),
      );
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: public_key,
      });
      const json = subscription.toJSON();
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/subscriptions`, {
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      );
      return { ok: true };
    } catch (err) {
      console.error('[notifications] no se pudo activar el push', err);
      return { ok: false, reason: 'error' };
    }
  }

  /** Da de baja la suscripción activa de este navegador, si hay una
   * (T032: se llama al cerrar sesión). Idempotente. */
  async unregister(): Promise<void> {
    if (!this.swPush.isEnabled) return;
    const subscription = await firstValueFrom(this.swPush.subscription);
    if (!subscription) return;
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/subscriptions`, {
          body: { endpoint: subscription.endpoint },
        }),
      );
    } finally {
      await this.swPush.unsubscribe().catch(() => undefined);
    }
  }
}
