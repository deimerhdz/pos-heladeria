import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface PublicKeyResponse {
  public_key: string;
}

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

  /** Pide permiso (si el navegador todavía no decidió) y registra la
   * suscripción contra el backend. No hace nada si `supported` es `false`. */
  async register(): Promise<void> {
    if (!this.swPush.isEnabled) return;
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
