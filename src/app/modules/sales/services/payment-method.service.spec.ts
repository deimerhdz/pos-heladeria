import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PaymentMethodService } from './payment-method.service';

const base = `${environment.apiBaseUrl}/sales/payment-methods`;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('PaymentMethodService', () => {
  let service: PaymentMethodService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PaymentMethodService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PaymentMethodService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads payment methods', async () => {
    const p = service.load();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'pm1', name: 'Efectivo', is_cash: true, active: true }]);
    await p;
    expect(service.methods()[0].name).toBe('Efectivo');
  });

  it('creates a payment method with name + is_cash then reloads', async () => {
    const p = service.create('Nequi', false);
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Nequi', is_cash: false });
    req.flush({ id: 'pm2', name: 'Nequi', is_cash: false, active: true });
    await tick();
    http.expectOne(base).flush([]);
    expect(await p).toBe(true);
  });

  it('maps an error', async () => {
    const p = service.load();
    http.expectOne(base).flush({ detail: 'Boom' }, { status: 500, statusText: 'Err' });
    await p;
    expect(service.error()).toBe('Boom');
  });
});
