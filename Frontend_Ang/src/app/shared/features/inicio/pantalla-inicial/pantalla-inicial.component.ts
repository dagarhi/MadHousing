import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { MapPreloadService } from '../../../../core/services/map-preload.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule } from '@jsverse/transloco';
import { LangSwitchComponent } from '../../../components/lang-switch/lang-switch.component';
import { mapBackendError } from '../../../../core/utils/backend-errors';

@Component({
  selector: 'app-pantalla-inicial',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, TranslocoModule, LangSwitchComponent],
  templateUrl: './pantalla-inicial.component.html',
  styleUrls: ['./pantalla-inicial.component.scss'],
})
export class PantallaInicialComponent implements OnInit {
  loginForm: FormGroup;
  registerForm: FormGroup;

  modoRegistro = false;
  cargando = false;
  // Las propiedades guardan claves de traducción (no strings literales) para
  // que la UI reaccione a cambios de idioma sin necesidad de re-disparar
  // las acciones que las setearon.
  errorKey: string | null = null;
  mensajeSesionKey: string | null = null;
  registroExitoKey: string | null = null;
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
      this.mensajeSesionKey = 'LOGIN.NOTICES.SESSION_EXPIRED';
    }
  }

  toggleModo(): void {
    this.modoRegistro = !this.modoRegistro;
    this.errorKey = null;
    this.registroExitoKey = null;
    this.loginForm.reset();
    this.registerForm.reset();
  }

  onSubmit(): void {
    if (this.cargando) return;
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.errorKey = null;
    this.cargando = true;
    const { username, password } = this.loginForm.value;
    this.auth.login(username, password).subscribe({
      next: () => {
        this.cargando = false;
        // Tras login, dispara el preload de datos (la primera invocación
        // en ngOnInit() solo precargó tiles porque aún no había token).
        this.preload.preload();
        // Honrar returnUrl si el authGuard redirigió aquí.
        // Defensas: solo rutas internas que NO sean /inicio (evita bucle)
        // y NO sean protocol-relative ("//evil.com" sería redirect externo).
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const safe =
          !!returnUrl &&
          returnUrl.startsWith('/') &&
          !returnUrl.startsWith('//') &&
          !returnUrl.startsWith('/inicio');
        this.router.navigateByUrl(safe ? returnUrl! : '/mapa');
      },
      error: (err) => {
        console.error('Error en login', err);
        this.cargando = false;
        this.errorKey = mapBackendError(err, 'LOGIN.ERRORS.BAD_CREDENTIALS');
      },
    });
  }

  onRegister(): void {
    if (this.cargando) return;
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.errorKey = null;
    this.cargando = true;
    const { username, password } = this.registerForm.value;
    this.auth.register(username, password).subscribe({
      next: () => {
        this.cargando = false;
        this.registroExitoKey = 'LOGIN.NOTICES.REGISTER_OK';
        this.modoRegistro = false;
        this.loginForm.patchValue({ username });
      },
      error: (err) => {
        this.cargando = false;
        this.errorKey = mapBackendError(err, 'LOGIN.ERRORS.REGISTER_FAIL');
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
