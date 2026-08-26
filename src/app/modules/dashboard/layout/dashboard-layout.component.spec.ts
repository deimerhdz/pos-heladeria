import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardLayoutComponent } from './dashboard-layout.component';
import { LayoutService } from './layout.service';

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

/**
 * Spec 036 (FR-012): `sidebarOpen()` ahora también controla el panel de
 * escritorio, no solo el slide-over móvil. El auto-cierre en cada
 * navegación (ya existente, pensado para ocultar el slide-over tras
 * navegar en móvil) antes se ejecutaba sin condición y colapsaba el
 * sidebar de escritorio en cuanto el usuario cambiaba de página, perdiendo
 * su elección — el bug reportado tras el despliegue de esta feature.
 *
 * No se llama `fixture.detectChanges()` a propósito: la suscripción a
 * `Router.events` vive en el constructor (corre al crear el componente,
 * sin falta de render), y evita tener que montar `<app-sidebar>`/
 * `<app-header>` completos con sus propias dependencias (AuthService,
 * TenantInfoService, etc.), ajenas a lo que prueba este bloque.
 */
describe('DashboardLayoutComponent — auto-cierre del sidebar solo en móvil (spec 036)', () => {
  let layoutService: LayoutService;
  let router: Router;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([{ path: 'otra', component: BlankComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    TestBed.createComponent(DashboardLayoutComponent);
    layoutService = TestBed.inject(LayoutService);
    router = TestBed.inject(Router);
  });

  afterEach(() => setViewportWidth(originalInnerWidth));

  it('en escritorio, navegar a otra página NO cierra el sidebar', async () => {
    setViewportWidth(1280);
    layoutService.open();

    await router.navigateByUrl('/otra');

    expect(layoutService.sidebarOpen()).toBe(true);
  });

  it('en móvil, navegar a otra página sí cierra el slide-over (comportamiento ya existente)', async () => {
    setViewportWidth(375);
    layoutService.open();

    await router.navigateByUrl('/otra');

    expect(layoutService.sidebarOpen()).toBe(false);
  });
});
