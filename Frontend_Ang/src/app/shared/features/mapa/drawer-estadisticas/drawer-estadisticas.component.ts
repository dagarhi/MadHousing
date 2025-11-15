import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../../shared/components/drawer-shell/drawer-shell.component';
import { EstadisticasService } from '../../../../core/services/estadisticas.service';
import { EstadisticasGlobales } from '../../../../core/models/estadistica.model';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-drawer-estadisticas',
  standalone: true,
  imports: [CommonModule, DrawerShellComponent, LucideAngularModule, FormsModule, NgChartsModule],
  templateUrl: './drawer-estadisticas.component.html',
  styleUrls: ['./drawer-estadisticas.component.scss'],
})
export class DrawerEstadisticasComponent implements OnChanges {
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  loading = false;
  stats: EstadisticasGlobales | null = null;
  tipoOperacion: 'sale' | 'rent' = 'sale';
  metrica: 'precio_medio' | 'tamano_medio' | 'score_medio' = 'precio_medio';

  chartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#333', maxRotation: 45, minRotation: 45 } },
      y: { ticks: { color: '#333' } },
    },
  };

  constructor(private estadisticas: EstadisticasService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['opened'] && this.opened) {
      this.cargarDatos();
    }
  }

  async cargarDatos() {
    this.loading = true;
    this.stats = null;
    try {
      const data = await this.estadisticas.obtenerGlobales().toPromise();
      this.stats = data as EstadisticasGlobales;
      this.actualizarGrafico();
    } catch (err) {
      console.error('Error cargando estadísticas', err);
    } finally {
      this.loading = false;
    }
  }

  actualizarGrafico() {
    if (!this.stats) return;

    const datos = this.estadisticas.obtenerDatosPorOperacion(
      this.stats,
      this.tipoOperacion,
      this.metrica
    );

    this.chartData = {
      labels: datos.map((d) => d.zona),
      datasets: [
        {
          data: datos.map((d) => d.valor),
          backgroundColor: this.tipoOperacion === 'sale' ? '#1976d2' : '#20c997',
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
