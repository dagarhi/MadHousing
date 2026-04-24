import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-session-expired-dialog',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="session-expired-dialog">
      <div class="session-expired-dialog__icon">
        <lucide-icon name="clock" [size]="28"></lucide-icon>
      </div>
      <h2>Sesión expirada</h2>
      <p>Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.</p>
      <div class="actions">
        <button type="button" class="session-expired-dialog__cta" (click)="goToLogin()">
          Ir al login
        </button>
      </div>
    </div>
  `,
})
export class SessionExpiredDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<SessionExpiredDialogComponent>,
    private router: Router,
  ) {}

  goToLogin() {
    this.dialogRef.close();
    this.router.navigate(['/inicio'], {
      queryParams: { reason: 'expired' },
    });
  }
}
