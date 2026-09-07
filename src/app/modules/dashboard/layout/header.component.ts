import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { LayoutService } from './layout.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { summarize } from '../../../core/notifications/notification.model';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Administrador',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
};

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'bg-purple-100 text-purple-700',
  [UserRole.ADMIN]: 'bg-purple-100 text-purple-700',
  [UserRole.CASHIER]: 'bg-blue-100 text-blue-700',
  [UserRole.MESERO]: 'bg-amber-100 text-amber-700',
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <header
      class="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3 justify-between shrink-0 z-10"
    >
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <button
          (click)="layoutService.toggle()"
          class="p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          aria-label="Abrir menú"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <h2 class="text-base font-semibold text-gray-700 truncate">Panel de Control</h2>
      </div>

      <div class="relative">
        <button
          (click)="toggleNotifications()"
          class="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Notificaciones"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.66V5a2 2 0 10-4 0v.34A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          @if (notificationCenter.pendingCount() > 0) {
            <span
              class="absolute top-0.5 right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {{ notificationCenter.pendingCount() > 9 ? '9+' : notificationCenter.pendingCount() }}
            </span>
          }
        </button>

        @if (notificationsOpen()) {
          <div
            class="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-100 z-50"
          >
            <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-gray-700">Notificaciones</p>
              @if (showEnablePush()) {
                <button
                  (click)="enablePush()"
                  class="text-xs font-medium text-indigo-600 hover:text-indigo-800 shrink-0"
                >
                  Activar avisos push
                </button>
              }
            </div>
            @if (notificationCenter.list().length === 0) {
              <p class="px-4 py-6 text-sm text-gray-400 text-center">Sin notificaciones todavía</p>
            } @else {
              <ul class="divide-y divide-gray-100">
                @for (n of notificationCenter.list(); track n.id) {
                  <li class="px-4 py-3 flex items-start gap-2" [class.bg-indigo-50]="!n.attended_at">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-gray-700">{{ summarize(n) }}</p>
                      <p class="text-xs text-gray-400">{{ n.created_at | date: 'short' }}</p>
                    </div>
                    @if (!n.attended_at) {
                      <button
                        (click)="attend(n.id)"
                        class="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Marcar atendida
                      </button>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>

      <div class="relative">
        <button
          (click)="toggleDropdown()"
          class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
        >
          <div
            class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0"
          >
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
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        @if (dropdownOpen()) {
          <div
            class="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-50"
          >
            <div class="px-4 py-3 border-b border-gray-100">
              <p class="text-xs text-gray-500 truncate">{{ currentUser()?.email }}</p>
            </div>
            <div class="p-2">
              @if (!currentUser()?.isSuperAdmin) {
                <a
                  routerLink="/dashboard/mi-plan"
                  (click)="dropdownOpen.set(false)"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
                    />
                  </svg>
                  Mi plan
                </a>
              }
              <a
                routerLink="/dashboard/mi-cuenta"
                (click)="dropdownOpen.set(false)"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
                  />
                </svg>
                Cambiar contraseña
              </a>
              <button
                (click)="logout()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
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
  readonly notificationCenter = inject(NotificationCenterService);
  private readonly pushRegistration = inject(PushRegistrationService);
  readonly summarize = summarize;

  currentUser = this.authService.currentUser;
  dropdownOpen = signal(false);
  notificationsOpen = signal(false);
  /** `true` mientras el navegador soporte push y el usuario no haya decidido
   * todavía (`default`) — una vez concedido o denegado, ya no se ofrece de
   * nuevo desde acá (el navegador gestiona el permiso desde entonces). */
  pushOffered = signal(
    typeof Notification !== 'undefined' && Notification.permission === 'default',
  );

  userInitial = computed(() => this.currentUser()?.name?.[0]?.toUpperCase() ?? '?');
  roleLabel = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  roleBadgeClass = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_BADGE_CLASSES[role] : '';
  });
  showEnablePush = computed(() => this.pushRegistration.supported && this.pushOffered());

  toggleDropdown(): void {
    this.dropdownOpen.update((v) => !v);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update((v) => !v);
  }

  attend(id: string): void {
    void this.notificationCenter.attend(id);
  }

  async enablePush(): Promise<void> {
    try {
      await this.pushRegistration.register();
    } catch (err) {
      console.error('[notifications] no se pudo activar el push', err);
    } finally {
      // El navegador ya decidió (concedido o denegado): no se vuelve a
      // ofrecer el botón, sea cual sea el resultado.
      this.pushOffered.set(false);
    }
  }

  async logout(): Promise<void> {
    this.dropdownOpen.set(false);
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
