import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashReportComponent } from './cash-report.component';
import { CashSessionStore } from '../services/cash-session.store';
import { Indicadores } from '../interfaces/cash-session.interface';

describe('CashReportComponent — ícono de turno cerrado (spec 082)', () => {
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
      aperturaFmt: signal(''),
      backToHistory: vi.fn(),
      cajaLabel: signal(''),
      cajero: signal(''),
      cierreFmt: signal(''),
      diffClass: signal(''),
      diffLabel: signal(''),
      efectivoEsperado: signal(0),
      fmt: (n: number) => `$ ${n}`,
      imprimirReporte: vi.fn(),
      indicadores: signal(indicadoresVacios),
      movimientosView: signal<Array<Record<string, unknown>>>([]),
      num: (n: number | null | undefined) => n ?? 0,
      nuevoTurno: vi.fn(),
      reconciliation: signal(null),
      report: signal(null),
      reportContext: signal<'history' | 'live'>('live'),
      shift: signal(null),
      sinMovimientos: signal(true),
      tagClass: () => '',
    };
    TestBed.configureTestingModule({
      imports: [CashReportComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashReportComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el candado como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el ícono de "Turno cerrado" con el nuevo componente', () => {
    const el = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('lock');
  });
});
