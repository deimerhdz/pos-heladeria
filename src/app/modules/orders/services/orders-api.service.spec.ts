import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { OrdersApiService } from './orders-api.service';
import { OrderResponse, Page } from '../../tables/interfaces/table.interface';

const base = `${environment.apiBaseUrl}/orders`;

function order(partial: Partial<OrderResponse>): OrderResponse {
  return {
    id: 'o1',
    table_id: 't1',
    scope: 'table',
    status: 'pending',
    total: '5000.00',
    created_at: '2026-01-01',
    items: [],
    ...partial,
  };
}

function page(items: OrderResponse[]): Page<OrderResponse> {
  return { items, total: items.length, page: 1, size: 20, pages: 1 };
}

describe('OrdersApiService', () => {
  let service: OrdersApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OrdersApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrdersApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists orders with default pagination params', async () => {
    const promise = service.listOrders();
    const req = http.expectOne(r => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(page([order({ id: 'o1' })]));
    await promise;

    expect(service.orders().map(o => o.id)).toEqual(['o1']);
    expect(service.pageInfo().total).toBe(1);
  });

  it('includes the status filter and page when provided', async () => {
    const promise = service.listOrders({ status: 'in_progress', page: 2 });
    const req = http.expectOne(r => r.url === base);
    expect(req.request.params.get('status')).toBe('in_progress');
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([]));
    await promise;
  });

  it('maps an error on list', async () => {
    const promise = service.listOrders();
    http.expectOne(r => r.url === base).flush(
      { detail: 'Boom' },
      { status: 500, statusText: 'Server Error' },
    );
    await promise;
    expect(service.error()).toBe('Boom');
  });

  it('gets an order by id', async () => {
    const promise = service.getOrder('o9');
    const req = http.expectOne(`${base}/o9`);
    expect(req.request.method).toBe('GET');
    req.flush(order({ id: 'o9' }));
    expect((await promise).id).toBe('o9');
  });
});
