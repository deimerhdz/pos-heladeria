import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { SalesService } from './sales.service';
import { Sale } from '../interfaces/sales.interface';

/** Drain pending microtasks so the reactive query effect fires the HTTP request. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const base = `${environment.apiBaseUrl}/sales`;

function sale(partial: Partial<Sale> = {}): Sale {
  return {
    id: 'sale1',
    cash_shift_id: 'sh1',
    user_id: 'u1',
    subtotal: '10.00',
    discount: '0.00',
    tax: '0.00',
    tip: '0.00',
    total: '10.00',
    status: 'paid',
    sold_at: '2026-01-01T10:00:00Z',
    items: [],
    payments: [],
    ...partial,
  };
}

describe('SalesService', () => {
  let service: SalesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SalesService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(SalesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('checks out a sale with shift, items and payments', async () => {
    const p = service.checkout({
      cash_shift_id: 'sh1',
      dining_session_id: 'sess1',
      items: [{ product_variant_id: 'v1', quantity: 2, option_ids: ['o1'] }],
      payments: [{ payment_method_id: 'pm1', amount: 10 }],
    });
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.cash_shift_id).toBe('sh1');
    expect(req.request.body.items[0].product_variant_id).toBe('v1');
    expect(req.request.body.payments[0].amount).toBe(10);
    req.flush(sale({ id: 'sale9' }));
    expect((await p)?.id).toBe('sale9');
  });

  it('returns null and sets error when checkout fails', async () => {
    const p = service.checkout({ cash_shift_id: 'sh1', items: [], payments: [] });
    http.expectOne(base).flush({ detail: 'Turno cerrado' }, { status: 400, statusText: 'Bad' });
    expect(await p).toBeNull();
    expect(service.error()).toBe('Turno cerrado');
  });

  it('lists sales and updates pagination state', async () => {
    service.list();
    await tick();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({
      items: [sale({ id: 'b', sold_at: '2026-01-01T11:00:00Z' }), sale({ id: 'a', sold_at: '2026-01-01T09:00:00Z' })],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
    });
    await tick();
    expect(service.sales().map((s) => s.id)).toEqual(['b', 'a']);
    expect(service.total()).toBe(2);
    expect(service.totalPages()).toBe(1);
  });

  it('sends status, date range and invoice_reference filters, stripping dashes', async () => {
    service.setStatus('paid');
    await tick();
    let req = http.expectOne((r) => r.url === base);
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    await tick();

    service.setDateFrom('2026-01-01');
    await tick();
    req = http.expectOne((r) => r.url === base);
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    await tick();

    service.setDateTo('2026-01-31');
    await tick();
    req = http.expectOne((r) => r.url === base);
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    await tick();

    service.setInvoiceReference('A-000004');
    await tick();
    req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('status')).toBe('paid');
    expect(req.request.params.get('date_from')).toBe('2026-01-01');
    expect(req.request.params.get('date_to')).toBe('2026-01-31');
    expect(req.request.params.get('invoice_reference')).toBe('A000004');
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    await tick();
  });

  it('gets a sale by id', async () => {
    const p = service.get('sale5');
    const req = http.expectOne(`${base}/sale5`);
    expect(req.request.method).toBe('GET');
    req.flush(sale({ id: 'sale5' }));
    expect((await p).id).toBe('sale5');
  });
});
