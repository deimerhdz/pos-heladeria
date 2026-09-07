import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TablesPageComponent } from './tables-page.component';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';

function table(partial: Partial<Table> = {}): Table {
  return {
    id: 't1',
    number: 1,
    name: null,
    qr_token: 'uuid-1',
    active: true,
    status: 'libre',
    ...partial,
  };
}

/**
 * spec 079, US3: la pantalla "Mesas" pagina en servidor por el carril paginado
 * de `TableService` (`pagedTables()` / `loadTablesPage()` / `refreshTablesPage()`),
 * sin tocar `tables()` (que sigue sirviendo a Terminal/Dashboard). Se usa un
 * fake del servicio (patrón `categories-page.component.spec.ts`); el contrato de
 * red del carril lo cubre `table.service.spec.ts`.
 */
class FakeTableService {
  pagedTables = signal<Table[]>([]);
  tablesTotal = signal(0);
  tablesTotalPages = signal(0);
  tablesPage = signal(1);
  tablesSize = signal(20);
  tablesLoading = signal(false);
  error = signal<string | null>(null);

  loadTablesPage = vi.fn();
  refreshTablesPage = vi.fn();
  toggleActive = vi.fn().mockResolvedValue(undefined);
  setStatus = vi.fn().mockResolvedValue(true);
}

describe('TablesPageComponent', () => {
  let fixture: ComponentFixture<TablesPageComponent>;
  let svc: FakeTableService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TablesPageComponent],
      providers: [provideRouter([]), { provide: TableService, useClass: FakeTableService }],
    });
    fixture = TestBed.createComponent(TablesPageComponent);
    svc = TestBed.inject(TableService) as unknown as FakeTableService;
  });

  it('al montar carga la primera página del carril paginado (1, 20)', () => {
    fixture.detectChanges();
    expect(svc.loadTablesPage).toHaveBeenCalledWith(1, 20);
  });

  it('pinta una fila por mesa de la página (pagedTables), no más de `size`', () => {
    svc.pagedTables.set([table({ id: 'a', number: 1 }), table({ id: 'b', number: 2 })]);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('(pageChange) de app-pagination-bar pide la página siguiente', () => {
    svc.pagedTables.set([table({})]);
    svc.tablesTotal.set(64);
    svc.tablesTotalPages.set(4);
    fixture.detectChanges();

    const bar = fixture.debugElement.query(By.css('app-pagination-bar'));
    bar.componentInstance.pageChange.emit(2);
    expect(svc.loadTablesPage).toHaveBeenLastCalledWith(2, 20);
  });

  it('tras cambiar el estado operativo de una mesa se refresca la página actual (FR-022)', async () => {
    svc.pagedTables.set([table({ id: 't1', number: 1, status: 'libre' })]);
    fixture.detectChanges();

    await fixture.componentInstance.changeStatus(table({ id: 't1', number: 1, status: 'libre' }), 'ocupada');

    expect(svc.setStatus).toHaveBeenCalledWith('t1', 'ocupada');
    expect(svc.refreshTablesPage).toHaveBeenCalled();
  });

  it('tras crear/editar una mesa (onSaved) se refresca la página actual', () => {
    fixture.detectChanges();
    fixture.componentInstance.onSaved();
    expect(svc.refreshTablesPage).toHaveBeenCalled();
  });

  it('estado vacío cuando la página no trae mesas', () => {
    svc.pagedTables.set([]);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Aún no hay mesas registradas');
  });
});
