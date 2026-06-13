import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { UserRole } from '../../../core/interfaces/user.interface';
import { SuperAdminUsersService } from './super-admin-users.service';
import { AdminUser, AdminUserForm } from '../interfaces/admin-user.interface';
import { Page } from '../interfaces/page.interface';

const baseUrl = `${environment.apiBaseUrl}/super-admin/users`;

/** Let the awaited service continuation run so the reload request is issued. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function adminUser(partial: Partial<AdminUser>): AdminUser {
  return {
    id: 'u1',
    email: 'a@b.c',
    name: 'A',
    role: UserRole.CASHIER,
    tenant_id: 1,
    is_active: true,
    created_at: '2026-01-01',
    ...partial,
  };
}

function page(items: AdminUser[]): Page<AdminUser> {
  return { items, total: items.length, page: 1, size: 20, pages: 1 };
}

const validForm: AdminUserForm = {
  email: 'new@b.c',
  password: 'secret1',
  name: 'New',
  role: UserRole.STAFF,
  tenant_id: 2,
};

describe('SuperAdminUsersService', () => {
  let service: SuperAdminUsersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SuperAdminUsersService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SuperAdminUsersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and sorts users by email', async () => {
    const promise = service.loadUsers();
    const req = http.expectOne(baseUrl);
    expect(req.request.method).toBe('GET');
    req.flush(page([adminUser({ id: '2', email: 'z@b.c' }), adminUser({ id: '1', email: 'a@b.c' })]));
    await promise;

    expect(service.users().map((u) => u.email)).toEqual(['a@b.c', 'z@b.c']);
  });

  it('creates a user and reloads', async () => {
    const promise = service.createUser(validForm);
    const post = http.expectOne(baseUrl);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      email: 'new@b.c',
      password: 'secret1',
      name: 'New',
      role: UserRole.STAFF,
      tenant_id: 2,
    });
    post.flush(adminUser({ id: '9', email: 'new@b.c' }));
    await tick();
    http.expectOne(baseUrl).flush(page([adminUser({ id: '9', email: 'new@b.c' })]));
    await promise;

    expect(service.error()).toBeNull();
    expect(service.users().length).toBe(1);
  });

  it('rejects creation without a tenant and does not call the API', async () => {
    await service.createUser({ ...validForm, tenant_id: null });

    http.expectNone(baseUrl);
    expect(service.error()).toBe('Debes seleccionar un tenant.');
  });

  it('maps a duplicate-email error from the backend', async () => {
    const promise = service.createUser(validForm);
    http
      .expectOne(baseUrl)
      .flush({ detail: 'El email ya existe' }, { status: 409, statusText: 'Conflict' });
    await promise;

    expect(service.error()).toBe('El email ya existe');
  });

  it('toggles active with a PATCH and reloads', async () => {
    const promise = service.toggleActive('7', true);
    const patch = http.expectOne(`${baseUrl}/7`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ is_active: false });
    patch.flush(adminUser({ id: '7', is_active: false }));
    await tick();
    http.expectOne(baseUrl).flush(page([adminUser({ id: '7', is_active: false })]));
    await promise;

    expect(service.users()[0].is_active).toBe(false);
  });
});
