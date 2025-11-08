import {
  Component,
  AfterViewInit,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import maplibregl from 'maplibre-gl';
import { Propiedad } from '../../app/models/propiedad.model';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { FavoritosService } from '../../app/core/services/favoritos.service';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [CommonModule,LucideAngularModule],
  templateUrl: './mapa-principal.component.html',
  styleUrls: ['./mapa-principal.component.scss'],
})
export class MapaPrincipalComponent implements AfterViewInit, OnChanges {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @Input() propiedades: Propiedad[] = [];
  constructor(private favoritosService: FavoritosService) {}


  map!: maplibregl.Map;
  markers: maplibregl.Marker[] = [];
  mostrarMarkers = true;
  mostrarZonas = true;

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propiedades']) {
      console.log('📦 propiedades recibidas:', this.propiedades?.length);
      if (this.map && this.map.loaded()) this.refrescarMarkers();
    }
  }

  private initMap() {
    console.log('🗺️ Iniciando mapa...');
    this.map = new maplibregl.Map({
      container: this.mapContainer.nativeElement,
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [-3.7038, 40.4168],
      zoom: 11,
      attributionControl: { compact: true },
    });

    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    this.map.on('load', () => {
      console.log('✅ Mapa cargado');
      this.cargarCoropletico();
      if (this.propiedades?.length) this.refrescarMarkers();
      setTimeout(() => {
      this.map.resize();
      console.log('🧩 MapLibre resize() aplicado');
    }, 400);
    });
  }

  private cargarCoropletico() {
    // Asegúrate de tener el archivo en src/assets/municipios_cam.geojson
    fetch('assets/municipios_cam.geojson')
      .then(r => r.json())
      .then((geojson) => {
        if (!this.map.getSource('muni_cam')) {
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
              'fill-opacity': 0.55,
            },
          });

          this.map.addLayer({
            id: 'muni-line',
            type: 'line',
            source: 'muni_cam',
            paint: { 'line-color': '#333', 'line-width': 0.8 },
          });
        }
      })
      .catch((err) => console.error('❌ Error cargando assets/municipios_cam.geojson:', err));
  }

  private refrescarMarkers() {
    console.log('🎯 Redibujando markers con', this.propiedades?.length, 'propiedades');
    // limpia anteriores
    this.markers.forEach(m => m.remove());
    this.markers = [];

    if (!this.mostrarMarkers || !this.propiedades?.length) return;

    const bounds = new maplibregl.LngLatBounds();

    for (const p of this.propiedades) {
      if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;

      const color = p.operation === 'sale' ? '#4caf50' : '#2196f3';

      const marker = new maplibregl.Marker({ color })
        .setLngLat([p.longitude, p.latitude])
        .setPopup(
          new maplibregl.Popup({
            maxWidth: '280px',
            offset: [60, -100],  // eleva el popup sobre la punta del pin
            anchor: 'bottom',  // ancla en la base del marcador
            closeButton: true
          }).setHTML(`
            <div class="popup-contenido">
              <div class="precio">${(p.price ?? 0).toLocaleString()} €</div>
              <div class="direccion">${p.address || ''}</div>
              <div class="detalles">${p.rooms ?? '?'} hab • ${p.size ?? '?'} m²</div>
              <a href="${p.url}" target="_blank" rel="noopener">Ver anuncio</a>
              <button class="fav-btn" data-id="${p.id}">
                ❤️ Favorito
              </button>
            </div>
          `)
        )
        .addTo(this.map);
        marker.getPopup()?.on('open', () => {
          const popupEl = marker.getPopup()?.getElement();
          if (popupEl) {
            popupEl.style.zIndex = '9999';
            popupEl.style.position = 'relative';
            const btn = popupEl.querySelector('.fav-btn');
            if (btn) {
              btn.addEventListener('click', () => {
                this.favoritosService.toggleFavorito(p);
              });
            }
          }
        });


      this.markers.push(marker);
      console.log('🔵 Añadiendo marker:', p.latitude, p.longitude);
      bounds.extend([p.longitude, p.latitude]);
    }

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
    }

    console.log(`✅ ${this.markers.length} markers añadidos`);
  }

  toggleMarkers() {
    this.mostrarMarkers = !this.mostrarMarkers;
    this.refrescarMarkers();
  }

  toggleZonas() {
    this.mostrarZonas = !this.mostrarZonas;
    const visibility = this.mostrarZonas ? 'visible' : 'none';
    if (this.map.getLayer('muni-fill')) this.map.setLayoutProperty('muni-fill', 'visibility', visibility);
    if (this.map.getLayer('muni-line')) this.map.setLayoutProperty('muni-line', 'visibility', visibility);
  }
}
