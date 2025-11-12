import { Component, AfterViewInit, OnChanges, OnDestroy, Input, ViewChild, ElementRef, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model'; 
import { MapLayerManager, Modo } from '../../../../core/services/map-layer-manager.service'; 
import { HttpClient } from '@angular/common/http';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';

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
  @Input() modo: Modo = 'heat';

  private ready = false;

  constructor(private readonly manager: MapLayerManager, private http: HttpClient) {}

  // mapa-principal.component.ts
  async ngAfterViewInit() {
    await this.manager.init(this.mapContainer.nativeElement);
    this.ready = true; // <- IMPORTANTE (tu snippet no lo tenía)

    this.http.get<FeatureCollection<Polygon | MultiPolygon>>('assets/municipios_cam.geojson')
      .subscribe(geo => {
        // 1) cargar polígonos
        this.manager.setChoroplethPolygons(geo, 'CODIGOINE'); // cambia 'NOMBRE' si procede

        // 2) datos
        this.manager.setData(this.pisos);

        // 3) modo (si quieres coroplético)
        this.manager.setMode(this.modo); // o 'coropletico' si lo vas a forzar
      });
  }


  ngOnChanges(ch: SimpleChanges) {
    if (!this.ready) return;
    if (ch['pisos']) this.manager.setData(this.pisos);
    if (ch['modo']) this.manager.setMode(this.modo);
  }

  ngOnDestroy() { this.manager.destroy(); }

  setModo(m: Modo) {
    if (this.modo === m) return;
    this.modo = m;
    this.manager.setMode(m);
  }
}
