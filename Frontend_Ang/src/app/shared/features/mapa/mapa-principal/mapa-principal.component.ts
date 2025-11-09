import {
  Component, AfterViewInit, OnChanges, Input, SimpleChanges,
  ViewChild, ElementRef, OnDestroy, EnvironmentInjector, ApplicationRef, createComponent
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapService } from '../../../../core/services/map.service'; 
import { Propiedad } from '../../../../core/models/propiedad.model';
import { PopupPropiedadComponent } from '../../../components/popup/popup-propiedad';
import 'maplibre-gl/dist/maplibre-gl.css';

@Component({
  selector: 'app-mapa-principal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mapa-principal.component.html',
  styleUrls: ['./mapa-principal.component.scss'],
})
export class MapaPrincipalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @Input() pisos: Propiedad[] = [];

  // Si quieres ver markers YA, pon 'pins' temporalmente:
  modo: 'coropletico' | 'pins' = 'pins';

  constructor(
    private mapSvc: MapService,
    private injector: EnvironmentInjector,
    private appRef: ApplicationRef
  ) {}

  async ngAfterViewInit() {
    await this.mapSvc.initMap(this.mapContainer.nativeElement);
    setTimeout(() => this.redibujar(), 0);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['pisos']) {
      this.redibujar();
    }
  }

  toggleModo() {
    this.modo = this.modo === 'coropletico' ? 'pins' : 'coropletico';
    this.redibujar();
  }

  private redibujar() {
    if (!this.pisos?.length) {
      this.mapSvc.limpiarMarkers();
      this.mapSvc.cerrarPopup();
      return;
    }

    if (this.modo === 'coropletico') {
      this.mapSvc.cerrarPopup();
      this.mapSvc.limpiarMarkers();
      this.mapSvc.dibujarMapaCoropletico(this.pisos);
    } else {
      this.mapSvc.dibujarChinchetasMapLibre(this.pisos, (piso, lngLat) => {
        this.abrirPopupAngular(piso, lngLat);
      });
    }
  }

  /** Monta tu PopupPropiedadComponent dentro del popup de MapLibre */
  private abrirPopupAngular(piso: Propiedad, lngLat: [number, number]) {
    this.mapSvc.abrirPopupEn(
      lngLat,
      (container) => {
        const compRef = createComponent(PopupPropiedadComponent, {
          environmentInjector: this.injector,
          hostElement: container,
        });
        compRef.setInput('piso', piso);
        this.appRef.attachView(compRef.hostView);

        // Limpieza al cerrar el popup
        const cleanup = () => {
          this.appRef.detachView(compRef.hostView);
          compRef.destroy();
        };
        // Vincular cleanup al propio popup (onClose se llama en el servicio)
        // Aquí no hacemos nada más porque el servicio ya invoca onClose.
        // Si quieres forzar cleanup desde aquí, expón el popup activo en el servicio.
      },
      () => {
        // onClose del popup (si necesitas actuar cuando se cierre)
      }
    );
  }

  ngOnDestroy() {
    this.mapSvc.destroy();
  }
}
