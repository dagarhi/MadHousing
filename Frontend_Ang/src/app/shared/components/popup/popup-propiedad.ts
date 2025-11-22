import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

import { Propiedad } from '../../../core/models/propiedad.model';
import { FavoritosService } from '../../../core/services/favoritos.service';
import { MapService } from '../../../core/services/map.service';
import { PALETTE_RDYLGN, BACKEND_SCORE_DOMAIN, interpolatePalette} from '../../../core/styles/score-colors';

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
  @Input() close?: () => void; 
  private sub?: Subscription;
  favoritos: Propiedad[] = [];

  constructor(private favs: FavoritosService, private mapSvc: MapService, ) {}

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
  get operationLabel(): string {
    const op = this.piso?.operation;
    if (!op) return '—';
    if (op === 'rent') return 'Alquiler';
    if (op === 'sale') return 'Venta';
    return op;
  }
  private asNum(v: any): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (v == null) return undefined;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }


  get displayScore(): number | null {
    if (!this.piso) return null;
    const raw = this.piso.score ?? this.piso.score_intrinseco;
    const s = this.asNum(raw);
    return s ?? null;
  }


  get scoreBgColor(): string | null {
    const s = this.displayScore;
    if (s == null) return null;

    const domain = BACKEND_SCORE_DOMAIN;
    const tRaw = (s - domain.min) / (domain.max - domain.min || 1);
    const t = Math.max(0, Math.min(1, tRaw)); 

    return interpolatePalette(PALETTE_RDYLGN, t);
  }


  get scoreTextColor(): string {
    const s = this.displayScore;
    if (s == null) return '#111827';

    const domain = BACKEND_SCORE_DOMAIN;
    const tRaw = (s - domain.min) / (domain.max - domain.min || 1);
    const t = Math.max(0, Math.min(1, tRaw));

    return t < 0.45 ? '#111827' : '#f9fafb';
  }
  onClosePopup(): void {
    this.mapSvc.cerrarPopup();
  }
}
