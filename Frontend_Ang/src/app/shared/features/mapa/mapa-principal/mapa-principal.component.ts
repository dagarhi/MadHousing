import {
  Component,
  AfterViewInit,
  OnChanges,
  Input,
  SimpleChanges,
  ViewChild,
  ElementRef,
  EnvironmentInjector,
  ApplicationRef,
  createComponent,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import maplibregl from 'maplibre-gl';
import { FavoritosService } from '../../../../core/services/favoritos.service';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { PopupPropiedadComponent } from '../../../components/popup/popup-propiedad'; 
import { ThemeService } from '../../../../core/services/theme.service';
import 'maplibre-gl/dist/maplibre-gl.css';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mapa-principal.component.html',
  styleUrls: ['./mapa-principal.component.scss'],
})
export class MapaPrincipalComponent implements AfterViewInit, OnChanges {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  @Input() pisos: Propiedad[] = [];

  private map!: maplibregl.Map;
  private markers: maplibregl.Marker[] = [];
  modo: 'coropletico' | 'pins' = 'coropletico';
  isDark = false;

  constructor(
    private favoritos: FavoritosService,
    private theme: ThemeService,
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector,
    private destroyRef: DestroyRef
  ) {}

  ngAfterViewInit() {
    this.initMap();
    this.theme.isDark$.subscribe((v) => {
      this.isDark = v;
      if (this.map) {
        this.map.setStyle(
          v
            ? 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'
            : 'https://tiles.stadiamaps.com/styles/alidade_smooth.json'
        );
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['pisos'] && !changes['pisos'].firstChange) {
      if (this.modo === 'pins') this.drawPins();
      else this.drawCoropletico();
    }
  }

  private initMap() {
    this.map = new maplibregl.Map({
      container: this.mapContainer.nativeElement,
      style: this.isDark
        ? 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'
        : 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [-3.7038, 40.4168],
      zoom: 9.2,
    });

    this.map.on('load', () => {
      this.drawCoropletico();
    });
  }

  private clearMarkers() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
  }

  /** 🔹 Dibuja modo coroplético */
  private async drawCoropletico() {
    this.clearMarkers();
    if (!this.map) return;

    const res = await fetch('assets/municipios_cam.geojson');
    const geojson = await res.json();

    const medias: Record<string, number> = {};
    for (const p of this.pisos) {
      const key = (p.city || p.neighborhood || p.district || 'desconocido').toLowerCase();
      const score = Number(p.score_intrinseco ?? p.score ?? 0);
      if (!Number.isFinite(score)) continue;
      medias[key] = medias[key] ? (medias[key] + score) / 2 : score;
    }

    for (const f of geojson.features) {
      const nombre = f.properties?.NAMEUNIT?.toLowerCase() ?? '';
      f.properties.valor = medias[nombre] ?? null;
    }

    if (this.map.getSource('muni_cam')) {
      this.map.removeLayer('muni-fill');
      this.map.removeLayer('muni-line');
      this.map.removeSource('muni_cam');
    }

    this.map.addSource('muni_cam', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'muni-fill',
      type: 'fill',
      source: 'muni_cam',
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'valor'], 0],
          0, '#f1eef6',
          40, '#bdc9e1',
          60, '#74a9cf',
          80, '#2b8cbe',
          100, '#045a8d',
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'valor'], null],
          0.18,
          0.7,
        ],
      },
    });

    this.map.addLayer({
      id: 'muni-line',
      type: 'line',
      source: 'muni_cam',
      paint: { 'line-color': this.isDark ? '#aaa' : '#333', 'line-width': 0.8 },
    });
  }

  /** 🔹 Dibuja modo pins */
  private drawPins() {
    this.clearMarkers();
    if (!this.map || !this.pisos?.length) return;

    this.pisos.forEach((p) => {
      const lat = Number(p.latitude ?? p.location?.lat);
      const lon = Number(p.longitude ?? p.location?.lon ?? p.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const color =
        p.score_intrinseco && p.score_intrinseco >= 70
          ? '#2ecc71'
          : p.score_intrinseco && p.score_intrinseco >= 50
          ? '#f1c40f'
          : '#e74c3c';

      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = `2px solid ${this.isDark ? '#fff' : '#000'}`;
      el.style.boxShadow = '0 0 6px rgba(0,0,0,0.5)';

      const popupNode = document.createElement('div');
      const compRef = createComponent(PopupPropiedadComponent, {
        environmentInjector: this.injector,
        hostElement: popupNode,
      });

      compRef.setInput('piso', p);
      compRef.setInput('isDark', this.isDark);
      compRef.setInput('favoritos', this.favoritos.currentFavoritos); // ✅ corregido
      compRef.setInput('toggleFavorito', (prop: Propiedad) => this.favoritos.toggleFavorito(prop));

      this.appRef.attachView(compRef.hostView);

      const popup = new maplibregl.Popup({ offset: 12 }).setDOMContent(popupNode);
      const marker = new maplibregl.Marker(el).setLngLat([lon, lat]).setPopup(popup);
      marker.addTo(this.map);
      this.markers.push(marker);

      this.destroyRef.onDestroy(() => {
        compRef.destroy();
      });
    });
  }

  toggleModo() {
    this.modo = this.modo === 'coropletico' ? 'pins' : 'coropletico';
    if (this.modo === 'pins') this.drawPins();
    else this.drawCoropletico();
  }
}
