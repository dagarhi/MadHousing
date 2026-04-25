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

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, LangSwitchComponent, TranslocoModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  users: UserRow[] = [];
  cargando = true;
  errorKey: string | null = null;
  confirmDeleteId: number | null = null;

  currentUsername = '';

  private readonly apiUrl = environment.apiBaseUrl;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router,
    readonly theme: ThemeService,
  ) {}

  ngOnInit(): void {
    this.currentUsername = this.auth.getCurrentUser()?.username ?? '';
    this.cargarUsuarios();
  }

  cargarUsuarios(): void {
    this.cargando = true;
    this.errorKey = null;
    this.http.get<UserRow[]>(`${this.apiUrl}/admin/users`).subscribe({
      next: (users) => {
        this.users = users;
        this.cargando = false;
      },
      error: (err) => {
        this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.LOAD');
        this.cargando = false;
      },
    });
  }

  cambiarRol(user: UserRow): void {
    const nuevoRol = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    this.http.patch<UserRow>(`${this.apiUrl}/admin/users/${user.id}`, { role: nuevoRol }).subscribe({
      next: (updated) => {
        user.role = updated.role;
      },
      error: (err) => {
        this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.ROLE_CHANGE');
      },
    });
  }

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
        this.confirmDeleteId = null;
      },
      error: (err) => {
        this.errorKey = mapBackendError(err, 'ADMIN.ERRORS.DELETE');
        this.confirmDeleteId = null;
      },
    });
  }

  volverAlMapa(): void {
    this.router.navigate(['/mapa']);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }
}
