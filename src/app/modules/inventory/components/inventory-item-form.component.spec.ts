import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { InventoryItemFormComponent } from './inventory-item-form.component';

describe('InventoryItemFormComponent', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [InventoryItemFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTanStackQuery(new QueryClient())],
    });
    const fixture = TestBed.createComponent(InventoryItemFormComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el ícono de cerrar como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el botón de cerrar con el nuevo componente de ícono (ligadura "close")', () => {
    const el = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon).toBeTruthy();
    expect(icon!.textContent?.trim()).toBe('close');
  });
});
