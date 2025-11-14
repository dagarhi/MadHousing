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
}

const STORAGE_KEY = 'tfg_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiBaseUrl;

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
          const user: AuthUser = {
            userId: res.user_id,
            username: res.username,
            profile: res.profile,
            token: res.access_token,
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
    return !!this.currentUserSubject.value;
  }

  /** Devuelve el usuario actual (o null) */
  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  /** Devuelve solo el token JWT (o null) */
  getToken(): string | null {
    return this.currentUserSubject.value?.token ?? null;
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
      if (stored && stored.token) {
        this.currentUserSubject.next(stored);
      }
    } catch {
      // Si algo falla al parsear, limpiamos
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
