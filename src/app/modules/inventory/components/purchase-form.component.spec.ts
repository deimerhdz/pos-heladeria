import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PurchaseFormComponent } from './purchase-form.component';

describe('PurchaseFormComponent', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [PurchaseFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTanStackQuery(new QueryClient())],
    });
    const fixture = TestBed.createComponent(PurchaseFormComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza ningún ícono de cerrar/quitar como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el botón de cerrar de la cabecera con el nuevo componente de ícono', () => {
    const el = crear();
    const iconos = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map((n) =>
      n.textContent?.trim(),
    );
    expect(iconos).toContain('close');
  });

  it('renderiza el botón de quitar renglón (fila inicial) con el nuevo componente de ícono', () => {
    const el = crear();
    const closeIcons = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).filter(
      (n) => n.textContent?.trim() === 'close',
    );
    // Cabecera + al menos una fila inicial = al menos 2 íconos "close".
    expect(closeIcons.length).toBeGreaterThanOrEqual(2);
  });
});
