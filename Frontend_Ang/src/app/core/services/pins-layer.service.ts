import { Injectable, OnDestroy } from '@angular/core';
import maplibregl, { Marker, Popup } from 'maplibre-gl';
import { MapService } from './map.service';
import { Propiedad } from '../models/propiedad.model'; 
import { PopupPropiedadService } from './popup-propiedad.service';

type LngLat = [number, number];

export interface PinsOptions {
  sizePx?: number;
  colorByOperation?: boolean;
  rentColor?: string;
  saleColor?: string;
  fallbackColor?: string;
  showPopupOnClick?: boolean;
  popupBuilder?: (p: Propiedad) => string | HTMLElement;
  popupOffsetY?: number;
  hoverScale?: number;
  selectedScale?: number;
  zIndexBase?: number;
}

type MarkerRecord = {
  marker: Marker;
  propiedad: Propiedad;
  root: HTMLElement; // wrapper que controla MapLibre (NO tocar transform aquí)
  icon: HTMLElement; // hijo que sí podemos escalar
};

@Injectable({ providedIn: 'root' })
export class PinsLayerService implements OnDestroy {
  private map?: maplibregl.Map;

  private options: Required<PinsOptions> = {
    sizePx: 34,
    colorByOperation: true,
    rentColor: '#22c55e',
    saleColor: '#3b82f6',
    fallbackColor: '#9ca3af',
    showPopupOnClick: true,
    popupBuilder: (p) => this.defaultPopupHTML(p),
    popupOffsetY: 14,
    hoverScale: 1.1,
    selectedScale: 1.2,
    zIndexBase: 10,
  };

  private markersById = new Map<string, MarkerRecord>();
  private visible = true;

  private activePopup?: Popup;
  private selectedId?: string;

  private markers: maplibregl.Marker[] = [];
  private pinLayerIds = new Set<string>();
  private pinSourceIds = new Set<string>();

  constructor(
    private readonly mapSvc: MapService,
    private readonly popupSvc: PopupPropiedadService,
  ) {}

  attach(map?: maplibregl.Map) {
    this.map = map ?? (this.mapSvc as any).getMap?.() ?? this.map;
  }

  ngOnDestroy() { this.clear(); }

