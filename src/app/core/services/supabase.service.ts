import { inject, Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly tenant = inject(TenantContextService);

  private readonly _client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      global: {
        // Custom fetch injects the tenant header per-request, reading the
        // already-resolved context. Only requests to our own backend get it.
        fetch: (input, init) => this.tenantFetch(input, init),
      },
    }
  );

  get client(): SupabaseClient {
    return this._client;
  }

  private tenantFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const slug = this.tenant.tenantSlug();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (slug !== null && url.startsWith(environment.supabaseUrl)) {
      const headers = new Headers(init?.headers ?? {});
      headers.set(environment.tenantHeaderName, slug);
      return fetch(input, { ...init, headers });
    }

    return fetch(input, init);
  }
}
