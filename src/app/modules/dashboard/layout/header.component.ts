import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MockUserService } from '../../../core/services/mock-user.service';
import { UserRole } from '../../../core/interfaces/user.interface';

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

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.ADMIN]:   '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.STAFF]:   '/dashboard/cocina',
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  template: `
    <header class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-10">
      <h2 class="text-base font-semibold text-gray-700">Panel de Control</h2>

      <div class="relative">
        <button
          (click)="toggleDropdown()"
          class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
        >
          <div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {{ userInitial() }}
          </div>
          <div class="text-left">
            <p class="text-sm font-medium text-gray-900 leading-tight">{{ currentUser().name }}</p>
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
          <div class="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 z-50">
            <div class="px-4 py-3 border-b border-gray-100">
              <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cambiar usuario (Demo)</p>
            </div>
            @for (user of mockUsers; track user.id) {
              <button
                (click)="selectUser(user.id)"
                class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                [class.bg-indigo-50]="user.id === currentUser().id"
              >
                <div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {{ user.name[0] }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">{{ user.name }}</p>
                  <p class="text-xs text-gray-400">{{ getRoleLabel(user.role) }}</p>
                </div>
                @if (user.id === currentUser().id) {
                  <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  </svg>
                }
              </button>
            }
          </div>
        }
      </div>
    </header>
  `,
})
export class HeaderComponent {
  private userService = inject(MockUserService);
  private router = inject(Router);

  currentUser = this.userService.currentUser;
  mockUsers = this.userService.mockUsers;
  dropdownOpen = signal(false);

  userInitial = computed(() => this.currentUser().name[0].toUpperCase());
  roleLabel = computed(() => ROLE_LABELS[this.currentUser().role]);
  roleBadgeClass = computed(() => ROLE_BADGE_CLASSES[this.currentUser().role]);

  getRoleLabel(role: UserRole): string {
    return ROLE_LABELS[role];
  }

  toggleDropdown(): void {
    this.dropdownOpen.update(v => !v);
  }

  selectUser(id: string): void {
    this.userService.switchUser(id);
    this.dropdownOpen.set(false);
    const user = this.userService.currentUser();
    this.router.navigate([ROLE_HOME[user.role]]);
  }
}
