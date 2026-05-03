import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { Propiedad } from '../models/propiedad.model';
import { MapService } from './map.service';
import { HeatValueMapService } from './heat-value-map.service';
import { PinsLayerService } from './pins-layer.service';
import { ChoroplethLayerService } from './choroplethlayer.service';
import { RadiusLayerService } from './radius-layer.service';
import { IsochroneLayerService } from './isochrone-layer.service';
import { RouteLayerService } from './route-layer.service';
import { ParksLayerService } from './parks-layer.service';
import { TransportLayerService } from './transport-layer.service';
import { HealthLayerService } from './health-layer.service';
import { EducationLayerService } from './education-layer.service';
import { CommerceLayerService } from './commerce-layer.service';
import { BikeLayerService } from './bike-layer.service';
import { MapLayer } from './map-layer.interface';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { BehaviorSubject } from 'rxjs';

export type Modo = 'coropletico' | 'heat' | 'chinchetas';
type ChoroAggMode = 'count' | 'avgPrice' | 'avgUnitPrice' | 'avgScore' | 'avgContexto' | 'avgFinal';
type ChoroOp = 'venta' | 'alquiler' | 'all';

@Injectable({ providedIn: 'root' })
export class MapLayerManager {
  private map?: maplibregl.Map;
  private mode: Modo = 'heat';
  private data: Propiedad[] = [];

  private choroIdField: string = 'CODIGOINE';
  private choroMetric: ChoroAggMode = 'avgFinal';
  private choroOperation: ChoroOp = 'all';

  readonly bearing$     = new BehaviorSubject<number>(0);
  readonly tileLoading$ = new BehaviorSubject<boolean>(true);

  private styleSwapInFlight?: Promise<void>;
  private pendingStyleUrl?: string;

  /**
   * Registry of every MapLayer the manager orchestrates. `attach`/`detach`
   * is driven off this list in `zIndex` order, so adding a new layer
   * (POIs, radius, iso, route…) only needs one `register()` call.
   */
  private readonly layers: MapLayer[] = [];

  constructor(
    private readonly mapSvc: MapService,
    private readonly heat: HeatValueMapService,
    private readonly pins: PinsLayerService,
    private readonly choro: ChoroplethLayerService,
    private readonly radius: RadiusLayerService,
    private readonly iso: IsochroneLayerService,
    private readonly route: RouteLayerService,
    private readonly parks: ParksLayerService,
    private readonly transport: TransportLayerService,
    private readonly health: HealthLayerService,
    private readonly education: EducationLayerService,
    private readonly commerce: CommerceLayerService,
    private readonly bike: BikeLayerService,
  ) {
    this.register(this.choro);
    this.register(this.parks);
    this.register(this.bike);
    this.register(this.heat);
    this.register(this.radius);
    this.register(this.iso);
    this.register(this.pins);
    this.register(this.commerce);
    this.register(this.education);
    this.register(this.health);
    this.register(this.transport);
    this.register(this.route);
  }

  // ── Registry ──────────────────────────────────────────────────────────────

  register(layer: MapLayer): void {
    if (this.layers.some(l => l.id === layer.id)) return;
    this.layers.push(layer);
    this.layers.sort((a, b) => a.zIndex - b.zIndex);
    if (this.map) layer.attach(this.map);
  }

  unregister(id: string): void {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    const [layer] = this.layers.splice(idx, 1);
    layer.detach();
  }

