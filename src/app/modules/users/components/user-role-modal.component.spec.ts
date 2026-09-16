import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { UserRoleModalComponent } from './user-role-modal.component';

describe('UserRoleModalComponent — ícono de cerrar (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [UserRoleModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(UserRoleModalComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza ✕ como texto literal', () => {
    const el = crear();
    expect(el.textContent).not.toContain('✕');
  });

  it('renderiza el botón de cerrar con el nuevo componente de ícono', () => {
    const el = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('close');
  });
});
