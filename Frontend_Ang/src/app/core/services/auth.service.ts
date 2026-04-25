import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment'; 
import { MatDialog } from '@angular/material/dialog'; 
import { SessionExpiredDialogComponent } from '../guards/session-expired-dialog';

/* Interfaces for Auth */
interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  role: string;
}

export interface AuthUser {
  userId: number;
  username: string;
  role: string;
  token: string;
  expiresAt: number;
}

const STORAGE_KEY = 'tfg_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiBaseUrl;
  private sessionExpiredOpen = false;
  private expirationTimer: any = null;

  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

   constructor(
    private http: HttpClient,
    private router: Router,
    private dialog: MatDialog,
  ) {
    this.restoreSession();
    // Dev-only: expone el servicio en `window.__auth` para disparar flujos de
    // auth desde la consola del navegador (p.ej. `__auth.logout('expired')`
    // para probar el modal de sesión expirada). Excluido del bundle de prod.
    if (!environment.production) {
      (window as unknown as { __auth?: AuthService }).__auth = this;
    }
  }

  /** Calculates token expiration or defaults to 1 hour */
  private getTokenExpiration(token: string): number {
    const ONE_HOUR = 3600 * 1000; 

    try {
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const json = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(json) as { exp?: number };
       if (payload.exp) {
          return payload.exp * 1000;
        }
     }
    } catch { }

    return Date.now() + ONE_HOUR;
  }

  private isTokenExpired(expiresAt: number | undefined): boolean {
    if (!expiresAt) return true;
    return Date.now() >= expiresAt;
  }

  /** Logs in the user and schedules auto-logout */
  login(username: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, { username, password })
      .pipe(
        map((res) => {
          const expiresAt = this.getTokenExpiration(res.access_token);
          const user: AuthUser = {
            userId: res.user_id,
            username: res.username,
            role: res.role,
            token: res.access_token,
            expiresAt,
          };
          this.scheduleAutoLogout(expiresAt);
          return user;
        }),
        tap((user) => this.setSession(user)),
      );
  }

  /** Clears session and handles expiration dialog if needed */
  logout(reason?: 'expired'): void {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }

    this.currentUserSubject.next(null);
    localStorage.removeItem(STORAGE_KEY);

    if (reason === 'expired') {
      if (this.sessionExpiredOpen) return; 
      this.sessionExpiredOpen = true;

      this.dialog.open(SessionExpiredDialogComponent, {
        disableClose: true,
        hasBackdrop: true,
        panelClass: 'session-expired-dialog-panel',
        width: '360px',
      }).afterClosed().subscribe(() => {
        this.sessionExpiredOpen = false;
      });
      return;
    }
    this.router.navigate(['/inicio']);
  }

  isAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'ADMIN';
  }

  register(username: string, password: string): Observable<{ user_id: number; username: string; role: string }> {
    return this.http.post<{ user_id: number; username: string; role: string }>(
      `${this.apiUrl}/auth/register`,
      { username, password },
    );
  }

  isAuthenticated(): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    return !this.isTokenExpired(user.expiresAt);
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  getToken(): string | null {
    const user = this.currentUserSubject.value;
    if (!user) return null;

    if (this.isTokenExpired(user.expiresAt)) {
      this.logout('expired'); 
      return null;
    }
    return user.token;
  }

  private setSession(user: AuthUser): void {
    this.currentUserSubject.next(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  private restoreSession(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const stored = JSON.parse(raw) as AuthUser;
      if (!stored.token || this.isTokenExpired(stored.expiresAt)) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.currentUserSubject.next(stored);
      this.scheduleAutoLogout(stored.expiresAt);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private scheduleAutoLogout(expiresAt: number): void {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }

    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      this.logout('expired');
      return;
    }

    this.expirationTimer = setTimeout(() => {
      const user = this.currentUserSubject.value;
      if (user && this.isTokenExpired(user.expiresAt)) {
        this.logout('expired');
      }
    }, msUntilExpiry);
  }
}
