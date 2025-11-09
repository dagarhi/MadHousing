import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../../shared/components/drawer-shell/drawer-shell.component';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { EstadisticasService } from '../../../../core/services/estadisticas.service';
import { EstadisticasGlobales } from '../../../../core/models/estadistica.model';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-drawer-comparador',
  standalone: true,
  imports: [CommonModule, DrawerShellComponent, LucideAngularModule, FormsModule, NgChartsModule],
  templateUrl: './drawer-comparador.component.html',
  styleUrls: ['./drawer-comparador.component.scss'],
})
export class DrawerComparadorComponent implements OnChanges {
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  loading = false;
  stats: EstadisticasGlobales | null = null;
  tipoOperacion: 'sale' | 'rent' = 'sale';
  zonaA: string | null = null;
  zonaB: string | null = null;
  zonasConDatos: string[] = [];

  constructor(private estadisticas: EstadisticasService) {}

   ngOnChanges(changes: SimpleChanges) {
    if (changes['opened'] && this.opened) {
      this.cargarDatos();
    }
  }

  async cargarDatos() {
    this.loading = true;
    try {
      const data = await this.estadisticas.obtenerGlobales().toPromise();
      this.stats = data as EstadisticasGlobales;
      this.actualizarZonas();
    } catch (err) {
      console.error('Error cargando estadísticas', err);
    } finally {
      this.loading = false;
    }
  }

  actualizarZonas() {
    if (!this.stats) return;
    this.zonasConDatos = Object.keys(this.stats)
      .filter(Boolean)
      .filter((z) => z !== 'Desconocido')
      .filter((z) => {
        const op = this.stats?.[z]?.[this.tipoOperacion];
        return op && (op.count ?? 0) > 0;
      })
      .sort((a, b) => a.localeCompare(b));

    // Reset selecciones si ya no son válidas
    if (this.zonaA && !this.zonasConDatos.includes(this.zonaA)) this.zonaA = null;
    if (this.zonaB && !this.zonasConDatos.includes(this.zonaB)) this.zonaB = null;
  }

  getDatosZona(zona: string | null) {
    if (!this.stats || !zona) return {};
    return this.stats[zona]?.[this.tipoOperacion] || {};
  }

  crearDatosChart(campo: keyof any): ChartConfiguration<'bar'>['data'] {
    const datosA: any = this.getDatosZona(this.zonaA);
    const datosB: any = this.getDatosZona(this.zonaB);
    return {
      labels: [this.zonaA || 'Zona A', this.zonaB || 'Zona B'],
      datasets: [
        {
          data: [
            typeof datosA[campo] === 'number' ? datosA[campo] : 0,
            typeof datosB[campo] === 'number' ? datosB[campo] : 0,
          ],
          backgroundColor: ['#1976d2', '#20c997'],
        },
      ],
    };
  }

  toggleDrawer(open: boolean) {
    this.opened = open;
    this.openedChange.emit(this.opened); 
  }
  onClose() {
    this.opened = false;
    this.openedChange.emit(false);
  }
  onOpenedChange(value: boolean) {
    this.opened = value;
    this.openedChange.emit(value); 
  }

}
