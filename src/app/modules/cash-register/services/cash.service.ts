import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CashMovement,
  CashMovementType,
  CashRegister,
  CashShift,
  Reconciliation,
} from '../interfaces/cash.interface';

const SHIFT_STORAGE_KEY = 'cash.shift';

/**
 * Real cash module transport (`/api/v1/cash/*`). The API has no "current shift"
 * or "list shifts/movements" endpoints, so the open shift is persisted in
 * localStorage (to survive reloads) and movements are kept in a session-local
 * list; `reconciliation` holds the authoritative running totals.
 */
@Injectable({ providedIn: 'root' })
export class CashService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/cash`;

  readonly registers = signal<CashRegister[]>([]);
  readonly shift = signal<CashShift | null>(null);
  readonly reconciliation = signal<Reconciliation | null>(null);
  readonly movements = signal<CashMovement[]>([]);

  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  /** True while a shift is open (not yet closed). */
  readonly isOpen = computed(() => {
    const s = this.shift();
    return !!s && !s.closed_at && s.status !== 'closed';
  });

  async loadRegisters(): Promise<void> {
    try {
      this.registers.set(
        await firstValueFrom(this.http.get<CashRegister[]>(`${this.baseUrl}/registers`)),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar las cajas.'));
    }
  }

  async createRegister(name: string): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post<CashRegister>(`${this.baseUrl}/registers`, { name }),
      );
      await this.loadRegisters();
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo crear la caja.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Restore a previously opened shift (survives reloads). */
  async restoreShift(): Promise<void> {
    const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
    if (!raw) return;
    let stored: CashShift;
    try {
      stored = JSON.parse(raw) as CashShift;
    } catch {
      localStorage.removeItem(SHIFT_STORAGE_KEY);
      return;
    }
    this.shift.set(stored);
    await this.loadReconciliation();
  }

  async openShift(cashRegisterId: string, openingAmount: number): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const shift = await firstValueFrom(
        this.http.post<CashShift>(`${this.baseUrl}/shifts/open`, {
          cash_register_id: cashRegisterId,
          opening_amount: openingAmount,
        }),
      );
      this.shift.set(shift);
      this.movements.set([]);
      localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(shift));
      await this.loadReconciliation();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo abrir el turno.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async addMovement(type: CashMovementType, amount: number, description: string): Promise<boolean> {
    const shift = this.shift();
    if (!shift) return false;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const movement = await firstValueFrom(
        this.http.post<CashMovement>(`${this.baseUrl}/shifts/${shift.id}/movements`, {
          type,
          amount,
          description,
        }),
      );
      this.movements.update((list) => [movement, ...list]);
      await this.loadReconciliation();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo registrar el movimiento.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async loadReconciliation(): Promise<void> {
    const shift = this.shift();
    if (!shift) return;
    try {
      this.reconciliation.set(
        await firstValueFrom(
          this.http.get<Reconciliation>(`${this.baseUrl}/shifts/${shift.id}/reconciliation`),
        ),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar el arqueo.'));
    }
  }

  async closeShift(countedAmount: number): Promise<boolean> {
    const shift = this.shift();
    if (!shift) return false;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const closed = await firstValueFrom(
        this.http.post<CashShift>(`${this.baseUrl}/shifts/${shift.id}/close`, {
          counted_amount: countedAmount,
        }),
      );
      this.shift.set(closed);
      localStorage.removeItem(SHIFT_STORAGE_KEY);
      await this.loadReconciliation();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cerrar el turno.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Discard the (closed) shift from view to start a new one. */
  reset(): void {
    this.shift.set(null);
    this.reconciliation.set(null);
    this.movements.set([]);
    this.error.set(null);
    localStorage.removeItem(SHIFT_STORAGE_KEY);
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
