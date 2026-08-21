import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { TableSessionService } from './table-session.service';

const API = environment.apiBaseUrl;

describe('TableSessionService', () => {
  let service: TableSessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TableSessionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TableSessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── feature 028, T034/T035: liberar una mesa ya cobrada sin cobrar nada ──

  it('libera una mesa sin cuerpo de petición', async () => {
    const promise = service.release('ts1');
    const req = http.expectOne(`${API}/table-sessions/ts1/release`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(null);
    await promise;
  });

  it('traduce el 409 cuando algo sigue sin pagar o cocina no terminó', async () => {
    const promise = service.release('ts1').catch((e: unknown) => e);
    http.expectOne(`${API}/table-sessions/ts1/release`).flush(
      { detail: { error: 'Quedan ítems sin terminar en cocina' } },
      { status: 409, statusText: 'Conflict' },
    );

    const err = await promise;
    expect(service.extractError(err)).toBe('Quedan ítems sin terminar en cocina');
  });
});
