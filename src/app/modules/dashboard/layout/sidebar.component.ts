import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MockUserService } from '../../../core/services/mock-user.service';
import { NAV_ITEMS } from '../../../core/config/navigation.config';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="w-60 bg-indigo-900 text-white flex flex-col shrink-0 h-full">
      <div class="px-6 py-5 border-b border-indigo-700">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🍦</span>
          <div>
            <h1 class="text-base font-bold leading-tight">Heladería</h1>
            <p class="text-indigo-300 text-xs">Sistema de Gestión</p>
          </div>
        </div>
      </div>

      <nav class="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        @for (item of visibleItems(); track item.route + item.label) {
          <a
            [routerLink]="item.route"
            routerLinkActive="bg-indigo-700 text-white font-semibold"
            [routerLinkActiveOptions]="{ exact: true }"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-200 hover:bg-indigo-800 hover:text-white transition-colors text-sm"
          >
            <span class="text-base">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="px-4 py-4 border-t border-indigo-700">
        <p class="text-indigo-400 text-xs text-center">v1.0 · Modo Demo</p>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  private userService = inject(MockUserService);

  visibleItems = computed(() =>
    NAV_ITEMS.filter(item => item.roles.includes(this.userService.currentUser().role))
  );
}
