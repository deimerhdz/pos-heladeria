import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SidebarComponent } from './sidebar.component';
import { LayoutService } from './layout.service';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserRole } from '../../../core/interfaces/user.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';

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

/**
 * Spec 036 (FR-012): `sidebarOpen()` ahora también controla la visibilidad
 * del `<aside>` en escritorio — antes `md:relative md:translate-x-0` era
 * incondicional y el componente lo ignoraba ahí (solo importaba en el
 * slide-over móvil). No hay forma de simular el breakpoint `md` en jsdom
 * (no evalúa media queries), así que la prueba correcta es sobre las clases
 * reactivas (`-translate-x-full` / `translate-x-0`), que ahora son la
 * ÚNICA fuente de verdad de la visibilidad en cualquier tamaño de pantalla
 * — y confirmar que la clase `md:` incondicional que las anulaba en
 * escritorio ya no está.
 */
describe('SidebarComponent — clases de escritorio honran sidebarOpen() (spec 036)', () => {
  const currentUser = signal<User | null>(makeUser({ isSuperAdmin: false, role: UserRole.CASHIER }));
  let fixture: ComponentFixture<SidebarComponent>;
  let layoutService: LayoutService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser } },
        // Evita la cadena TenantInfoService → TenantContextService (necesita
        // provideTenantInitializer() al arranque real): este bloque solo
        // ejercita las clases reactivas del <aside>, no el branding.
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
      ],
    });
    fixture = TestBed.createComponent(SidebarComponent);
    layoutService = TestBed.inject(LayoutService);
  });

  const aside = (): HTMLElement => fixture.nativeElement.querySelector('aside') as HTMLElement;

  it('ya no fuerza "md:relative md:translate-x-0" de forma incondicional', () => {
    fixture.detectChanges();
    expect(aside().className).not.toContain('md:relative');
    expect(aside().className).not.toContain('md:translate-x-0');
  });

  it('sidebarOpen() en true → visible (translate-x-0), también en escritorio', () => {
    layoutService.sidebarOpen.set(true);
    fixture.detectChanges();

    expect(aside().classList.contains('translate-x-0')).toBe(true);
    expect(aside().classList.contains('-translate-x-full')).toBe(false);
  });

  it('sidebarOpen() en false → oculto (-translate-x-full), también en escritorio', () => {
    layoutService.sidebarOpen.set(false);
    fixture.detectChanges();

    expect(aside().classList.contains('-translate-x-full')).toBe(true);
    expect(aside().classList.contains('translate-x-0')).toBe(false);
  });
});
