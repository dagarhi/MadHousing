import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { Propiedad } from '../models/propiedad.model';
import { MapService } from './map.service';
import { HeatValueMapService } from './heat-value-map.service';
import { PinsLayerService } from './pins-layer.service';
import { ChoroplethLayerService } from './choroplethlayer.service';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';

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

  constructor(
    private readonly mapSvc: MapService,
    private readonly heat: HeatValueMapService,
    private readonly pins: PinsLayerService,
    private readonly choro: ChoroplethLayerService,
  ) {}

  async init(container: HTMLElement) {
    await this.mapSvc.initMap(container);
    this.map = this.mapSvc.getMap()!;
    (this.heat as any).attach?.(this.map);
    (this.pins as any).attach?.(this.map);
    (this.choro as any).attach?.(this.map);
  }

  setMode(m: Modo) {
    if (this.mode === m) return;

    if (this.mode === 'coropletico') {
        this.choro.setVisible(false);          
    } else if (this.mode === 'heat') {
        this.heat.setVisible(false); 
    } else if (this.mode === 'chinchetas') {
        this.pins.setVisible(false);
    }

    this.mode = m;

    // activa el nuevo
    this.choro.setVisible(m === 'coropletico');
    this.heat.setVisible(m === 'heat');
    this.pins.setVisible(m === 'chinchetas');

    this.render(); // volverá a pintar SOLO la capa activa
    }

  setData(pisos: Propiedad[]) {
    this.data = Array.isArray(pisos) ? pisos : [];
    this.render();
  }

  private render() {
    if (!this.map) return;
    switch (this.mode) {
      case 'heat':
        // Si HeatValueMapService tiene updateData, puedes llamarla en vez de render
        this.heat.render(this.data, { highOnTop: true });
        break;
      case 'chinchetas':
        this.pins.render(this.data, { showPopupOnClick: true, colorByOperation: true });
        break;
      case 'coropletico':
        this.choro.render(this.data, {
          idField: this.choroIdField,
          mode: this.choroMetric,
          filterOperation: this.choroOperation,
        });
        break;
    }
  }

  destroy() {
    this.heat.clear();
    this.pins.clear();
    this.choro.clear();
    this.mapSvc.destroy?.();
  }
  // Añade este método al manager
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

}
