import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { PresentationsPageComponent } from './presentations-page.component';
import { PresentationService } from '../services/presentation.service';
import { Presentation } from '../interfaces/presentation.interface';

function makePresentation(partial: Partial<Presentation> = {}): Presentation {
  return {
    id: 'p1',
    name: 'Mediano',
    active: true,
    created_at: '2026-09-01T00:00:00Z',
    ...partial,
  };
}

/**
 * spec 083 (US1, T043): listado paginado, crear, editar/renombrar (incluido
 * el rechazo 409 por nombre duplicado, FR-003) y toggle activar/desactivar en
 * ambos sentidos (Escenario 5). `PresentationService` real depende de
 * TanStack Query + HTTP -- se reemplaza por un fake liviano (mismo patrón que
 * `tables-page.component.spec.ts`) para no sincronizar sus queries.
 */
class FakePresentationService {
  presentations = signal<Presentation[]>([]);
  allPresentations = signal<Presentation[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  otherError = signal<string | null>(null);
  isSubmitting = signal(false);
  page = signal(1);
  size = signal(20);
  total = signal(0);
  totalPages = signal(0);

  loadPresentations = vi.fn();
  loadAllPresentations = vi.fn();
  setSearch = vi.fn();
  setActiveFilter = vi.fn();
  toggleActive = vi.fn().mockResolvedValue(undefined);
  createPresentation = vi.fn().mockResolvedValue(undefined);
  updatePresentation = vi.fn().mockResolvedValue(undefined);
}

describe('PresentationsPageComponent', () => {
  let fixture: ComponentFixture<PresentationsPageComponent>;
  let component: PresentationsPageComponent;
  let svc: FakePresentationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PresentationsPageComponent],
      providers: [{ provide: PresentationService, useClass: FakePresentationService }],
    });
    fixture = TestBed.createComponent(PresentationsPageComponent);
    component = fixture.componentInstance;
    svc = TestBed.inject(PresentationService) as unknown as FakePresentationService;
  });

  it('la tabla renderiza el nombre y el estado de cada presentación (listado)', () => {
    svc.presentations.set([
      makePresentation({ id: 'p1', name: 'Pequeño', active: true }),
      makePresentation({ id: 'p2', name: 'Grande', active: false }),
    ]);
    fixture.detectChanges();

    const rows: HTMLTableRowElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Pequeño');
    expect(rows[0].textContent).toContain('Activa');
    expect(rows[1].textContent).toContain('Grande');
    expect(rows[1].textContent).toContain('Inactiva');
  });

  it('(pageChange)/(sizeChange) de app-pagination-bar delegan la paginación al servicio', () => {
    svc.presentations.set([makePresentation()]);
    svc.page.set(2);
    svc.size.set(20);
    svc.total.set(45);
    svc.totalPages.set(3);
    fixture.detectChanges();

    const bar = fixture.debugElement.query(By.css('app-pagination-bar'));
    bar.componentInstance.pageChange.emit(3);
    expect(svc.loadPresentations).toHaveBeenLastCalledWith(3, 20);

    bar.componentInstance.sizeChange.emit(50);
    expect(svc.loadPresentations).toHaveBeenLastCalledWith(1, 50);
  });

  it('crear una presentación llama a createPresentation con el nombre y cierra el formulario', async () => {
    fixture.detectChanges();

    component.openCreate();
    component.formName = 'Pequeño';
    await component.onSubmit();

    expect(svc.createPresentation).toHaveBeenCalledWith({ name: 'Pequeño' });
    expect(component.showForm()).toBe(false);
  });

  it('el formulario rechaza localmente un nombre ya existente sin llamar al servicio (FR-003)', async () => {
    svc.allPresentations.set([makePresentation({ id: 'p1', name: 'Grande' })]);
    fixture.detectChanges();

    component.openCreate();
    component.formName = 'grande';
    await component.onSubmit();

    expect(svc.createPresentation).not.toHaveBeenCalled();
    expect(component.nameError()).toBe('duplicate');
  });

  it('editar/renombrar una presentación llama a updatePresentation con el id y el nuevo nombre', async () => {
    fixture.detectChanges();

    component.openEdit(makePresentation({ id: 'p9', name: 'Mediano' }));
    component.formName = 'Mediano Grande';
    await component.onSubmit();

    expect(svc.updatePresentation).toHaveBeenCalledWith('p9', { name: 'Mediano Grande' });
    expect(component.showForm()).toBe(false);
  });

  it('el rechazo 409 del backend por nombre duplicado deja el formulario abierto con el mensaje (FR-003)', async () => {
    fixture.detectChanges();
    svc.updatePresentation.mockImplementation(async () => {
      svc.error.set('Ya existe una presentación con ese nombre.');
    });

    component.openEdit(makePresentation({ id: 'p1', name: 'Mediano' }));
    component.formName = 'Grande';
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.showForm()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Ya existe una presentación con ese nombre.');
  });

  it('activa y desactiva una presentación en ambos sentidos (Escenario 5)', async () => {
    fixture.detectChanges();

    await component.onToggle(makePresentation({ id: 'p1', active: true }));
    expect(svc.toggleActive).toHaveBeenCalledWith('p1', true);

    await component.onToggle(makePresentation({ id: 'p2', active: false }));
    expect(svc.toggleActive).toHaveBeenCalledWith('p2', false);
  });
});
