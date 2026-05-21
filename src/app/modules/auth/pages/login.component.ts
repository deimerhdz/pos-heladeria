import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MockUserService } from '../../../core/services/mock-user.service';
import { UserRole } from '../../../core/interfaces/user.interface';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]:   'Administrador — Acceso total al sistema',
  [UserRole.CASHIER]: 'Cajero — Caja, órdenes y pagos',
  [UserRole.STAFF]:   'Personal de Cocina — Cola de preparación',
};

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.ADMIN]:   '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.STAFF]:   '/dashboard/cocina',
};

const ROLE_ICON: Record<UserRole, string> = {
  [UserRole.ADMIN]:   '👑',
  [UserRole.CASHIER]: '💳',
  [UserRole.STAFF]:   '🍳',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div class="w-full max-w-sm">
        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-4 shadow-xl">
            <span class="text-4xl">🍦</span>
          </div>
          <h1 class="text-3xl font-bold text-white">Heladería</h1>
          <p class="text-indigo-300 mt-1 text-sm">Sistema de Gestión · Demo</p>
        </div>

        <!-- User selection card -->
        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div class="px-6 pt-6 pb-4">
            <h2 class="text-lg font-bold text-gray-900">Seleccionar usuario</h2>
            <p class="text-gray-400 text-sm mt-1">Elige un perfil para acceder al sistema</p>
          </div>
          <div class="px-4 pb-6 space-y-2">
            @for (user of mockUsers; track user.id) {
              <button
                (click)="login(user.id)"
                class="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left group"
              >
                <div class="w-12 h-12 rounded-xl bg-indigo-600 group-hover:bg-indigo-700 flex items-center justify-center text-xl transition-colors shrink-0">
                  {{ getRoleIcon(user.role) }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-gray-900 group-hover:text-indigo-800">{{ user.name }}</p>
                  <p class="text-xs text-gray-400 mt-0.5 truncate">{{ getRoleLabel(user.role) }}</p>
                </div>
                <svg
                  class="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition-colors shrink-0"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            }
          </div>
        </div>

        <p class="text-center text-indigo-400 text-xs mt-6">Modo demo · Sin autenticación real</p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private userService = inject(MockUserService);
  private router = inject(Router);

  readonly mockUsers = this.userService.mockUsers;

  getRoleLabel(role: UserRole): string { return ROLE_LABELS[role]; }
  getRoleIcon(role: UserRole): string  { return ROLE_ICON[role]; }

  login(userId: string): void {
    this.userService.switchUser(userId);
    const user = this.userService.currentUser();
    this.router.navigate([ROLE_HOME[user.role]]);
  }
}
