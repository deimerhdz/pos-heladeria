import { Component, OnInit, inject, signal } from '@angular/core';
import { PaymentMethodService } from '../services/payment-method.service';

@Component({
  selector: 'app-payment-methods-page',
  standalone: true,
  template: `
    <div class="space-y-6 max-w-2xl">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Métodos de pago</h1>
          <p class="text-gray-500 text-sm mt-1">Formas de cobro disponibles en el checkout</p>
        </div>
        <button
          (click)="showForm.set(true)"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          + Nuevo método
        </button>
      </div>

      @if (svc.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ svc.error() }}</div>
      }

      @if (svc.loading() && svc.methods().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (svc.methods().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">💳</div>
              <p class="text-gray-600 font-medium">Aún no hay métodos de pago</p>
              <p class="text-gray-400 text-sm mt-1">Crea al menos uno (ej: Efectivo) para poder cobrar</p>
            </div>
          } @else {
            <ul class="divide-y divide-gray-50">
              @for (m of svc.methods(); track m.id) {
                <li class="flex items-center justify-between px-5 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-xl">{{ m.is_cash ? '💵' : '💳' }}</span>
                    <div>
                      <p class="text-sm font-medium text-gray-900">{{ m.name }}</p>
                      <p class="text-xs text-gray-400">{{ m.is_cash ? 'Efectivo' : 'Electrónico' }}</p>
                    </div>
                  </div>
                  @if (m.active) {
                    <span class="text-xs px-2.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Activo</span>
                  } @else {
                    <span class="text-xs px-2.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Inactivo</span>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>

    <!-- Modal crear -->
    @if (showForm()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 class="text-lg font-semibold text-gray-900">Nuevo método de pago</h2>
            <button type="button" (click)="closeForm()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nombre <span class="text-red-500">*</span></label>
              <input
                type="text"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
                placeholder="Ej: Efectivo, Nequi, Tarjeta…"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" [checked]="isCash()" (change)="isCash.set($any($event.target).checked)" class="rounded" />
              Es efectivo (afecta el arqueo de caja)
            </label>
            @if (svc.error()) {
              <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{{ svc.error() }}</p>
            }
            <div class="flex gap-3 pt-1">
              <button (click)="closeForm()" class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                (click)="submit()"
                [disabled]="svc.isSubmitting() || !name().trim()"
                class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class PaymentMethodsPageComponent implements OnInit {
  readonly svc = inject(PaymentMethodService);

  readonly showForm = signal(false);
  readonly name = signal('');
  readonly isCash = signal(true);

  ngOnInit(): void {
    this.svc.load();
  }

  closeForm(): void {
    this.showForm.set(false);
    this.name.set('');
    this.isCash.set(true);
    this.svc.error.set(null);
  }

  async submit(): Promise<void> {
    if (!this.name().trim()) return;
    const ok = await this.svc.create(this.name().trim(), this.isCash());
    if (ok) this.closeForm();
  }
}
