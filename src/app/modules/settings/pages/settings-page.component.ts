import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface SettingsTab {
  label: string;
  path: string;
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
          @for (tab of tabs; track tab.path) {
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
  readonly tabs: SettingsTab[] = [
    { label: 'Información básica', path: 'informacion' },
    { label: 'Métodos de pago', path: 'metodos-pago' },
    { label: 'Unidades de medida', path: 'unidades' },
    { label: 'Grupos de opciones', path: 'grupos-opciones' },
    { label: 'Horarios', path: 'horarios' },
    { label: 'Auditoría', path: 'auditoria' },
  ];
}
