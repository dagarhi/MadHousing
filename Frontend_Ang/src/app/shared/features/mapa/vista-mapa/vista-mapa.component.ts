import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapaPrincipalComponent } from '../mapa-principal/mapa-principal.component';
import { DrawerFavoritosComponent } from '../drawer-favoritos/drawer-favoritos.component';
import { DrawerHistorialComponent } from '../drawer-historial/drawer-historical.component'; 
import { DrawerEstadisticasComponent } from '../drawer-estadisticas/drawer-estadisticas.component';
import { DrawerComparadorComponent } from '../drawer-comparador/drawer-comparador.component';
import { BuscadorComponent } from '../buscador/buscador.component';
import { ThemeToggleComponent } from '../../../components/theme-toggle/theme-toggle';
import { LeyendaScoreComponent } from '../../../components/leyenda-score/leyenda-score.component'; 
import { LucideAngularModule } from 'lucide-angular';
import { Propiedad } from '../../../../core/models/propiedad.model'; 
import { FiltroBusqueda } from '../../../../core/models/filtros.model';
import { MapLayerManager } from '../../../../core/services/map-layer-manager.service';

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
    ThemeToggleComponent,
    LeyendaScoreComponent,
    LucideAngularModule,
  ],
  templateUrl: './vista-mapa.component.html',
  styleUrls: ['./vista-mapa.component.scss'],
})
export class VistaMapaComponent {
   @ViewChild(BuscadorComponent) buscador!: BuscadorComponent;
  // Estado global del mapa y drawers
  mostrarFavoritos = false;
  mostrarHistorial = false;
  mostrarEstadisticas = false;
  mostrarComparador = false;
  mostrarBuscador = false;

  pisos: Propiedad[] = [];

  constructor(private layers: MapLayerManager) {}

  // Recibe resultados del buscador
  onResultados(e: { pisos: any[]; filtros: FiltroBusqueda }) {
    this.pisos = e.pisos;
  }

  // Cierra todos los drawers excepto el especificado
  // vista-mapa.component.ts (método)
  cerrarOtros(excepto: 'favoritos'|'historial'|'estadisticas'|'comparador'|'buscador') {
    const estadoActual = {
      favoritos: this.mostrarFavoritos,
      historial: this.mostrarHistorial,
      estadisticas: this.mostrarEstadisticas,
      comparador: this.mostrarComparador,
      buscador: this.mostrarBuscador,
    }[excepto];

    // Si clicas el mismo botón y está abierto ⇒ toggle a false
    this.mostrarFavoritos   = excepto === 'favoritos'   ? !estadoActual : false;
    this.mostrarHistorial   = excepto === 'historial'   ? !estadoActual : false;
    this.mostrarEstadisticas= excepto === 'estadisticas'? !estadoActual : false;
    this.mostrarComparador  = excepto === 'comparador'  ? !estadoActual : false;
    this.mostrarBuscador    = excepto === 'buscador'    ? !estadoActual : false;
  }
  onReaplicarHist(filtros: FiltroBusqueda) {
    this.mostrarHistorial = false;           // cierra historial para que se note
    this.mostrarBuscador = false;            // opcional: cierra el buscador si lo abres automáticamente
    // Ejecuta la carga + búsqueda
    Promise.resolve(this.buscador.aplicarFiltros(filtros, true));
  }

  limpiarMapa() {
    this.pisos = [];
    this.layers.clearAll();
  }

}
