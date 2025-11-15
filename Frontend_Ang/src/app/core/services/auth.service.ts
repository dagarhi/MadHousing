import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment'; 
import { FavoritosService } from './favoritos.service';
import { HistorialService } from './historial.service';

// Lo que devuelve tu backend en /auth/login
interface LoginResponse {
  access_token: string;
  token_type: string; // "bearer"
  user_id: number;
  username: string;
  profile?: string | null;
}

// Lo que manejará el front como "usuario actual"
export interface AuthUser {
  userId: number;
  username: string;
  profile?: string | null;
  token: string;
  expiresAt: number; 
}

const STORAGE_KEY = 'tfg_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiBaseUrl;

  private getTokenExpiration(token: string): number {
    const ONE_HOUR = 60 * 60 * 1000; // 1 hora en ms

    try {
      // Intentamos leer "exp" del JWT si viene
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const json = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(json) as { exp?: number };
        if (payload.exp) {
          return payload.exp * 1000; // exp suele venir en segundos
        }
      }
    } catch {
      // ignoramos errores
    }

    // Si no hay "exp" en el token, usamos 1h desde ahora
    return Date.now() + ONE_HOUR;
  }

  private isTokenExpired(expiresAt: number | undefined): boolean {
    if (!expiresAt) {
      // si no tenemos fecha, mejor considerarlo caducado para forzar login de nuevo
      return true;
    }
    return Date.now() >= expiresAt;
  }

  // Estado en memoria del usuario actual
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  currentUser$ = this.currentUserSubject.asObservable();

   constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    this.restoreSession();
  }

  // ---------- LOGIN / LOGOUT ---------- //

  login(username: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, { username, password })
      .pipe(
        map((res) => {
          const expiresAt = this.getTokenExpiration(res.access_token);

          const user: AuthUser = {
            userId: res.user_id,
            username: res.username,
            profile: res.profile,
            token: res.access_token,
            expiresAt, // ← AQUÍ
          };
          return user;
        }),
        tap((user) => {
          this.setSession(user);
        }),
      );
  }

  logout(): void {
    this.currentUserSubject.next(null);
    localStorage.removeItem(STORAGE_KEY);
    this.router.navigate(['/inicio']);
  }

  // ---------- ESTADO DE AUTENTICACIÓN ---------- //

  /** Devuelve true si hay un usuario autenticado en memoria */
  isAuthenticated(): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;

    if (this.isTokenExpired(user.expiresAt)) {
      return false;
    }

    return true;
  }

  /** Devuelve el usuario actual (o null) */
  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  /** Devuelve solo el token JWT (o null) */
  getToken(): string | null {
    const user = this.currentUserSubject.value;
    if (!user) return null;

    if (this.isTokenExpired(user.expiresAt)) {
      this.logout(); 
      return null;
    }

    return user.token;
  }

  // ---------- SESIÓN (LOCALSTORAGE) ---------- //

  private setSession(user: AuthUser): void {
    this.currentUserSubject.next(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  /** Intenta recuperar la sesión desde localStorage al arrancar la app */
  private restoreSession(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const stored = JSON.parse(raw) as AuthUser;

      // Sin token o token caducado => borramos y no restauramos
      if (!stored.token || this.isTokenExpired(stored.expiresAt)) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.currentUserSubject.next(stored);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
