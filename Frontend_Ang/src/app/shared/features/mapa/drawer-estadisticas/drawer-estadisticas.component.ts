import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../../shared/components/drawer-shell/drawer-shell.component';
import { EstadisticasService } from '../../../../core/services/estadisticas.service';
import { EstadisticasGlobales } from '../../../../core/models/estadistica.model';
import { ThemeService } from '../../../../core/services/theme.service';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ChartConfiguration } from 'chart.js';
import { firstValueFrom, Subscription } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { notifyError } from '../../../../core/utils/notify-error';

// Paleta de marca para los datasets (aceptos magenta/violeta)
const BRAND_SALE = '#c000a5';
const BRAND_RENT = '#7c3aed';

@Component({
  selector: 'app-drawer-estadisticas',
  standalone: true,
  imports: [CommonModule, DrawerShellComponent, LucideAngularModule, FormsModule, NgChartsModule, TranslocoModule],
  templateUrl: './drawer-estadisticas.component.html',
  styleUrls: ['./drawer-estadisticas.component.scss'],
})
export class DrawerEstadisticasComponent implements OnChanges, OnInit, OnDestroy {
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  loading = false;
  stats: EstadisticasGlobales | null = null;
  tipoOperacion: 'sale' | 'rent' = 'sale';
  metrica: 'precio_medio' | 'tamano_medio' | 'score_medio' = 'precio_medio';

  chartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'bar'>['options'] = this.buildChartOptions(false);

  private themeSub?: Subscription;

  constructor(
    private estadisticas: EstadisticasService,
    private theme: ThemeService,
    private snack: MatSnackBar,
    private transloco: TranslocoService,
  ) {}

  ngOnInit() {
    this.themeSub = this.theme.dark$.subscribe((dark) => {
      this.chartOptions = this.buildChartOptions(dark);
      // Forzar nueva referencia para que ng2-charts detecte el cambio
      this.chartData = { ...this.chartData };
    });
  }

  ngOnDestroy() {
    this.themeSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['opened'] && this.opened) {
      this.cargarDatos();
    }
  }

  async cargarDatos() {
    this.loading = true;
    this.stats = null;
    try {
      const data = await firstValueFrom(this.estadisticas.obtenerGlobales());
      this.stats = data;
      this.actualizarGrafico();
    } catch (err) {
      console.error('Error cargando estadísticas', err);
      notifyError(this.snack, this.transloco, err, 'DRAWER_ESTADISTICAS.ERRORS.LOAD');
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
          backgroundColor: this.tipoOperacion === 'sale' ? BRAND_SALE : BRAND_RENT,
          borderRadius: 6,
        },
      ],
    };
  }

  private buildChartOptions(dark: boolean): ChartConfiguration<'bar'>['options'] {
    const tickColor = dark ? '#e5e7eb' : '#1f2937';
    const gridColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const tooltipBg = dark ? '#1e1e2e' : '#ffffff';
    const tooltipText = dark ? '#e5e7eb' : '#111827';
    const tooltipBorder = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          ticks: { color: tickColor, maxRotation: 45, minRotation: 45 },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: tickColor },
          grid: { color: gridColor },
        },
      },
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
