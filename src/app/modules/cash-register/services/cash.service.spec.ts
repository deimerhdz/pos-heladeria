import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { CashService } from './cash.service';
import { CashShift, Reconciliation } from '../interfaces/cash.interface';

const base = `${environment.apiBaseUrl}/cash`;
const tick = () => new Promise((r) => setTimeout(r, 0));

function shift(partial: Partial<CashShift> = {}): CashShift {
  return {
    id: 's1',
    cash_register_id: 'r1',
    user_id: 'u1',
    opening_amount: '100.00',
    opened_at: '2026-01-01T08:00:00Z',
    status: 'open',
    ...partial,
  };
}

function recon(partial: Partial<Reconciliation> = {}): Reconciliation {
  return {
    cash_shift_id: 's1',
    status: 'open',
    opening_amount: '100.00',
    cash_sales: '0.00',
    cash_in: '0.00',
    cash_out: '0.00',
    expected: '100.00',
    ...partial,
  };
}

describe('CashService', () => {
  let service: CashService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CashService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CashService);
    http = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => http.verify());

  it('lists registers', async () => {
    const p = service.loadRegisters();
    const req = http.expectOne(`${base}/registers`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'r1', name: 'Caja 1', active: true }]);
    await p;
    expect(service.registers()[0].name).toBe('Caja 1');
  });

  it('opens a shift and loads reconciliation, persisting to localStorage', async () => {
    const p = service.openShift('r1', 100);
    const req = http.expectOne(`${base}/shifts/open`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ cash_register_id: 'r1', opening_amount: 100 });
    req.flush(shift());
    await tick();
    http.expectOne(`${base}/shifts/s1/reconciliation`).flush(recon());
    expect(await p).toBe(true);
    expect(service.isOpen()).toBe(true);
    expect(localStorage.getItem('cash.shift')).toContain('s1');
  });

  it('registers a movement with type/amount/description', async () => {
    service.shift.set(shift());
    const p = service.addMovement('out', 20, 'Compra hielo');
    const req = http.expectOne(`${base}/shifts/s1/movements`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'out', amount: 20, description: 'Compra hielo' });
    req.flush({ id: 'm1', cash_shift_id: 's1', type: 'out', amount: '20.00', description: 'Compra hielo', occurred_at: 'x' });
    await tick();
    http.expectOne(`${base}/shifts/s1/reconciliation`).flush(recon({ cash_out: '20.00', expected: '80.00' }));
    expect(await p).toBe(true);
    expect(service.movements()[0].id).toBe('m1');
  });

  it('closes a shift with counted_amount and clears localStorage', async () => {
    localStorage.setItem('cash.shift', JSON.stringify(shift()));
    service.shift.set(shift());
    const p = service.closeShift(75);
    const req = http.expectOne(`${base}/shifts/s1/close`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ counted_amount: 75 });
    req.flush(shift({ status: 'closed', closed_at: 'x', counted_amount: '75.00' }));
    await tick();
    http.expectOne(`${base}/shifts/s1/reconciliation`).flush(recon({ status: 'closed', counted_amount: '75.00', difference: '-5.00' }));
    expect(await p).toBe(true);
    expect(service.isOpen()).toBe(false);
    expect(localStorage.getItem('cash.shift')).toBeNull();
  });

  it('restores an open shift from localStorage and refreshes reconciliation', async () => {
    localStorage.setItem('cash.shift', JSON.stringify(shift()));
    const p = service.restoreShift();
    http.expectOne(`${base}/shifts/s1/reconciliation`).flush(recon());
    await p;
    expect(service.shift()?.id).toBe('s1');
    expect(service.reconciliation()?.expected).toBe('100.00');
  });
});
