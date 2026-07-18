import { Component, computed, inject } from '@angular/core';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
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
    <div class="grid gap-6 md:grid-cols-2 max-w-3xl">
      <!-- Negocio -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">🏪</span>
          <h2 class="text-base font-semibold text-gray-900">Negocio</h2>
        </div>
        <dl class="space-y-3 text-sm">
          <div class="flex justify-between gap-3">
            <dt class="text-gray-500">Nombre</dt>
            <dd class="font-medium text-gray-900 text-right">{{ businessName() }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-gray-500">Identificador</dt>
            <dd class="font-mono text-gray-700 text-right">{{ slug() || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-gray-500">Dominio</dt>
            <dd class="font-mono text-gray-700 text-right break-all">{{ hostname() }}</dd>
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

    <p class="text-xs text-gray-400 mt-4 max-w-3xl">
      La edición de los datos del negocio aún no está disponible.
    </p>
  `,
})
export class TenantInfoComponent {
  private readonly tenant = inject(TenantContextService);
  private readonly auth = inject(AuthService);

  readonly slug = this.tenant.tenantSlug;
  readonly hostname = computed(() => this.tenant.context().hostname);

  readonly businessName = computed(() => {
    const slug = this.tenant.tenantSlug();
    if (!slug) return 'Heladería';
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  });

  readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  readonly roleLabel = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role ? ROLE_LABEL[role] : '—';
  });
}
