import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BillingCycle, Tenant } from '../interfaces/tenant.interface';
import { TenantService } from '../services/tenant.service';
import { PlanService } from '../services/plan.service';

/** Cambiar o renovar el plan de un tenant existente (spec 033, Historia de
 * Usuario 2) — mismo `PATCH` sirve ambas operaciones (research.md Decisión
 * 16): elegir el mismo plan que el tenant ya tenía es una renovación. */
@Component({
  selector: 'app-tenant-plan-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">Cambiar / renovar plan</h2>
          <button type="button" (click)="onCancel()" class="text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          <p class="text-sm text-gray-500">
            Tenant: <span class="font-medium text-gray-700">{{ tenant.name }}</span>
          </p>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              formControlName="plan_id"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              @for (p of planService.plans(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
            <p class="text-xs text-gray-400 mt-1">
              Elegir el mismo plan que ya tiene renueva su período desde hoy.
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Ciclo de facturación</label>
            <select
              formControlName="ciclo_facturacion"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
              <option [ngValue]="null">Sin vencimiento</option>
            </select>
          </div>

          @if (tenantService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ tenantService.error() }}
            </p>
          }

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="tenantService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {{ tenantService.isSubmitting() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TenantPlanFormComponent implements OnInit {
  @Input({ required: true }) tenant!: Tenant;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly tenantService = inject(TenantService);
  readonly planService = inject(PlanService);

  readonly form = new FormGroup({
    plan_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ciclo_facturacion: new FormControl<BillingCycle>('mensual', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.planService.load();
    this.form.patchValue({
      plan_id: this.tenant.plan_id,
      ciclo_facturacion: this.tenant.ciclo_facturacion ?? null,
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const ok = await this.tenantService.changePlan(this.tenant.id, {
      plan_id: raw.plan_id,
      ciclo_facturacion: raw.ciclo_facturacion,
    });
    if (ok) this.saved.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
