import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RealtimeControlType,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeStatus,
} from './realtime-event.model';
import { SseClient } from './sse-client';

type Handler = (ev: any) => void;

interface TicketResponse {
  ticket: string;
  expires_in: number;
}

/**
 * Punto único de acceso al stream de tiempo real.
 *
 * **Signals para el estado, callbacks para el flujo.** Los eventos son un
 * *stream*, no estado: un signal con "el último evento" pierde los que lleguen
 * en el mismo tick y obliga a cada consumidor a desduplicar. Los signals se
 * reservan para `status`, que sí es estado y se pinta.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly http = inject(HttpClient);

  readonly status = signal<RealtimeStatus>('idle');

  private client: SseClient | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();

  /** Comensal: el token de sesión viaja en la query (EventSource no manda cabeceras). */
  connectDiner(token: string): void {
    this.connect((lastId) =>
      Promise.resolve(this.buildUrl({ token }, lastId)),
    );
  }

  /**
   * Staff: se mintea un ticket de un solo uso por intento.
   *
   * `HttpClient` pasa por `authTokenInterceptor`, que ya pone `Bearer` y
   * `X-Tenant-Host` porque `/realtime` no está en `DINER_PATHS`. El interceptor
   * no necesita ningún cambio.
   */
  connectStaff(): void {
    this.connect(async (lastId) => {
      const res = await firstValueFrom(
        this.http.post<TicketResponse>(`${environment.apiBaseUrl}/realtime/ticket`, {}),
      );
      return this.buildUrl({ ticket: res.ticket }, lastId);
    });
  }

  disconnect(): void {
    this.client?.stop();
    this.client = null;
    this.status.set('idle');
  }

  /**
   * Suscribe un handler a un tipo de evento. Devuelve la función de baja.
   *
   * Además de los eventos de negocio acepta los de control: `resync` (hay un
   * hueco, recarga por REST) y `reconnected` (el stream volvió tras caerse).
   */
  on<T extends RealtimeEventType>(
    type: T,
    fn: (ev: Extract<RealtimeEvent, { type: T }>) => void,
  ): () => void;
  on(type: RealtimeControlType, fn: () => void): () => void;
  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.handlers.delete(type);
    };
  }

  private buildUrl(params: Record<string, string>, lastId: string | null): string {
    const q = new URLSearchParams(params);
    // El navegador solo manda la cabecera `Last-Event-ID` en SU reconexión
    // automática; la nuestra tiene que llevarlo en la query.
    if (lastId) q.set('last_event_id', lastId);
    return `${environment.apiBaseUrl}/realtime/stream?${q.toString()}`;
  }

  private connect(url: (lastId: string | null) => Promise<string>): void {
    this.disconnect();
    this.client = new SseClient({
      url,
      onStatus: (s) => this.status.set(s),
      onEvent: (type, data) => this.emit(type, data),
    });
    this.client.start();
  }

  private emit(type: string, data: unknown): void {
    // `hello` es del protocolo, no del negocio: nadie se suscribe a él.
    if (type === 'hello') return;
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        // Un handler roto no puede tumbar a los demás ni al stream.
        console.error(`[realtime] handler de "${type}" lanzó`, err);
      }
    }
  }
}
