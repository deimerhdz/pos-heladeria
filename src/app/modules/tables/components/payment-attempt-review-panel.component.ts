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
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';

/**
 * Revisión de pagos del cajero para una orden (spec 024): aprobar/rechazar el
 * comprobante de transferencia vigente, o confirmar el efectivo calculando el
 * cambio. Vive dentro de `payment-validation-block` (feature 028), una
 * instancia por orden, completamente independiente de sus hermanas —
 * `confirm_order` (backend) exige un intento `confirmado` antes de dejar
 * avanzar la orden a comanda, así que este panel es el paso previo obligado.
 *
 * Spec 044: además, cuando el pago es en efectivo o es una transferencia que
 * todavía no tiene comprobante subido, el cajero puede rechazar el **pedido
 * completo** (con motivo obligatorio) — revierte, para esos dos casos, la
 * Decisión D5 de spec 028 (que había dejado "Rechazar" con un único
 * significado: el del intento de pago, con reintento). La transferencia con
 * comprobante ya subido conserva su "Rechazar" de siempre, sin cambios.
 */
@Component({
  selector: 'app-payment-attempt-review-panel',
  standalone: true,
  imports: [FormsModule, MoneyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="text-sm text-gray-400">Cargando pago…</p>
    } @else if (current(); as attempt) {
      <div class="border border-amber-200 bg-amber-50/60 rounded-lg p-2.5 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-semibold text-amber-800">
            💳 {{ attempt.payment_method_name }}
          </span>
          <span class="text-sm px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
            Pendiente de revisión
          </span>
        </div>

        @if (attempt.is_cash) {
          <!-- Efectivo: el cajero registra el monto, el backend calcula el cambio. -->
          <div class="flex items-center gap-2 flex-wrap">
            <app-money-input
              [(ngModel)]="amountReceived"
              placeholder="Monto recibido"
              sizeClass="w-36 min-h-11 px-2 py-1 text-base rounded-lg"
            />
            <button
              (click)="confirmCash(attempt)"
              [disabled]="busy() || !amountReceived || amountReceived <= 0 || !cashShiftId"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {{ busy() ? 'Confirmando…' : 'Confirmar efectivo' }}
            </button>
            <button
              (click)="showRejectOrder.set(!showRejectOrder())"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar pedido
            </button>
          </div>
          @if (!cashShiftId) {
            <p class="text-sm text-red-600">Abre un turno de caja para poder confirmar el pago.</p>
          }
          @if (cashChangePreview(); as cambio) {
            <!--
              Vista previa mientras el cajero escribe, antes de confirmar
              (feature 028): antes solo se veía el cambio DESPUÉS de
              confirmar (bloque lastResolved() más abajo), a diferencia del
              cobro de mostrador (payment-input.component.ts), que ya lo
              muestra en vivo — mismo criterio de visibilidad (> 0) para
              ser consistentes.
            -->
            <div class="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
              <span class="text-sm font-medium text-emerald-800">Cambio</span>
              <span class="text-lg font-bold text-emerald-700">$ {{ money(cambio.toString()) }}</span>
            </div>
          }
        } @else if (attempt.receipt_file_url) {
          <!-- Transferencia con comprobante ya subido: aprobar o rechazar. -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              (click)="receiptPreviewOpen.set(true)"
              class="text-sm font-medium text-indigo-600 hover:underline"
            >
              Ver comprobante
            </button>
            <button
              (click)="approve(attempt)"
              [disabled]="busy() || !cashShiftId"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Aprobar
            </button>
            <button
              (click)="showReject.set(!showReject())"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar
            </button>
          </div>
          @if (!cashShiftId) {
            <p class="text-sm text-red-600">Abre un turno de caja para poder aprobar el pago.</p>
          }

          @if (showReject()) {
            <div class="flex items-center gap-2 pt-1 flex-wrap">
              <input
                type="text"
                [(ngModel)]="rejectReason"
                placeholder="Motivo del rechazo (obligatorio)"
                class="flex-1 min-h-11 px-2 py-1 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <button
                (click)="reject(attempt)"
                [disabled]="busy() || !rejectReason.trim()"
                class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Confirmar rechazo
              </button>
            </div>
          }
        } @else {
          <p class="text-sm text-amber-700">Esperando que el comensal suba el comprobante…</p>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              (click)="showRejectOrder.set(!showRejectOrder())"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar pedido
            </button>
          </div>
        }

        @if (showRejectOrder()) {
          <!-- Spec 044: rechaza el pedido completo (no solo el intento) con motivo
               obligatorio -- solo disponible desde las ramas efectivo y "sin
               comprobante aún" de arriba; la transferencia con comprobante conserva
               su propio "Rechazar" (rechaza el intento, permite reintentar). -->
          <div class="flex items-center gap-2 pt-1 flex-wrap">
            <input
              type="text"
              [(ngModel)]="rejectOrderReason"
              placeholder="Motivo del rechazo (obligatorio)"
              class="flex-1 min-h-11 px-2 py-1 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <button
              (click)="rejectOrder(order)"
              [disabled]="busy() || !rejectOrderReason.trim()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              Confirmar rechazo del pedido
            </button>
          </div>
        }
      </div>
    } @else if (lastResolved(); as last) {
      @if (last.status === 'confirmado') {
        <p class="text-base text-emerald-700 font-medium">✓ Pago confirmado ({{ last.payment_method_name }})</p>
        @if (last.is_cash) {
          <p class="text-sm text-emerald-700">
            Recibido: $ {{ money(last.amount_received) }} · Cambio: $ {{ money(last.change_amount) }}
          </p>
        }
      } @else {
        <p class="text-sm text-gray-400">Sin pago confirmado — el último intento fue rechazado.</p>
      }
    } @else {
      <p class="text-sm text-gray-400">El comensal aún no inició el pago.</p>
    }

    <!--
      Vista previa del comprobante sin salir de la terminal (feature 028,
      T008): antes target="_blank" abría otra pestaña, lo que le hacía
      perder de vista la mesa al cajero. Overlay simple a propósito — no hay
      un modal genérico reutilizable en el codebase, y esto no lo necesita.
    -->
    @if (receiptPreviewOpen() && current()?.receipt_file_url; as url) {
      <div
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        (click)="receiptPreviewOpen.set(false)"
      >
        <div class="max-w-2xl max-h-[90vh] flex flex-col items-center gap-3" (click)="$event.stopPropagation()">
          <img [src]="url" alt="Comprobante de pago" class="max-w-full max-h-[80vh] rounded-lg shadow-xl object-contain" />
          <button
            type="button"
            (click)="receiptPreviewOpen.set(false)"
            class="min-h-11 px-5 py-2 bg-white text-gray-800 text-sm font-semibold rounded-xl hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    }
  `,
})
export class PaymentAttemptReviewPanelComponent implements OnChanges {
  @Input({ required: true }) order!: DiningOrder;
  /**
   * Turno de caja abierto (feature 028): aprobar/confirmar ya genera la
   * venta/factura en la misma llamada, así que la necesita — igual que el
   * cobro de mostrador. `null` si no hay turno abierto; en ese caso las
   * acciones quedan deshabilitadas.
   */
  @Input() cashShiftId: string | null = null;
  /** Se emite tras aprobar/rechazar/confirmar — el padre recarga la orden. */
  @Output() resolved = new EventEmitter<void>();

  private readonly api = inject(DiningSessionService);
  private readonly toast = inject(ToastService);

  readonly attempts = signal<PaymentAttempt[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly showReject = signal(false);
  readonly receiptPreviewOpen = signal(false);
  rejectReason = '';
  amountReceived: number | null = null;
  /** Spec 044 — rechazo de pedido completo (efectivo / sin comprobante aún).
   *  Nombres distintos de `showReject`/`rejectReason` (que siguen siendo solo
   *  del rechazo de intento con reintento, transferencia con comprobante). */
  readonly showRejectOrder = signal(false);
  rejectOrderReason = '';

  ngOnChanges(): void {
    this.receiptPreviewOpen.set(false);
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

  /** spec 026, FR-004/FR-005: formatea el monto recibido/cambio de forma
   *  consistente, incluyendo explícitamente "0.00" cuando el cambio es cero
   *  (nunca se omite el dato). */
  money(value: string | null): string {
    return Number(value ?? 0).toFixed(2);
  }

  /** Total cobrable de la orden — mismo criterio que el backend
   *  (`_order_total`): suma `unit_price * quantity` sobre ítems no
   *  anulados. Ya viene en `order.items`, sin IO adicional. */
  private orderTotal(): number {
    return (this.order.items ?? [])
      .filter((it) => it.estado_cocina !== 'anulado')
      .reduce((sum, it) => sum + Number(it.unit_price) * it.quantity, 0);
  }

  /** Vista previa del cambio mientras el cajero escribe el monto recibido,
   *  antes de confirmar (feature 028; spec 026 FR-004 reutilizado). `null`
   *  si todavía no hay un monto válido que alcance el total — nada que
   *  mostrar aún. */
  cashChangePreview(): number | null {
    const amount = this.amountReceived;
    if (!amount || amount < this.orderTotal()) return null;
    return amount - this.orderTotal();
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
    if (!this.cashShiftId) {
      this.toast.error('No hay un turno de caja abierto.');
      return;
    }
    this.busy.set(true);
    try {
      await this.api.approvePaymentAttempt(attempt.id, this.cashShiftId);
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
    if (!this.cashShiftId) {
      this.toast.error('No hay un turno de caja abierto.');
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.confirmCashPaymentAttempt(
        attempt.id,
        this.amountReceived,
        this.cashShiftId,
      );
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

  /**
   * Rechaza el pedido completo (spec 044), no solo el intento de pago vigente
   * -- reutiliza `cancelOrder` (mismo endpoint que ya usa el panel de cobro,
   * `POST /orders/{id}/cancel`), que en la misma transacción también resuelve
   * (marca `rechazado`) el intento `pendiente` de la orden. Solo se llama
   * desde las ramas efectivo / "sin comprobante aún" del template.
   */
  async rejectOrder(order: DiningOrder): Promise<void> {
    if (!this.rejectOrderReason.trim()) return;
    this.busy.set(true);
    try {
      await this.api.cancelOrder(order.id, this.rejectOrderReason.trim());
      this.toast.info('Pedido rechazado');
      this.rejectOrderReason = '';
      this.showRejectOrder.set(false);
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo rechazar el pedido.'));
    } finally {
      this.busy.set(false);
    }
  }
}
