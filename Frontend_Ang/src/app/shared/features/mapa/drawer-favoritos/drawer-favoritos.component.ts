import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../components/drawer-shell/drawer-shell.component'; 
import { FavoritosService } from '../../../../core/services/favoritos.service'; 
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { PinsLayerService } from '../../../../core/services/pins-layer.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-drawer-favoritos',
  standalone: true,
  imports: [CommonModule, DrawerShellComponent, LucideAngularModule],
  templateUrl: './drawer-favoritos.component.html',
  styleUrls: ['./drawer-favoritos.component.scss'],
})
export class DrawerFavoritosComponent {
  /** Control externo de apertura del drawer */
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  constructor(
    public favoritos: FavoritosService,
    private pins: PinsLayerService,
    private snack: MatSnackBar
  ) {}

  toggleDrawer(open: boolean) {
    this.opened = open;
    this.openedChange.emit(this.opened); 
  }

  quitarFavorito(piso: Propiedad) {
    this.favoritos.toggleFavorito(piso);
  }

  borrarTodos() {
    this.favoritos.borrarTodos();
  }
  onClose() {
    this.opened = false;
    this.openedChange.emit(false);
  }
  onOpenedChange(value: boolean) {
    this.opened = value;
    this.openedChange.emit(value);
  }
  irAlFavorito(item: Propiedad) {
    this.onClose();
    const id = String((item as any).propertyCode ?? '');
    if (!id) return;

    this.pins.setVisible(true);

    if (this.pins.hasPin(id)) {
      // Caso 1: ya está en el mapa → centramos y abrimos popup
      this.pins.focusOn(id, 16, true);
      return;
    }

    // Caso 2: NO está dibujado → avisamos y pedimos acción
    const ref = this.snack.open(
      'Este piso no está dibujado. ¿Quieres dibujarlo y centrar el mapa?',
      'Dibujar',
      { duration: 7000 } // si no pulsa, no pasa nada
    );

    ref.onAction().subscribe(() => {
      const ok = this.pins.addOne(item, { fly: true, zoom: 16, openPopup: true });
      if (!ok) {
        this.snack.open('No se pudo dibujar el pin (falta localización).', undefined, { duration: 4000 });
      }
    });
  }
}
