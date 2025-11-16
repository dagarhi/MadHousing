import { Component, AfterViewInit, OnChanges, OnDestroy, Input, ViewChild, ElementRef, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model'; 
import { MapLayerManager, Modo } from '../../../../core/services/map-layer-manager.service'; 
import { HttpClient } from '@angular/common/http';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { Subscription } from 'rxjs';

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
  private subs = new Subscription();

  constructor(
    private readonly manager: MapLayerManager, 
    private http: HttpClient, 
  ) {}

  // mapa-principal.component.ts
  async ngAfterViewInit() {
    await this.manager.init(this.mapContainer.nativeElement);
    this.ready = true; 

    this.http.get<FeatureCollection<Polygon | MultiPolygon>>('assets/municipios_cam.geojson')
      .subscribe(geo => {
        this.manager.setChoroplethPolygons(geo, 'CODIGOINE'); 
        this.manager.setData(this.pisos);
        this.manager.setMode(this.modo); 
      });
  }


  ngOnChanges(ch: SimpleChanges) {
    if (!this.ready) return;
    if (ch['pisos']) this.manager.setData(this.pisos);
    if (ch['modo']) this.manager.setMode(this.modo);
  }

  ngOnDestroy() { 
    this.subs.unsubscribe(); 
    this.manager.destroy(); 
  }

  setModo(m: Modo) {
    if (this.modo === m) return;
    this.modo = m;
    this.manager.setMode(m);
  }
}
