import { Component, AfterViewInit, OnChanges, OnDestroy, Input, Output, EventEmitter, ViewChild, ElementRef, SimpleChanges, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { MapLayerManager, Modo } from '../../../../core/services/map-layer-manager.service';
import { MapService } from '../../../../core/services/map.service';
import { MapControlsComponent } from '../../../components/map-controls/map-controls.component';
import { SnapDragDirective } from '../../../directives/snap-drag.directive';
import { ThemeService } from '../../../../core/services/theme.service';
import { HttpClient } from '@angular/common/http';
import { circle, booleanPointInPolygon } from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { Subscription } from 'rxjs';
import { environment } from '../../../../../environments/environment';

const RADIUS_SRC  = 'radius-filter-src';
const RADIUS_FILL = 'radius-filter-fill';
const RADIUS_LINE = 'radius-filter-line';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MapControlsComponent, SnapDragDirective],
  templateUrl: './mapa-principal.component.html',
  styleUrls: ['./mapa-principal.component.scss'],
})
export class MapaPrincipalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @Input() pisos: Propiedad[] = [];
  @Input() modo: Modo = 'heat';

  @Output() clear = new EventEmitter<void>();

  private ready = false;
  private subs = new Subscription();

  // --- Radius filter state ---
  private allPisos: Propiedad[] = [];
  radiusMode   = false;
  radiusCenter: [number, number] | null = null;
  radiusKm     = 1;
  filteredCount: number | null = null;
  readonly radiusOptions = [0.5, 1, 2, 5];
  private circleGeoJSON: Feature<Polygon> | null = null;

  private boundMapClick  = (e: any) => this.onMapClick(e);
  private boundStyleLoad = ()        => { if (this.circleGeoJSON) this.redrawCircleLayers(); };

  constructor(
    readonly manager: MapLayerManager,
    private http: HttpClient,
    private theme: ThemeService,
    private mapSvc: MapService,
    private zone: NgZone,
  ) {}

  async ngAfterViewInit() {
    this.allPisos = Array.isArray(this.pisos) ? [...this.pisos] : [];

    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const initialStyle = this.theme.isDark ? environment.mapStyleDark : environment.mapStyleLight;
    await this.manager.init(this.mapContainer.nativeElement, initialStyle);
    this.ready = true;

    const map = this.mapSvc.getMap();
    if (map) map.on('style.load', this.boundStyleLoad);

    this.http.get<FeatureCollection<Polygon | MultiPolygon>>('assets/municipios_cam.geojson')
      .subscribe(geo => {
        this.manager.setChoroplethPolygons(geo, 'CODIGOINE');
        this.manager.setData(this.pisos);
        this.manager.setMode(this.modo);
      });
  }

  ngOnChanges(ch: SimpleChanges) {
    if (!this.ready) return;
    if (ch['pisos']) {
      this.allPisos = Array.isArray(this.pisos) ? [...this.pisos] : [];
      if (this.circleGeoJSON) {
        this.applyFilter();
      } else {
        this.manager.setData(this.pisos);
      }
    }
    if (ch['modo']) this.manager.setMode(this.modo);
  }

  ngOnDestroy() {
    const map = this.mapSvc.getMap();
    if (map) {
      map.off('style.load', this.boundStyleLoad);
      map.off('click', this.boundMapClick);
    }
    this.clearRadiusLayers();
    this.subs.unsubscribe();
    this.manager.destroy();
  }

  setModo(m: Modo): void {
    if (this.modo === m) return;
    this.modo = m;
    this.manager.setMode(m);
  }

  handleClear(): void {
    this.clear.emit();
  }

  handleCenter(): void {
    this.manager.lookNorth();
  }

  // ── Radius filter ─────────────────────────────────────────────────────────

  get radiusActive(): boolean {
    return this.radiusMode || !!this.radiusCenter;
  }

  toggleRadiusMode(): void {
    if (this.radiusCenter) {
      // Filter already applied → toggle clears it
      this.clearRadius();
      return;
    }
    this.radiusMode = !this.radiusMode;
    const map = this.mapSvc.getMap();
    if (!map) return;

    if (this.radiusMode) {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', this.boundMapClick);
    } else {
      map.getCanvas().style.cursor = '';
      map.off('click', this.boundMapClick);
    }
  }

  private onMapClick(e: any): void {
    // MapLibre events run outside Angular's NgZone — wrap so change detection fires
    this.zone.run(() => {
      const lng: number = e.lngLat.lng;
      const lat: number = e.lngLat.lat;
      this.radiusCenter = [lng, lat];

      // Stop drawing mode
      this.radiusMode = false;
      const map = this.mapSvc.getMap();
      if (map) {
        map.getCanvas().style.cursor = '';
        map.off('click', this.boundMapClick);
      }

      this.drawCircle();
      this.applyFilter();
    });
  }

  setRadius(km: number): void {
    this.radiusKm = km;
    if (this.radiusCenter) {
      this.drawCircle();
      this.applyFilter();
    }
  }

  clearRadius(): void {
    this.clearRadiusLayers();
    this.circleGeoJSON = null;
    this.radiusCenter  = null;
    this.radiusMode    = false;
    this.filteredCount = null;

    const map = this.mapSvc.getMap();
    if (map) {
      map.getCanvas().style.cursor = '';
      map.off('click', this.boundMapClick);
    }

    this.manager.setData(this.allPisos);
  }

  private drawCircle(): void {
    if (!this.radiusCenter) return;
    this.circleGeoJSON = circle(this.radiusCenter, this.radiusKm, { units: 'kilometers' }) as Feature<Polygon>;
    this.redrawCircleLayers();
  }

  private redrawCircleLayers(): void {
    const map = this.mapSvc.getMap();
    if (!map || !this.circleGeoJSON) return;

    this.clearRadiusLayers();

    map.addSource(RADIUS_SRC, { type: 'geojson', data: this.circleGeoJSON as any });

    map.addLayer({
      id: RADIUS_FILL,
      type: 'fill',
      source: RADIUS_SRC,
      paint: { 'fill-color': '#a060a8', 'fill-opacity': 0.12 },
    });

    map.addLayer({
      id: RADIUS_LINE,
      type: 'line',
      source: RADIUS_SRC,
      paint: { 'line-color': '#a060a8', 'line-width': 2, 'line-dasharray': [4, 3] },
    });
  }

  private clearRadiusLayers(): void {
    const map = this.mapSvc.getMap();
    if (!map) return;
    if (map.getLayer(RADIUS_LINE)) try { map.removeLayer(RADIUS_LINE); } catch { }
    if (map.getLayer(RADIUS_FILL)) try { map.removeLayer(RADIUS_FILL); } catch { }
    if (map.getSource(RADIUS_SRC)) try { map.removeSource(RADIUS_SRC); } catch { }
  }

  private applyFilter(): void {
    if (!this.circleGeoJSON) {
      this.manager.setData(this.allPisos);
      this.filteredCount = null;
      return;
    }

    const poly = this.circleGeoJSON;
    const filtered = this.allPisos.filter(p => {
      const lat = Number(p.latitude ?? p.location?.lat);
      const lon = Number(p.longitude ?? p.location?.lng ?? (p.location as any)?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      return booleanPointInPolygon([lon, lat], poly);
    });

    this.filteredCount = filtered.length;
    this.manager.setData(filtered);
  }
}
