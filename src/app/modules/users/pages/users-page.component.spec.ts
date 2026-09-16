import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsersPageComponent } from './users-page.component';
import { AuthService } from '../../../core/services/auth.service';

describe('UsersPageComponent — estado vacío (spec 082)', () => {
  it('el estado vacío ya no muestra el emoji 👥 como ícono', async () => {
    TestBed.configureTestingModule({
      imports: [UsersPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(UsersPageComponent);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http
      .match(() => true)
      .forEach((req) => req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }));
    await Promise.resolve();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('👥');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('group');
  });
});
