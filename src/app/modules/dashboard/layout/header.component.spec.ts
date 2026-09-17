import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';
import { UserRole } from '../../../core/interfaces/user.interface';

describe('HeaderComponent — íconos estandarizados (spec 082)', () => {
  function crear() {
    const currentUser = signal({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ana',
      role: UserRole.ADMIN,
      tenantId: 1,
      isSuperAdmin: false,
      mustChangePassword: false,
    });
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser } },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('el menú hamburguesa y la campana de notificaciones ya no son SVG artesanales', () => {
    const fixture = crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['menu', 'notifications']));
  });

  it('el menú desplegable de usuario (chevron, mi plan, cambiar contraseña, cerrar sesión) usa el nuevo componente', () => {
    const fixture = crear();
    fixture.componentInstance.dropdownOpen.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(
      expect.arrayContaining(['expand_more', 'layers', 'settings', 'logout']),
    );
  });
});
