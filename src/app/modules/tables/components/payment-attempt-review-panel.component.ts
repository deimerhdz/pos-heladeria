import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiningOrder, PaymentAttempt } from '../interfaces/dining.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { ToastService } from '../../../shared/feedback/toast.service';

/**
 * Revisión de pagos del cajero para una orden (spec 024): aprobar/rechazar el
 * comprobante de transferencia vigente, o confirmar el efectivo calculando el
 * cambio. Vive dentro de `pending-orders-panel`, una instancia por orden —
 * `confirm_order` (backend) exige un intento `confirmado` antes de dejar
 * avanzar la orden a comanda, así que este panel es el paso previo obligado
 * al botón "Confirmar" de esa tarjeta.
 */
@Component({
  selector: 'app-payment-attempt-review-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="text-xs text-gray-400">Cargando pago…</p>
    } @else if (current(); as attempt) {
      <div class="border border-amber-200 bg-amber-50/60 rounded-lg p-2.5 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-amber-800">
            💳 {{ attempt.payment_method_name }}
          </span>
          <span class="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
            Pendiente de revisión
          </span>
        </div>

        @if (attempt.is_cash) {
          <!-- Efectivo: el cajero registra el monto, el backend calcula el cambio. -->
          <div class="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="100"
              [(ngModel)]="amountReceived"
              placeholder="Monto recibido"
              class="w-32 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              (click)="confirmCash(attempt)"
              [disabled]="busy() || !amountReceived || amountReceived <= 0"
              class="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {{ busy() ? 'Confirmando…' : 'Confirmar efectivo' }}
            </button>
          </div>
        } @else if (attempt.receipt_file_url) {
          <!-- Transferencia con comprobante ya subido: aprobar o rechazar. -->
          <div class="flex items-center gap-2 flex-wrap">
            <a
              [href]="attempt.receipt_file_url"
              target="_blank"
              rel="noopener"
              class="text-xs font-medium text-indigo-600 hover:underline"
            >
              Ver comprobante ↗
            </a>
            <button
              (click)="approve(attempt)"
              [disabled]="busy()"
              class="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Aprobar
            </button>
            <button
              (click)="showReject.set(!showReject())"
              [disabled]="busy()"
              class="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar
            </button>
          </div>

          @if (showReject()) {
            <div class="flex items-center gap-2 pt-1">
              <input
                type="text"
                [(ngModel)]="rejectReason"
                placeholder="Motivo del rechazo (obligatorio)"
                class="flex-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <button
                (click)="reject(attempt)"
                [disabled]="busy() || !rejectReason.trim()"
                class="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Confirmar rechazo
              </button>
            </div>
          }
        } @else {
          <p class="text-xs text-amber-700">Esperando que el comensal suba el comprobante…</p>
        }
      </div>
    } @else if (lastResolved(); as last) {
      @if (last.status === 'confirmado') {
        <p class="text-xs text-emerald-700 font-medium">✓ Pago confirmado ({{ last.payment_method_name }})</p>
      } @else {
        <p class="text-xs text-gray-400">Sin pago confirmado — el último intento fue rechazado.</p>
      }
    } @else {
      <p class="text-xs text-gray-400">El comensal aún no inició el pago.</p>
    }
  `,
})
export class PaymentAttemptReviewPanelComponent implements OnChanges {
  @Input({ required: true }) order!: DiningOrder;
  /** Se emite tras aprobar/rechazar/confirmar — el padre recarga la orden. */
  @Output() resolved = new EventEmitter<void>();

  private readonly api = inject(DiningSessionService);
  private readonly toast = inject(ToastService);

  readonly attempts = signal<PaymentAttempt[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly showReject = signal(false);
  rejectReason = '';
  amountReceived: number | null = null;

  ngOnChanges(): void {
    if (this.order) this.load();
  }

  /** El intento vigente si sigue `pendiente` — es el único sobre el que el
   *  cajero puede actuar ahora mismo. */
  current(): PaymentAttempt | null {
    return this.attempts().find((a) => a.status === 'pendiente') ?? null;
  }

  /** Si no hay ninguno pendiente, el más reciente resuelto (para mostrar
   *  "confirmado" o "el último fue rechazado, esperando reintento"). */
  lastResolved(): PaymentAttempt | null {
    const resolved = this.attempts().filter((a) => a.status !== 'pendiente');
    return resolved.length ? resolved[resolved.length - 1] : null;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.attempts.set(await this.api.listPaymentAttempts(this.order.id));
    } catch {
      // Silencioso: la tarjeta de la orden sigue siendo útil sin el detalle de pago.
    } finally {
      this.loading.set(false);
    }
  }

  async approve(attempt: PaymentAttempt): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.approvePaymentAttempt(attempt.id);
      this.toast.success('Comprobante aprobado');
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo aprobar el comprobante.'));
    } finally {
      this.busy.set(false);
    }
  }

  async reject(attempt: PaymentAttempt): Promise<void> {
    if (!this.rejectReason.trim()) return;
    this.busy.set(true);
    try {
      await this.api.rejectPaymentAttempt(attempt.id, this.rejectReason.trim());
      this.toast.info('Comprobante rechazado');
      this.rejectReason = '';
      this.showReject.set(false);
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo rechazar el comprobante.'));
    } finally {
      this.busy.set(false);
    }
  }

  async confirmCash(attempt: PaymentAttempt): Promise<void> {
    if (!this.amountReceived || this.amountReceived <= 0) return;
    this.busy.set(true);
    try {
      const result = await this.api.confirmCashPaymentAttempt(attempt.id, this.amountReceived);
      const cambio = Number(result.change_amount ?? 0);
      this.toast.success(
        cambio > 0 ? `Pago confirmado — cambio: $${cambio.toFixed(2)}` : 'Pago confirmado',
      );
      this.amountReceived = null;
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo confirmar el pago.'));
    } finally {
      this.busy.set(false);
    }
  }
}
