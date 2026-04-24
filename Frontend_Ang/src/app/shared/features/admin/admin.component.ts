import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { environment } from '../../../../environments/environment';
import { LucideAngularModule } from 'lucide-angular';

interface UserRow {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit {
  users: UserRow[] = [];
  cargando = true;
  error: string | null = null;
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
    this.error = null;
    this.http.get<UserRow[]>(`${this.apiUrl}/admin/users`).subscribe({
      next: (users) => {
        this.users = users;
        this.cargando = false;
      },
      error: () => {
        this.error = 'Error al cargar usuarios.';
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
      error: () => {
        this.error = 'Error al cambiar el rol.';
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
      error: () => {
        this.error = 'Error al eliminar el usuario.';
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
