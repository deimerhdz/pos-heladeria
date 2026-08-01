import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { SalesService } from '../services/sales.service';
import { PaymentMethodService } from '../services/payment-method.service';
import { Sale } from '../interfaces/sales.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PrinterSettingsStore } from '../../../core/printing/printer-settings.store';
import {
  buildReceiptHtml,
  formatInvoice,
  printReceiptHtml,
  saleToReceipt,
} from '../../tables/services/receipt.util';

@Component({
  selector: 'app-sales-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <div class="space-y-6 max-w-3xl">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Ventas</h1>
          <p class="text-gray-500 text-sm mt-1">Historial de ventas emitidas</p>
        </div>
        <button
          (click)="svc.list()"
          class="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          ↻ Actualizar
        </button>
      </div>

      @if (svc.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ svc.error() }}</div>
      }

      @if (svc.loading() && svc.sales().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (svc.sales().length === 0) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center text-gray-400">
          <p class="text-4xl mb-3">🧾</p>
          <p class="font-medium">Aún no hay ventas</p>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          @for (sale of svc.sales(); track sale.id) {
            <button (click)="selected.set(sale)" class="w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
              <div class="min-w-0">
                <p class="text-sm font-medium text-gray-900">{{ docLabel(sale) }}</p>
                <p class="text-xs text-gray-400">
                  {{ sale.sold_at | date: 'dd/MM HH:mm' }}{{ sale.customer_name ? ' · ' + sale.customer_name : '' }}
                </p>
              </div>
              <span class="text-sm font-bold text-gray-900 shrink-0">$ {{ +sale.total | number: '1.2-2' }}</span>
            </button>
          }
        </div>
      }
    </div>

    <!-- Recibo -->
    @if (selected(); as r) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="selected.set(null)">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
            <h2 class="text-lg font-semibold text-gray-900">{{ docLabel(r) }}</h2>
            <div class="flex items-center gap-2 shrink-0">
              <button
                (click)="print(r)"
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                🧾 Imprimir
              </button>
              <button (click)="selected.set(null)" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>
          <div class="px-6 py-4 space-y-3 text-sm">
            <p class="text-xs text-gray-400">{{ r.sold_at | date: 'dd/MM/yyyy HH:mm' }}{{ r.customer_name ? ' · ' + r.customer_name : '' }}</p>
            <div class="space-y-1">
              @for (it of r.items ?? []; track it.id) {
                <div class="flex justify-between">
                  <span class="text-gray-700">{{ it.quantity }}× {{ it.description }}</span>
                  <span class="text-gray-600">$ {{ +it.line_total | number: '1.2-2' }}</span>
                </div>
              }
            </div>
            <div class="border-t border-gray-100 pt-2 space-y-1">
              <div class="flex justify-between text-gray-500"><span>Subtotal</span><span>$ {{ +r.subtotal | number: '1.2-2' }}</span></div>
              @if (+r.discount > 0) { <div class="flex justify-between text-gray-500"><span>Descuento</span><span>− $ {{ +r.discount | number: '1.2-2' }}</span></div> }
              @if (+r.tax > 0) { <div class="flex justify-between text-gray-500"><span>Impuesto</span><span>$ {{ +r.tax | number: '1.2-2' }}</span></div> }
              @if (+r.tip > 0) { <div class="flex justify-between text-gray-500"><span>Propina</span><span>$ {{ +r.tip | number: '1.2-2' }}</span></div> }
              <div class="flex justify-between font-bold text-base"><span>Total</span><span>$ {{ +r.total | number: '1.2-2' }}</span></div>
            </div>
            @if (r.payments && r.payments.length > 0) {
              <div class="border-t border-gray-100 pt-2">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pagos</p>
                @for (p of r.payments; track p.id) {
                  <div class="flex justify-between text-gray-600">
                    <span>{{ methodName(p.payment_method_id) }}</span>
                    <span>$ {{ +p.amount | number: '1.2-2' }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SalesPageComponent implements OnInit {
  readonly svc = inject(SalesService);
  private readonly methods = inject(PaymentMethodService);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly printer = inject(PrinterSettingsStore);
  readonly selected = signal<Sale | null>(null);

  ngOnInit(): void {
    this.svc.list();
    this.methods.load();
    // Para el ticket: nombre del negocio, logo y mensaje de cierre.
    if (!this.tenantInfo.info()) void this.tenantInfo.load();
  }

  methodName(id: string): string {
    return this.methods.methods().find((m) => m.id === id)?.name ?? 'Pago';
  }

  /** Cómo se identifica la venta: por su factura, o por el id si no tiene. */
  docLabel(sale: Sale): string {
    return sale.invoice ? `Factura ${formatInvoice(sale.invoice)}` : `Venta #${sale.id.slice(0, 8)}`;
  }

  /** Reimprime el mismo ticket que salió al cobrar. */
  print(sale: Sale): void {
    printReceiptHtml(
      buildReceiptHtml(
        [
          saleToReceipt(sale, {
            businessName: this.tenantInfo.businessName(),
            logoUrl: this.tenantInfo.logoUrl(),
            message: this.tenantInfo.receiptMessage(),
            methodName: (id) => this.methodName(id),
          }),
        ],
        { paperWidthMm: this.printer.paperWidthMm() },
      ),
    );
  }
}
