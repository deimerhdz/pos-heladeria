import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { vi } from 'vitest';
import { passwordChangeGuard, changePasswordPageGuard } from './password-change.guard';
import { AuthService } from '../services/auth.service';
import { User, UserRole } from '../interfaces/user.interface';

function user(partial: Partial<User>): User {
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

function setup(currentUser: User | null) {
  const router = { createUrlTree: vi.fn((commands: unknown[]) => ({ commands }) as unknown as UrlTree) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal(currentUser), authReady$: of(void 0) } },
      { provide: Router, useValue: router },
    ],
  });
  return router;
}

/** Guards are CanActivateFn; run inside injection context and normalize result. */
async function runGuard(guard: typeof passwordChangeGuard): Promise<unknown> {
  const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  return isObservable(result) ? firstValueFrom(result) : result;
}

describe('passwordChangeGuard', () => {
  it('redirects to /change-password when a change is required', async () => {
    const router = setup(user({ mustChangePassword: true }));
    const result = await runGuard(passwordChangeGuard);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/change-password']);
    expect(result).toEqual({ commands: ['/change-password'] });
  });

  it('allows access when no change is required', async () => {
    setup(user({ mustChangePassword: false }));
    const result = await runGuard(passwordChangeGuard);
    expect(result).toBe(true);
  });
});

describe('changePasswordPageGuard', () => {
  it('allows the page while a change is required', async () => {
    setup(user({ mustChangePassword: true }));
    const result = await runGuard(changePasswordPageGuard);
    expect(result).toBe(true);
  });

  it('redirects to the role home when no change is required', async () => {
    const router = setup(user({ role: UserRole.CASHIER, mustChangePassword: false }));
    await runGuard(changePasswordPageGuard);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard/caja']);
  });

  it('redirects to /login when there is no session', async () => {
    const router = setup(null);
    await runGuard(changePasswordPageGuard);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
