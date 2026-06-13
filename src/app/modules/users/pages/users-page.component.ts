import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { UserFormComponent } from '../components/user-form.component';
import { UsersService } from '../services/users.service';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [UserFormComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p class="text-gray-500 text-sm mt-1">Gestión del personal del sistema</p>
        </div>
        @if (!showForm()) {
          <button
            (click)="showForm.set(true)"
            class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <span>+</span> Agregar usuario
          </button>
        }
      </div>

      <!-- Formulario de creación -->
      @if (showForm()) {
        <app-user-form (saved)="onUserSaved()" (cancelled)="showForm.set(false)" />
      }

      <!-- Error global -->
      @if (usersService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          Error al cargar usuarios: {{ usersService.error() }}
        </div>
      }

      <!-- Skeleton de carga -->
      @if (usersService.isLoading()) {
        <div class="space-y-2">
          @for (i of [1, 2, 3]; track i) {
            <div
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse flex items-center gap-4"
            >
              <div class="w-10 h-10 rounded-full bg-gray-200 shrink-0"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 bg-gray-200 rounded w-1/3"></div>
                <div class="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
              <div class="h-6 bg-gray-200 rounded-full w-16"></div>
            </div>
          }
        </div>
      } @else if (usersService.users().length === 0) {
        <div
          class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400"
        >
          <p class="text-4xl mb-3">👥</p>
          <p class="font-medium">No hay usuarios registrados</p>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {{ usersService.totalCount() }} usuario(s)
            </p>
          </div>
          <div class="divide-y divide-gray-50">
            @for (user of usersService.users(); track user.id) {
              <div
                class="px-5 py-4 flex items-center justify-between gap-3 transition-opacity"
                [class.opacity-50]="!user.is_active"
              >
                <!-- Avatar + info -->
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    [class]="avatarClass(user.role)"
                  >
                    {{ user.name.charAt(0).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold text-gray-800 truncate">{{ user.name }}</p>
                      <span
                        class="w-2 h-2 rounded-full shrink-0"
                        [class]="user.is_active ? 'bg-green-500' : 'bg-gray-300'"
                        [title]="user.is_active ? 'Activo' : 'Inactivo'"
                      ></span>
                    </div>
                    <p class="text-xs text-gray-400 truncate">{{ user.email }}</p>
                  </div>
                </div>

                <!-- Badges + acciones -->
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class="text-xs px-2.5 py-1 rounded-full font-semibold"
                    [class]="roleBadgeClass(user.role)"
                  >
                    {{ roleLabel(user.role) }}
                  </span>
                  <span
                    class="text-xs px-2 py-1 rounded-full font-medium"
                    [class]="
                      user.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    "
                  >
                    {{ user.is_active ? 'Activo' : 'Inactivo' }}
                  </span>

                  @if (user.id !== currentUserId()) {
                    @if (user.is_active) {
                      <button
                        (click)="toggleActive(user.id, false)"
                        class="text-xs px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors"
                      >
                        Desactivar
                      </button>
                    } @else {
                      <button
                        (click)="toggleActive(user.id, true)"
                        class="text-xs px-3 py-1.5 rounded-xl bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors"
                      >
                        Activar
                      </button>
                    }
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersPageComponent implements OnInit {
  readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);

  readonly showForm = signal(false);
  readonly currentUserId = () => this.authService.currentUser()?.id;

  ngOnInit(): void {
    this.usersService.loadUsers();
  }

  async toggleActive(userId: string, newValue: boolean): Promise<void> {
    await this.usersService.toggleActive(userId, newValue);
  }

  onUserSaved(): void {
    this.showForm.set(false);
    this.usersService.loadUsers();
  }

  roleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      [UserRole.SUPER_ADMIN]: 'SuperAdmin',
      [UserRole.ADMIN]: 'Admin',
      [UserRole.CASHIER]: 'Cajero',
      [UserRole.STAFF]: 'Staff',
    };
    return labels[role] ?? role;
  }

  roleBadgeClass(role: UserRole): string {
    const classes: Record<UserRole, string> = {
      [UserRole.SUPER_ADMIN]: 'bg-indigo-100 text-indigo-700',
      [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-700',
      [UserRole.CASHIER]: 'bg-green-100 text-green-700',
      [UserRole.STAFF]: 'bg-amber-100 text-amber-700',
    };
    return classes[role] ?? 'bg-gray-100 text-gray-500';
  }

  avatarClass(role: UserRole): string {
    const classes: Record<UserRole, string> = {
      [UserRole.SUPER_ADMIN]: 'bg-indigo-100 text-indigo-700',
      [UserRole.ADMIN]: 'bg-indigo-100 text-indigo-700',
      [UserRole.CASHIER]: 'bg-green-100 text-green-700',
      [UserRole.STAFF]: 'bg-amber-100 text-amber-700',
    };
    return classes[role] ?? 'bg-gray-100 text-gray-500';
  }
}
