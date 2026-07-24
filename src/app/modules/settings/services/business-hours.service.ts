import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';

export interface BusinessHours {
  id?: string;
  day_of_week: number; // 0=lunes..6=domingo
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
}

@Injectable({ providedIn: 'root' })
export class BusinessHoursService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/business-hours`;

  readonly hours = signal<BusinessHours[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.get<BusinessHours[]>(this.baseUrl));
      this.hours.set(data);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async save(week: BusinessHours[]): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.put<BusinessHours[]>(this.baseUrl, week));
      this.hours.set(data);
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
