import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MapaPrincipalComponent } from '../mapa-principal/mapa-principal.component';
import { DrawerFavoritosComponent } from '../drawer-favoritos/drawer-favoritos.component';
import { DrawerHistorialComponent } from '../drawer-historial/drawer-historial.component';
import { DrawerEstadisticasComponent } from '../drawer-estadisticas/drawer-estadisticas.component';
import { DrawerComparadorComponent } from '../drawer-comparador/drawer-comparador.component';
import { BuscadorComponent } from '../buscador/buscador.component';
import { LeyendaScoreComponent } from '../../../components/leyenda-score/leyenda-score.component';
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { FiltroBusqueda } from '../../../../core/models/filtros.model';
import { MapLayerManager } from '../../../../core/services/map-layer-manager.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { environment } from '../../../../../environments/environment';
import { MapHelpComponent } from '../../../components/map-help/map-help.component';
import { SnapDragDirective } from '../../../directives/snap-drag.directive';
import { LangSwitchComponent } from '../../../components/lang-switch/lang-switch.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-vista-mapa',
  standalone: true,
  imports: [
    CommonModule,
    MapaPrincipalComponent,
    DrawerFavoritosComponent,
    DrawerHistorialComponent,
    DrawerEstadisticasComponent,
    DrawerComparadorComponent,
    BuscadorComponent,
    LeyendaScoreComponent,
    LucideAngularModule,
    MapHelpComponent,
    SnapDragDirective,
    LangSwitchComponent,
    TranslocoModule,
  ],
  templateUrl: './vista-mapa.component.html',
  styleUrls: ['./vista-mapa.component.scss'],
})
export class VistaMapaComponent {
  @ViewChild(BuscadorComponent) buscador!: BuscadorComponent;
  @ViewChild(MapaPrincipalComponent) mapa?: MapaPrincipalComponent;

  mostrarFavoritos = false;
  mostrarHistorial = false;
  mostrarEstadisticas = false;
  mostrarComparador = false;
  mostrarBuscador = false;
  userHelpKey = '';

  pisos: Propiedad[] = [];

  constructor(
    private layers: MapLayerManager,
    private auth: AuthService,
    private router: Router,
    readonly theme: ThemeService,
  ) { }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  onResultados(e: { pisos: any[]; filtros: FiltroBusqueda }) {
    this.pisos = e.pisos;
  }

  /** Closes other drawers when one is opened */
  cerrarOtros(excepto: 'favoritos' | 'historial' | 'estadisticas' | 'comparador' | 'buscador') {
    const estadoActual = {
      favoritos: this.mostrarFavoritos,
      historial: this.mostrarHistorial,
      estadisticas: this.mostrarEstadisticas,
      comparador: this.mostrarComparador,
      buscador: this.mostrarBuscador,
    }[excepto];

    this.mostrarFavoritos = excepto === 'favoritos' ? !estadoActual : false;
    this.mostrarHistorial = excepto === 'historial' ? !estadoActual : false;
    this.mostrarEstadisticas = excepto === 'estadisticas' ? !estadoActual : false;
    this.mostrarComparador = excepto === 'comparador' ? !estadoActual : false;
    this.mostrarBuscador = excepto === 'buscador' ? !estadoActual : false;
  }

  onReaplicarHist(filtros: FiltroBusqueda) {
    this.mostrarHistorial = false;
    this.mostrarBuscador = false;
    Promise.resolve(this.buscador.aplicarFiltros(filtros, true));
  }

  limpiarMapa() {
    this.pisos = [];
    this.layers.clearAll();
    this.mapa?.resetFilters();
  }

  toggleTheme(): void {
    this.theme.toggle();
    const style = this.theme.isDark ? environment.mapStyleDark : environment.mapStyleLight;
    this.layers.changeMapStyle(style);
  }

  logout(): void {
    this.auth.logout();
  }

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    this.userHelpKey = user ? `uid-${user.userId}` : '';
  }
}
