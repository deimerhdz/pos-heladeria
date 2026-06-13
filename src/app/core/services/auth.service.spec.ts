import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthApiService } from '../auth/auth-api.service';
import { TokenStorageService } from '../auth/token-storage.service';
import { BackendUser, LoginResponse } from '../auth/auth.models';
import { UserRole } from '../interfaces/user.interface';

function loginResponse(user: BackendUser): LoginResponse {
  return {
    message: 'Login successful',
    access_token: 'access',
    refresh_token: 'refresh',
    user,
  };
}

describe('AuthService.login', () => {
  let service: AuthService;
  let authApi: { login: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn>; refreshToken: ReturnType<typeof vi.fn> };
  let tokenStorage: {
    getAccessToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    setTokens: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authApi = { login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn() };
    tokenStorage = {
      // No stored session: constructor's restoreSession() short-circuits to clear.
      getAccessToken: vi.fn().mockReturnValue(null),
      getRefreshToken: vi.fn().mockReturnValue(null),
      setTokens: vi.fn(),
      clear: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiService, useValue: authApi },
        { provide: TokenStorageService, useValue: tokenStorage },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('accepts a super admin whose role is not a tenant role', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'admin@admin.com',
          uid: '8a4fde0a-222b-40c6-bd80-7384cfb26e07',
          tenant_id: null,
          is_super_admin: true,
          role: 'SUPER_ADMIN',
        }),
      ),
    );

    const { error } = await service.login('admin@admin.com', 'secret');

    expect(error).toBeNull();
    const user = service.currentUser();
    expect(user).not.toBeNull();
    expect(user!.isSuperAdmin).toBe(true);
    expect(user!.tenantId).toBeNull();
    // Falls back to ADMIN since SUPER_ADMIN is not a tenant role.
    expect(user!.role).toBe(UserRole.ADMIN);
  });

  it('maps a normal tenant role correctly', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'cajero@tienda.com',
          uid: 'u1',
          tenant_id: 1,
          is_super_admin: false,
          role: 'CASHIER',
        }),
      ),
    );

    const { error } = await service.login('cajero@tienda.com', 'secret');

    expect(error).toBeNull();
    expect(service.currentUser()!.role).toBe(UserRole.CASHIER);
  });

  it('rejects a non-super-admin with an unknown role as an invalid session', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'x@y.com',
          uid: 'u2',
          tenant_id: 1,
          is_super_admin: false,
          role: 'SUPERVISOR',
        }),
      ),
    );

    const { error } = await service.login('x@y.com', 'secret');

    expect(error).toBe('Tu rol de usuario no es válido para este sistema.');
    expect(service.currentUser()).toBeNull();
    expect(tokenStorage.clear).toHaveBeenCalled();
  });

  it('returns a credentials error on 401', async () => {
    authApi.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    const { error } = await service.login('x@y.com', 'bad');

    expect(error).toBe('Credenciales incorrectas. Verifica tu email y contraseña.');
    expect(service.currentUser()).toBeNull();
  });
});
