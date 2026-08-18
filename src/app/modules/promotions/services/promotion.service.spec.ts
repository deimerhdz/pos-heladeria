import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { PromotionService } from './promotion.service';

/** Drain pending microtasks so the reactive query effect fires the HTTP request. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const base = `${environment.apiBaseUrl}/promotions`;

function emptyPage() {
  return { items: [], total: 0, page: 1, size: 100, pages: 0 };
}

describe('PromotionService — hora sincronizada con el servidor (A-09)', () => {
  let service: PromotionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PromotionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(PromotionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('antes del primer sync, ready() es false y now() no debe consultarse (FR-004)', () => {
    expect(service.ready()).toBe(false);
  });

  it('tras el primer GET /promotions?status=active, now() usa el offset del servidor, no el reloj local (FR-001/FR-002)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // solo Date: setTimeout real para que tick() siga funcionando
    vi.setSystemTime(new Date('2026-08-18T22:30:00.000Z')); // reloj local del terminal

    service.loadActive();
    await tick();

    const req = http.expectOne((r) => r.url === base && r.params.get('status') === 'active');
    req.flush(emptyPage(), { headers: { 'X-Server-Time': '2026-08-18T22:32:00.000Z' } }); // servidor 2 min adelantado
    await tick();

    expect(service.ready()).toBe(true);
    expect(service.now().toISOString()).toBe('2026-08-18T22:32:00.000Z');
  });
});
