import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { PisosService } from '../app/core/services/pisos.service';
import { Propiedad } from './models/propiedad.model';
import { MapaPrincipalComponent } from '../features/mapa/mapa-principal.component';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle';
import { DrawerFavoritosComponent } from '../features/drawers/favoritos/drawer-favoritos.component';
import { DrawerEstadisticasComponent } from '../features/drawers/estadisticas/drawer-estadisticas.component'; 
import { DrawerBuscadorComponent } from '../features/drawers/buscador/buscador.component'; 
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MapaPrincipalComponent,
    ThemeToggleComponent,
    DrawerFavoritosComponent,
    DrawerEstadisticasComponent,
    DrawerBuscadorComponent,
    LucideAngularModule
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent implements OnInit {
  mostrarFavoritos = false;
  mostrarEstadisticas = false;
  mostrarBuscador = false;
  propiedades: Propiedad[] = [];

  constructor(private pisosService: PisosService) {}

  ngOnInit(): void {
    this.pisosService.buscarTodo('sale').subscribe({
      next: (propiedades) => {
        console.log('📥 Propiedades cargadas:', propiedades.length);
        this.propiedades = propiedades;
      },
      error: (err) => console.error('❌ Error cargando propiedades:', err),
    });
  }


  abrirEstadisticas() {
    this.mostrarEstadisticas = !this.mostrarEstadisticas;
  }

  toggleBuscador() {
    this.mostrarBuscador = !this.mostrarBuscador;
  }

  actualizarPropiedades(datos: Propiedad[]) {
    this.propiedades = datos || [];
  }
}
