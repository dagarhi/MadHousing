import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { MapPreloadService } from '../../../../core/services/map-preload.service';
import { ThemeService } from '../../../../core/services/theme.service';
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
  registerForm: FormGroup;

  modoRegistro = false;
  cargando = false;
  error: string | null = null;
  mensajeSesion: string | null = null;
  registroExito: string | null = null;
  mostrarPassword = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthService,
    private route: ActivatedRoute,
    private preload: MapPreloadService,
    readonly theme: ThemeService,
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/mapa']);
      return;
    }

    // Precarga tiles del mapa y datos en segundo plano mientras el usuario hace login
    this.preload.preload();

    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'expired') {
      this.mensajeSesion = 'Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.';
    }
  }

  toggleModo(): void {
    this.modoRegistro = !this.modoRegistro;
    this.error = null;
    this.registroExito = null;
    this.loginForm.reset();
    this.registerForm.reset();
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

  onRegister(): void {
    if (this.cargando) return;
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.error = null;
    this.cargando = true;
    const { username, password } = this.registerForm.value;
    this.auth.register(username, password).subscribe({
      next: () => {
        this.cargando = false;
        this.registroExito = 'Cuenta creada. Ya puedes iniciar sesión.';
        this.modoRegistro = false;
        this.loginForm.patchValue({ username });
      },
      error: (err) => {
        this.cargando = false;
        this.error = err.error?.detail ?? 'Error al registrar. Inténtalo de nuevo.';
      },
    });
  }

  hasError(controlName: string, error: string): boolean {
    const control = this.loginForm.get(controlName);
    return !!control && control.touched && control.hasError(error);
  }

  hasErrorReg(controlName: string, error: string): boolean {
    const control = this.registerForm.get(controlName);
    return !!control && control.touched && control.hasError(error);
  }

  togglePassword(): void {
    this.mostrarPassword = !this.mostrarPassword;
  }

  toggleTheme(): void {
    this.theme.toggle();
  }
}
