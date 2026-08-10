import { MenuCategory, MenuProduct } from '../../products/interfaces/product.interface';
import {
  ScopeSelection,
  categoryState,
  countMissing,
  filterGroups,
  selectCategory,
} from './scope-picker.component';

function product(id: string, name: string, price = 1000): MenuProduct {
  return {
    id,
    name,
    description: null,
    image_url: null,
    variants: [
      {
        id: `${id}-v1`,
        name: 'Único',
        price,
        option_groups: [],
        available: true,
      },
    ],
    option_groups: [],
    available: true,
  };
}

function category(id: string, name: string, products: MenuProduct[]): MenuCategory {
  return { id, name, products };
}

const MALTEADAS = category('c-malt', 'Malteadas', [
  product('p-fresa', 'Malteada de fresa', 12000),
  product('p-choco', 'Malteada de chocolate', 12000),
]);
const GRANIZADOS = category('c-gran', 'Granizados', [
  product('p-mora', 'Granizado de mora', 8000),
  product('p-limon', 'Granizado de limón', 8000),
]);
const CATALOGO = [MALTEADAS, GRANIZADOS];

const t = (id: string, value: number | null = null, min_qty: number | null = null) => ({ id, value, min_qty });
const VACIA: ScopeSelection = { categories: [], products: [] };

describe('filterGroups', () => {
  it('sin búsqueda devuelve el catálogo completo', () => {
    const groups = filterGroups(CATALOGO, '', VACIA, false);
    expect(groups.map((g) => g.id)).toEqual(['c-malt', 'c-gran']);
    expect(groups[0].products).toHaveLength(2);
  });

  it('si el nombre de la categoría casa, muestra todos sus productos', () => {
    // Quien escribe "malteadas" quiere la categoría entera, no solo las filas
    // cuyo nombre repita la palabra.
    const groups = filterGroups(CATALOGO, 'malteadas', VACIA, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].products.map((p) => p.id)).toEqual(['p-fresa', 'p-choco']);
  });

  it('si solo casan productos, muestra únicamente esos', () => {
    const groups = filterGroups(CATALOGO, 'mora', VACIA, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('c-gran');
    expect(groups[0].products.map((p) => p.id)).toEqual(['p-mora']);
  });

  it('la búsqueda ignora acentos y mayúsculas', () => {
    const groups = filterGroups(CATALOGO, 'LIMON', VACIA, false);
    expect(groups[0].products.map((p) => p.name)).toEqual(['Granizado de limón']);
  });

  it('conserva el total real de la categoría aunque el filtro muestre menos', () => {
    const groups = filterGroups(CATALOGO, 'mora', VACIA, false);
    expect(groups[0].products).toHaveLength(1);
    expect(groups[0].totalProducts).toBe(2);
  });

  it('«solo seleccionados» deja únicamente lo elegido', () => {
    const selection: ScopeSelection = { categories: [], products: [t('p-mora')] };
    const groups = filterGroups(CATALOGO, '', selection, true);
    expect(groups).toHaveLength(1);
    expect(groups[0].products.map((p) => p.id)).toEqual(['p-mora']);
  });

  it('una categoría marcada sigue visible en «solo seleccionados», con todos sus productos', () => {
    const selection: ScopeSelection = { categories: [t('c-malt')], products: [] };
    const groups = filterGroups(CATALOGO, '', selection, true);
    expect(groups.map((g) => g.id)).toEqual(['c-malt']);
    expect(groups[0].products).toHaveLength(2);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filterGroups(CATALOGO, 'sushi', VACIA, false)).toEqual([]);
  });

  it('el precio mostrado es el mínimo de las presentaciones', () => {
    const multi = category('c-x', 'Conos', [
      {
        ...product('p-cono', 'Cono'),
        variants: [
          { id: 'v1', name: 'Grande', price: 9000, option_groups: [], available: true },
          { id: 'v2', name: 'Pequeño', price: 5000, option_groups: [], available: true },
        ],
      },
    ]);
    expect(filterGroups([multi], '', VACIA, false)[0].products[0].price).toBe(5000);
  });
});

