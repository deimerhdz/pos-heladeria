import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  BillingMode,
  CloseSessionPayload,
  CloseSessionResponse,
  PaymentLine,
  SessionBill,
  SplitPayment,
} from '../interfaces/dining.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import { TableSessionService } from '../services/table-session.service';
import { PaymentInputComponent } from './payment-input.component';
import {
  PaymentDraft,
  emptyPaymentDraft,
  paymentIssue,
  paymentLines,
} from '../services/payment-draft.util';
import { ToastService } from '../../../shared/feedback/toast.service';

/** Cobro asignado a un comensal en modo `split`. */
interface SplitDraft {
  participantId: string | null;
  label: string;
  subtotal: number;
  /** Con qué método(s) paga su parte; puede combinar dos. */
  payment: PaymentDraft;
}

/**
 * Cuenta de la mesa y cobro.
 *
 * El desglose por comensal es exacto porque la asignación vive en cada ítem
 * (`order_items.participant_id`), no en el pedido: un pedido que mezcle
 * personas se reparte igualmente bien.
 */
@Component({
  selector: 'app-session-bill-panel',
  standalone: true,
  imports: [DecimalPipe, PaymentInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <h2 class="text-base font-bold text-gray-900 mb-3">Cuenta de la mesa</h2>

      @if (!bill) {
        @if (orphan) {
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-1">
            <p class="text-base font-semibold text-amber-900">No se puede cobrar esta mesa</p>
            <p class="text-sm text-amber-800">
              Tiene pedidos sin cobrar, pero su sesión está cerrada. Avisa al administrador.
            </p>
          </div>
        } @else {
          <p class="text-base text-gray-400 py-6 text-center">Selecciona una mesa con consumo.</p>
        }
      } @else {
        <!-- Desglose: ítems, descuento y subtotal por comensal (spec 026, FR-006) -->
        <div class="space-y-3 mb-4">
          @for (line of bill.split; track line.participant_id) {
            <div class="space-y-0.5">
              <div class="flex items-center justify-between text-base">
                <span class="text-gray-700 font-medium truncate">{{ lineLabel(line.display_label) }}</span>
                <span class="font-medium text-gray-900">$ {{ +line.subtotal | number: '1.2-2' }}</span>
              </div>
              <ul class="pl-3 space-y-0.5">
                @for (item of line.items; track $index) {
                  <li class="flex items-center justify-between text-sm text-gray-500">
                    <span class="truncate">{{ +item.quantity }}× {{ item.description }}</span>
                    <span>$ {{ +item.line_total | number: '1.2-2' }}</span>
                  </li>
                }
              </ul>
              @if (+line.discount > 0) {
                <div class="flex items-center justify-between text-sm text-emerald-700 pl-3">
                  <span>Descuento aplicado</span>
                  <span>- $ {{ +line.discount | number: '1.2-2' }}</span>
                </div>
              }
            </div>
          }
          <div class="flex items-center justify-between pt-2 border-t border-gray-100">
            <span class="text-base font-semibold text-gray-800">Total</span>
            <span class="text-lg font-bold text-gray-900">
              $ {{ +bill.total | number: '1.2-2' }}
            </span>
          </div>
        </div>

        @if (readOnly) {
          <!--
            Feature 028, T004/T009: pedido de canal qr — el comensal ya pagó a
            distancia y el cajero solo valida el comprobante (en el bloque de
            validación de pagos, no aquí). Mostrar el selector de método y el
            botón "Cobrar y cerrar mesa" en este modo era justo el bug de
            origen: cobrar de nuevo una mesa ya pagada por QR fallaba con un
            error que el cajero no sabía interpretar.
          -->
          <p class="text-sm text-gray-400 py-2">
            Pedido pagado por el comensal desde el QR — nada que cobrar aquí.
          </p>
        } @else {
        <!-- Modo de cobro -->
        <div class="flex gap-2 mb-3">
          <button
            (click)="mode.set('unified')"
            class="flex-1 min-h-11 py-2 rounded-lg text-sm font-semibold border transition-colors"
            [class]="
              mode() === 'unified'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            "
          >
            Cuenta única
          </button>
          <button
            (click)="mode.set('split')"
            [disabled]="!canSplit()"
            class="flex-1 min-h-11 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40"
            [class]="
              mode() === 'split'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            "
          >
            Dividir por comensal
          </button>
        </div>

        @if (!canSplit()) {
          <p class="text-sm text-gray-400 mb-3">
            Dividir requiere consumo asignado a más de un comensal.
          </p>
        }

        <!-- Pago -->
        <div class="flex-1 overflow-y-auto space-y-2 mb-3">
          @if (mode() === 'unified') {
            <app-payment-input
              [total]="total()"
              [methods]="methods"
              (changed)="unifiedPayment.set($event)"
            />
          } @else {
            <p class="text-sm text-gray-500">Cómo paga cada comensal con consumo:</p>
            @for (d of splits(); track d.participantId) {
              <div class="border border-gray-200 rounded-lg p-2">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-base font-semibold text-gray-700 truncate">{{ d.label }}</span>
                  <span class="text-base font-medium text-gray-900">
                    $ {{ d.subtotal | number: '1.2-2' }}
                  </span>
                </div>
                <app-payment-input
                  [total]="d.subtotal"
                  [methods]="methods"
                  (changed)="setSplitPayment(d.participantId, $event)"
                />
              </div>
            }
          }
        </div>

        @if (error()) {
          <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <p class="text-sm text-red-700">{{ error() }}</p>
          </div>
        }

        <button
          (click)="charge()"
          [disabled]="submitting() || !ready()"
          class="w-full min-h-11 py-2.5 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {{ submitting() ? 'Cobrando...' : 'Cobrar y cerrar mesa' }}
        </button>
        }
      }
    </div>
  `,
})
export class SessionBillPanelComponent implements OnChanges {
  @Input() bill: SessionBill | null = null;
  @Input() methods: PaymentMethod[] = [];
  @Input() cashShiftId: string | null = null;
  /** A nombre de quién se factura la cuenta única; vacío lo resuelve el backend. */
  @Input() customerName = '';
  /** La mesa tiene consumo pero ninguna sesión activa que cobrar. */
  @Input() orphan = false;
  /**
   * Feature 028 (T004/T009): `true` cuando el pedido activo es de canal `qr`
   * — el comensal ya pagó a distancia. Oculta el selector de método y el
   * botón "Cobrar y cerrar mesa"; solo queda el desglose de lectura.
   */
  @Input() readOnly = false;
  /**
   * Gancho que corre justo antes de cerrar: si devuelve `false` no se cobra.
   *
   * Lo usa la terminal para resolver de una vez los productos que siguen sin
   * marcar como listos, que el backend rechazaría con un `409`. Va como
   * callback para no acoplar este panel al store de la terminal.
   */
  @Input() beforeCharge: (() => Promise<boolean>) | null = null;
  /** Cierre completo: sus `sale_ids` son la fuente de la factura impresa. */
  @Output() charged = new EventEmitter<CloseSessionResponse>();

  private readonly api = inject(TableSessionService);
  private readonly toast = inject(ToastService);

  readonly mode = signal<BillingMode>('unified');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly splits = signal<SplitDraft[]>([]);

  /**
   * Cómo se paga la cuenta única. **Es una señal**: `ready()` la lee, y un
   * `computed` solo se recalcula cuando cambia una señal. Como campo normal, el
   * botón de cobrar se quedaba deshabilitado para siempre.
   */
  readonly unifiedPayment = signal<PaymentDraft>(emptyPaymentDraft());

  /**
   * Espejo de la cuenta que llega por `@Input`.
   *
   * Los `computed` de abajo dependen de ella: leer `this.bill` directamente los
   * dejaría congelados en su primer valor, porque un campo normal no notifica
   * cambios (es el mismo fallo que tenía `unifiedMethod`).
   */
  private readonly currentBill = signal<SessionBill | null>(null);

  readonly total = computed(() => Number(this.currentBill()?.total ?? 0));

  /** Dividir solo tiene sentido si hay consumo de más de un comensal. */
  readonly canSplit = computed(() => (this.currentBill()?.split.length ?? 0) > 1);

  /**
   * Solo se cobra si **ningún** bloque tiene incidencia: método sin elegir,
   * importe corto, o un cobro electrónico por encima de lo que se debe (eso
   * descuadraría el efectivo esperado del turno).
   */
  readonly ready = computed(() => {
    if (this.mode() === 'unified') {
      return paymentIssue(this.unifiedPayment(), this.total(), this.methods) === null;
    }
    return (
      this.splits().length > 0 &&
      this.splits().every((s) => paymentIssue(s.payment, s.subtotal, this.methods) === null)
    );
  });

  /**
   * Resetea el pago **solo cuando cambia la cuenta**, no ante cualquier `@Input`.
   *
   * Sin mirar `changes`, un cambio en `methods`, `cashShiftId` o `customerName`
   * —o cualquier `@Input` que se añada mañana— borraba el efectivo que el cajero
   * estaba tecleando. Ese era el motivo real de que el sondeo no pudiera recargar
   * la cuenta, y por el que un `session.bill_changed` la marca obsoleta en vez de
   * recargarla: la recarga es una decisión del cajero, con el botón "Actualizar".
   *
   * Cuando la cuenta **sí** cambia, el pago se reinicia a propósito: los importes
   * anteriores son de un total que ya no existe, y cobrarlos descuadraría el
   * turno. (`PaymentInputComponent` lo reinicia por su cuenta de todos modos al
   * recibir otro `total`.)
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['bill']) return;

    this.error.set(null);
    this.currentBill.set(this.bill);
    this.unifiedPayment.set(emptyPaymentDraft());
    this.splits.set(
      (this.bill?.split ?? []).map((l) => ({
        participantId: l.participant_id,
        label: this.lineLabel(l.display_label),
        subtotal: Number(l.subtotal),
        payment: emptyPaymentDraft(),
      })),
    );
    if (!this.canSplit()) this.mode.set('unified');
  }

  /** Los ítems sin comensal los añadió el mesero. */
  lineLabel(label: string | null): string {
    return label ?? 'Sin asignar (mesero)';
  }

  setSplitPayment(participantId: string | null, payment: PaymentDraft): void {
    this.splits.update((list) =>
      list.map((s) => (s.participantId === participantId ? { ...s, payment } : s)),
    );
  }

  async charge(): Promise<void> {
    if (!this.bill || !this.cashShiftId) {
      this.error.set('No hay un turno de caja abierto.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      // Antes del cierre, no después: el 409 por ítems sin terminar dejaría al
      // cajero con un error que solo puede resolver en otra pantalla.
      if (this.beforeCharge && !(await this.beforeCharge())) return;
      const closed = await this.api.close(
        this.bill.table_session_id,
        this.buildPayload(this.cashShiftId),
      );
      this.toast.success('Mesa cobrada y liberada');
      this.charged.emit(closed);
    } catch (err) {
      this.showChargeError(err);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * En efectivo se manda **lo que entregó el cliente**, no el importe justo: el
   * backend deriva de ahí `paid_amount` y `change_given`, y sin eso el vuelto no
   * se descuenta del efectivo esperado del turno.
   */
  private buildPayload(cashShiftId: string): CloseSessionPayload {
    if (this.mode() === 'unified') {
      const payments: PaymentLine[] = paymentLines(this.unifiedPayment());
      const nombre = this.customerName.trim();
      return {
        cash_shift_id: cashShiftId,
        billing_mode: 'unified',
        payments,
        // Vacío no se manda: el backend cae a los comensales o a la mesa.
        ...(nombre ? { customer_name: nombre } : {}),
      };
    }
    // En `split` cada venta va a nombre de su comensal, no del campo Cliente.
    const splits: SplitPayment[] = this.splits().map((s) => ({
      participant_id: s.participantId,
      payments: paymentLines(s.payment),
    }));
    return { cash_shift_id: cashShiftId, billing_mode: 'split', splits };
  }

  /**
   * Los rechazos al cerrar son accionables, no genéricos: o falta confirmar
   * pedidos, o hay comida sin terminar, o el split deja comensales sin cubrir.
   */
  private showChargeError(err: unknown): void {
    const blocked = this.api.closeBlocked(err);
    if (blocked) {
      this.error.set(blocked.error);
      return;
    }
    const incomplete = this.api.splitIncomplete(err);
    if (incomplete) {
      const missing = this.splits()
        .filter((s) => (incomplete.participant_ids ?? []).includes(s.participantId ?? ''))
        .map((s) => s.label);
      this.error.set(
        missing.length > 0
          ? `Falta asignar el pago de: ${missing.join(', ')}.`
          : incomplete.error,
      );
      return;
    }
    this.error.set(this.api.extractError(err, 'No se pudo cobrar la mesa.'));
  }
}
