import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Table, TableForm, TableWithOccupancy } from '../interfaces/table.interface';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly supabase = inject(SupabaseService);

  readonly tables = signal<TableWithOccupancy[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadTables(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    // Load tables and active session member_count in one query
    const { data: tablesData, error: tablesError } = await this.supabase.client
      .from('tables')
      .select('*')
      .order('name');

    if (tablesError) {
      this.error.set(tablesError.message);
      this.loading.set(false);
      return;
    }

    const tables = tablesData as Table[];

    // Load active sessions for all tables (orders not paid)
    const { data: sessionsData } = await this.supabase.client
      .from('table_sessions')
      .select('table_id, member_count, order_id, orders!inner(status)')
      .neq('orders.status', 'paid');

    const sessionMap = new Map<string, number>();
    if (sessionsData) {
      for (const s of sessionsData as { table_id: string; member_count: number }[]) {
        sessionMap.set(s.table_id, s.member_count);
      }
    }

    this.tables.set(
      tables.map(t => ({
        ...t,
        member_count: sessionMap.get(t.id) ?? null,
      }))
    );

    this.loading.set(false);
  }

  async createTable(data: TableForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 8);

    const { error } = await this.supabase.client.from('tables').insert({
      name: data.name,
      code,
      capacity: data.capacity ?? null,
      is_active: true,
    });

    if (error) {
      this.error.set(error.message);
      this.isSubmitting.set(false);
      return;
    }

    await this.loadTables();
    this.isSubmitting.set(false);
  }

  async updateTable(id: string, data: TableForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('tables')
      .update({
        name: data.name,
        capacity: data.capacity ?? null,
      })
      .eq('id', id);

    if (error) {
      this.error.set(error.message);
      this.isSubmitting.set(false);
      return;
    }

    await this.loadTables();
    this.isSubmitting.set(false);
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('tables')
      .update({ is_active: !current })
      .eq('id', id);

    if (error) {
      this.error.set(error.message);
    } else {
      await this.loadTables();
    }

    this.isSubmitting.set(false);
  }
}
