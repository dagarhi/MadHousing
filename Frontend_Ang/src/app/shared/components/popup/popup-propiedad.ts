import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../core/models/propiedad.model';
import { FavoritosService } from '../../../core/services/favoritos.service';

@Component({
  selector: 'app-popup-propiedad',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './popup-propiedad.html',
  styleUrls: ['./popup-propiedad.scss'],
})
export class PopupPropiedadComponent {
  @Input() piso!: Propiedad;
  @Input() isDark = false;
  @Input() favoritos: Propiedad[] = [];
  @Input() toggleFavorito!: (p: Propiedad) => void;

  constructor(private favs: FavoritosService) {}

  esFavorito(piso: Propiedad): boolean {
    return this.favoritos.some((f) => f.propertyCode === piso.propertyCode);
  }

  onToggleFavorito() {
    if (this.toggleFavorito) {
      this.toggleFavorito(this.piso);
    } else {
      this.favs.toggleFavorito(this.piso);
    }
  }
}
