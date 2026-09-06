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
import {
  CloseSessionPayload,
  CloseSessionResponse,
  PaymentLine,
  SessionBill,
} from '../interfaces/dining.interface';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import { TableSessionService } from '../services/table-session.service';
import { PaymentInputComponent } from './payment-input.component';
import { BillSummaryComponent } from './bill-summary.component';
import { formatMoney } from '../../../shared/money';
import {
  PaymentDraft,
  emptyPaymentDraft,
  paymentIssue,
  paymentLines,
} from '../services/payment-draft.util';
import { ToastService } from '../../../shared/feedback/toast.service';

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
  imports: [PaymentInputComponent, BillSummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <h2 class="text-[15px] font-bold text-[#111827] mb-3">Cuenta de la mesa</h2>

      @if (paidSummary; as pagado) {
        <!-- Bugfix reportado sobre spec 049: la mesa puede tener pedidos ya
             cobrados (p. ej. mostrador pagado por adelantado) que el
             desglose de abajo no incluye a propósito (evita cobrar dos
             veces) — este bloque muestra ese consumo ya pagado aparte, sin
             mezclarlo con lo pendiente. -->
        <div class="mb-3 pb-3 border-b border-[#e5e7eb] space-y-1">
          <p class="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide">Ya pagado</p>
          <app-bill-summary
            [subtotal]="pagado.subtotal"
            [discount]="pagado.discount"
            [total]="pagado.total"
            totalLabel="Total pagado"
            size="sm"
          />
        </div>
      }

      @if (!bill) {
        @if (orphan) {
          <div class="bg-[#fffbeb] border border-[#fef3c7] rounded-[6px] px-3 py-3 space-y-1">
            <p class="text-[14px] font-semibold text-[#92400e]">No se puede cobrar esta mesa</p>
            <p class="text-[13px] text-[#b45309]">
              Tiene pedidos sin cobrar, pero su sesión está cerrada. Avisa al administrador.
            </p>
          </div>
        } @else {
          <p class="text-[14px] text-[#9ca3af] py-6 text-center">Selecciona una mesa con consumo.</p>
        }
      } @else {
        <!-- Cuentas: una tarjeta seleccionable por comensal (incluida la de
             participant_id null -- "sin asignar", ítems del mesero). Se
             elige por índice, no por participant_id, porque ese campo
             legítimamente puede ser null para "sin asignar" y necesitamos
             distinguir "sin selección" de "seleccioné la de sin asignar". -->
        <div class="mb-3">
          <p class="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide mb-1.5">Cuentas</p>
          <div class="flex flex-wrap gap-1.5">
            @for (line of bill.split; track $index; let i = $index) {
              <button
                type="button"
                (click)="selectedIndex.set(i)"
                class="flex-1 min-w-[140px] text-left px-2.5 py-2 rounded-[6px] border transition-colors"
                [class]="i === selectedIndex() ? 'border-[#4f46e5] bg-[#eef2ff]' : 'border-[#e5e7eb] bg-white hover:bg-[#f9fafb]'"
              >
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" [class]="i === selectedIndex() ? 'bg-[#4f46e5]' : 'bg-[#d1d5db]'"></span>
                  <span class="text-[13px] font-semibold text-[#111827] truncate">{{ lineLabel(line.display_label) }}</span>
                  <span class="text-[10px] font-medium text-[#6b7280] shrink-0">{{ line.items.length }} ítems</span>
                </div>
                <div class="text-[13px] font-bold text-[#4f46e5] mt-0.5">{{ money(+line.subtotal) }}</div>
              </button>
            }
          </div>
        </div>

        <!-- Productos de la cuenta seleccionada -->
        @if (selectedLine(); as line) {
          <div class="mb-3 pb-3 border-b border-[#e5e7eb]">
            <p class="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide mb-1.5">
              Productos en {{ lineLabel(line.display_label) }} ({{ line.items.length }} ítems)
            </p>
            <ul class="space-y-1">
              @for (item of line.items; track $index) {
                <li class="flex items-center justify-between text-[13px] text-[#4b5563]">
                  <span class="truncate">{{ +item.quantity }}× {{ item.description }}</span>
                  <span class="font-medium text-[#111827]">{{ money(+item.line_total) }}</span>
                </li>
              }
            </ul>
            <app-bill-summary
              [discount]="+line.discount"
              [total]="+line.subtotal"
              [totalLabel]="'Subtotal ' + lineLabel(line.display_label)"
              size="sm"
            />
          </div>
        }

        <!-- Totales de TODA la mesa -- lo que realmente cobra el botón de
             abajo, siempre visible aparte del subtotal de la cuenta
             seleccionada para no sugerir un cobro parcial que no existe. -->
        <div class="mb-4">
          @let summary = billSummary();
          <app-bill-summary
            [subtotal]="summary ? summary.subtotal : undefined"
            [subtotalLabel]="'Subtotal mesa (' + bill.split.length + ' cuenta' + (bill.split.length === 1 ? '' : 's') + ')'"
            [discount]="summary ? summary.discount : 0"
            [total]="+bill.total"
            totalLabel="Total a cobrar"
            size="md"
          />
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
          <p class="text-[13px] text-[#9ca3af] py-2">
            Pedido pagado por el comensal desde el QR — nada que cobrar aquí.
          </p>
        } @else {
        <!-- Pago -->
        <div class="flex-1 overflow-y-auto space-y-2 mb-3">
          <app-payment-input
            [total]="total()"
            [methods]="methods"
            (changed)="unifiedPayment.set($event)"
          />
        </div>

        @if (error()) {
          <div class="bg-[#fef2f2] border border-[#fecaca] rounded-[6px] px-3 py-2 mb-3">
            <p class="text-[13px] text-[#b91c1c]">{{ error() }}</p>
          </div>
        }

        <button
          (click)="charge()"
          [disabled]="submitting() || !ready()"
          class="w-full min-h-11 py-2.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[14px] font-semibold rounded-[6px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
  @Input() methods: PaymentMethodCheckoutOption[] = [];
  @Input() cashShiftId: string | null = null;
  /** A nombre de quién se factura la cuenta única; vacío lo resuelve el backend. */
  @Input() customerName = '';
  /** La mesa tiene consumo pero ninguna sesión activa que cobrar. */
  @Input() orphan = false;
  /**
   * Consumo ya cobrado de la mesa (pedidos `paid`), sumado desde las ventas
   * reales — independiente de `bill` (que a propósito excluye lo ya pagado).
   * `null` sin nada pagado. Ver `PosTerminalStore.selectedTablePaidSummary`.
   */
  @Input() paidSummary: { subtotal: number; discount: number; total: number } | null = null;
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

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

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

  /** Cuenta seleccionada en la sección "Cuentas" -- por índice de
   *  `bill.split`, no por `participant_id` (ese campo puede legítimamente
   *  ser `null` para "sin asignar", así que un índice evita la ambigüedad
   *  entre "nada seleccionado" y "seleccioné la de sin asignar"). Se
   *  resetea a la primera cuenta cada vez que cambia `bill` (mismo punto
   *  que ya resetea `unifiedPayment`). */
  readonly selectedIndex = signal(0);

  readonly selectedLine = computed(() => this.currentBill()?.split[this.selectedIndex()] ?? null);

  /**
   * Subtotal/descuento agregados de toda la cuenta, sumando las mismas
   * columnas que ya trae `bill.split` por comensal (spec 049, FR-003/FR-004).
   * `bill.total` no cambia: esto solo agrega dos filas encima, sin recalcular
   * nada que el backend no haya entregado ya.
   */
  readonly billSummary = computed(() => {
    const bill = this.currentBill();
    if (!bill) return null;
    return {
      subtotal: bill.split.reduce((s, l) => s + Number(l.subtotal), 0),
      discount: bill.split.reduce((s, l) => s + Number(l.discount), 0),
    };
  });

  /**
   * Solo se cobra si el bloque de pago no tiene incidencia: método sin
   * elegir, importe corto, o un cobro electrónico por encima de lo que se
   * debe (eso descuadraría el efectivo esperado del turno).
   */
  readonly ready = computed(
    () => paymentIssue(this.unifiedPayment(), this.total(), this.methods) === null,
  );

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
    this.selectedIndex.set(0);
  }

  /** Los ítems sin comensal los añadió el mesero — spec 057, FR-005/FR-006:
   *  se prioriza el nombre de cliente de la orden (ya disponible en
   *  `customerName`, el mismo que se envía como `customer_name` al cobrar)
   *  por encima de la etiqueta genérica, cuando existe. */
  lineLabel(label: string | null): string {
    if (label) return label;
    return this.customerName.trim() || 'Sin asignar (mesero)';
  }

  money(n: number): string {
    return formatMoney(n);
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
   *
   * Spec 046 (FR-005): "Dividir por comensal" se retiró — el cierre siempre
   * cobra la cuenta completa (`billing_mode: 'unified'`) con un único método.
   */
  private buildPayload(cashShiftId: string): CloseSessionPayload {
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

  /** Los rechazos al cerrar son accionables, no genéricos: o falta confirmar
   *  pedidos, o hay comida sin terminar. */
  private showChargeError(err: unknown): void {
    const blocked = this.api.closeBlocked(err);
    if (blocked) {
      this.error.set(blocked.error);
      return;
    }
    this.error.set(this.api.extractError(err, 'No se pudo cobrar la mesa.'));
  }
}
