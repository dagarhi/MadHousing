import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';

@Component({
  selector: 'app-session-expired-dialog',
  standalone: true,
  template: `
    <div class="session-expired-dialog">
      <h2>Sesión expirada</h2>
      <p>Tu sesión ha expirado. Vuelve a iniciar sesión para continuar.</p>
      <div class="actions">
        <button mat-raised-button color="primary" (click)="goToLogin()">
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
