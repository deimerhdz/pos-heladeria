import { TestBed } from '@angular/core/testing';
import { TenantInfoService, TenantInfo } from '../../core/tenant/tenant-info.service';
import { TenantDatePipe } from './tenant-date.pipe';

const tenantInfoFixture: TenantInfo = {
  id: 1,
  name: 'Heladería de prueba',
  host: 'prueba.skeilopos.com',
  plan: 'basic',
  logo_url: null,
  receipt_message: null,
  timezone: 'America/Bogota',
};

describe('TenantDatePipe', () => {
  let pipe: TenantDatePipe;
  let tenantInfo: TenantInfoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    tenantInfo = TestBed.inject(TenantInfoService);
    pipe = TestBed.runInInjectionContext(() => new TenantDatePipe());
  });

  it('formatea en la zona horaria del tenant, no en la del navegador (A-50)', () => {
    tenantInfo.info.set({ ...tenantInfoFixture, timezone: 'America/Bogota' });
    // 2026-08-24T12:53:07Z = 2026-08-24 07:53 hora de Bogotá (UTC-5).
    const resultado = pipe.transform('2026-08-24T12:53:07.000Z', 'dd/MM/yyyy HH:mm');
    expect(resultado).toBe('24/08/2026 07:53');
  });

  it('usa America/Bogota como respaldo si el tenant aún no cargó', () => {
    tenantInfo.info.set(null);
    const resultado = pipe.transform('2026-08-24T12:53:07.000Z', 'HH:mm');
    expect(resultado).toBe('07:53');
  });

  it('devuelve null para un valor nulo o vacío', () => {
    tenantInfo.info.set(tenantInfoFixture);
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
  });
});
