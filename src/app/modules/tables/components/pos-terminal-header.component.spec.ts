import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PosTerminalHeaderComponent } from './pos-terminal-header.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { AuthService } from '../../../core/services/auth.service';

describe('PosTerminalHeaderComponent — íconos estandarizados (spec 082)', () => {
  function crear(cashIsOpen: boolean) {
    TestBed.configureTestingModule({
      imports: [PosTerminalHeaderComponent],
      providers: [
        provideRouter([]),
        {
          provide: PosTerminalStore,
          useValue: {
            cashIsOpen: () => cashIsOpen,
            cashShift: () => null,
            realtimeStatus: () => 'connected',
          },
        },
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(PosTerminalHeaderComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ningún ícono se renderiza ya como SVG artesanal', () => {
    const el = crear(false);
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el ícono de turno/cajero y el botón "Turno caja" (caja cerrada)', () => {
    const el = crear(false);
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['group', 'credit_card', 'lock']));
  });

  it('renderiza el ícono de bloquear terminal incluso con caja abierta', () => {
    const el = crear(true);
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['group', 'lock']));
    expect(ligaduras).not.toContain('credit_card');
  });
});
