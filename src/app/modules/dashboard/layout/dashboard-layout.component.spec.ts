import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { DashboardLayoutComponent } from './dashboard-layout.component';
import { LayoutService } from './layout.service';

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

/** spec 077 sumó `AuthService → PushRegistrationService → SwPush` al árbol de
 *  inyección del shell; este TestBed no proveía `SwPush` y quedó en `NG0201`.
 *  Ningún test de aquí ejercita push (spec 078, stub local). */
const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };

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
        swPushStub,
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

  // ── spec 078 (US6): umbral md (768) → lg (1024) — el menú se colapsa en tablet ──

  it('en tablet (~900px), navegar a otra página cierra el menú (nuevo — antes se mantenía fijo)', async () => {
    setViewportWidth(900);
    layoutService.open();

    await router.navigateByUrl('/otra');

    expect(layoutService.sidebarOpen()).toBe(false);
  });

  it('justo por debajo de 1024px auto-cierra; en 1024px o más, no', async () => {
    setViewportWidth(1023);
    layoutService.open();
    await router.navigateByUrl('/otra');
    expect(layoutService.sidebarOpen()).toBe(false);

    setViewportWidth(1024);
    layoutService.open();
    await router.navigateByUrl('/');
    expect(layoutService.sidebarOpen()).toBe(true);
  });
});

/**
 * spec 078 (US6, FR-031–FR-036; research.md D7): el valor inicial de
 * `sidebarOpen` depende del viewport contra el umbral `lg` (1024), no `md`
 * (768). Se necesita un TestBed nuevo por ancho para que el `signal` de
 * `LayoutService` (que lee `window.innerWidth` al construirse) tome el valor.
 */
describe('LayoutService — valor inicial de sidebarOpen por ancho (spec 078, US6)', () => {
  const originalInnerWidth = window.innerWidth;
  afterEach(() => setViewportWidth(originalInnerWidth));

  function freshLayoutService(width: number): LayoutService {
    setViewportWidth(width);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(LayoutService);
  }

  it('en móvil (375px) arranca cerrado', () => {
    expect(freshLayoutService(375).sidebarOpen()).toBe(false);
  });

  it('en tablet (900px) arranca cerrado (antes, con umbral md, arrancaba abierto)', () => {
    expect(freshLayoutService(900).sidebarOpen()).toBe(false);
  });

  it('en el límite 1023px arranca cerrado; en 1024px arranca abierto', () => {
    expect(freshLayoutService(1023).sidebarOpen()).toBe(false);
    expect(freshLayoutService(1024).sidebarOpen()).toBe(true);
  });

  it('en escritorio (1280px) arranca abierto — sin cambio', () => {
    expect(freshLayoutService(1280).sidebarOpen()).toBe(true);
  });
});

// Nota (spec 078, US6): el cambio de clases `md:hidden`→`lg:hidden` (backdrop) y
// `md:ml-64`→`lg:ml-64` (margen del contenido) en `dashboard-layout.component.ts`
// es un swap estático de prefijo de breakpoint. Montar el shell completo en un
// TestBed para afirmarlo exige `TenantContextService`/`AuthService`/… (el mismo
// motivo por el que el bloque de arriba evita `detectChanges()`), así que se
// verifica por lectura de código + el recorrido responsive de quickstart.md
// (Historia 6). El comportamiento observable — cuándo el menú arranca oculto y
// cuándo auto-cierra — sí queda cubierto por los tests de este archivo.
