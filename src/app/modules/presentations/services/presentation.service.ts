import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import {
  Presentation,
  PresentationCreatePayload,
  PresentationForm,
  PresentationInUseError,
  PresentationUpdatePayload,
} from '../interfaces/presentation.interface';

/**
 * Catálogo de presentaciones (spec 040). CRUD + lista completa (tope 100) para
 * los pickers de `product-form` y del editor de reglas de promoción.
 */
@Injectable({ providedIn: 'root' })
export class PresentationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/presentations`;

  readonly presentations = signal<Presentation[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  /** Detalle del último 409 de FR-020 (baja bloqueada), para el diálogo. */
  readonly inUseError = signal<PresentationInUseError | null>(null);

  readonly activePresentations = computed(() =>
    this.presentations().filter((p) => p.active),
  );

  async loadPresentations(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.http.get<Page<Presentation>>(this.baseUrl, { params: { size: 100 } }),
      );
      this.presentations.set([...page.items].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createPresentation(form: PresentationForm): Promise<boolean> {
    return this.mutate(() =>
      firstValueFrom(
        this.http.post<Presentation>(this.baseUrl, {
          name: form.name,
        } satisfies PresentationCreatePayload),
      ),
    );
  }

  async renamePresentation(id: string, name: string): Promise<boolean> {
    return this.mutate(() =>
      firstValueFrom(
        this.http.patch<Presentation>(`${this.baseUrl}/${id}`, {
          name,
        } satisfies PresentationUpdatePayload),
      ),
    );
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    return this.mutate(() =>
      firstValueFrom(
        this.http.patch<Presentation>(`${this.baseUrl}/${id}`, {
          active: !current,
        } satisfies PresentationUpdatePayload),
      ),
    );
  }

  async deletePresentation(id: string): Promise<boolean> {
    return this.mutate(() => firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${id}`)));
  }

  private async mutate(op: () => Promise<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.inUseError.set(null);
    try {
      await op();
      await this.loadPresentations();
      return true;
    } catch (err) {
      const inUse = this.extractInUse(err);
      if (inUse) {
        this.inUseError.set(inUse);
      } else {
        this.error.set(this.extractError(err));
      }
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractInUse(err: unknown): PresentationInUseError | null {
    if (err instanceof HttpErrorResponse && err.status === 409) {
      const detail = (err.error as { detail?: unknown } | null)?.detail;
      if (detail && typeof detail === 'object' && 'promotions' in detail) {
        return detail as PresentationInUseError;
      }
    }
    return null;
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      return body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
