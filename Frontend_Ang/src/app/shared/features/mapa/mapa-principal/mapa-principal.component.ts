import { Component, AfterViewInit, OnChanges, Input, SimpleChanges, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';

import { MapService } from '../../../../core/services/map.service';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { PinsLayerService } from '../../../../core/services/pins-layer.service';
import { HeatValueMapService } from '../../../../core/services/heat-value-map.service';

import 'maplibre-gl/dist/maplibre-gl.css';

type Modo = 'coropletico' | 'heat' | 'chinchetas';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [CommonModule, MatButtonToggleModule, MatTooltipModule, LucideAngularModule],
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
    this.pins.attach(this.mapSvc as any);
    this.heat.attach(this.mapSvc as any);
    setTimeout(() => this.redibujar(), 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['pisos']) this.redibujar();
  }

  setModo(m: Modo) {
    if (this.modo === m) return;
    this.modo = m;
    this.redibujar();
  }

  private redibujar() {
    if (!this.pisos?.length) {
      this.heat.clear();
      this.pins.clear();
      this.mapSvc.cerrarPopup?.();
      return;
    }

    switch (this.modo) {
      case 'coropletico':
        this.heat.setVisible(false);
        this.pins.setVisible(false);
        this.mapSvc.dibujarMapaCoropletico?.(this.pisos);
        break;

      case 'heat':
        this.pins.setVisible(false);
        this.heat.render(this.pisos, {
          valueAccessor: (p) => p.score ?? p.price,
          radiusUnit: 'px',
          radiusRange: { min: 8, max: 26 },
          bins: 7,
          opacity: 0.7,
          blur: 0.6,
          highOnTop: true,
        });
        this.heat.setVisible(true);
        break;

      case 'chinchetas':
        this.heat.setVisible(false);
        this.pins.render(this.pisos, {
          colorByOperation: true,
          rentColor: '#22c55e',
          saleColor: '#3b82f6',
          fallbackColor: '#9ca3af',
          sizePx: 34,
        });
        this.pins.setVisible(true);
        break;
    }
  }

  ngOnDestroy() {
    this.heat.clear();
    this.pins.clear();
    this.mapSvc.destroy?.();
  }
}
