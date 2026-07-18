import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CashMovement,
  CashMovementPayload,
  CashRegister,
  CashShift,
  Reconciliation,
  ShiftClosePayload,
  ShiftReport,
} from '../interfaces/cash.interface';

const REGISTER_STORAGE_KEY = 'cash.register';

/**
 * Transporte del módulo de caja real (`/api/v1/cash/*`). El header de tenant y el
 * Bearer los añade `authTokenInterceptor` a toda petición.
 *
 * Además mantiene el **turno abierto actual** como estado compartido (singleton
 * root): lo consume tanto `CashSessionStore` (pantalla de caja) como el checkout
 * de ventas, que necesita el `cash_shift_id` para cobrar.
 */
@Injectable({ providedIn: 'root' })
export class CashService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/cash`;

  /** Estado compartido del turno abierto (fuente única de verdad entre módulos). */
  readonly registers = signal<CashRegister[]>([]);
  readonly shift = signal<CashShift | null>(null);

  /** True mientras hay un turno abierto (no cerrado). */
  readonly isOpen = computed(() => {
    const s = this.shift();
    return !!s && s.status !== 'closed' && !s.closed_at;
  });

  /** Carga las cajas y actualiza la señal compartida. */
  async loadRegisters(): Promise<CashRegister[]> {
    const regs = await this.listRegisters();
    this.registers.set(regs);
    return regs;
  }

  /**
   * Restaura el turno abierto de la última caja usada (persistida en localStorage)
   * hacia la señal `shift`. Silencioso si no hay caja recordada o no hay turno
   * abierto (404). Lo usa el checkout de ventas al cargar sin pasar por /caja.
   */
  async restoreShift(): Promise<void> {
    const regId = localStorage.getItem(REGISTER_STORAGE_KEY);
    if (!regId) return;
    try {
      this.shift.set(await this.getCurrentShift(regId));
    } catch {
      this.shift.set(null);
    }
  }

  listRegisters(): Promise<CashRegister[]> {
    return firstValueFrom(this.http.get<CashRegister[]>(`${this.baseUrl}/registers`));
  }

  createRegister(name: string): Promise<CashRegister> {
    return firstValueFrom(this.http.post<CashRegister>(`${this.baseUrl}/registers`, { name }));
  }

  openShift(cashRegisterId: string, openingAmount: number): Promise<CashShift> {
    return firstValueFrom(
      this.http.post<CashShift>(`${this.baseUrl}/shifts/open`, {
        cash_register_id: cashRegisterId,
        opening_amount: openingAmount,
      }),
    );
  }

  /** Turno abierto de una caja; lanza 404 si no hay ninguno. */
  getCurrentShift(cashRegisterId: string): Promise<CashShift> {
    return firstValueFrom(
      this.http.get<CashShift>(`${this.baseUrl}/shifts/current`, {
        params: { cash_register_id: cashRegisterId },
      }),
    );
  }

  addMovement(shiftId: string, payload: CashMovementPayload): Promise<CashMovement> {
    return firstValueFrom(
      this.http.post<CashMovement>(`${this.baseUrl}/shifts/${shiftId}/movements`, payload),
    );
  }

  listMovements(shiftId: string): Promise<CashMovement[]> {
    return firstValueFrom(
      this.http.get<CashMovement[]>(`${this.baseUrl}/shifts/${shiftId}/movements`),
    );
  }

  getReconciliation(shiftId: string): Promise<Reconciliation> {
    return firstValueFrom(
      this.http.get<Reconciliation>(`${this.baseUrl}/shifts/${shiftId}/reconciliation`),
    );
  }

  closeShift(shiftId: string, payload: ShiftClosePayload): Promise<CashShift> {
    return firstValueFrom(
      this.http.post<CashShift>(`${this.baseUrl}/shifts/${shiftId}/close`, payload),
    );
  }

  getReport(shiftId: string): Promise<ShiftReport> {
    return firstValueFrom(this.http.get<ShiftReport>(`${this.baseUrl}/shifts/${shiftId}/report`));
  }

  /** Extrae un mensaje legible del error HTTP del backend (FastAPI `detail`). */
  extractError(err: unknown, fallback: string): string {
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
