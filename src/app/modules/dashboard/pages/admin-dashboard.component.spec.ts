import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { AdminDashboardComponent } from './admin-dashboard.component';

describe('AdminDashboardComponent — sin temática de heladería ni SVG artesanal (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ninguna tarjeta ni acceso rápido renderiza ya el cono de helado (🍦) ni ningún otro emoji funcional', () => {
    const el = crear();
    for (const emoji of ['🍦', '👥', '📋', '💰', '🍽️', '🧾', '🪑']) {
      expect(el.textContent).not.toContain(emoji);
    }
  });

  it('el acceso rápido de productos (/dashboard/products) usa específicamente el ícono neutro shopping_bag (SC-003)', () => {
    const el = crear();
    const accesos = Array.from(el.querySelectorAll('a[href*="/dashboard/products"]'));
    expect(accesos.length).toBeGreaterThan(0);
    const icon = accesos[0].querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('shopping_bag');
  });

  it('ningún ícono se renderiza ya como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(
      expect.arrayContaining(['group', 'shopping_bag', 'receipt_long', 'payments', 'point_of_sale', 'receipt', 'table_restaurant']),
    );
  });
});
