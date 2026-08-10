import { TestBed } from '@angular/core/testing';
import { SearchableSelectComponent } from './searchable-select.component';

/**
 * El filtro comparaba con `toLowerCase()`: escribir "cafe" no encontraba "Café".
 * En la despensa de una heladería media docena de insumos lleva tilde y nadie
 * la teclea, así que la búsqueda no servía justo donde más falta hacía.
 */
describe('SearchableSelectComponent', () => {
  let component: SearchableSelectComponent;

  const OPCIONES = [
    { id: '1', label: 'Café · kg' },
    { id: '2', label: 'Limón · und' },
    { id: '3', label: 'Azúcar · kg' },
    { id: '4', label: 'Chocolate · g' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SearchableSelectComponent] });
    component = TestBed.createComponent(SearchableSelectComponent).componentInstance;
    component.options = OPCIONES;
  });

  function buscar(termino: string): string[] {
    component.query.set(termino);
    return component.filteredOptions().map((o) => o.label);
  }

  it('encuentra las opciones con tilde escribiendo sin ella', () => {
    expect(buscar('cafe')).toEqual(['Café · kg']);
    expect(buscar('limon')).toEqual(['Limón · und']);
    expect(buscar('azucar')).toEqual(['Azúcar · kg']);
  });

  it('sigue encontrándolas si se escribe la tilde', () => {
    expect(buscar('café')).toEqual(['Café · kg']);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(buscar('  CHOCOLATE ')).toEqual(['Chocolate · g']);
  });

  it('busca en cualquier parte de la etiqueta, no solo al principio', () => {
    // La unidad forma parte de la etiqueta: buscar por ella también vale.
    expect(buscar('kg')).toEqual(['Café · kg', 'Azúcar · kg']);
  });

  it('sin término devuelve todas las opciones', () => {
    expect(buscar('')).toHaveLength(4);
    expect(buscar('   ')).toHaveLength(4);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(buscar('sushi')).toEqual([]);
  });

  it('resuelve la etiqueta de lo seleccionado', () => {
    component.writeValue('2');
    expect(component.selectedLabel()).toBe('Limón · und');
  });

  it('al seleccionar, emite el id y cierra la lista', () => {
    const cambios: string[] = [];
    component.registerOnChange((v) => cambios.push(v));
    component.open.set(true);

    component.selectOption(OPCIONES[0]);

    expect(cambios).toEqual(['1']);
    expect(component.value()).toBe('1');
    expect(component.open()).toBe(false);
  });
});