  getLayer<T extends MapLayer>(id: string): T | undefined {
    return this.layers.find(l => l.id === id) as T | undefined;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init(container: HTMLElement, styleUrl?: string) {
    await this.mapSvc.initMap(container, styleUrl);
    this.map = this.mapSvc.getMap()!;
    this.bearing$.next(this.map.getBearing() ?? 0);

    this.map.on('move', () => {
      if (!this.map) return;
      this.bearing$.next(this.map.getBearing() ?? 0);
    });

    this.map.once('idle', () => this.tileLoading$.next(false));

    this.attachAll();
  }

  /**
   * Light ↔ dark style toggle. Detaches every registered layer, swaps the
   * style (which also wipes icons), awaits `style.load`, re-registers pin
   * icons, then re-attaches every layer in zIndex order. Each layer's
   * `attach()` pushes its cached data, so no data re-fetch is needed.
   */
  async changeMapStyle(styleUrl: string): Promise<void> {
    if (!this.map) return;

    // Serialize concurrent calls: if a swap is in flight, queue the latest URL
    // and wait for the running swap to finish — then apply the pending one.
    if (this.styleSwapInFlight) {
      this.pendingStyleUrl = styleUrl;
      return;
    }

    this.styleSwapInFlight = this.runStyleSwap(styleUrl).finally(() => {
      this.styleSwapInFlight = undefined;
      const next = this.pendingStyleUrl;
      this.pendingStyleUrl = undefined;
      if (next && next !== styleUrl) this.changeMapStyle(next);
    });
    await this.styleSwapInFlight;
  }

  private async runStyleSwap(styleUrl: string): Promise<void> {
    if (!this.map) return;

    this.detachAll();

    // `diff: false` forces a full reload so `style.load` is guaranteed to fire.
    // With default `diff: true`, MapLibre may apply style patches silently
    // without emitting the event, leaving the await hanging forever.
    this.map.setStyle(styleUrl, { diff: false });
    await this.waitForStyleLoad(3000);

    try {
      await this.mapSvc.loadPinsIcons();
    } catch (err) {
      console.error('[MapLayerManager] loadPinsIcons failed', err);
    }

    this.attachAll();
    this.render();
  }

  private waitForStyleLoad(timeoutMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      if (!this.map) { resolve(); return; }
      let done = false;
      const onLoad = () => { if (done) return; done = true; resolve(); };
      this.map.once('style.load', onLoad);
      setTimeout(() => {
        if (done) return;
        done = true;
        this.map?.off('style.load', onLoad);
        console.warn('[MapLayerManager] style.load timeout — proceeding anyway');
        resolve();
      }, timeoutMs);
    });
  }

  // ── Mode / data ───────────────────────────────────────────────────────────

  setMode(m: Modo) {
    if (this.mode === m) return;
    this.mode = m;
    this.render();
  }

  setData(pisos: Propiedad[]) {
    this.data = Array.isArray(pisos) ? pisos : [];
    this.render();
  }

  setChoroplethPolygons(geojson: FeatureCollection<Polygon | MultiPolygon>, idField = 'CODIGOINE') {
    this.choroIdField = idField;
    this.choro.setPolygons(geojson, idField);
    if (this.mode === 'coropletico') {
      this.choro.setVisible(true);
      this.choro.render(this.data, {
        idField: this.choroIdField,
        mode: this.choroMetric,
        filterOperation: this.choroOperation,
      });
    }
  }

  private render() {
    if (!this.map) return;

    this.choro.setVisible(false);
    this.heat.setVisible(false);
    this.pins.setVisible(false);

    const hasData = !!this.data?.length;

    switch (this.mode) {
      case 'heat': {
        if (!hasData) { this.heat.clear(); return; }
        this.heat.setVisible(true);
        this.heat.render(this.data, {
          highOnTop: true,
          radiusRange: { min: 18, max: 38 },
          opacity: 0.8,
          blur: 0.2,
          maxZoom: 24,
        });
        break;
      }
      case 'chinchetas': {
        if (!hasData) { this.pins.clear(); return; }
        this.pins.setVisible(true);
        this.pins.render(this.data, { showPopupOnClick: true, colorByOperation: true });
        break;
      }
      case 'coropletico': {
        if (!hasData) { this.choro.clear(); return; }
        this.choro.setVisible(true);
        this.choro.render(this.data, {
          idField: this.choroIdField,
          mode: this.choroMetric,
          filterOperation: this.choroOperation,
        });
        break;
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  clearAll(): void {
    if (!this.map) return;

    this.data = [];
    this.mapSvc.cerrarPopup?.();
    this.mapSvc.limpiarMarkers?.();

    for (const layer of this.layers) layer.clear();

    document.querySelectorAll('.maplibregl-popup').forEach(el => el.remove());
  }

  destroy() {
    for (const layer of this.layers) layer.clear();
    this.mapSvc.destroy?.();
    this.map = undefined;
    this.tileLoading$.next(true);
  }

  lookNorth(): void {
    this.mapSvc.resetNorth(true);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private attachAll() {
    if (!this.map) return;
    for (const layer of this.layers) layer.attach(this.map);
  }

  private detachAll() {
    for (const layer of this.layers) layer.detach();
  }
}
