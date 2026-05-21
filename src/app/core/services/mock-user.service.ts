import { Injectable, signal } from '@angular/core';
import { User } from '../interfaces/user.interface';
import { MOCK_USERS } from '../../shared/data/mock-data';

@Injectable({ providedIn: 'root' })
export class MockUserService {
  readonly currentUser = signal<User>(MOCK_USERS[0]);
  readonly mockUsers: User[] = MOCK_USERS;

  switchUser(id: string): void {
    const found = MOCK_USERS.find(u => u.id === id);
    if (found) {
      this.currentUser.set(found);
    }
  }
}
