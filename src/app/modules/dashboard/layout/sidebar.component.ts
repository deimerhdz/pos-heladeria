import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NAV_ITEMS, SUPER_ADMIN_NAV_ITEMS } from '../../../core/config/navigation.config';
import { NAV_GROUP_ORDER, NavItem } from '../../../core/interfaces/navigation.interface';
import { IconComponent } from '../../../shared/icon/icon.component';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { LayoutService } from './layout.service';

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <aside
      class="w-64 bg-indigo-600 text-white flex flex-col shrink-0 h-full
             fixed inset-y-0 left-0 z-40
             transition-transform duration-300 ease-in-out"
      [class.-translate-x-full]="!layoutService.sidebarOpen()"
      [class.translate-x-0]="layoutService.sidebarOpen()"
    >
      <!-- Brand -->
      <div class="px-5 py-4 border-b border-white/10">
        <div class="flex items-center gap-3">
          @if (!isSuperAdmin() && logoUrl()) {
            <img
              [src]="logoUrl()"
              alt=""
              class="w-9 h-9 rounded-xl object-cover bg-white/10 shrink-0"
            />
          } @else {
            <span
              class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-lg shrink-0"
            >
              {{ isSuperAdmin() ? '🛡️' : '🍦' }}
            </span>
          }
          <div class="min-w-0">
            <h1 class="text-sm font-bold leading-tight truncate">
              {{ isSuperAdmin() ? 'Super Admin' : businessName() }}
            </h1>
            <p class="text-white/60 text-xs truncate">
              {{ isSuperAdmin() ? 'Panel de Plataforma' : 'Sistema de Gestión' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 min-h-0 px-3 py-2 overflow-y-auto">
        @for (group of groupedItems(); track group.title) {
          <div class="mb-0.5">
            <p class="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              {{ group.title }}
            </p>
            <div class="space-y-0.5">
              @for (item of group.items; track item.route + item.label) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive
                  #rla="routerLinkActive"
                  [routerLinkActiveOptions]="{ exact: true }"
                  [class]="rla.isActive ? activeClass : inactiveClass"
                >
                  <span class="w-5 h-5 flex items-center justify-center shrink-0">
                    <app-icon [name]="item.icon" />
                  </span>
                  <span class="truncate">{{ item.label }}</span>
                </a>
              }
            </div>
          </div>
        }
      </nav>

      <!-- Footer -->
      <div class="px-4 py-2.5 border-t border-white/10">
        <p class="text-white/40 text-xs text-center">v1.0</p>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  private authService = inject(AuthService);
  readonly layoutService = inject(LayoutService);
  private readonly tenantInfo = inject(TenantInfoService);
  /** `DashboardLayoutComponent` la carga; aquí solo se lee (mismo patrón que `tenantInfo`). */
  private readonly planSummaryService = inject(PlanSummaryService);

  /** Branding del negocio (lo carga `DashboardLayoutComponent`; aquí solo se lee). */
  readonly logoUrl = this.tenantInfo.logoUrl;
  readonly businessName = this.tenantInfo.businessName;

  private readonly baseClass =
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors';
  readonly inactiveClass = `${this.baseClass} text-white/75 hover:bg-white/10 hover:text-white`;
  readonly activeClass = `${this.baseClass} bg-white/[0.12] text-white font-medium`;

  readonly isSuperAdmin = computed(() => !!this.authService.currentUser()?.isSuperAdmin);

  /** Flat, role- and plan-filtered list (consumed by tests and by `groupedItems`). */
  readonly visibleItems = computed<NavItem[]>(() => {
    const user = this.authService.currentUser();
    if (!user) return [];
    // Un super admin se identifica por el flag, no por un rol de tenant: muestra
    // su propia navegación (Tenants, Usuarios) en lugar de los ítems del POS.
    // El plan no aplica a su navegación.
    if (user.isSuperAdmin) return SUPER_ADMIN_NAV_ITEMS;
    const summary = this.planSummaryService.summary();
    return NAV_ITEMS.filter((item) => item.roles.includes(user.role)).filter((item) => {
      if (!item.moduleKey) return true;
      // Mismo criterio de fail-open que `plan-module.guard.ts`: mientras el
      // plan todavía no cargó (o falló), no ocultamos el ítem — el guard de
      // la ruta es la fuente de verdad real si el tenant intenta entrar.
      if (!summary) return true;
      if (summary.vencido) return false;
      return summary.modules[item.moduleKey];
    });
  });

  /** Visible items grouped by section, in `NAV_GROUP_ORDER`; empty groups hidden. */
  readonly groupedItems = computed<NavGroup[]>(() => {
    const items = this.visibleItems();
    return NAV_GROUP_ORDER.map((title) => ({
      title,
      items: items.filter((i) => i.group === title),
    })).filter((g) => g.items.length > 0);
  });
}
