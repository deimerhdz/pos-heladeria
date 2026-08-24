import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';

const base = environment.apiBaseUrl;

describe('AuthApiService', () => {
  let service: AuthApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('forgotPassword posts the email to /auth/forgot-password', async () => {
    const promise = firstValueFrom(service.forgotPassword({ email: 'user@tienda.com' }));

    const req = http.expectOne(`${base}/auth/forgot-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'user@tienda.com' });
    req.flush({ message: 'ok' });

    await expect(promise).resolves.toEqual({ message: 'ok' });
  });

  it('validateResetToken sends the token as a query param without a body', async () => {
    const promise = firstValueFrom(service.validateResetToken('raw-token'));

    const req = http.expectOne(
      (r) => r.url === `${base}/auth/reset-password/validate` && r.params.get('token') === 'raw-token',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ valid: true });

    await expect(promise).resolves.toEqual({ valid: true });
  });

  it('resetPassword posts the token and new password to /auth/reset-password', async () => {
    const promise = firstValueFrom(
      service.resetPassword({ token: 'raw-token', new_password: 'claveNueva1' }),
    );

    const req = http.expectOne(`${base}/auth/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'raw-token', new_password: 'claveNueva1' });
    req.flush({ message: 'Contraseña actualizada correctamente.' });

    await expect(promise).resolves.toEqual({ message: 'Contraseña actualizada correctamente.' });
  });
});
