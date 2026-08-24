import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { OrderDetailComponent } from './order-detail.component';
import { DiningOrder } from '../../tables/interfaces/dining.interface';

const API = environment.apiBaseUrl;

/**
 * Spec 029, hotfix #5: mismo defecto que `orders-page.component.ts` (el
 * badge del detalle también usaba `status` crudo, sin mirar `paid`).
 */
describe('OrderDetailComponent', () => {
  let fixture: ComponentFixture<OrderDetailComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrderDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'o1' }) } },
        },
      ],
    });
    fixture = TestBed.createComponent(OrderDetailComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne(`${API}/menu`).flush([]);
    http.expectOne(`${API}/orders/tables`).flush([]);
    http.expectOne(`${API}/orders/o1`).flush({
      id: 'o1',
      channel: 'qr',
      status: 'abierta',
      paid: true,
      created_at: '2026-08-21T18:27:00',
      dining_table_id: null,
      customer_name: null,
      items: [],
    } as DiningOrder);
  });

  afterEach(() => http.verify());

  it('un pedido abierta ya pagado (paid) se muestra con badge "Pagada"', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Pagada');
    expect((fixture.nativeElement.textContent as string)).not.toContain('Abierta');
  });
});
