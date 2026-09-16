import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';

describe('LoginComponent', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login: async () => ({}), currentUser: () => null } },
        // Evita "TenantContextService read before initialization" (necesita
        // provideTenantInitializer() al arranque real) — mismo patrón que
        // sidebar.component.spec.ts.
        { provide: TenantContextService, useValue: { isSuperAdmin: () => false, tenantSlug: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.isLoading.set(true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('el spinner de carga ya no es un SVG artesanal (spec 082)', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
    const boton = el.querySelector('button[type="submit"]')!;
    const icon = boton.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('autorenew');
  });

  it('el ícono del spinner conserva la animación de giro', () => {
    const el = crear();
    const boton = el.querySelector('button[type="submit"]')!;
    const host = boton.querySelector('app-mi-icon');
    expect(host?.className).toContain('animate-spin');
  });
});
