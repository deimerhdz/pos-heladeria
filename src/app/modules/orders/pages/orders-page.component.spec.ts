import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { OrdersPageComponent } from './orders-page.component';
import { OrdersListService } from '../services/orders-list.service';
import { DiningOrder } from '../../tables/interfaces/dining.interface';

function order(id: string, over: Partial<DiningOrder> = {}): DiningOrder {
  return {
    id,
    channel: 'POS',
    order_type: 'DINE_IN',
    status: 'abierta',
    paid: false,
    created_at: '2026-09-01T12:00:00',
    dining_table_id: null,
    customer_name: null,
    items: [],
    ...over,
  } as DiningOrder;
}

/**
 * `OrdersListService` real depende de TanStack Query + HTTP — se reemplaza por
 * un fake liviano (mismo patrón que `categories-page.component.spec.ts`) para
 * verificar la vista sin sincronizar sus queries. El contrato de red (los
 * parámetros `page`/`size`/`status`/`order_type` que emite el primer `list()` y
 * los setters) lo cubre `orders-list.service.spec.ts`.
 */
class FakeOrdersListService {
  orders = signal<DiningOrder[]>([]);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  size = signal(20);
  loading = signal(false);
  error = signal<string | null>(null);
  status = signal<'' | 'recibida' | 'abierta' | 'bloqueada' | 'pagada' | 'cancelada'>('');
  orderType = signal<'' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('');

  list = vi.fn();
  setStatus = vi.fn((v: string) => this.status.set(v as never));
  setOrderType = vi.fn((v: string) => this.orderType.set(v as never));
}

describe('OrdersPageComponent', () => {
  let fixture: ComponentFixture<OrdersPageComponent>;
  let svc: FakeOrdersListService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrdersPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: OrdersListService, useClass: FakeOrdersListService },
      ],
    });
    fixture = TestBed.createComponent(OrdersPageComponent);
    svc = TestBed.inject(OrdersListService) as unknown as FakeOrdersListService;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(() => true); // el TableService real dispara GET /orders/tables
    http.verify();
  });

  it('al montar carga la primera página (svc.list()) y las mesas para la etiqueta', () => {
    fixture.detectChanges();
    expect(svc.list).toHaveBeenCalled();
    http.expectOne((r) => r.url.endsWith('/orders/tables'));
  });

  it('pinta una fila por orden de la página', () => {
    svc.orders.set([order('o1'), order('o2'), order('o3')]);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('a[href^="/dashboard/orders/"]');
    expect(rows.length).toBe(3);
  });

  it('el badge de estado usa displayOrderStatus: "Pagada" para paid, "Abierta" para el resto', () => {
    svc.orders.set([order('o1', { paid: true }), order('o2', { paid: false })]);
    fixture.detectChanges();
    const badges = Array.from(fixture.nativeElement.querySelectorAll('a span')).map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    expect(badges).toContain('Pagada');
    expect(badges).toContain('Abierta');
  });

  it('ya no renderiza ningún botón de acceso rápido de estado; sí hay <select> de estado y tipo', () => {
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')).map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    for (const dead of ['Todas', 'Abiertas', 'Bloqueadas', 'Pagadas', 'Canceladas']) {
      expect(buttons).not.toContain(dead);
    }
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Estado');
    expect(text).toContain('Tipo');
  });

  it('app-pagination-bar muestra "Página X de Y" y el total del Page recibido (FR-002)', () => {
    svc.orders.set([order('o1'), order('o2')]);
    svc.total.set(130);
    svc.totalPages.set(7);
    svc.page.set(1);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Página 1 de 7');
  });

  it('(pageChange) y (sizeChange) de app-pagination-bar llaman a svc.list con los argumentos correctos', () => {
    svc.orders.set([order('o1')]);
    svc.total.set(60);
    svc.totalPages.set(3);
    fixture.detectChanges();

    const bar = fixture.debugElement.query(By.css('app-pagination-bar'));
    expect(bar).toBeTruthy();

    bar.componentInstance.pageChange.emit(2);
    expect(svc.list).toHaveBeenLastCalledWith(2, 20);

    bar.componentInstance.sizeChange.emit(50);
    expect(svc.list).toHaveBeenLastCalledWith(1, 50);
  });

  // ── US2: filtros server-side de estado y tipo, tipo visible ────────────────

  it('cambiar el <select> de estado llama svc.setStatus (que vuelve a la página 1)', () => {
    fixture.detectChanges();
    const estado = fixture.nativeElement.querySelectorAll('select')[0] as HTMLSelectElement;
    estado.value = 'bloqueada';
    estado.dispatchEvent(new Event('change'));
    expect(svc.setStatus).toHaveBeenCalledWith('bloqueada');
  });

  it('cambiar el <select> de tipo llama svc.setOrderType', () => {
    fixture.detectChanges();
    const tipo = fixture.nativeElement.querySelectorAll('select')[1] as HTMLSelectElement;
    tipo.value = 'DELIVERY';
    tipo.dispatchEvent(new Event('change'));
    expect(svc.setOrderType).toHaveBeenCalledWith('DELIVERY');
  });

  it('cada fila muestra la etiqueta de tipo; order_type null → "Sin especificar" (FR-017/FR-018)', () => {
    svc.orders.set([order('o1', { order_type: 'TAKEAWAY' }), order('o2', { order_type: null })]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Para llevar');
    expect(text).toContain('Sin especificar');
  });

  it('sin filtros y 0 órdenes: "No hay órdenes"', () => {
    svc.orders.set([]);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('No hay órdenes');
    expect((fixture.nativeElement.textContent as string)).not.toContain('con estos filtros');
  });

  it('con un filtro activo y 0 resultados: "No hay órdenes con estos filtros" y pager 0/0', () => {
    svc.status.set('cancelada');
    svc.orders.set([]);
    svc.total.set(0);
    svc.totalPages.set(0);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No hay órdenes con estos filtros');
  });
});