  clear() {
    // Quitar todos los Marker que mantienes en tu mapa
    for (const rec of this.markersById.values()) rec.marker.remove();
    this.markersById.clear();
    this.selectedId = undefined;

    // 👇 asegura cerrar el popup activo
    this.activePopup?.remove();
    this.activePopup = undefined;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const rec of this.markersById.values()) {
      rec.root.style.display = visible ? 'block' : 'none';
    }
  }

  render(map: maplibregl.Map, pisos: Propiedad[], opts?: PinsOptions): void;
  render(pisos: Propiedad[], opts?: PinsOptions): void;
  render(a: any, b?: any, c?: any): void {
    const isMapFirst = a && typeof a === 'object' && typeof a.addLayer === 'function';
    const map = isMapFirst ? (a as maplibregl.Map) : undefined;
    const pisos: Propiedad[] = isMapFirst ? (b as Propiedad[] ?? []) : (a as Propiedad[] ?? []);
    const opts: PinsOptions = (isMapFirst ? c : b) ?? {};

    this.attach(map);
    if (!this.map) return;

    // 🔧 corregido el merge de opciones
    this.options = { ...this.options, ...opts };

    const incoming = new Set<string>();
    for (const p of pisos) {
      const id = (p as any).propertyCode as string;
      if (!id) continue;
      const ll = this.getLngLat(p);
      if (!ll) continue;

      incoming.add(id);

      const rec = this.markersById.get(id);
      if (rec) {
        rec.marker.setLngLat(ll);
        rec.propiedad = p;
        this.updateMarkerAppearance(rec);
      } else {
        const created = this.createMarker(p, ll);
        this.markersById.set(id, created);
      }
    }

    for (const [id, rec] of this.markersById) {
      if (!incoming.has(id)) {
        rec.marker.remove();
        this.markersById.delete(id);
      }
    }

    this.setVisible(this.visible);
  }

  setData(pisos: Propiedad[], opts?: PinsOptions) { this.render(pisos, opts); }

  setSelected(propertyCode?: string) {
    const prev = this.selectedId && this.markersById.get(this.selectedId);
    if (prev) this.applyScale(prev.icon, 1);
    this.selectedId = propertyCode;
    const next = propertyCode && this.markersById.get(propertyCode);
    if (next) this.applyScale(next.icon, this.options.selectedScale);
  }

  focusOn(propertyCode: string, zoom?: number, withPopup = true) {
    if (!this.map) return;
    const rec = this.markersById.get(propertyCode);
    if (!rec) return;
    this.map.easeTo({ center: rec.marker.getLngLat(), zoom: zoom ?? Math.max(this.map.getZoom(), 14) });
    if (withPopup && this.options.showPopupOnClick) this.openPopup(rec);
  }

  fitToMarkers(padding: number | { top: number; bottom: number; left: number; right: number } = 40) {
    if (!this.map) return;
    const bounds = new maplibregl.LngLatBounds();
    let count = 0;
    for (const rec of this.markersById.values()) { bounds.extend(rec.marker.getLngLat()); count++; }
    if (count > 0) this.map.fitBounds(bounds, { padding, duration: 600 });
  }

  // ===== Internos =====

  private createMarker(p: Propiedad, ll: LngLat): MarkerRecord {
    // root + icon
    const root = document.createElement('div');
    root.className = 'pin-wrap';
    root.style.willChange = 'transform';      // OK, no seteamos 'transform' aquí
    root.style.pointerEvents = 'auto';
    root.style.cursor = 'pointer';

    const icon = document.createElement('div');
    icon.className = 'pin-icon';
    const color = this.getColor(p);
    icon.innerHTML = this.getMarkerSVG(color, this.options.sizePx);
    icon.style.transformOrigin = '50% 100%';  // escala desde la punta inferior
    root.appendChild(icon);

    // hover/leave → escala en EL ICONO
    root.addEventListener('mouseenter', () => this.applyScale(icon, this.options.hoverScale));
    root.addEventListener('mouseleave', () => {
      const scale = (this.selectedId && this.selectedId === p.propertyCode) ? this.options.selectedScale : 1;
      this.applyScale(icon, scale);
    });
    root.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setSelected(p.propertyCode);
      if (this.options.showPopupOnClick) {
        const rec = this.markersById.get(p.propertyCode!);
        if (rec) this.openPopup(rec);
      }
    });

    const marker = new maplibregl.Marker({ element: root, anchor: 'bottom' })
      .setLngLat(ll)
      .addTo(this.map!);

    // z-index
    marker.getElement().style.zIndex = String(this.options.zIndexBase);

    return { marker, propiedad: p, root, icon };
  }

  private updateMarkerAppearance(rec: MarkerRecord) {
    const color = this.getColor(rec.propiedad);
    rec.icon.innerHTML = this.getMarkerSVG(color, this.options.sizePx);
  }

  private getColor(p: Propiedad): string {
    if (this.options.colorByOperation) {
      if (p.operation === 'rent') return this.options.rentColor;
      if (p.operation === 'sale') return this.options.saleColor;
    }
    return this.options.fallbackColor;
  }

  private applyScale(iconEl: HTMLElement, scale: number) {
    iconEl.style.transform = `scale(${scale})`;
    iconEl.style.transition = 'transform 120ms ease';
  }

  private openPopup(rec: MarkerRecord) {
    // Si quieres detectar modo oscuro automáticamente, usa una clase global:
    const isDark =
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark');

    // coge el lng/lat del marker
    const { lng, lat } = rec.marker.getLngLat();
    // delega en tu servicio que monta el componente Angular
    this.popupSvc.open(rec.propiedad, [lng, lat], isDark);
  }

  private getLngLat(p: Propiedad): LngLat | null {
    const lat = Number(p.latitude ?? (p as any).lat ?? p.location?.lat);
    const lon = Number(p.longitude ?? (p as any).lng ?? (p as any).lon ?? p.location?.lng ?? p.location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lon, lat];
  }

  private getMarkerSVG(color: string, size: number) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".35"/>
          </filter>
        </defs>
        <path d="M20 37s-11-11.5-11-19C9 8.5 13.9 4 20 4s11 4.5 11 14c0 7.5-11 19-11 19z"
              fill="${color}" filter="url(#shadow)"/>
        <circle cx="20" cy="17" r="4.5" fill="#ffffff"/>
      </svg>`;
  }

  private defaultPopupHTML(p: Propiedad) {
    const precio = (p.price ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const tam = p.size ? `${p.size} m²` : '';
    const dir = [p.address, p.neighborhood, p.district, p.city].filter(Boolean).join(' · ');
    const tipo = p.operation === 'rent' ? 'Alquiler' : p.operation === 'sale' ? 'Venta' : '—';
    const url = p.url ?? '#';
    return `
      <div class="popup-propiedad">
        <div class="row-1"><strong>${precio}</strong> <span>${tam}</span></div>
        <div class="row-2">${dir}</div>
        <div class="row-3">${tipo}</div>
        <div class="row-4"><a href="${url}" target="_blank" rel="noopener">Ver anuncio</a></div>
      </div>
    `;
  }

  hasPin(propertyCode: string): boolean {
    return this.markersById.has(String(propertyCode));
  }

  addOne(p: Propiedad, opts: { fly?: boolean; zoom?: number; openPopup?: boolean } = {}): boolean {
    this.attach();
    if (!this.map) return false;

    const id = String((p as any).propertyCode ?? '');
    if (!id) return false;

    let rec = this.markersById.get(id);
    if (!rec) {
      const ll = this.getLngLat(p);
      if (!ll) return false;
      rec = this.createMarker(p, ll);
      this.markersById.set(id, rec);
      // asegura visibilidad coherente con el estado actual
      this.setVisible(this.visible);
    } else {
      // refresca datos (por si vienen del drawer)
      rec.propiedad = p;
      this.updateMarkerAppearance(rec);
    }

    if (opts.fly) {
      this.map.easeTo({
        center: rec.marker.getLngLat(),
        zoom: opts.zoom ?? Math.max(this.map.getZoom(), 16)
      });
    }
    if (opts.openPopup && this.options.showPopupOnClick) {
      this.openPopup(rec);
    }
    return true;
  }
}
