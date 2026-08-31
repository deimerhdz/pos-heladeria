import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { ModuleAccess } from '../../plan/interfaces/plan-summary.interface';

interface SettingsTab {
  label: string;
  path: string;
  /** Igual que `NavItem.moduleKey` (sidebar, spec 062): si el plan vigente
   * del tenant no la incluye (o está vencido), la pestaña se oculta. Sin
   * definir = siempre visible. */
  moduleKey?: keyof ModuleAccess;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Ajustes</h1>
        <p class="text-gray-500 text-sm mt-1">Configuración del negocio y del catálogo</p>
      </div>

      <!-- Tab nav -->
      <div class="border-b border-gray-200 overflow-x-auto">
        <nav class="flex gap-1 min-w-max">
          @for (tab of visibleTabs(); track tab.path) {
            <a
              [routerLink]="tab.path"
              routerLinkActive
              #rla="routerLinkActive"
              class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
              [class]="rla.isActive
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'"
            >
              {{ tab.label }}
            </a>
          }
        </nav>
      </div>

      <!-- Active tab content -->
      <router-outlet />
    </div>
  `,
})
export class SettingsPageComponent {
  private readonly planSummaryService = inject(PlanSummaryService);

  readonly tabs: SettingsTab[] = [
    { label: 'Información básica', path: 'informacion' },
    { label: 'Métodos de pago', path: 'metodos-pago' },
    { label: 'Unidades de medida', path: 'unidades', moduleKey: 'inventario' },
    { label: 'Grupos de opciones', path: 'grupos-opciones' },
  ];

  /** Pestañas visibles: igual que `SidebarComponent.visibleItems`, fail-open
   * mientras el plan todavía no cargó — la ruta ya está protegida por
   * `planModuleGuard`, así que esto es puramente cosmético. */
  readonly visibleTabs = computed<SettingsTab[]>(() => {
    const summary = this.planSummaryService.summary();
    return this.tabs.filter((tab) => {
      if (!tab.moduleKey) return true;
      if (!summary) return true;
      if (summary.vencido) return false;
      return summary.modules[tab.moduleKey];
    });
  });
}
