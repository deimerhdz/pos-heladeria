import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  PaymentMethod,
  PaymentMethodCheckoutOption,
  PaymentMethodUpdatePayload,
} from '../interfaces/sales.interface';

/** Transport for payment methods (`/api/v1/sales/payment-methods`). */
@Injectable({ providedIn: 'root' })
export class PaymentMethodService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sales/payment-methods`;

  readonly methods = signal<PaymentMethod[]>([]);
  /** Solo los disponibles para cobrar en caja (spec 032, FR-012/FR-012a) —
   * sin `payment_info`, consumido por el panel de cobro (`pos-terminal.store.ts`). */
  readonly checkoutOptions = signal<PaymentMethodCheckoutOption[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.methods.set(await firstValueFrom(this.http.get<PaymentMethod[]>(this.baseUrl)));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar los métodos de pago.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Carga solo los métodos disponibles para cobrar (`?available=true`). Usado
   * por el panel de cobro en vez de `load()`/`methods` (spec 032, FR-012). */
  async loadAvailableForCheckout(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.checkoutOptions.set(
        await firstValueFrom(
          this.http.get<PaymentMethodCheckoutOption[]>(this.baseUrl, {
            params: { available: true },
          }),
        ),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar los métodos de pago disponibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Activa, para este tenant, un método del catálogo de la plataforma (spec
   * 032, FR-007/FR-011). `name`/`type`/`is_cash` ya no se mandan — el
   * backend los copia de `catalog_id`. Si el tenant ya tiene una fila para
   * ese `catalog_id` (activa o no), el backend responde `409`: hay que
   * reactivarla/editarla con `update()`, no volver a llamar `create()`.
   */
  async create(catalogId: string, paymentInfo?: Record<string, string> | null): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post<PaymentMethod>(this.baseUrl, {
          catalog_id: catalogId,
          payment_info: paymentInfo ?? null,
        }),
      );
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo activar el método de pago.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Edita datos de pago/estado (spec 024 US1, spec 032 FR-008/FR-009/FR-010).
   * Reactivar (`active: true`) es también el camino para volver a usar un
   * método desactivado, conservando su `payment_info` si no se manda uno
   * nuevo. Al desactivar el último método activo, el backend responde `409`
   * — el mensaje ya viene listo para mostrar (`extractError`).
   */
  async update(id: string, patch: PaymentMethodUpdatePayload): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.patch<PaymentMethod>(`${this.baseUrl}/${id}`, patch));
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo actualizar el método de pago.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Atajo de `update()` para el botón activar/desactivar de la lista. */
  async toggleActive(method: PaymentMethod): Promise<boolean> {
    return this.update(method.id, { active: !method.active });
  }

  /**
   * Sube un archivo (código QR u otro campo `format: "image"` del catálogo)
   * directo a R2 vía presign (`folder: 'payment-methods'`, ya en la
   * whitelist del backend) y devuelve la URL pública — sin persistir nada
   * todavía. Quien llama guarda esa URL en el `payment_info` local y la
   * persiste junto con el resto de los campos vía `create()`/`update()`
   * (mismo patrón que `tenant-info.service.ts::uploadLogo`, sin el PATCH
   * final porque aquí el guardado va con el resto del formulario).
   */
  async uploadQrImage(file: File): Promise<string | null> {
    if (!file.type.startsWith('image/')) {
      this.error.set('El archivo debe ser una imagen.');
      return null;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.error.set('La imagen supera el máximo de 2 MB.');
      return null;
    }
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const presign = await firstValueFrom(
        this.http.post<{ upload_url: string; public_url: string }>(
          `${environment.apiBaseUrl}/uploads/presign`,
          { filename: file.name, content_type: file.type, folder: 'payment-methods' },
        ),
      );
      await firstValueFrom(
        this.http.put(presign.upload_url, file, { headers: { 'Content-Type': file.type } }),
      );
      return presign.public_url;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo subir la imagen.'));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
