import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { OrdersPageComponent } from './orders-page.component';
import { DiningOrder } from '../../tables/interfaces/dining.interface';

const API = environment.apiBaseUrl;

function order(id: string, status: DiningOrder['status'], paid?: boolean): DiningOrder {
  return {
    id,
    channel: 'QR_MENU',
    status,
    paid,
    created_at: '2026-08-21T18:27:00',
    dining_table_id: null,
    customer_name: null,
    items: [],
  } as DiningOrder;
}

/**
 * Spec 029, hotfix #5: el reporte del usuario mostraba un pedido QR ya
 * cobrado ("Pedido pagado por el comensal desde el QR" en la Terminal de
 * Mesas) apareciendo como "Abierta" aquí, en Panel de Control → Órdenes —
 * un módulo aparte que nunca adoptó el campo `paid` (research.md D2).
 */
describe('OrdersPageComponent', () => {
  let fixture: ComponentFixture<OrdersPageComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrdersPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(OrdersPageComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne(`${API}/orders/tables`).flush([]);
    http.expectOne(`${API}/orders`).flush([
      order('o1', 'abierta', true),
      order('o2', 'abierta', false),
    ]);
  });

  afterEach(() => http.verify());

  it('un pedido abierta ya pagado (paid) se muestra con badge "Pagada"; el otro, genuinamente sin pagar, sigue "Abierta"', () => {
    fixture.detectChanges();
    const badges = Array.from(fixture.nativeElement.querySelectorAll('a span')) as HTMLElement[];
    const texts = badges.map((b) => b.textContent?.trim());

    expect(texts).toEqual(['Pagada', 'Abierta']);
  });

  it('cae en la pestaña "Pagadas", no en "Abiertas"', () => {
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.setFilter('pagada');
    fixture.detectChanges();
    expect(component.visibleOrders().map((o) => o.id)).toEqual(['o1']);

    component.setFilter('abierta');
    fixture.detectChanges();
    expect(component.visibleOrders().map((o) => o.id)).toEqual(['o2']);
  });
});
