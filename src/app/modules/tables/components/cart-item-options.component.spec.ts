import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CartItemOptionsComponent } from './cart-item-options.component';
import { CartOptionLine } from '../services/pos-terminal.store';

describe('CartItemOptionsComponent', () => {
  let fixture: ComponentFixture<CartItemOptionsComponent>;
  let component: CartItemOptionsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CartItemOptionsComponent] });
    fixture = TestBed.createComponent(CartItemOptionsComponent);
    component = fixture.componentInstance;
  });

  function setInputs(options: CartOptionLine[], notes: string | null = null): void {
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('notes', notes);
    fixture.detectChanges();
  }

  it('sin opciones ni nota no muestra nada', () => {
    setInputs([]);
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('agrupa las opciones por el nombre de su grupo', () => {
    setInputs([
      { groupLabel: 'Sabores', text: 'Chicle' },
      { groupLabel: 'Sabores', text: 'Combinado' },
      { groupLabel: 'Toppings', text: 'Bombum' },
    ]);

    expect(component.optionGroups()).toEqual([
      { label: 'Sabores', items: ['Chicle', 'Combinado'] },
      { label: 'Toppings', items: ['Bombum'] },
    ]);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Sabores:');
    expect(texto).toContain('Chicle, Combinado');
    expect(texto).toContain('Toppings:');
    expect(texto).toContain('Bombum');
  });

  it('los componentes de un combo (sin grupo) van juntos, sin etiqueta', () => {
    setInputs([
      { groupLabel: null, text: '1x Cono sencillo' },
      { groupLabel: null, text: '1x Gaseosa' },
    ]);

    expect(component.optionGroups()).toEqual([
      { label: null, items: ['1x Cono sencillo', '1x Gaseosa'] },
    ]);
    expect(fixture.nativeElement.textContent).toContain('1x Cono sencillo, 1x Gaseosa');
  });

  // La caja que agrupa sabores/toppings es un `<div>` con esquinas de 8px;
  // la pastilla suelta de la nota es un `<span>` con esquinas redondas del
  // todo (`rounded-full`) -- selectores distintos para no confundir una con
  // otra (las dos tienen clase `border`).
  const box = (): HTMLElement | null => fixture.nativeElement.querySelector('div[class*="rounded-[8px]"]');

  it('con opciones y nota, la nota se ve dentro de la misma caja', () => {
    setInputs([{ groupLabel: 'Sabores', text: 'Fresa' }], 'sin azucar por favor');

    const caja = box();
    expect(caja).toBeTruthy();
    expect(caja!.textContent).toContain('Fresa');
    expect(caja!.textContent).toContain('Nota:');
    expect(caja!.textContent).toContain('sin azucar por favor');
  });

  it('sin opciones pero con nota, la nota se ve suelta (sin caja)', () => {
    setInputs([], 'para llevar');

    expect(box()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Nota:');
    expect(fixture.nativeElement.textContent).toContain('para llevar');
  });
});
