import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-pantalla-inicial',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './pantalla-inicial.component.html',
  styleUrls: ['./pantalla-inicial.component.scss'],
})
export class PantallaInicialComponent implements OnInit {
  loginForm: FormGroup;
  cargando = false;
  error: string | null = null;

  mostrarPassword = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthService,
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    // Si ya hay sesión iniciada, saltamos directamente al mapa
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/mapa']);
    }
  }

  onSubmit(): void {
    if (this.cargando) return;

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.error = null;
    this.cargando = true;

    const { username, password } = this.loginForm.value;

    this.auth.login(username, password).subscribe({
      next: () => {
        this.cargando = false;
        this.router.navigate(['/mapa']);
      },
      error: (err) => {
        console.error('Error en login', err);
        this.cargando = false;
        this.error = 'Usuario o contraseña incorrectos.';
      },
    });
  }

  // Helpers para mostrar errores en el template
  hasError(controlName: string, error: string): boolean {
    const control = this.loginForm.get(controlName);
    return !!control && control.touched && control.hasError(error);
  }

  togglePassword(): void {
    this.mostrarPassword = !this.mostrarPassword;
  }
}
