import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { FavoritosService } from '../../../app/core/services/favoritos.service';
import { Propiedad } from '../../../app/models/propiedad.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-drawer-favoritos',
  standalone: true,
  imports: [CommonModule, MatListModule, MatButtonModule, LucideAngularModule],
  templateUrl: './drawer-favoritos.component.html',
  styleUrls: ['./drawer-favoritos.component.scss']
})
export class DrawerFavoritosComponent {
  favoritos: Propiedad[] = [];

  constructor(private favoritosService: FavoritosService) {
    this.favoritosService.favoritos$.subscribe(lista => (this.favoritos = lista));
  }

  eliminar(prop: Propiedad) {
    this.favoritosService.toggleFavorito(prop);
  }

  limpiar() {
    this.favoritosService.clearFavoritos();
  }
}
