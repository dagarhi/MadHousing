import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-session-expired-dialog',
  standalone: true,
  imports: [LucideAngularModule, TranslocoModule],
  template: `
    <div class="session-expired-dialog">
      <div class="session-expired-dialog__icon">
        <lucide-icon name="clock" [size]="28"></lucide-icon>
      </div>
      <h2>{{ 'SESSION_EXPIRED.TITLE' | transloco }}</h2>
      <p>{{ 'SESSION_EXPIRED.BODY' | transloco }}</p>
      <div class="actions">
        <button type="button" class="session-expired-dialog__cta" (click)="goToLogin()">
          {{ 'SESSION_EXPIRED.CTA' | transloco }}
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
