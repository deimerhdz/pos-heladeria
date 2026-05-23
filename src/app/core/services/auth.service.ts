import { inject, Injectable, signal } from '@angular/core';
import { ReplaySubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { User, UserRole } from '../interfaces/user.interface';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _authReady = new ReplaySubject<void>(1);

  readonly currentUser = signal<User | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly authReady$ = this._authReady.asObservable();

  constructor() {
    // 👇 callback NO async, sin await dentro
    this.supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // 👇 difiere la carga fuera del callback para evitar el deadlock
        queueMicrotask(() => this.handleSession(session.user.id, session.user.email ?? ''));
      } else {
        this.currentUser.set(null);
        this.isLoading.set(false);
        this._authReady.next();
      }
    });
  }

  private async handleSession(userId: string, email: string): Promise<void> {
    try {
      const profile = await this.loadProfile(userId, email);
      this.currentUser.set(profile);
    } catch (err) {
      console.error(err);
      this.currentUser.set(null);
    } finally {
      this.isLoading.set(false);
      this._authReady.next();
    }
  }

  private async loadProfile(userId: string, email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', userId)
      .single();

    if (error || !data) return null;

    return {
      id: data['id'],
      name: data['name'],
      email,
      role: data['role'] as UserRole,
    };
  }
  async login(email: string, password: string): Promise<{ error: string | null }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

    if (error) return { error: 'Credenciales incorrectas. Verifica tu email y contraseña.' };

    if (data.user) {
      const profile = await this.loadProfile(data.user.id, data.user.email ?? email);
      this.currentUser.set(profile);
    }

    return { error: null };
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    this.currentUser.set(null);
  }
}
