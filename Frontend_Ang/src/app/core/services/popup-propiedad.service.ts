import { Injectable, ApplicationRef, EnvironmentInjector, createComponent, ComponentRef } from '@angular/core';
import { MapService } from './map.service';
import { Propiedad } from '../models/propiedad.model';
import { PopupPropiedadComponent } from '../../shared/components/popup/popup-propiedad'; 

@Injectable({ providedIn: 'root' })
export class PopupPropiedadService {
  constructor(
    private readonly mapSvc: MapService,
    private readonly appRef: ApplicationRef,
    private readonly env: EnvironmentInjector
  ) {}

  open(piso: Propiedad, lngLat: [number, number], isDark = false) {
    let cmpRef: ComponentRef<PopupPropiedadComponent> | undefined;

    this.mapSvc.abrirPopupEn(
      lngLat,
      (host) => {
        cmpRef = createComponent(PopupPropiedadComponent, {
          environmentInjector: this.env,
          hostElement: host,
        });
        cmpRef.setInput('piso', piso);
        cmpRef.setInput('isDark', isDark);
        cmpRef.setInput('close', close);
        this.appRef.attachView(cmpRef.hostView);
      },
      () => {
        if (cmpRef) {
          this.appRef.detachView(cmpRef.hostView);
          cmpRef.destroy();
          cmpRef = undefined;
        }
      }
    );
  }
}
