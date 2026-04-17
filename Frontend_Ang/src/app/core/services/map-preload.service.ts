import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { environment } from '../../../environments/environment';
import { BusquedaService } from './busqueda.service';

@Injectable({ providedIn: 'root' })
export class MapPreloadService {
  private done = false;

  constructor(private busqueda: BusquedaService) {}

  /**
   * Lanzar desde PantallaInicialComponent.ngOnInit() para que los tiles
   * del mapa y los datos de propiedades estén en caché cuando el usuario
   * navegue a /mapa. Se ejecuta una sola vez por sesión.
   */
  preload(): void {
    if (this.done) return;
    this.done = true;

    // Espera 400 ms para no competir con el renderizado del login
    setTimeout(() => {
      this.preloadTiles();
      this.preloadData();
    }, 400);
  }

  private preloadTiles(): void {
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1024px;height:768px;' +
      'visibility:hidden;pointer-events:none;z-index:-1;';
    document.body.appendChild(container);

    const map = new maplibregl.Map({
      container,
      style: environment.mapStyleLight,
      center: [-3.7038, 40.4168],
      zoom: 12,
    });

    // Una vez renderizados todos los tiles del viewport inicial, limpiamos
    map.once('idle', () => {
      map.remove();
      container.remove();
    });
  }

  private preloadData(): void {
    // Fire-and-forget: escribe en localStorage para que buscarTodo() sea
    // instantáneo cuando el usuario llegue al mapa
    this.busqueda.buscarTodo('rent').catch(() => {});
    this.busqueda.buscarTodo('sale').catch(() => {});
  }
}
