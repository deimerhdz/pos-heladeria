import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.STAFF]: 'Personal',
};

@Component({
  selector: 'app-tenant-info',
  standalone: true,
  template: `
    <div class="max-w-3xl space-y-6">
      @if (tenantInfo.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ tenantInfo.error() }}
        </div>
      }

      <!-- Logotipo -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">🎨</span>
          <div>
            <h2 class="text-base font-semibold text-gray-900">Logotipo</h2>
            <p class="text-xs text-gray-400">Se muestra en el menú de la app y en el menú del QR</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          @if (tenantInfo.logoUrl()) {
            <img
              [src]="tenantInfo.logoUrl()"
              alt="Logotipo del negocio"
              class="w-16 h-16 rounded-xl object-cover border border-gray-100"
            />
          } @else {
            <div class="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl">
              🏪
            </div>
          }

          <div class="min-w-0">
            <input
              type="file"
              accept="image/*"
              [disabled]="tenantInfo.isSubmitting()"
              (change)="onLogoSelected($event)"
              class="text-sm text-gray-500 disabled:opacity-50"
            />
            <p class="text-xs text-gray-400 mt-1">PNG, JPG o WEBP · máximo 2 MB</p>
            @if (tenantInfo.isSubmitting()) {
              <p class="text-xs text-gray-500 mt-1">Subiendo…</p>
            } @else if (saved()) {
              <p class="text-xs text-green-600 mt-1">Guardado ✓</p>
            }
          </div>
        </div>
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <!-- Negocio -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="flex items-center gap-3 mb-4">
            <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">🏪</span>
            <h2 class="text-base font-semibold text-gray-900">Negocio</h2>
          </div>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Nombre</dt>
              <dd class="font-medium text-gray-900 text-right">{{ tenantInfo.businessName() }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Dominio</dt>
              <dd class="font-mono text-gray-700 text-right break-all">{{ host() }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Plan</dt>
              <dd class="text-right">
                <span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {{ plan() }}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <!-- Cuenta -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="flex items-center gap-3 mb-4">
            <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">👤</span>
            <h2 class="text-base font-semibold text-gray-900">Tu cuenta</h2>
          </div>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Correo</dt>
              <dd class="font-medium text-gray-900 text-right break-all">{{ email() || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Rol</dt>
              <dd class="text-right">
                <span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {{ roleLabel() }}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p class="text-xs text-gray-400">
        El nombre y el dominio del negocio los gestiona el administrador de la plataforma.
      </p>
    </div>
  `,
})
export class TenantInfoComponent implements OnInit {
  readonly tenantInfo = inject(TenantInfoService);
  private readonly auth = inject(AuthService);

  readonly saved = signal(false);

  readonly host = computed(() => this.tenantInfo.info()?.host ?? '—');
  readonly plan = computed(() => this.tenantInfo.info()?.plan ?? '—');

  readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  readonly roleLabel = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role ? ROLE_LABEL[role] : '—';
  });

  ngOnInit(): void {
    void this.tenantInfo.load();
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.saved.set(false);
    const ok = await this.tenantInfo.uploadLogo(file);
    // Permite volver a elegir el mismo archivo tras un fallo.
    input.value = '';
    if (ok) this.saved.set(true);
  }
}
