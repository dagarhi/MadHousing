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
  ) {}

  async init(container: HTMLElement) {
    await this.mapSvc.initMap(container);
    this.map = this.mapSvc.getMap()!;
    this.bearing$.next(this.map.getBearing() ?? 0);

    this.map.on('move', () => {
      if (!this.map) return;
      this.bearing$.next(this.map.getBearing() ?? 0);
    });
    
    (this.heat as any).attach?.(this.map);
    (this.pins as any).attach?.(this.map);
    (this.choro as any).attach?.(this.map);
    if (typeof window !== 'undefined') {
      (window as any).map = this.map;
    }
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

    // Oculta todo por defecto
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

    // 0) Vacía el snapshot para que no se re-pinte al siguiente render
    this.data = [];

    // 1) Cierra popups y markers “legacy” del MapService (por si se usaron)
    this.mapSvc.cerrarPopup?.();
    this.mapSvc.limpiarMarkers?.();
    this.mapSvc.clearChoropleth?.();

    // 2) Pide a cada servicio que limpie lo suyo (lo hace mejor que por prefijo)
    this.pins.clear();
    this.heat.clear();
    this.choro.clear();

    // 3) Como extra, quita cualquier popup suelto del DOM
    document.querySelectorAll('.maplibregl-popup').forEach(el => el.remove());

    // 4) Fallback: barre capas/sources residuales por prefijo
    const style = this.map.getStyle();
    const layerIds = (style?.layers ?? []).map(l => l.id);
    for (const id of layerIds) {
      if (/^(heat|heat-value|choropleth-|choro-|pins|pin-)/i.test(id) && this.map.getLayer(id)) {
        try { this.map.removeLayer(id); } catch {}
      }
    }
    const sourceIds = Object.keys(style?.sources ?? {});
    for (const id of sourceIds) {
      if (/^(heat|heat-value|choropleth-|choro-|pins|pin-)/i.test(id) && this.map.getSource(id)) {
        try { this.map.removeSource(id); } catch {}
      }
    }
  }
  lookNorth(): void {
    this.mapSvc.resetNorth(true); 
  }
}
