import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../components/drawer-shell/drawer-shell.component'; 
import { FavoritosService } from '../../../../core/services/favoritos.service'; 
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model';

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

  constructor(public favoritos: FavoritosService) {}

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
}
