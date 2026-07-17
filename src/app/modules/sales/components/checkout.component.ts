import { DecimalPipe } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CashService } from '../../cash-register/services/cash.service';
import { PaymentMethodService } from '../services/payment-method.service';
import { SalesService } from '../services/sales.service';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { MenuService } from '../../menu/services/menu.service';
import { buildMenuLookup } from '../../tables/services/menu-lookup';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { Sale, SaleItemPayload } from '../interfaces/sales.interface';

interface PaymentRow {
  payment_method_id: string;
  amount: string;
  reference: string;
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">
              {{ view() === 'receipt' ? 'Venta emitida' : 'Cobrar' }}
            </h2>
            <p class="text-xs text-gray-400">{{ tableLabel }}{{ customerName ? ' · ' + customerName : '' }}</p>
          </div>
          <button type="button" (click)="cancelled.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>

        <!-- ═══ FORM ═══ -->
        @if (view() === 'form') {
          @if (!cash.isOpen()) {
            <div class="p-6 text-center space-y-3">
              <div class="text-4xl">🔒</div>
              <p class="text-sm text-gray-600">Necesitas un <strong>turno de caja abierto</strong> para cobrar.</p>
              <p class="text-xs text-gray-400">Ve a <span class="font-mono">Caja</span> y abre un turno.</p>
            </div>
          } @else if (methods().length === 0) {
            <div class="p-6 text-center space-y-3">
              <div class="text-4xl">💳</div>
              <p class="text-sm text-gray-600">No hay <strong>métodos de pago</strong> configurados.</p>
              <p class="text-xs text-gray-400">Un administrador debe crearlos en <span class="font-mono">Métodos de pago</span>.</p>
            </div>
          } @else {
            <div class="px-6 py-4 space-y-4 overflow-y-auto">
              <!-- Items -->
              <div>
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ítems</p>
                <div class="space-y-1.5">
                  @for (line of lines(); track $index) {
                    <div class="flex items-start justify-between text-sm gap-2">
                      <div class="min-w-0">
                        <span class="text-gray-800"><span class="font-medium">{{ line.quantity }}×</span> {{ line.label }}</span>
                        @if (line.optionLabel) {
                          <span class="block text-xs text-gray-400">{{ line.optionLabel }}</span>
                        }
                      </div>
                      <span class="text-gray-700 shrink-0">$ {{ line.lineTotal | number: '1.2-2' }}</span>
                    </div>
                  } @empty {
                    <p class="text-sm text-gray-400">Esta sesión no tiene ítems para cobrar.</p>
                  }
                </div>
              </div>

              <!-- Ajustes -->
              <div class="grid grid-cols-3 gap-2">
                <label class="text-xs text-gray-500">Descuento
                  <input type="number" min="0" [value]="discount()" (input)="discount.set($any($event.target).value)"
                    class="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
                <label class="text-xs text-gray-500">Impuesto
                  <input type="number" min="0" [value]="tax()" (input)="tax.set($any($event.target).value)"
                    class="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
                <label class="text-xs text-gray-500">Propina
                  <input type="number" min="0" [value]="tip()" (input)="tip.set($any($event.target).value)"
                    class="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
              </div>

              <!-- Totales -->
              <div class="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-gray-500">Subtotal</span><span>$ {{ subtotal() | number: '1.2-2' }}</span></div>
                <div class="flex justify-between font-bold text-base border-t border-gray-200 pt-1 mt-1">
                  <span>Total</span><span class="text-indigo-600">$ {{ total() | number: '1.2-2' }}</span>
                </div>
              </div>

              <!-- Pagos -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagos</p>
                  <button (click)="addPayment()" class="text-xs font-medium text-indigo-600 hover:text-indigo-800">+ Dividir pago</button>
                </div>
                <div class="space-y-2">
                  @for (pay of payments(); track $index) {
                    <div class="flex items-center gap-2">
                      <select
                        [value]="pay.payment_method_id"
                        (change)="updatePayment($index, 'payment_method_id', $any($event.target).value)"
                        class="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        @for (m of methods(); track m.id) {
                          <option [value]="m.id">{{ m.name }}</option>
                        }
                      </select>
                      <input
                        type="number" min="0" [value]="pay.amount"
                        (input)="updatePayment($index, 'amount', $any($event.target).value)"
                        placeholder="Monto"
                        class="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      @if (payments().length > 1) {
                        <button (click)="removePayment($index)" class="text-gray-400 hover:text-red-600 text-sm px-1">✕</button>
                      }
                    </div>
                  }
                </div>
                <div class="flex justify-between text-xs mt-2" [class]="remainingClass()">
                  <span>{{ remaining() > 0.005 ? 'Falta' : (remaining() < -0.005 ? 'Cambio' : 'Cubierto') }}</span>
                  <span>$ {{ absRemaining() | number: '1.2-2' }}</span>
                </div>
              </div>

