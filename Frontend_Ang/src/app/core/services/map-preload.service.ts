import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { environment } from '../../../environments/environment';
import { BusquedaService } from './busqueda.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class MapPreloadService {
  private tilesDone = false;
  private dataDone = false;

  constructor(
    private busqueda: BusquedaService,
    private auth: AuthService,
  ) {}

  /**
   * Lanzar desde PantallaInicialComponent.ngOnInit() para que los tiles
   * del mapa y los datos de propiedades estén en caché cuando el usuario
   * navegue a /mapa.
   *
   * Tiles: se precargan siempre (la API key de MapTiler es pública).
   * Datos: requieren auth (Bug 5 — /buscar-todo no es anónimo). Solo
   * se precargan si hay token. Llamar de nuevo tras login exitoso para
   * que el preload de datos surta efecto sin volver a precargar tiles.
   */
  preload(): void {
    // Espera 400 ms para no competir con el renderizado del login
    setTimeout(() => {
      if (!this.tilesDone) {
        this.tilesDone = true;
        this.preloadTiles();
      }
      if (!this.dataDone && this.auth.getToken()) {
        this.dataDone = true;
        this.preloadData();
      }
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
