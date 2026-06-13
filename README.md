# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Arquitectura multi-tenant (subdominios)

La aplicación resuelve el **tenant** automáticamente desde el hostname al arrancar
(`provideTenantInitializer` en `app.config.ts`), lo expone globalmente vía
`TenantContextService` (signals de solo lectura) y propaga el slug del tenant en
cada petición mediante el header `X-Tenant-Host` (cliente Supabase con `fetch`
personalizado + `tenantHostInterceptor` para `HttpClient`).

Contextos:

- **Super Admin** — dominio raíz: `pos-sistem.com` (prod) / `localhost:4200` (dev).
  Aterriza en `/super-admin`.
- **Tenant** — subdominio: `conodoble.pos-sistem.com` (prod) /
  `heladeria.localhost:4200` (dev). Aterriza en el POS `/dashboard`.

### Desarrollo con subdominios locales

Los navegadores modernos (Chrome/Edge) resuelven `*.localhost` a `127.0.0.1` sin
editar el archivo `hosts`. Para probar el POS de un tenant en dev usa, por ejemplo:

```
http://heladeria.localhost:4200/
```

Y para el Super Admin, el dominio raíz `http://localhost:4200/`.

### Prerequisito de backend (fuera de alcance del frontend)

El aislamiento real de datos **no** depende del header de tenant (que es solo un
hint de enrutamiento y es falsificable desde el cliente). Antes de comercializar el
SaaS, el backend de Supabase debe:

1. Añadir una columna `tenant_id` a las tablas de negocio.
2. Definir **RLS por tenant** que derive el tenant del JWT/usuario autenticado.
3. Mantener un mapeo `tenant (slug → id)` para resolver el subdominio a `tenant_id`.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
