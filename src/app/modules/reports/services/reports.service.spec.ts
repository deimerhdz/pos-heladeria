import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { ReportsService } from './reports.service';

const api = environment.apiBaseUrl;

/**
 * El spec anterior probaba una versión del servicio que agregaba las ventas en
 * el cliente contra `/sales`, `/sales/payment-methods` e `/inventory/items`.
 * Ese servicio dejó de existir cuando los informes pasaron a `/reports/*`, y el
 * spec se quedó pidiendo URLs que ya nadie llama: llevaba roto desde entonces.
 */
describe('ReportsService', () => {
  let service: ReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        ReportsService,
      ],
    });
    service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick(); // deja correr los efectos que lanzan las queries
  });

  afterEach(() => {
    http.match(() => true); // vacía las peticiones que el test no necesitó
    http.verify();
  });

  /** Deja resolver la promesa del HttpClient y propagar la signal de la query. */
  async function asentar(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
  }

  /** URLs pedidas hasta ahora, sin el prefijo del API. */
  function urlsPedidas(): string[] {
    return http
      .match(() => true)
      .map((r) => r.request.urlWithParams.replace(`${api}/reports/`, ''));
  }

  it('pide los seis informes del rango al arrancar', () => {
    const urls = urlsPedidas();
    const recursos = urls.map((u) => u.split('?')[0]).sort();

    expect(recursos).toEqual([
      'cashiers',
      'categories',
      'inventory',
      'profitability',
      'sales',
      'top-products',
    ]);
  });

  it('acota por fecha todos los informes menos el de inventario', () => {
    const urls = urlsPedidas();
    const hoy = new Date().toLocaleDateString('en-CA');

    for (const url of urls) {
      if (url.startsWith('inventory')) {
        // El stock no depende del período: su clave de query tampoco.
        expect(url).not.toContain('date_from');
      } else {
        expect(url).toContain(`date_from=${hoy}`);
        expect(url).toContain(`date_to=${hoy}`);
      }
    }
  });

  it('pide el desglose por día salvo en el año, que lo pide por mes', () => {
    expect(service.groupBy()).toBe('day');
    expect(urlsPedidas().find((u) => u.startsWith('sales'))).toContain('group_by=day');

    service.setPeriod('year');
    TestBed.tick();

    expect(service.groupBy()).toBe('month');
    // Un año por día son 365 puntos: la gráfica necesita 12.
    expect(urlsPedidas().find((u) => u.startsWith('sales'))).toContain('group_by=month');
  });

  it('el rango del año va del 1 de enero al 31 de diciembre', () => {
    service.setPeriod('year');
    const año = new Date().getFullYear();

    expect(service.range()).toEqual({ from: `${año}-01-01`, to: `${año}-12-31` });
  });

  it('convierte a número los decimales que llegan como string', async () => {
    http.expectOne((r) => r.url === `${api}/reports/sales`).flush({
      total_sales: '4780.50',
      ticket_count: 156,
      avg_ticket: '30.64',
      by_day: [{ day: '2026-08-04', total: '320.00', count: 11 }],
    });
    http.expectOne((r) => r.url === `${api}/reports/top-products`).flush([
      { product_variant_id: 'v1', description: 'Cono', units: 84, revenue: '420.00' },
    ]);
    await asentar();

    expect(service.salesSummary()).toEqual({
      total: 4780.5,
      count: 156,
      average: 30.64,
      cashTotal: 0,
      cardTotal: 0,
    });
    expect(service.dailySales()).toEqual([{ date: '2026-08-04', count: 11, total: 320 }]);
    expect(service.topProducts()).toEqual([{ name: 'Cono', totalQty: 84, totalRevenue: 420 }]);
  });

  it('solo lista los insumos por debajo del mínimo', async () => {
    http.expectOne((r) => r.url === `${api}/reports/inventory`).flush([
      {
        inventory_item_id: 'i1', name: 'Leche', current_stock: '2', min_stock: '10',
        unit_cost: '1', stock_value: '2', below_min: true,
      },
      {
        inventory_item_id: 'i2', name: 'Azúcar', current_stock: '50', min_stock: '10',
        unit_cost: '1', stock_value: '50', below_min: false,
      },
    ]);
    await asentar();

    expect(service.lowStockIngredients().map((i) => i.name)).toEqual(['Leche']);
    expect(service.lowStockIngredients()[0].current_stock).toBe(2);
  });
});
