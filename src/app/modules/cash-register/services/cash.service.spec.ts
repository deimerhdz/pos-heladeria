import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { CashService } from './cash.service';
import { CashShift } from '../interfaces/cash.interface';

const base = `${environment.apiBaseUrl}/cash`;

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

describe('CashService', () => {
  let service: CashService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CashService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CashService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists registers', async () => {
    const p = service.listRegisters();
    const req = http.expectOne(`${base}/registers`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'r1', name: 'Caja 1', active: true }]);
    expect((await p)[0].name).toBe('Caja 1');
  });

  it('opens a shift', async () => {
    const p = service.openShift('r1', 100);
    const req = http.expectOne(`${base}/shifts/open`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ cash_register_id: 'r1', opening_amount: 100 });
    req.flush(shift());
    expect((await p).id).toBe('s1');
  });

  it('gets the current open shift by register', async () => {
    const p = service.getCurrentShift('r1');
    const req = http.expectOne((r) => r.url === `${base}/shifts/current`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('cash_register_id')).toBe('r1');
    req.flush(shift());
    expect((await p).cash_register_id).toBe('r1');
  });

  it('registers a movement with kind/amount/category', async () => {
    const p = service.addMovement('s1', {
      kind: 'egreso',
      amount: 20,
      category: 'Bolsas',
      description: null,
    });
    const req = http.expectOne(`${base}/shifts/s1/movements`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      kind: 'egreso',
      amount: 20,
      category: 'Bolsas',
      description: null,
    });
    req.flush({
      id: 'm1',
      cash_shift_id: 's1',
      kind: 'egreso',
      amount: '20.00',
      category: 'Bolsas',
      occurred_at: 'x',
    });
    expect((await p).id).toBe('m1');
  });

  it('lists movements of a shift', async () => {
    const p = service.listMovements('s1');
    const req = http.expectOne(`${base}/shifts/s1/movements`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(await p).toEqual([]);
  });

  it('closes a shift with denominations and close_note', async () => {
    const p = service.closeShift('s1', {
      counted_amount: 95000,
      denominations: [{ denomination: 50000, quantity: 1 }],
      close_note: 'faltante caja',
    });
    const req = http.expectOne(`${base}/shifts/s1/close`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.denominations).toEqual([{ denomination: 50000, quantity: 1 }]);
    expect(req.request.body.close_note).toBe('faltante caja');
    req.flush(shift({ status: 'closed', closed_at: 'x', counted_amount: '95000.00' }));
    expect((await p).status).toBe('closed');
  });

  it('gets the shift report', async () => {
    const p = service.getReport('s1');
    const req = http.expectOne(`${base}/shifts/s1/report`);
    expect(req.request.method).toBe('GET');
    req.flush({ shift: shift({ status: 'closed' }), reconciliation: {}, movements: [], denominations: [] });
    expect((await p).shift.id).toBe('s1');
  });
});
