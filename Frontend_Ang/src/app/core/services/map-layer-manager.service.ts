import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { Propiedad } from '../models/propiedad.model';
import { MapService } from './map.service';
import { HeatValueMapService } from './heat-value-map.service';
import { PinsLayerService } from './pins-layer.service';
import { ChoroplethLayerService } from './choroplethlayer.service';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { BehaviorSubject } from 'rxjs';

export type Modo = 'coropletico' | 'heat' | 'chinchetas';
type ChoroAggMode = 'count' | 'avgPrice' | 'avgUnitPrice' | 'avgScore';
type ChoroOp = 'venta' | 'alquiler' | 'all';

interface attachableLayer {
  attach?(map: maplibregl.Map): void;
}

@Injectable({ providedIn: 'root' })
export class MapLayerManager {
  private map?: maplibregl.Map;
  private mode: Modo = 'heat';
  private data: Propiedad[] = [];

  private choroIdField: string = 'CODIGOINE';
  private choroMetric: ChoroAggMode = 'avgScore';
  private choroOperation: ChoroOp = 'all';
  readonly bearing$ = new BehaviorSubject<number>(0);

  constructor(
    private readonly mapSvc: MapService,
    private readonly heat: HeatValueMapService,
    private readonly pins: PinsLayerService,
    private readonly choro: ChoroplethLayerService,
  ) { }

  async init(container: HTMLElement) {
    await this.mapSvc.initMap(container);
    this.map = this.mapSvc.getMap()!;
    this.bearing$.next(this.map.getBearing() ?? 0);

    this.map.on('move', () => {
      if (!this.map) return;
      this.bearing$.next(this.map.getBearing() ?? 0);
    });

    // Safely attach sub-services
    (this.heat as unknown as attachableLayer).attach?.(this.map);
    (this.pins as unknown as attachableLayer).attach?.(this.map);
    (this.choro as unknown as attachableLayer).attach?.(this.map);
  }

  setMode(m: Modo) {
    if (this.mode === m) return;
    this.mode = m;
    this.render();
  }

  setData(pisos: Propiedad[]) {
    this.data = Array.isArray(pisos) ? pisos : [];
    this.render();
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

  destroy() {
    this.heat.clear();
    this.pins.clear();
    this.choro.clear();
    this.mapSvc.destroy?.();
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

  clearAll(): void {
    if (!this.map) return;

    this.data = [];
    this.mapSvc.cerrarPopup?.();
    this.mapSvc.limpiarMarkers?.();
    this.mapSvc.clearChoropleth?.();

    this.pins.clear();
    this.heat.clear();
    this.choro.clear();

    document.querySelectorAll('.maplibregl-popup').forEach(el => el.remove());
    this.cleanResidualLayers();
  }

  private cleanResidualLayers() {
    if (!this.map) return;
    const style = this.map.getStyle();

    // Clean layers
    (style?.layers ?? []).forEach(l => {
      if (/^(heat|heat-value|choropleth-|choro-|pins|pin-)/i.test(l.id) && this.map!.getLayer(l.id)) {
        try { this.map!.removeLayer(l.id); } catch { }
      }
    });

    // Clean sources
    Object.keys(style?.sources ?? {}).forEach(id => {
      if (/^(heat|heat-value|choropleth-|choro-|pins|pin-)/i.test(id) && this.map!.getSource(id)) {
        try { this.map!.removeSource(id); } catch { }
      }
    });
  }

  lookNorth(): void {
    this.mapSvc.resetNorth(true);
  }
}
