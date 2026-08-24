import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SidebarComponent } from './sidebar.component';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserRole } from '../../../core/interfaces/user.interface';

function makeUser(partial: Partial<User>): User {
  return {
    id: 'u1',
    email: 'a@b.c',
    role: UserRole.ADMIN,
    tenantId: 1,
    isSuperAdmin: false,
    mustChangePassword: false,
    ...partial,
  };
}

describe('SidebarComponent.visibleItems', () => {
  const currentUser = signal<User | null>(null);

  function createComponent(): SidebarComponent {
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        // El sidebar inyecta TenantInfoService (solo lee sus señales, no pide nada).
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser } },
      ],
    });
    return TestBed.createComponent(SidebarComponent).componentInstance;
  }

  it('shows super admin navigation when the user is a super admin', () => {
    currentUser.set(makeUser({ isSuperAdmin: true, role: UserRole.SUPER_ADMIN, tenantId: null }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes).toEqual([
      '/super-admin/tenants',
      '/super-admin/users',
      '/super-admin/payment-methods-catalog',
    ]);
    expect(sidebar.isSuperAdmin()).toBe(true);
  });

  it('shows role-based POS navigation for a tenant user (no super admin items)', () => {
    currentUser.set(makeUser({ isSuperAdmin: false, role: UserRole.CASHIER }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes.every((r) => !r.startsWith('/super-admin'))).toBe(true);
    expect(routes).toContain('/dashboard/caja');
    expect(sidebar.isSuperAdmin()).toBe(false);
  });

  it('shows nothing when there is no authenticated user', () => {
    currentUser.set(null);
    const sidebar = createComponent();
    expect(sidebar.visibleItems()).toEqual([]);
  });
});
