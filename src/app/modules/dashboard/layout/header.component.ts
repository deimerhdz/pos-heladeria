import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { LayoutService } from './layout.service';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]:   'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.STAFF]:   'Personal de Cocina',
};

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  [UserRole.ADMIN]:   'bg-purple-100 text-purple-700',
  [UserRole.CASHIER]: 'bg-blue-100 text-blue-700',
  [UserRole.STAFF]:   'bg-green-100 text-green-700',
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  template: `
    <header class="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3 justify-between shrink-0 z-10">
      <!-- Hamburger — solo visible en móvil -->
      <button
        (click)="layoutService.toggle()"
        class="md:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
        aria-label="Abrir menú"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>

      <h2 class="text-base font-semibold text-gray-700 flex-1 md:flex-none">Panel de Control</h2>

      <div class="relative">
        <button
          (click)="toggleDropdown()"
          class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
        >
          <div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {{ userInitial() }}
          </div>
          <div class="text-left">
            <p class="text-sm font-medium text-gray-900 leading-tight">{{ currentUser()?.name }}</p>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="roleBadgeClass()">
              {{ roleLabel() }}
            </span>
          </div>
          <svg
            class="w-4 h-4 text-gray-400 transition-transform"
            [class.rotate-180]="dropdownOpen()"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        @if (dropdownOpen()) {
          <div class="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-50">
            <div class="px-4 py-3 border-b border-gray-100">
              <p class="text-xs text-gray-500 truncate">{{ currentUser()?.email }}</p>
            </div>
            <div class="p-2">
              <button
                (click)="logout()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                Cerrar sesión
              </button>
            </div>
          </div>
        }
      </div>
    </header>
  `,
})
export class HeaderComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly layoutService = inject(LayoutService);

  currentUser = this.authService.currentUser;
  dropdownOpen = signal(false);

  userInitial = computed(() => this.currentUser()?.name[0]?.toUpperCase() ?? '?');
  roleLabel = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  roleBadgeClass = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_BADGE_CLASSES[role] : '';
  });

  toggleDropdown(): void {
    this.dropdownOpen.update(v => !v);
  }

  async logout(): Promise<void> {
    this.dropdownOpen.set(false);
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
