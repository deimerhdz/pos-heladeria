import { buildMenuLookup } from './menu-lookup';
import { MenuCategory } from '../../products/interfaces/product.interface';

function makeCategories(): MenuCategory[] {
  return [
    {
      id: 'c1',
      name: 'Helados',
      products: [
        {
          id: 'p1',
          name: 'Banana Split',
          description: null,
          image_url: null,
          available: true,
          variants: [
            { id: 'v1', name: 'Única', price: 15000, option_groups: [], available: true },
          ],
          option_groups: [
            {
              id: 'g1',
              name: 'Toppings',
              min_select: 0,
              max_select: 1,
              consume: false,
              selection_mode: 'cantidad',
              max_quantity_per_option: null,
              max_total_quantity: null,
              options: [
                { id: 'o1', name: 'Bobombún', extra_price: 1000, available: true },
              ],
            },
          ],
        },
      ],
    },
  ];
}

describe('buildMenuLookup — optionLabelWithQuantity', () => {
  it('quantity=1 devuelve el nombre sin prefijo (idéntico a optionLabel)', () => {
    const lk = buildMenuLookup(makeCategories());
    expect(lk.optionLabelWithQuantity('o1', 1)).toBe('Bobombún');
    expect(lk.optionLabelWithQuantity('o1', 1)).toBe(lk.optionLabel('o1'));
  });

  it('quantity>1 antepone "Nx "', () => {
    const lk = buildMenuLookup(makeCategories());
    expect(lk.optionLabelWithQuantity('o1', 2)).toBe('2x Bobombún');
  });

});
