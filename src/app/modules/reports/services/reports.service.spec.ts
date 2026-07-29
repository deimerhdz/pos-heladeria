import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { ReportsService } from './reports.service';

const api = environment.apiBaseUrl;
const nowIso = new Date().toISOString();

function sale(id: string, total: string, items: { description: string; quantity: number; line_total: string }[], payMethod: string, payAmount: string) {
  return {
    id,
    cash_shift_id: 'sh1',
    user_id: 'u1',
    subtotal: total,
    discount: '0.00',
    tax: '0.00',
    tip: '0.00',
    total,
    status: 'paid',
    sold_at: nowIso,
    items: items.map((it, i) => ({ id: `${id}-${i}`, product_variant_id: 'v', ...it })),
    payments: [{ id: `${id}-p`, payment_method_id: payMethod, amount: payAmount }],
  };
}

describe('ReportsService', () => {
  let service: ReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReportsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('aggregates sales summary, cash/card split and top products for the period', async () => {
    const p = service.loadAll(); // default period = 'today'; sales are dated now

    http.expectOne(`${api}/sales`).flush([
      sale('s1', '10.00', [{ description: 'Cono', quantity: 2, line_total: '6.00' }], 'cash', '10.00'),
      sale('s2', '5.00', [{ description: 'Cono', quantity: 1, line_total: '3.00' }], 'card', '5.00'),
    ]);
    http.expectOne(`${api}/sales/payment-methods`).flush([
      { id: 'cash', name: 'Efectivo', is_cash: true, active: true },
      { id: 'card', name: 'Tarjeta', is_cash: false, active: true },
    ]);
    http.expectOne((r) => r.url === `${api}/inventory/items`).flush([]);

    await p;

    const summary = service.salesSummary()!;
    expect(summary.total).toBe(15);
    expect(summary.count).toBe(2);
    expect(summary.cashTotal).toBe(10);
    expect(summary.cardTotal).toBe(5);
    expect(summary.average).toBe(7.5);

    // "Cono" appears in both sales → merged, qty 3
    expect(service.topProducts()[0]).toEqual({ name: 'Cono', totalQty: 3, totalRevenue: 9 });
  });
});
