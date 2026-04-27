import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { environment } from '../../../../environments/environment';
import { LucideAngularModule } from 'lucide-angular';
import { LangSwitchComponent } from '../../components/lang-switch/lang-switch.component';
import { TranslocoModule } from '@jsverse/transloco';
import { mapBackendError } from '../../../core/utils/backend-errors';

interface UserRow {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

interface AdminStats {
  total_users: number;
  total_admins: number;
  total_regular: number;
  total_favorites: number;
  total_searches: number;
  total_properties: number;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, LangSwitchComponent, TranslocoModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  users: UserRow[] = [];
  stats: AdminStats | null = null;
  cargando = true;
  errorKey: string | null = null;
  confirmDeleteId: number | null = null;

  // ── Multi-selección ────────────────────────────────────────────────────────
  /** Conjunto de IDs seleccionados para acciones en bloque. */
  readonly seleccionados = new Set<number>();
  /** Mostrar el diálogo de confirmación de borrado masivo. */
  confirmBulkDelete = false;

  currentUsername = '';
  currentUserId: number | null = null;

  private readonly apiUrl = environment.apiBaseUrl;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router,
    readonly theme: ThemeService,
  ) {}

  ngOnInit(): void {
    const cu = this.auth.getCurrentUser();
    this.currentUsername = cu?.username ?? '';
    this.currentUserId = cu?.userId ?? null;
    this.cargarTodo();
  }

  // ── Carga inicial ──────────────────────────────────────────────────────────

  cargarTodo(): void {
    this.cargando = true;
    this.errorKey = null;
    this.cargarUsuarios();
    this.cargarStats();
  }

  cargarUsuarios(): void {
    this.http.get<UserRow[]>(`${this.apiUrl}/admin/users`).subscribe({
      next: (users) => {
        this.users = users;
        this.cargando = false;
        // Limpia selecciones que ya no apliquen tras refrescar
        for (const id of [...this.seleccionados]) {
          if (!users.some(u => u.id === id)) this.seleccionados.delete(id);
        }
      },
      error: (err) => {
        this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.LOAD');
        this.cargando = false;
      },
    });
  }

  cargarStats(): void {
    this.http.get<AdminStats>(`${this.apiUrl}/admin/stats`).subscribe({
      next: (s) => { this.stats = s; },
      error: () => {
        // Si fallan las stats, no bloqueamos la pantalla principal
        this.stats = null;
      },
    });
  }

  // ── Cambiar rol ────────────────────────────────────────────────────────────

  cambiarRol(user: UserRow): void {
    const nuevoRol = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    this.http.patch<UserRow>(`${this.apiUrl}/admin/users/${user.id}`, { role: nuevoRol }).subscribe({
      next: (updated) => {
        user.role = updated.role;
        this.cargarStats(); // refresca contador admin/regular
      },
      error: (err) => {
        this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.ROLE_CHANGE');
      },
    });
  }

  // ── Borrado individual ────────────────────────────────────────────────────

  confirmarEliminar(id: number): void {
    this.confirmDeleteId = id;
  }

  cancelarEliminar(): void {
    this.confirmDeleteId = null;
  }

  eliminarUsuario(id: number): void {
    this.http.delete(`${this.apiUrl}/admin/users/${id}`).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== id);
        this.seleccionados.delete(id);
        this.confirmDeleteId = null;
        this.cargarStats();
      },
      error: (err) => {
        this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.DELETE');
        this.confirmDeleteId = null;
      },
    });
  }

  // ── Multi-selección ────────────────────────────────────────────────────────

  /** ¿Está el usuario seleccionado? */
  estaSeleccionado(id: number): boolean {
    return this.seleccionados.has(id);
  }

  /** Conmuta la selección de un usuario individual. */
  toggleSeleccion(user: UserRow): void {
    if (user.id === this.currentUserId) return; // no se permite seleccionar la propia cuenta
    if (this.seleccionados.has(user.id)) {
      this.seleccionados.delete(user.id);
    } else {
      this.seleccionados.add(user.id);
    }
  }

  /** Usuarios seleccionables (todos menos la propia cuenta del admin). */
  private get usuariosSeleccionables(): UserRow[] {
    return this.users.filter(u => u.id !== this.currentUserId);
  }

  /** ¿Están todos los seleccionables marcados? */
  get todosSeleccionados(): boolean {
    const sel = this.usuariosSeleccionables;
    return sel.length > 0 && sel.every(u => this.seleccionados.has(u.id));
  }

  /** ¿Hay alguno marcado pero no todos? (para indeterminate state). */
  get algunosSeleccionados(): boolean {
    const seleccionables = this.usuariosSeleccionables;
    const marcados = seleccionables.filter(u => this.seleccionados.has(u.id)).length;
    return marcados > 0 && marcados < seleccionables.length;
  }

  /** Conmuta el estado "todos / ninguno" (cabecera de la tabla). */
  toggleTodos(): void {
    if (this.todosSeleccionados) {
      this.seleccionados.clear();
    } else {
      for (const u of this.usuariosSeleccionables) this.seleccionados.add(u.id);
    }
  }

  /** Limpia toda la selección. */
  limpiarSeleccion(): void {
    this.seleccionados.clear();
  }

  // ── Borrado masivo ────────────────────────────────────────────────────────

  pedirConfirmacionMasiva(): void {
    if (this.seleccionados.size === 0) return;
    this.confirmBulkDelete = true;
  }

  cancelarConfirmacionMasiva(): void {
    this.confirmBulkDelete = false;
  }

  ejecutarBorradoMasivo(): void {
    const ids = [...this.seleccionados];
    if (ids.length === 0) return;

    this.http
      .post<{ deleted: number[]; not_found: number[]; rejected: number[] }>(
        `${this.apiUrl}/admin/users/bulk-delete`,
        { ids },
      )
      .subscribe({
        next: (res) => {
          const borrados = new Set(res.deleted);
          this.users = this.users.filter(u => !borrados.has(u.id));
          this.seleccionados.clear();
          this.confirmBulkDelete = false;
          this.cargarStats();
        },
        error: (err) => {
          this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.BULK_DELETE');
          this.confirmBulkDelete = false;
        },
      });
  }

  // ── Navegación / tema ─────────────────────────────────────────────────────

  volverAlMapa(): void {
    this.router.navigate(['/mapa']);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }
}
