import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashArqueoModalComponent } from './cash-arqueo-modal.component';
import { CashSessionStore } from '../services/cash-session.store';

describe('CashArqueoModalComponent', () => {
  function crear() {
    const fakeStore = {
      arqueoDisabled: signal(false),
      arqueoObservacion: signal(''),
      closeModal: vi.fn(),
      confirmarArqueoYCerrar: vi.fn(),
      contadoIngresado: signal(false),
      denominaciones: signal<Array<{ label: string; value: number; qty: number }>>([]),
      diferenciaLive: signal(0),
      diffClass: signal(''),
      diffLabel: signal(''),
      efectivoEsperado: signal(0),
      error: signal<string | null>(null),
      fmt: (n: number) => `$ ${n}`,
      isSubmitting: signal(false),
      requiereObservacion: signal(false),
      setDenom: vi.fn(),
      stepDenom: vi.fn(),
      totalContado: signal(0),
    };
    TestBed.configureTestingModule({
      imports: [CashArqueoModalComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashArqueoModalComponent);
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
