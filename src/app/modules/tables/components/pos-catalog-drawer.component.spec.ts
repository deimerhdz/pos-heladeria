import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PosCatalogDrawerComponent } from './pos-catalog-drawer.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { MenuService } from '../../../core/services/menu.service';
import { MenuProduct } from '../../products/interfaces/product.interface';

function product(id: string, name: string): MenuProduct {
  return {
    id,
    name,
    description: null,
    image_url: null,
    variants: [{ id: `${id}-v1`, name: 'Única', price: 8000, option_groups: [] }],
    option_groups: [],
    available: true,
  } as unknown as MenuProduct;
}

/** Spec 036, Historia 2: catálogo embebido del "+ Agregar producto" — sin
 *  overlay de pantalla completa, con buscador por nombre combinado con el
 *  filtro de categoría ya existente. */
describe('PosCatalogDrawerComponent', () => {
  let fixture: ComponentFixture<PosCatalogDrawerComponent>;
  let store: PosTerminalStore;
  let menuService: MenuService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCatalogDrawerComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: PromotionService,
          useValue: {
            loadActive: () => {},
            activePromotions: () => [],
            ready: () => false,
            now: () => new Date(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(PosCatalogDrawerComponent);
    store = TestBed.inject(PosTerminalStore);
    menuService = TestBed.inject(MenuService);
    http = TestBed.inject(HttpTestingController);

    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [product('p1', 'Malteada de fresa'), product('p2', 'Jugo de mango')] },
      { id: 'c2', name: 'Postres', products: [product('p3', 'Helado de fresa')] },
    ]);
    store.catalogCategoryId.set('c1');
  });

  afterEach(() => http.verify());

  it('no se monta como overlay de pantalla completa (sin fixed inset-0 / backdrop)', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fixed.inset-0')).toBeNull();
    expect(el.querySelector('[class*="bg-black"]')).toBeNull();
  });

  it('muestra los productos de la categoría activa por defecto', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).toContain('Jugo de mango');
  });

  it('filtra por nombre en tiempo real', () => {
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'malteada';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(store.catalogSearchText()).toBe('malteada');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).not.toContain('Jugo de mango');
  });

  it('combina el filtro de categoría ya existente con la búsqueda por nombre', () => {
    fixture.detectChanges();

    store.setCatalogSearchText('fresa');
    fixture.detectChanges();

    // Categoría "Bebidas" (c1) + "fresa" → solo "Malteada de fresa", no
    // "Helado de fresa" (está en Postres, c2).
    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).not.toContain('Helado de fresa');

    const categoryButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Postres',
    ) as HTMLButtonElement;
    categoryButton.click();
    fixture.detectChanges();

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Helado de fresa');
    expect(text).not.toContain('Malteada de fresa');
  });

  it('sin coincidencias muestra un estado vacío claro, no una grilla en blanco', () => {
    fixture.detectChanges();

    store.setCatalogSearchText('no-existe-xyz');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.toLowerCase()).toContain('sin productos');
  });

  it('seleccionar un producto abre la configuración de variante (mismo flujo ya existente)', () => {
    fixture.detectChanges();

    const productButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Malteada de fresa'),
    ) as HTMLButtonElement;
    productButton.click();

    expect(store.configuringProduct()?.id).toBe('p1');
  });

  it('"← Volver a la lista" cierra el catálogo sin perder ningún ítem ya agregado', () => {
    store.draftLines.set([
      {
        kind: 'product',
        key: 'existing',
        product: product('pX', 'Ya agregado'),
        variant: { id: 'vX', price: 5000 } as never,
        options: [],
        quantity: 1,
        notes: null,
        unitPrice: 5000,
      },
    ]);
    store.catalogOpen.set(true);
    fixture.detectChanges();

    const backButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === '← Volver a la lista',
    ) as HTMLButtonElement;
    backButton.click();

    expect(store.catalogOpen()).toBe(false);
    expect(store.draftLines()).toHaveLength(1);
  });
});
