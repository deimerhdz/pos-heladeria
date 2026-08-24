import { Component, OnInit, inject, signal } from '@angular/core';
import { PaymentMethodCatalogEntry } from '../interfaces/payment-method-catalog.interface';
import { PaymentMethodCatalogService } from '../services/payment-method-catalog.service';
import { PaymentMethodCatalogFormComponent } from '../components/payment-method-catalog-form.component';

const TYPE_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

/** Administración del catálogo de métodos de pago de la plataforma (spec 032,
 * Historia de Usuario 1). Mismo patrón que `tenants-page.component.ts`. */
@Component({
  selector: 'app-payment-method-catalog-page',
  standalone: true,
  imports: [PaymentMethodCatalogFormComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Métodos de pago</h1>
          <p class="text-gray-500 text-sm mt-1">
            Catálogo de la plataforma — los tenants solo pueden activar métodos de esta lista
          </p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nuevo método
        </button>
      </div>

      @if (catalogService.error() && !showForm()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ catalogService.error() }}
        </div>
      }

      @if (catalogService.loading() && entries().length === 0) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (entries().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">💳</div>
              <p class="text-gray-600 font-medium">Aún no hay métodos de pago en el catálogo</p>
              <button
                (click)="openCreate()"
                class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Crear el primero
              </button>
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">
                    Nombre
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                    Tipo
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                    Campos
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">
                    Estado
                  </th>
                  <th class="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (e of entries(); track e.id) {
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <span class="text-sm font-medium">{{ e.name }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ typeLabel(e.type) }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">
                        {{ e.fields.length === 0 ? 'Ninguno' : e.fields.length + ' campo(s)' }}
                      </span>
                    </td>
                    <td class="px-5 py-4">
                      <span
                        class="text-xs font-medium px-2 py-1 rounded-full"
                        [class.bg-green-50]="e.active"
                        [class.text-green-700]="e.active"
                        [class.bg-gray-100]="!e.active"
                        [class.text-gray-500]="!e.active"
                      >
                        {{ e.active ? 'Activo' : 'Inactivo' }}
                      </span>
                    </td>
                    <td class="px-5 py-4 text-right space-x-3">
                      <button
                        (click)="openEdit(e)"
                        class="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        (click)="toggleActive(e)"
                        class="text-sm font-medium"
                        [class.text-red-600]="e.active"
                        [class.hover:text-red-700]="e.active"
                        [class.text-green-600]="!e.active"
                        [class.hover:text-green-700]="!e.active"
                      >
                        {{ e.active ? 'Desactivar' : 'Activar' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    </div>

    @if (showForm()) {
      <app-payment-method-catalog-form
        [entry]="editing()"
        (saved)="onSaved()"
        (cancelled)="onCancelled()"
      />
    }
  `,
})
export class PaymentMethodCatalogPageComponent implements OnInit {
  readonly catalogService = inject(PaymentMethodCatalogService);
  readonly entries = this.catalogService.entries;
  readonly showForm = signal(false);
  readonly editing = signal<PaymentMethodCatalogEntry | null>(null);

  ngOnInit(): void {
    this.catalogService.load();
  }

  typeLabel(type: string): string {
    return TYPE_LABEL[type] ?? type;
  }

  openCreate(): void {
    this.editing.set(null);
    this.showForm.set(true);
  }

  openEdit(entry: PaymentMethodCatalogEntry): void {
    this.editing.set(entry);
    this.showForm.set(true);
  }

  async toggleActive(entry: PaymentMethodCatalogEntry): Promise<void> {
    await this.catalogService.update(entry.id, { active: !entry.active });
  }

  onSaved(): void {
    this.showForm.set(false);
  }

  onCancelled(): void {
    this.showForm.set(false);
  }
}
