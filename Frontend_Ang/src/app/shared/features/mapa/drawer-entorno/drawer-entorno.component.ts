import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

import { Propiedad } from '../../../../core/models/propiedad.model';
import {
  PoiService,
  PoiCategory,
  NearbyByCategory,
  NearbyPoi,
} from '../../../../core/services/poi.service';
import { RouteProfile } from '../../../../core/services/route.service';
import { notifyError } from '../../../../core/utils/notify-error';

interface CategoryView {
  key: PoiCategory;
  labelKey: string;
  icon: string;   // Lucide icon name
  open: boolean;
  pois: NearbyPoi[];
}

export interface RouteRequest {
  destLat: number;
  destLng: number;
  label: string;
  profile: RouteProfile;
}

const CATEGORIES: Array<Omit<CategoryView, 'open' | 'pois'>> = [
  { key: 'transport', labelKey: 'DRAWER_ENTORNO.CATEGORIES.TRANSPORT', icon: 'train-front' },
  { key: 'health',    labelKey: 'DRAWER_ENTORNO.CATEGORIES.HEALTH',    icon: 'cross' },
  { key: 'education', labelKey: 'DRAWER_ENTORNO.CATEGORIES.EDUCATION', icon: 'graduation-cap' },
  { key: 'park',      labelKey: 'DRAWER_ENTORNO.CATEGORIES.PARK',      icon: 'trees' },
  { key: 'commerce',  labelKey: 'DRAWER_ENTORNO.CATEGORIES.COMMERCE',  icon: 'shopping-cart' },
  { key: 'bike',      labelKey: 'DRAWER_ENTORNO.CATEGORIES.BIKE',      icon: 'bike' },
];

@Component({
  selector: 'app-drawer-entorno',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TranslocoModule],
  templateUrl: './drawer-entorno.component.html',
  styleUrls: ['./drawer-entorno.component.scss'],
})
export class DrawerEntornoComponent implements OnChanges, OnDestroy {
  /** Cuando es null el drawer no se renderiza (cerrado). */
  @Input() propiedad: Propiedad | null = null;

  @Output() close       = new EventEmitter<void>();
  @Output() routeTo     = new EventEmitter<RouteRequest>();
  @Output() clearRoute  = new EventEmitter<void>();

  private readonly pois = inject(PoiService);
  private readonly transloco = inject(TranslocoService);
  private readonly snack = inject(MatSnackBar);
  private sub?: Subscription;

  collapsed = false;            // colapsa todo el drawer al handle
  loading = false;
  sections: CategoryView[] = CATEGORIES.map(c => ({ ...c, open: false, pois: [] }));

  /** Key "poiId:profile" del botón de ruta actualmente activo. Null = nada. */
  activeRouteKey: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['propiedad']) return;
    const p = this.propiedad;
    if (!p || p.latitude == null || p.longitude == null) {
      this.clearSections();
      return;
    }
    this.loadNearby(p.latitude, p.longitude);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private loadNearby(lat: number, lng: number): void {
    this.sub?.unsubscribe();
    this.loading = true;
    this.clearSections();
    // Al cambiar de piso, cualquier ruta del drawer anterior deja de tener sentido.
    this.activeRouteKey = null;
    this.sub = this.pois.getNearby(lat, lng, { limit: 3, radiusM: 2000 }).subscribe({
      next: (data: NearbyByCategory) => {
        this.loading = false;
        this.sections = CATEGORIES.map(c => ({
          ...c,
          open: false,
          pois: data[c.key] ?? [],
        }));
      },
      error: err => {
        this.loading = false;
        console.error('[drawer-entorno] getNearby error', err);
        notifyError(this.snack, this.transloco, err, 'DRAWER_ENTORNO.ERRORS.LOAD');
      },
    });
  }

  private clearSections(): void {
    this.sections = CATEGORIES.map(c => ({ ...c, open: false, pois: [] }));
  }

  toggleSection(key: PoiCategory): void {
    for (const s of this.sections) if (s.key === key) s.open = !s.open;
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  onClose(): void {
    this.close.emit();
  }

  routeKey(poi: NearbyPoi, profile: RouteProfile): string {
    return `${poi.id}:${profile}`;
  }

  isRouteActive(poi: NearbyPoi, profile: RouteProfile): boolean {
    return this.activeRouteKey === this.routeKey(poi, profile);
  }

  /** Click on a mini transport-mode icon: toggle route for this (poi, profile).
   *  Second click on the same button clears it instead of redrawing. */
  onRouteClick(poi: NearbyPoi, profile: RouteProfile): void {
    const key = this.routeKey(poi, profile);
    if (this.activeRouteKey === key) {
      this.activeRouteKey = null;
      this.clearRoute.emit();
      return;
    }
    const geom: any = poi.geometry;
    const coords: number[] | undefined = geom?.coordinates;
    if (!coords || coords.length < 2) return;
    this.activeRouteKey = key;
    this.routeTo.emit({
      destLat: coords[1],
      destLng: coords[0],
      label: poi.name || poi.subtype || this.transloco.translate('DRAWER_ENTORNO.POI_UNNAMED'),
      profile,
    });
  }

  /** Human-readable distance: "180m" or "1.2km". */
  fmtDist(m: number): string {
    if (m < 1000) return `${Math.round(m)}m`;
    return `${(m / 1000).toFixed(1)}km`;
  }

  trackByPoiId(_: number, p: NearbyPoi): number {
    return p.id;
  }
}
