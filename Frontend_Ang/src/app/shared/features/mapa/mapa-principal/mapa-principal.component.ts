import {
  Component, AfterViewInit, OnChanges, Input, SimpleChanges,
  ViewChild, ElementRef, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';

// 👇 Angular Material (para <mat-button-toggle-group> y tooltips)
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

// 👇 Lucide (para <lucide-icon ...>)
import { LucideAngularModule } from 'lucide-angular';

import { MapService } from '../../../../core/services/map.service';
import { Propiedad } from '../../../../core/models/propiedad.model';

// 👇 Tus servicios de capas
import { PinsLayerService } from '../../../../core/services/pins-layer.service';
import { HeatValueMapService } from '../../../../core/services/heat-value-map.service';

import 'maplibre-gl/dist/maplibre-gl.css';

type Modo = 'coropletico' | 'heat' | 'chinchetas';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonToggleModule,
    MatTooltipModule,
    LucideAngularModule,
  ],
  templateUrl: './mapa-principal.component.html',
  styleUrls: ['./mapa-principal.component.scss'],
})
export class MapaPrincipalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @Input() pisos: Propiedad[] = [];

  modo: Modo = 'coropletico';

  constructor(
    private readonly mapSvc: MapService,
    private readonly pins: PinsLayerService,
    private readonly heat: HeatValueMapService,
  ) {}

  async ngAfterViewInit() {
    await this.mapSvc.initMap(this.mapContainer.nativeElement);
    // Conecta servicios al mismo mapa
    this.pins.attach(this.mapSvc as any);
    this.heat.attach(this.mapSvc as any);

    // Primer pintado
    this.redibujar();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['pisos']) {
      this.redibujar();
    }
  }

  // 👇 Falta en tu código actual: el HTML llama a este método
  setModo(m: Modo) {
    if (this.modo === m) return;
    this.modo = m;
    this.redibujar();
  }

  private redibujar() {
    if (!this.pisos?.length) {
      // Limpia todo si no hay datos
      this.heat.clear();
      this.pins.clear();
      this.mapSvc.limpiarMarkers?.();
      this.mapSvc.cerrarPopup?.();
      return;
    }

    switch (this.modo) {
      case 'coropletico': {
        // Oculta las otras capas
        this.heat.setVisible?.(false);
        this.pins.setVisible(false);

        // Dibuja tu capa coroplética con tu servicio actual
        this.mapSvc.cerrarPopup?.();
        this.mapSvc.limpiarMarkers?.();
        this.mapSvc.dibujarMapaCoropletico(this.pisos);
        break;
      }
      case 'heat': {
        // Oculta chinchetas
        this.pins.setVisible(false);

        // Render heat (si ya existe, el servicio actualiza)
        this.heat.render(this.pisos, {
          valueAccessor: (p) => p.score ?? p.price, // ajusta al campo que prefieras
          // Ejemplo: radio por valor (px). Si prefieres metros: radiusUnit:'m' y radiusAccessor -> metros
          radiusUnit: 'px',
          bins: 7,
          colorRamp: ['#440154','#46337E','#365C8D','#277F8E','#1FA187','#4AC16D','#FDE725'],
          opacity: 0.7,
          blur: 0.6,
          highOnTop: true,
          radiusRange: { min: 8, max: 26 },
        });
        this.heat.setVisible?.(true);
        break;
      }
      case 'chinchetas': {
        // Oculta heat
        this.heat.setVisible?.(false);

        // Pinta/actualiza chinchetas
        this.pins.render(this.pisos, {
          colorByOperation: true,
          rentColor: '#22c55e',
          saleColor: '#3b82f6',
          fallbackColor: '#9ca3af',
          popupBuilder: (p) => this.popupHTML(p),
          sizePx: 34,
          hoverScale: 1.1,
          selectedScale: 1.2,
        });
        this.pins.setVisible(true);
        break;
      }
    }
  }

  private popupHTML(p: Propiedad) {
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

  ngOnDestroy() {
    this.heat.clear();
    this.pins.clear();
    this.mapSvc.destroy?.();
  }
}
