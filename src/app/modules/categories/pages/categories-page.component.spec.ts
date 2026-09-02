import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoriesPageComponent } from './categories-page.component';
import { CategoryService } from '../services/category.service';
import { Category } from '../interfaces/category.interface';

function makeCategory(partial: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Bebidas',
    description: 'Gaseosas, jugos y aguas',
    active: true,
    display_order: 10,
    created_at: '2026-09-01T00:00:00Z',
    ...partial,
  };
}

/**
 * `CategoryService` real depende de TanStack Query + HTTP -- se reemplaza por
 * un fake liviano (mismo patrón que `product-form.component.spec.ts`) para
 * poder verificar la tabla sin sincronizar sus queries.
 */
class FakeCategoryService {
  categories = signal<Category[]>([]);
  allCategories = signal<Category[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  size = signal(20);
  loadCategories(): void {}
  loadAllCategories(): void {}
  setSearch(): void {}
  setActiveFilter(): void {}
  async toggleActive(): Promise<void> {}
}

describe('CategoriesPageComponent', () => {
  let fixture: ComponentFixture<CategoriesPageComponent>;
  let categoryService: FakeCategoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CategoriesPageComponent],
      providers: [{ provide: CategoryService, useClass: FakeCategoryService }],
    });
    fixture = TestBed.createComponent(CategoriesPageComponent);
    categoryService = TestBed.inject(CategoryService) as unknown as FakeCategoryService;
  });

  // spec 067 (US3): columna "Orden" en el listado de administración de categorías

  it('la tabla renderiza el display_order de cada categoría en la nueva columna', () => {
    categoryService.categories.set([
      makeCategory({ id: 'c1', name: 'Bebidas', display_order: 25 }),
      makeCategory({ id: 'c2', name: 'Postres', display_order: 5 }),
    ]);
    fixture.detectChanges();

    const rows: HTMLTableRowElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('25');
    expect(rows[1].textContent).toContain('5');
  });

  it('la columna "Orden" aparece en el encabezado de la tabla', () => {
    categoryService.categories.set([makeCategory()]);
    fixture.detectChanges();

    const headers: string[] = Array.from(
      fixture.nativeElement.querySelectorAll('thead th'),
    ).map((th) => (th as HTMLElement).textContent?.trim() ?? '');
    expect(headers).toContain('Orden');
  });
});
