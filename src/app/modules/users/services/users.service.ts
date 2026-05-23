import { Injectable, computed, inject, signal } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { UserRole } from '../../../core/interfaces/user.interface';
import { SupabaseService } from '../../../core/services/supabase.service';
import { UserCreateForm, UserProfile } from '../interfaces/user-profile.interface';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly supabase = inject(SupabaseService);

  readonly users = signal<UserProfile[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalCount = computed(() => this.users().length);

  async loadUsers(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    const { data, error } = await this.supabase.client
      .from('profiles_with_email')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      this.error.set(error.message);
      this.isLoading.set(false);
      return;
    }

    this.users.set(
      (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role as UserRole,
        is_active: row.is_active,
        created_at: row.created_at,
      }))
    );
    this.isLoading.set(false);
  }

  async createUser(form: UserCreateForm): Promise<{ error: string | null }> {
    // Cliente secundario para no afectar la sesión del admin
    const anonClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('already registered')) {
        return { error: 'Este correo ya está registrado' };
      }
      return { error: signUpError.message };
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      return { error: 'No se pudo obtener el ID del usuario creado' };
    }

    const { error: insertError } = await this.supabase.client
      .from('profiles')
      .insert({ id: userId, name: form.name, role: form.role });

    if (insertError) {
      return { error: `Perfil no pudo crearse: ${insertError.message}` };
    }

    await this.loadUsers();
    return { error: null };
  }

  async toggleActive(userId: string, newValue: boolean): Promise<void> {
    const previous = this.users();
    this.users.update(users =>
      users.map(u => u.id === userId ? { ...u, is_active: newValue } : u)
    );

    const { error } = await this.supabase.client
      .from('profiles')
      .update({ is_active: newValue })
      .eq('id', userId);

    if (error) {
      this.users.set(previous);
      this.error.set(error.message);
    }
  }
}
