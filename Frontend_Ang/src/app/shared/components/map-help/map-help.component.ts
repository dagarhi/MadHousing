import {
  AfterViewInit,
  Component,
  Input,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-map-help',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatCardModule,
    LucideAngularModule,
  ],
  templateUrl: './map-help.component.html',
  styleUrls: ['./map-help.component.scss'],
})
export class MapHelpComponent implements AfterViewInit {

  @ViewChild('helpDialog') helpDialogTpl!: TemplateRef<any>;

  /** Identificador del usuario actual (userId, username, etc.) */
  @Input() userKey?: string;

  showInfoButton = false;

  constructor(private dialog: MatDialog) {}

  private get storageKey(): string {
    // si no hay userKey por lo que sea, usamos una genérica
    return this.userKey ? `mapHelpSeen:${this.userKey}` : 'mapHelpSeen';
  }

  ngAfterViewInit(): void {
    const alreadySeen = localStorage.getItem(this.storageKey) === 'true';

    if (!alreadySeen) {
      // Primera vez para ESTE usuario → mostrar popup
      this.openDialog();
      this.showInfoButton = false;
    } else {
      // Ya lo vio → solo botón reutilizable
      this.showInfoButton = true;
    }
  }

  openDialog(): void {
    const dialogRef = this.dialog.open(this.helpDialogTpl, {
      autoFocus: false,
      restoreFocus: true,
    });

    dialogRef.afterClosed().subscribe(() => {
      localStorage.setItem(this.storageKey, 'true');
      this.showInfoButton = true;
    });
  }

  onInfoClick(): void {
    this.openDialog();
  }
}
