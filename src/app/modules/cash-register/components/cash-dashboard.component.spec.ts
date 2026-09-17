import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashDashboardComponent } from './cash-dashboard.component';
import { CashSessionStore } from '../services/cash-session.store';
import { Indicadores } from '../interfaces/cash-session.interface';

describe('CashDashboardComponent', () => {
  function crear() {
    const indicadoresVacios: Indicadores = {
      ventas: [],
      cambioEntregado: 0,
      ingresos: 0,
      egresos: 0,
      retiros: 0,
      efectivoEsperado: 0,
      countIngresos: 0,
      countEgresos: 0,
      countRetiros: 0,
    };
    const fakeStore = {
      efectivoEsperado: signal(0),
      error: signal<string | null>(null),
      fmt: (n: number) => `$ ${n}`,
      num: (n: number | null | undefined) => n ?? 0,
      indicadores: signal(indicadoresVacios),
      modal: signal<string | null>(null),
      movimientosView: signal<Array<Record<string, unknown>>>([]),
      openArqueo: vi.fn(),
      openMovimiento: vi.fn(),
      setVista: vi.fn(),
      shift: signal<{ opening_amount: number } | null>(null),
      sinMovimientos: signal(true),
      tagClass: () => '',
      vista: signal<'tabla' | 'timeline'>('tabla'),
    };
    TestBed.configureTestingModule({
      imports: [CashDashboardComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashDashboardComponent);
    fixture.componentInstance.showPartial.set(true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el ícono de cerrar del modal de arqueo parcial como emoji', () => {
    const el = crear();
    expect(el.textContent).not.toContain('✕');
  });

  it('renderiza el botón de cerrar del modal de arqueo parcial con el nuevo componente de ícono', () => {
    const el = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon).toBeTruthy();
    expect(icon!.textContent?.trim()).toBe('close');
  });
});