              @if (sales.error()) {
                <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{{ sales.error() }}</p>
              }
            </div>

            <div class="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
              <button (click)="cancelled.emit()" class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                (click)="charge()"
                [disabled]="sales.isSubmitting() || !canCharge()"
                class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {{ sales.isSubmitting() ? 'Cobrando…' : 'Cobrar $ ' + (total() | number: '1.2-2') }}
              </button>
            </div>
          }
        }

        <!-- ═══ RECEIPT ═══ -->
        @if (view() === 'receipt' && receipt(); as r) {
          <div class="px-6 py-5 space-y-4 overflow-y-auto text-center">
            <div class="text-4xl">🧾</div>
            <p class="text-sm text-gray-500">Venta #{{ r.id.slice(0, 8) }}</p>
            <div class="text-left bg-gray-50 rounded-xl p-4 space-y-1 text-sm">
              @for (it of r.items ?? []; track it.id) {
                <div class="flex justify-between">
                  <span class="text-gray-700">{{ it.quantity }}× {{ it.description }}</span>
                  <span class="text-gray-600">$ {{ +it.line_total | number: '1.2-2' }}</span>
                </div>
              }
              <div class="border-t border-gray-200 mt-2 pt-2 space-y-1">
                <div class="flex justify-between text-gray-500"><span>Subtotal</span><span>$ {{ +r.subtotal | number: '1.2-2' }}</span></div>
                @if (+r.discount > 0) { <div class="flex justify-between text-gray-500"><span>Descuento</span><span>− $ {{ +r.discount | number: '1.2-2' }}</span></div> }
                @if (+r.tax > 0) { <div class="flex justify-between text-gray-500"><span>Impuesto</span><span>$ {{ +r.tax | number: '1.2-2' }}</span></div> }
                @if (+r.tip > 0) { <div class="flex justify-between text-gray-500"><span>Propina</span><span>$ {{ +r.tip | number: '1.2-2' }}</span></div> }
                <div class="flex justify-between font-bold text-base"><span>Total</span><span>$ {{ +r.total | number: '1.2-2' }}</span></div>
              </div>
            </div>
            @if (closeError()) {
              <p class="text-amber-600 text-xs">Venta emitida, pero no se pudo cerrar la sesión: {{ closeError() }}</p>
            }
            <button (click)="paid.emit()" class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
              Listo
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class CheckoutComponent implements OnInit {
  @Input({ required: true }) sessionId!: string;
  @Input() diningTableId: string | null = null;
  @Input() customerName: string | null = null;
  @Input() tableLabel = '';
  @Input({ required: true }) orders: DiningOrder[] = [];

  @Output() paid = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly cash = inject(CashService);
  readonly paymentMethods = inject(PaymentMethodService);
  readonly sales = inject(SalesService);
  private readonly sessions = inject(DiningSessionService);
  private readonly menu = inject(MenuService);

  readonly view = signal<'form' | 'receipt'>('form');
  readonly receipt = signal<Sale | null>(null);
  readonly closeError = signal<string | null>(null);

  readonly discount = signal('');
  readonly tax = signal('');
  readonly tip = signal('');
  readonly payments = signal<PaymentRow[]>([]);

  readonly methods = computed(() => this.paymentMethods.methods().filter((m) => m.active));
  private readonly lookup = computed(() => buildMenuLookup(this.menu.categories()));

  readonly lines = computed(() => {
    const lk = this.lookup();
    const out: { product_variant_id: string; quantity: number; option_ids: string[]; label: string; optionLabel: string; lineTotal: number }[] = [];
    for (const order of this.orders) {
      for (const item of order.items ?? []) {
        const optionIds = (item.options ?? []).map((o) => o.option_id);
        const unit = lk.variantPrice(item.product_variant_id) + optionIds.reduce((s, id) => s + lk.optionPrice(id), 0);
        out.push({
          product_variant_id: item.product_variant_id,
          quantity: item.quantity,
          option_ids: optionIds,
          label: lk.variantLabel(item.product_variant_id),
          optionLabel: optionIds.map((id) => lk.optionLabel(id)).filter(Boolean).join(', '),
          lineTotal: unit * item.quantity,
        });
      }
    }
    return out;
  });

  readonly subtotal = computed(() => this.lines().reduce((s, l) => s + l.lineTotal, 0));
  readonly total = computed(() =>
    Math.max(0, this.subtotal() - this.num(this.discount()) + this.num(this.tax()) + this.num(this.tip())),
  );
  readonly paidAmount = computed(() => this.payments().reduce((s, p) => s + this.num(p.amount), 0));
  readonly remaining = computed(() => this.total() - this.paidAmount());
  readonly absRemaining = computed(() => Math.abs(this.remaining()));

  async ngOnInit(): Promise<void> {
    this.menu.loadMenu();
    await this.paymentMethods.load();
    // Recover an open shift if the cashier didn't pass through /dashboard/caja this load.
    if (!this.cash.shift()) {
      await this.cash.loadRegisters();
      await this.cash.restoreShift();
    }
    // Prefill a single payment for the full total with the first (cash-preferred) method.
    const first = this.methods().find((m) => m.is_cash) ?? this.methods()[0];
    if (first) {
      this.payments.set([{ payment_method_id: first.id, amount: this.total().toFixed(2), reference: '' }]);
    }
  }

  addPayment(): void {
    const first = this.methods()[0];
    if (!first) return;
    const remaining = Math.max(0, this.remaining());
    this.payments.update((list) => [
      ...list,
      { payment_method_id: first.id, amount: remaining.toFixed(2), reference: '' },
    ]);
  }

  removePayment(index: number): void {
    this.payments.update((list) => list.filter((_, i) => i !== index));
  }

  updatePayment(index: number, field: keyof PaymentRow, value: string): void {
    this.payments.update((list) => list.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  canCharge(): boolean {
    return (
      this.cash.isOpen() &&
      this.lines().length > 0 &&
      this.total() > 0 &&
      this.payments().every((p) => p.payment_method_id && this.num(p.amount) > 0) &&
      this.remaining() <= 0.005 // fully covered (change allowed)
    );
  }

  remainingClass(): string {
    if (this.remaining() > 0.005) return 'text-red-600';
    if (this.remaining() < -0.005) return 'text-amber-600';
    return 'text-green-600';
  }

  async charge(): Promise<void> {
    if (!this.canCharge()) return;
    const shift = this.cash.shift();
    if (!shift) return;

    const items: SaleItemPayload[] = this.lines().map((l) => ({
      product_variant_id: l.product_variant_id,
      quantity: l.quantity,
      option_ids: l.option_ids,
    }));

    const sale = await this.sales.checkout({
      cash_shift_id: shift.id,
      dining_session_id: this.sessionId,
      dining_table_id: this.diningTableId,
      customer_name: this.customerName,
      discount: this.num(this.discount()),
      tax: this.num(this.tax()),
      tip: this.num(this.tip()),
      items,
      payments: this.payments().map((p) => ({
        payment_method_id: p.payment_method_id,
        amount: this.num(p.amount),
        reference: p.reference.trim() || null,
      })),
    });

    if (!sale) return;

    // Best-effort: close the session now that it's been settled.
    try {
      await this.sessions.closeSession(this.sessionId);
    } catch (err) {
      this.closeError.set(this.sessions.extractError(err, 'ciérrala manualmente.'));
    }

    this.receipt.set(sale);
    this.view.set('receipt');
  }

  private num(value: string): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
}
