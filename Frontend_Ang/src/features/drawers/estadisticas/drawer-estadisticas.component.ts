import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { PisosService } from '../../../app/core/services/pisos.service';
import { EstadisticasGlobales } from '../../../app/models/estadisticas.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-drawer-estadisticas',
  standalone: true,
  imports: [CommonModule, MatListModule, MatButtonModule, LucideAngularModule],
  templateUrl: './drawer-estadisticas.component.html',
  styleUrls: ['./drawer-estadisticas.component.scss']
})
export class DrawerEstadisticasComponent implements OnInit {
  data?: EstadisticasGlobales;
  cargando = true;

  constructor(private pisosService: PisosService) {}

  ngOnInit() {
    this.cargarDatos();
  }

  cargarDatos() {
    this.cargando = true;
    this.pisosService.estadisticas().subscribe({
      next: res => {
        this.data = res;
        this.cargando = false;
      },
      error: err => {
        console.error('Error al cargar estadísticas', err);
        this.cargando = false;
      }
    });
  }

  zonas(): string[] {
    return this.data ? Object.keys(this.data) : [];
  }
}
