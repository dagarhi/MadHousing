import { Component, AfterViewInit, OnChanges, OnDestroy, Input, Output, EventEmitter, ViewChild, ElementRef, SimpleChanges, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { MapLayerManager, Modo } from '../../../../core/services/map-layer-manager.service';
import { MapService } from '../../../../core/services/map.service';
import { MapControlsComponent, PoiKey } from '../../../components/map-controls/map-controls.component';
import { SnapDragDirective } from '../../../directives/snap-drag.directive';
import { ThemeService } from '../../../../core/services/theme.service';
import { HttpClient } from '@angular/common/http';
import { circle, booleanPointInPolygon } from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { Subscription } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { IsochroneService, IsochroneProfile } from '../../../../core/services/isochrone.service';
import { RouteService, RouteProfile } from '../../../../core/services/route.service';
import { PinsLayerService } from '../../../../core/services/pins-layer.service';
import { RadiusLayerService } from '../../../../core/services/radius-layer.service';
import { IsochroneLayerService } from '../../../../core/services/isochrone-layer.service';
import { RouteLayerService } from '../../../../core/services/route-layer.service';
import { PopupPropiedadService } from '../../../../core/services/popup-propiedad.service';
import { DrawerEntornoComponent, RouteRequest } from '../drawer-entorno/drawer-entorno.component';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MapControlsComponent, SnapDragDirective, DrawerEntornoComponent],
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

  private boundMapClick = (e: any) => this.onMapClick(e);

  // ── Isochrone state ──────────────────────────────────────────────────────
  isochroneOpen    = false;
  isochroneMode    = false;
  isochroneCenter: [number, number] | null = null;
  isochroneProfile: IsochroneProfile = 'foot-walking';
  isochroneRanges  = new Set<number>([600, 1200, 1800]);
  isochroneLoading = false;
  isochroneCount: number | null = null;
  private isochroneGeoJSON: FeatureCollection | null = null;
  private boundIsoClick = (e: any) => this.onIsochroneMapClick(e);

  // ── Route state ──────────────────────────────────────────────────────────
  routeOpen   = false;
  routeMode   = false;
  routeProfile: RouteProfile = 'foot-walking';
  routeOrigin: [number, number] | null = null;
  routeDest: [number, number] | null = null;
  routeOriginLabel = '';
  routeDestLabel   = '';
  routeLoading     = false;
  routeDistanceKm: number | null = null;
  routeDurationMin: number | null = null;
  private boundRouteClick = (e: any) => this.onRouteMapClick(e);

  // ── POI state ────────────────────────────────────────────────────────────
  poisActive: Record<PoiKey, boolean> = {
    transport: false,
    health:    false,
    education: false,
    park:      false,
    commerce:  false,
    bike:      false,
  };

  // ── Entorno drawer state ─────────────────────────────────────────────────
  entornoPiso: Propiedad | null = null;

  constructor(
    readonly manager: MapLayerManager,
    private http: HttpClient,
    private theme: ThemeService,
    private mapSvc: MapService,
    private zone: NgZone,
    private isoSvc: IsochroneService,
    private routeSvc: RouteService,
    private pins: PinsLayerService,
    private radiusLayer: RadiusLayerService,
    private isoLayer: IsochroneLayerService,
    private routeLayer: RouteLayerService,
    private popupSvc: PopupPropiedadService,
  ) {
    this.subs.add(
      this.popupSvc.entornoRequested$.subscribe(piso => this.zone.run(() => {
        this.entornoPiso = piso;
      })),
    );
  }

  onEntornoClose(): void {
    this.entornoPiso = null;
  }

  /** Drawer requested route removal (user clicked an active route button). */
  onEntornoClearRoute(): void {
    this.routeLayer.clear();
  }

  /**
   * Draw a route from the property to a POI without opening the main Ruta panel.
   * Drawer-triggered routes live only on the map — distance/duration will be
   * available via hover (Fase 7). Any panel-driven state is cleared so the map
   * shows only this new route.
   */
  onEntornoRouteTo(req: RouteRequest): void {
    const piso = this.entornoPiso;
    if (!piso || piso.latitude == null || piso.longitude == null) return;

    // Close the main Ruta panel if it happened to be open with a previous route.
    this.routeOrigin = null;
    this.routeDest = null;
    this.routeOriginLabel = '';
    this.routeDestLabel = '';
    this.routeDistanceKm = null;
    this.routeDurationMin = null;
    this.routeLoading = false;
    this.routeOpen = false;

    const origin: [number, number] = [piso.longitude, piso.latitude];
    const dest:   [number, number] = [req.destLng, req.destLat];

    this.routeLayer.setEndpoints(origin, dest);
    this.routeSvc.getRoute(origin, dest, req.profile).subscribe({
      next: gj => this.zone.run(() => this.routeLayer.setRoute(gj, req.profile)),
      error: err => console.error('[entorno route]', err),
    });
  }

  async ngAfterViewInit() {
    this.allPisos = Array.isArray(this.pisos) ? [...this.pisos] : [];

    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const initialStyle = this.theme.isDark ? environment.mapStyleDark : environment.mapStyleLight;
    await this.manager.init(this.mapContainer.nativeElement, initialStyle);
    this.ready = true;

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
      map.off('click', this.boundMapClick);
      map.off('click', this.boundIsoClick);
      map.off('click', this.boundRouteClick);
    }
    this.pins.setPopupSuppressed(false);
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

  onPoiToggle(key: PoiKey): void {
    const next = !this.poisActive[key];
    this.poisActive = { ...this.poisActive, [key]: next };
    this.manager.getLayer(key)?.setVisible(next);
  }

  /**
   * Reset all ephemeral filter UI (radius/isochrone/route). The layer services
   * are wiped separately by `manager.clearAll()`, so this only needs to close
   * panels, drop click modes, and null out state.
   */
  resetFilters(): void {
    const map = this.mapSvc.getMap();

    // Radius
    if (map) {
      map.getCanvas().style.cursor = '';
      map.off('click', this.boundMapClick);
    }
    this.circleGeoJSON = null;
    this.radiusCenter  = null;
    this.radiusMode    = false;
    this.filteredCount = null;

    // Isochrone
    this.exitIsochroneMode();
    this.isochroneGeoJSON = null;
    this.isochroneCenter  = null;
    this.isochroneLoading = false;
    this.isochroneCount   = null;
    this.isochroneOpen    = false;

    // Route
    this.exitRouteMode();
    this.routeOrigin      = null;
    this.routeDest        = null;
    this.routeOriginLabel = '';
    this.routeDestLabel   = '';
    this.routeDistanceKm  = null;
    this.routeDurationMin = null;
    this.routeLoading     = false;
    this.routeOpen        = false;

    // POIs — layer services were already cleared by manager.clearAll(), so
    // just reset the UI state so checkboxes uncheck.
    this.poisActive = {
      transport: false,
      health:    false,
      education: false,
      park:      false,
      commerce:  false,
      bike:      false,
    };

    this.entornoPiso = null;
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
    this.radiusLayer.setCircle(null);
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
    this.radiusLayer.setCircle(this.circleGeoJSON);
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

  // ── Isochrone ─────────────────────────────────────────────────────────────

  get isochroneActive(): boolean {
    return this.isochroneOpen || !!this.isochroneCenter;
  }

  /** Toggle panel open/closed. If center is already drawn, close = full clear. */
  toggleIsochronePanel(): void {
    if (this.isochroneCenter) {
      this.clearIsochrone();
      return;
    }
    this.isochroneOpen = !this.isochroneOpen;
    if (!this.isochroneOpen) this.exitIsochroneMode();
  }

  /** Enter/exit "click to place" mode. */
  toggleIsochroneMode(): void {
    if (this.isochroneMode) {
      this.exitIsochroneMode();
      return;
    }
    // Disable radius mode if active
    if (this.radiusMode) this.toggleRadiusMode();

    this.isochroneMode = true;
    const map = this.mapSvc.getMap();
    if (map) {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', this.boundIsoClick);
    }
  }

  private exitIsochroneMode(): void {
    this.isochroneMode = false;
    const map = this.mapSvc.getMap();
    if (map) {
      map.getCanvas().style.cursor = '';
      map.off('click', this.boundIsoClick);
    }
  }

  private onIsochroneMapClick(e: any): void {
    this.zone.run(() => {
      this.isochroneCenter = [e.lngLat.lng, e.lngLat.lat];
      this.exitIsochroneMode();
      this.fetchIsochrones();
    });
  }

  setIsochroneProfile(p: IsochroneProfile): void {
    if (this.isochroneProfile === p) return;
    this.isochroneProfile = p;
    if (this.isochroneCenter) this.fetchIsochrones();
  }

  toggleIsochroneRange(seconds: number): void {
    if (this.isochroneRanges.has(seconds)) {
      if (this.isochroneRanges.size > 1) this.isochroneRanges.delete(seconds);
    } else {
      this.isochroneRanges.add(seconds);
    }
    if (this.isochroneCenter) this.fetchIsochrones();
  }

  private fetchIsochrones(): void {
    if (!this.isochroneCenter || this.isochroneRanges.size === 0) return;
    this.isochroneLoading = true;

    const sortedRanges = Array.from(this.isochroneRanges).sort((a, b) => a - b);
    this.isoSvc.getIsochrones({
      lnglat: this.isochroneCenter,
      profile: this.isochroneProfile,
      ranges: sortedRanges,
    }).subscribe({
      next: (geojson) => {
        this.zone.run(() => {
          this.isochroneGeoJSON = geojson;
          this.isochroneLoading = false;
          this.isoLayer.setData(geojson);
          this.applyIsochroneFilter();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          console.error('[Isochrone] ORS error', err);
          this.isochroneLoading = false;
        });
      },
    });
  }

  clearIsochrone(): void {
    this.exitIsochroneMode();
    this.isoLayer.setData(null);
    this.isochroneGeoJSON  = null;
    this.isochroneCenter   = null;
    this.isochroneLoading  = false;
    this.isochroneCount    = null;
    this.isochroneOpen     = false;
    // Restore all pisos if no radius filter is active
    if (!this.circleGeoJSON) this.manager.setData(this.allPisos);
  }

  private applyIsochroneFilter(): void {
    if (!this.isochroneGeoJSON) return;

    // Use the largest polygon (highest value) as the filter boundary
    const largest = this.isochroneGeoJSON.features.reduce((best, f) => {
      const v = (f.properties?.['value'] ?? 0) as number;
      return v > ((best?.properties?.['value'] ?? 0) as number) ? f : best;
    }, this.isochroneGeoJSON.features[0]);

    if (!largest) return;

    const filtered = this.allPisos.filter(p => {
      const lat = Number(p.latitude ?? p.location?.lat);
      const lon = Number(p.longitude ?? p.location?.lng ?? (p.location as any)?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      return booleanPointInPolygon([lon, lat], largest as Feature<Polygon>);
    });

    this.isochroneCount = filtered.length;
    this.manager.setData(filtered);
  }

  // ── Route ─────────────────────────────────────────────────────────────────

  get routeActive(): boolean {
    return this.routeOpen || !!this.routeOrigin || !!this.routeDest;
  }

  /** Toggle: open panel + enter click mode; or full clear if route already drawn. */
  toggleRoutePanel(): void {
    if (this.routeOrigin || this.routeDest) {
      this.clearRoute();
      return;
    }
    this.routeOpen = !this.routeOpen;
    if (this.routeOpen) this.enterRouteMode();
    else this.exitRouteMode();
  }

  private enterRouteMode(): void {
    if (this.routeMode) return;
    // Disable competing modes
    if (this.radiusMode) this.toggleRadiusMode();
    if (this.isochroneMode) {
      this.isochroneMode = false;
      const map = this.mapSvc.getMap();
      if (map) map.off('click', this.boundIsoClick);
    }

    this.routeMode = true;
    this.pins.setPopupSuppressed(true);
    const map = this.mapSvc.getMap();
    if (map) {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', this.boundRouteClick);
    }
  }

  private exitRouteMode(): void {
    this.routeMode = false;
    this.pins.setPopupSuppressed(false);
    const map = this.mapSvc.getMap();
    if (map) {
      map.getCanvas().style.cursor = '';
      map.off('click', this.boundRouteClick);
    }
  }

  private onRouteMapClick(e: any): void {
    this.zone.run(() => {
      const map = this.mapSvc.getMap();
      if (!map) return;

      // Detect if click hit a piso pin
      let lnglat: [number, number];
      let label: string;
      const feats = map.queryRenderedFeatures(e.point, { layers: [this.pins.layerId] });
      if (feats && feats.length > 0) {
        const f: any = feats[0];
        const coords = f.geometry?.type === 'Point'
          ? f.geometry.coordinates
          : [e.lngLat.lng, e.lngLat.lat];
        lnglat = [coords[0], coords[1]];
        const pisoId: string | undefined = f.properties?.id;
        const piso = pisoId ? this.allPisos.find(p => p.propertyCode === pisoId) : null;
        label = piso?.address ? this.truncate(piso.address, 28) : 'Piso';
      } else {
        lnglat = [e.lngLat.lng, e.lngLat.lat];
        label = 'Punto del mapa';
      }

      if (!this.routeOrigin) {
        this.routeOrigin = lnglat;
        this.routeOriginLabel = label;
        this.routeLayer.setEndpoints(this.routeOrigin, this.routeDest);
      } else if (!this.routeDest) {
        this.routeDest = lnglat;
        this.routeDestLabel = label;
        this.routeLayer.setEndpoints(this.routeOrigin, this.routeDest);
        this.exitRouteMode();
        this.fetchRoute();
      }
    });
  }

  private truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  setRouteProfile(p: RouteProfile): void {
    if (this.routeProfile === p) return;
    this.routeProfile = p;
    if (this.routeOrigin && this.routeDest) this.fetchRoute();
  }

  swapRoute(): void {
    if (!this.routeOrigin || !this.routeDest) return;
    [this.routeOrigin, this.routeDest] = [this.routeDest, this.routeOrigin];
    [this.routeOriginLabel, this.routeDestLabel] = [this.routeDestLabel, this.routeOriginLabel];
    this.routeLayer.setEndpoints(this.routeOrigin, this.routeDest);
    this.fetchRoute();
  }

  private fetchRoute(): void {
    if (!this.routeOrigin || !this.routeDest) return;
    this.routeLoading = true;
    this.routeSvc.getRoute(this.routeOrigin, this.routeDest, this.routeProfile).subscribe({
      next: (gj) => this.zone.run(() => {
        this.routeLoading = false;
        const feat: any = gj.features?.[0];
        const summary = feat?.properties?.summary;
        if (summary) {
          this.routeDistanceKm = Math.round((summary.distance / 1000) * 10) / 10;
          this.routeDurationMin = Math.round(summary.duration / 60);
        } else {
          this.routeDistanceKm = null;
          this.routeDurationMin = null;
        }
        this.routeLayer.setRoute(gj, this.routeProfile);
      }),
      error: (err) => this.zone.run(() => {
        console.error('[Route] ORS error', err);
        this.routeLoading = false;
      }),
    });
  }

  clearRoute(): void {
    this.exitRouteMode();
    this.routeLayer.clear();
    this.routeOrigin      = null;
    this.routeDest        = null;
    this.routeOriginLabel = '';
    this.routeDestLabel   = '';
    this.routeDistanceKm  = null;
    this.routeDurationMin = null;
    this.routeLoading     = false;
    this.routeOpen        = false;
  }
}
