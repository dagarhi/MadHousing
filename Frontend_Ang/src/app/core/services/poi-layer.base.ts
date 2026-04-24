import { Injectable, OnDestroy, inject } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { MapService } from './map.service';
import { MapLayer } from './map-layer.interface';
import { PoiService, PoiCategory } from './poi.service';

export interface PoiLayerStyle {
  type: 'circle' | 'fill' | 'line' | 'symbol';
  paint: any;
  layout?: any;
  minzoom?: number;
  maxzoom?: number;
}

/**
 * Shared lifecycle for POI layers (parks, metro, schools…). Each concrete
 * subclass declares an `id`, `zIndex`, backend `category`, and a MapLibre style.
 * Data is fetched lazily on first `setVisible(true)` via `PoiService` (which hits
 * GET /pois?category=X with HTTP cache + per-session in-memory cache), stored in
 * the instance, and replayed through style swaps via the manager's attach/detach
 * cycle so theme toggles don't trigger refetches.
 */
@Injectable()
export abstract class PoiLayerBase implements OnDestroy, MapLayer {
  abstract readonly id: string;
  abstract readonly zIndex: number;
  protected abstract readonly category: PoiCategory;
  protected abstract readonly style: PoiLayerStyle;

  protected readonly mapSvc = inject(MapService);
  protected readonly pois   = inject(PoiService);

  protected map?: maplibregl.Map;
  protected data?: FeatureCollection;
  protected fetching = false;
  protected visible = false;

  protected get sourceId(): string { return `${this.id}-src`; }
  protected get layerId(): string  { return `${this.id}-layer`; }

  attach(map?: maplibregl.Map) {
    this.map = map ?? this.mapSvc.getMap() ?? this.map;
    if (!this.map) return;
    if (this.data) this.rebuild();
    else if (this.visible) this.ensureLoaded();
  }

  detach() {
    if (!this.map) return;
    if (this.map.getLayer(this.layerId))   { try { this.map.removeLayer(this.layerId); } catch { } }
    if (this.map.getSource(this.sourceId)) { try { this.map.removeSource(this.sourceId); } catch { } }
  }

  ngOnDestroy() { this.clear(); }

  clear() {
    this.detach();
    this.data = undefined;
    this.visible = false;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.map) return;

    if (!visible) {
      if (this.map.getLayer(this.layerId)) {
        this.map.setLayoutProperty(this.layerId, 'visibility', 'none');
      }
      return;
    }

    if (this.data) {
      if (this.map.getLayer(this.layerId)) {
        this.map.setLayoutProperty(this.layerId, 'visibility', 'visible');
      } else {
        this.rebuild();
      }
    } else {
      this.ensureLoaded();
    }
  }

  private ensureLoaded() {
    if (this.fetching || this.data) return;
    this.fetching = true;
    this.pois.getPois(this.category).subscribe({
      next: fc => {
        this.fetching = false;
        this.data = fc;
        if (this.map && this.visible) this.rebuild();
      },
      error: err => {
        this.fetching = false;
        console.error(`[${this.id}] failed to load category=${this.category}`, err);
      },
    });
  }

  private rebuild() {
    if (!this.map || !this.data) return;
    this.detach();

    this.map.addSource(this.sourceId, { type: 'geojson', data: this.data as any });

    const layout: any = { ...(this.style.layout ?? {}), visibility: this.visible ? 'visible' : 'none' };
    const layerDef: any = {
      id: this.layerId,
      type: this.style.type,
      source: this.sourceId,
      paint: this.style.paint,
      layout,
    };
    if (this.style.minzoom !== undefined) layerDef.minzoom = this.style.minzoom;
    if (this.style.maxzoom !== undefined) layerDef.maxzoom = this.style.maxzoom;
    this.map.addLayer(layerDef);
  }
}
