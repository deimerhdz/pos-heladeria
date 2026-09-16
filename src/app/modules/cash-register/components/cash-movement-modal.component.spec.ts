import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashMovementModalComponent } from './cash-movement-modal.component';
import { CashSessionStore } from '../services/cash-session.store';

describe('CashMovementModalComponent', () => {
  function crear() {
    const fakeStore = {
      categoriasModal: signal<string[]>([]),
      closeModal: vi.fn(),
      confirmarMovimiento: vi.fn(),
      error: signal<string | null>(null),
      formCategoria: signal(''),
      formMonto: signal(''),
      formNota: signal(''),
      isSubmitting: signal(false),
      modalTitulo: signal('Nuevo movimiento'),
      movimientoDisabled: signal(false),
    };
    TestBed.configureTestingModule({
      imports: [CashMovementModalComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashMovementModalComponent);
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
