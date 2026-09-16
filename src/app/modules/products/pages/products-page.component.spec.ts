import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ProductsPageComponent } from './products-page.component';

describe('ProductsPageComponent — íconos estandarizados (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    const fixture = TestBed.createComponent(ProductsPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ningún ícono se renderiza ya como emoji ni SVG artesanal (empty state y "Nuevo producto")', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
    for (const emoji of ['🍦', '🚫', '✏️', '🔴', '🟢']) {
      expect(el.textContent).not.toContain(emoji);
    }
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('add');
  });
});
