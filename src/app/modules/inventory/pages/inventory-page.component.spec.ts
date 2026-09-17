import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { InventoryPageComponent } from './inventory-page.component';

describe('InventoryPageComponent — íconos estandarizados (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [InventoryPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    const fixture = TestBed.createComponent(InventoryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('el botón "Nuevo insumo" ya no usa un SVG artesanal', () => {
    const fixture = crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('add');
  });

  it('el botón de cerrar del panel de recepción de compra usa el nuevo componente', () => {
    const fixture = crear();
    fixture.componentInstance.receivePurchase.set({
      id: 'p1',
      status: 'pendiente',
      items: [],
    } as never);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('✕');
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toContain('close');
  });
});