describe('categoryState', () => {
  it('marcada cuando hay target de categoría', () => {
    const selection: ScopeSelection = { categories: [t('c-malt')], products: [] };
    expect(categoryState(MALTEADAS, selection)).toBe('checked');
  });

  it('indeterminada cuando hay productos suyos sueltos', () => {
    const selection: ScopeSelection = { categories: [], products: [t('p-fresa')] };
    expect(categoryState(MALTEADAS, selection)).toBe('indeterminate');
  });

  it('vacía cuando lo marcado pertenece a otra categoría', () => {
    const selection: ScopeSelection = { categories: [], products: [t('p-mora')] };
    expect(categoryState(MALTEADAS, selection)).toBe('empty');
  });
});

describe('modo lectura', () => {
  // En lectura la tabla se fuerza a «solo seleccionados»: es el alcance, no el
  // catálogo. Estos casos fijan lo que el admin ve de una promoción congelada.
  it('expande la categoría marcada y lista aparte el producto suelto de otra', () => {
    const mixto: ScopeSelection = { categories: [t('c-malt')], products: [t('p-mora')] };
    const groups = filterGroups(CATALOGO, '', mixto, true);

    expect(groups.map((g) => g.id)).toEqual(['c-malt', 'c-gran']);
    expect(groups[0].products.map((p) => p.name)).toEqual([
      'Malteada de fresa',
      'Malteada de chocolate',
    ]);
    expect(groups[1].products.map((p) => p.id)).toEqual(['p-mora']);
  });

  it('el buscador filtra sobre el alcance, no sobre el catálogo entero', () => {
    const mixto: ScopeSelection = { categories: [t('c-malt')], products: [t('p-mora')] };
    // "granizado" casa con dos productos del catálogo, pero solo uno está en el alcance.
    const groups = filterGroups(CATALOGO, 'granizado', mixto, true);
    expect(groups).toHaveLength(1);
    expect(groups[0].products.map((p) => p.id)).toEqual(['p-mora']);
  });

  it('sin targets no hay grupos: la promoción aplica a toda la venta', () => {
    expect(filterGroups(CATALOGO, '', VACIA, true)).toEqual([]);
  });
});

describe('countMissing', () => {
  it('no cuenta nada cuando todo se resuelve en el catálogo', () => {
    const selection: ScopeSelection = { categories: [t('c-malt')], products: [t('p-mora')] };
    expect(countMissing(CATALOGO, selection)).toBe(0);
  });

  it('detecta el target de un producto que ya no está en el menú', () => {
    // `/menu` solo trae productos activos: desactivar uno lo saca del catálogo
    // pero el target sigue existiendo, y sin este conteo desaparecería sin aviso.
    const selection: ScopeSelection = { categories: [], products: [t('p-mora'), t('p-borrado')] };
    expect(countMissing(CATALOGO, selection)).toBe(1);
  });

  it('cuenta también categorías desaparecidas', () => {
    const selection: ScopeSelection = { categories: [t('c-borrada')], products: [t('p-borrado')] };
    expect(countMissing(CATALOGO, selection)).toBe(2);
  });
});

describe('selectCategory', () => {
  it('marca la categoría y retira sus productos sueltos, dejando los de otras', () => {
    // El target de categoría ya cubre esos productos: mantener ambos duplicaría
    // el alcance sin cambiar el descuento.
    const selection: ScopeSelection = {
      categories: [],
      products: [t('p-fresa'), t('p-choco'), t('p-mora')],
    };
    const next = selectCategory(MALTEADAS, selection);
    expect(next.categories.map((x) => x.id)).toEqual(['c-malt']);
    expect(next.products.map((x) => x.id)).toEqual(['p-mora']);
  });

  it('no toca las categorías ya marcadas', () => {
    const selection: ScopeSelection = { categories: [t('c-gran')], products: [] };
    expect(selectCategory(MALTEADAS, selection).categories.map((x) => x.id)).toEqual(['c-gran', 'c-malt']);
  });
});
