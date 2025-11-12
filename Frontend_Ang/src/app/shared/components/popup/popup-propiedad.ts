import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
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
export class PopupPropiedadComponent implements OnInit, OnDestroy {
  @Input() piso!: Propiedad;
  @Input() isDark = false;

  private sub?: Subscription;
  favoritos: Propiedad[] = [];

  constructor(private favs: FavoritosService) {}

  ngOnInit(): void {
    // estado inicial + suscripción
    this.favoritos = this.favs.currentFavoritos;
    this.sub = this.favs.favoritos$.subscribe(f => (this.favoritos = f));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get isFav(): boolean {
    return this.esFavorito(this.piso);
  }

  private esFavorito(piso: Propiedad): boolean {
    const code = String((piso as any).propertyCode ?? '');
    return this.favoritos.some(f => String((f as any).propertyCode ?? '') === code);
  }

  onToggleFavorito(): void {
    if (!this.piso) return;
    this.favs.toggleFavorito(this.piso);
  }
}
