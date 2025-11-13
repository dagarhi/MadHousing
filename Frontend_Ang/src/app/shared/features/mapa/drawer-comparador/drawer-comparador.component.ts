import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { DrawerShellComponent } from '../../../components/drawer-shell/drawer-shell.component'; 
import { LucideAngularModule } from 'lucide-angular';

import { EstadisticasGlobales, EstadisticaZona } from '../../../../core/models/estadistica.model';
import { EstadisticasService } from '../../../../core/services/estadisticas.service'; 
import { firstValueFrom } from 'rxjs';

import {
  Chart,
  ChartConfiguration,
  ChartType,
  registerables,
} from 'chart.js';

// registrar componentes de Chart.js
Chart.register(...registerables);

type ChartDataSimple = ChartConfiguration['data'];

@Component({
  selector: 'app-drawer-comparador',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DrawerShellComponent,
    LucideAngularModule,
  ],
  templateUrl: './drawer-comparador.component.html',
  styleUrls: ['./drawer-comparador.component.scss'],
})
export class DrawerComparadorComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  @Input() tipoOperacion: 'sale' | 'rent' = 'sale';

  loading = false;
  stats: EstadisticasGlobales | null = null;

  zonaA: string | null = null;
  zonaB: string | null = null;
  zonasConDatos: string[] = [];

  // canvases
  @ViewChild('precioCanvas') precioCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('tamanoCanvas') tamanoCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('scoreCanvas') scoreCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('countCanvas') countCanvas?: ElementRef<HTMLCanvasElement>;

  // instancias Chart.js
  private precioChart?: Chart;
  private tamanoChart?: Chart;
  private scoreChart?: Chart;
  private countChart?: Chart;

  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  } as ChartConfiguration['options'];

  // datos preparados (como antes)
  chartData: {
    precio_medio: ChartDataSimple;
    tamano_medio: ChartDataSimple;
    score_medio: ChartDataSimple;
    count: ChartDataSimple;
  } = {
    precio_medio: { labels: [], datasets: [] },
    tamano_medio: { labels: [], datasets: [] },
    score_medio: { labels: [], datasets: [] },
    count: { labels: [], datasets: [] },
  };

  constructor(private estadisticas: EstadisticasService) {}

  // ───────────────────── ciclos de vida ─────────────────────

  ngAfterViewInit() {
    // cuando ya existen los canvas, podemos pintar si ya teníamos datos
    this.updateAllCharts();
  }

  ngOnDestroy() {
    this.destroyChart(this.precioChart);
    this.destroyChart(this.tamanoChart);
    this.destroyChart(this.scoreChart);
    this.destroyChart(this.countChart);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['opened']?.currentValue === true) {
      if (!this.stats) {
        this.cargarDatos();
      } else {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      }
    }

    if (changes['tipoOperacion'] && this.stats) {
      this.actualizarZonas();
      this.rebuildCharts();
    }
  }

  // ───────────────────── helpers de datos ─────────────────────

  private opKey(): 'sale' | 'rent' {
    return this.tipoOperacion === 'rent' ? 'rent' : 'sale';
  }

  private getDatosBrutos(zona: string | null): EstadisticaZona | {} {
    if (!zona || !this.stats) return {};
    const op = this.opKey();
    return (this.stats[zona]?.[op] ?? {}) as EstadisticaZona | {};
  }

  getDatosZona(zona: string | null) {
    const datos: any = this.getDatosBrutos(zona);

    const n = (campo: keyof EstadisticaZona): number | null =>
      typeof datos?.[campo] === 'number' ? (datos[campo] as number) : null;

    return {
      precio_medio: n('precio_medio'),
      tamano_medio: n('tamano_medio'),
      score_medio: n('score_medio'),
      count: n('count'),
    };
  }

  // ───────────────────── carga API ─────────────────────

  async cargarDatos() {
    this.loading = true;
    try {
      const data = await firstValueFrom(this.estadisticas.obtenerGlobales());
      this.stats = data as EstadisticasGlobales;
      this.actualizarZonas();
      this.rebuildCharts();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    } catch (err) {
      console.error('Error cargando estadísticas', err);
    } finally {
      this.loading = false;
    }
  }

  actualizarZonas() {
    if (!this.stats) return;
    const op = this.opKey();

    this.zonasConDatos = Object.keys(this.stats)
      .filter((z) => !!z && z !== 'Desconocido')
      .filter((z) => {
        const bucket = this.stats![z]?.[op];
        const count = bucket?.count ?? 0;
        return count > 0;
      })
      .sort((a, b) => a.localeCompare(b, 'es'));

    if (this.zonaA && !this.zonasConDatos.includes(this.zonaA)) this.zonaA = null;
    if (this.zonaB && !this.zonasConDatos.includes(this.zonaB)) this.zonaB = null;
  }

  onOperacionChange() {
    this.actualizarZonas();
    this.rebuildCharts();
  }

  // ───────────────────── charts con Chart.js puro ─────────────────────

  rebuildCharts() {
    if (!this.stats || !this.zonaA || !this.zonaB) {
      const empty: ChartDataSimple = { labels: [], datasets: [] };
      this.chartData.precio_medio = empty;
      this.chartData.tamano_medio = empty;
      this.chartData.score_medio = empty;
      this.chartData.count = empty;
      this.updateAllCharts();
      return;
    }

    const op = this.opKey();
    const datosA: any = this.stats[this.zonaA]?.[op] ?? {};
    const datosB: any = this.stats[this.zonaB]?.[op] ?? {};

    const val = (datos: any, campo: keyof EstadisticaZona): number =>
      typeof datos?.[campo] === 'number' ? (datos[campo] as number) : 0;

    const labels = [this.zonaA, this.zonaB];

    this.chartData.precio_medio = {
      labels,
      datasets: [
        {
          label: '€',
          data: [
            val(datosA, 'precio_medio'),
            val(datosB, 'precio_medio'),
          ],
          backgroundColor: ['#1976d2', '#20c997'],
        },
      ],
    };

    this.chartData.tamano_medio = {
      labels,
      datasets: [
        {
          label: 'm²',
          data: [
            val(datosA, 'tamano_medio'),
            val(datosB, 'tamano_medio'),
          ],
          backgroundColor: ['#1976d2', '#20c997'],
        },
      ],
    };

    this.chartData.score_medio = {
      labels,
      datasets: [
        {
          label: 'Score',
          data: [
            val(datosA, 'score_medio'),
            val(datosB, 'score_medio'),
          ],
          backgroundColor: ['#1976d2', '#20c997'],
        },
      ],
    };

    this.chartData.count = {
      labels,
      datasets: [
        {
          label: 'Nº pisos',
          data: [val(datosA, 'count'), val(datosB, 'count')],
          backgroundColor: ['#1976d2', '#20c997'],
        },
      ],
    };

    console.log('Comparador charts', {
      op,
      zonaA: this.zonaA,
      zonaB: this.zonaB,
      datosA,
      datosB,
      chartPrecio: this.chartData.precio_medio,
    });

    this.updateAllCharts();
  }

  private updateAllCharts() {
    // puede llamarse antes de que existan los canvas, por eso las ?.
    this.precioChart = this.createOrUpdateChart(
      this.precioCanvas,
      this.precioChart,
      this.chartData.precio_medio,
      'bar'
    );
    this.tamanoChart = this.createOrUpdateChart(
      this.tamanoCanvas,
      this.tamanoChart,
      this.chartData.tamano_medio,
      'bar'
    );
    this.scoreChart = this.createOrUpdateChart(
      this.scoreCanvas,
      this.scoreChart,
      this.chartData.score_medio,
      'bar'
    );
    this.countChart = this.createOrUpdateChart(
      this.countCanvas,
      this.countChart,
      this.chartData.count,
      'bar'
    );
  }

  private createOrUpdateChart(
    canvasRef: ElementRef<HTMLCanvasElement> | undefined,
    current: Chart | undefined,
    data: ChartDataSimple,
    type: ChartType
  ): Chart | undefined {
    if (!canvasRef) return current;
    const ctx = canvasRef.nativeElement.getContext('2d');
    if (!ctx) return current;

    if (!data || !data.datasets || data.datasets.length === 0) {
      if (current) {
        current.destroy();
      }
      return undefined;
    }

    const options = this.chartOptions ?? {}; // 🔹 aquí forzamos a que nunca sea undefined

    if (!current) {
      return new Chart(ctx, {
        type,
        data,
        options,
      });
    }

    current.data = data;
    current.options = options;
    current.update();
    return current;
  }
  private destroyChart(chart?: Chart) {
    if (chart) {
      chart.destroy();
    }
  }

  // ───────────────────── drawer shell ─────────────────────

  onOpenedChange(value: boolean) {
    this.opened = value;
    this.openedChange.emit(value);
    if (value) {
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    }
  }

  onZonaChange() {
    // Si aún falta una zona o no hay datos, no hacemos nada
    if (!this.zonaA || !this.zonaB || !this.stats) return;

    // Esperamos al siguiente "tick" para que Angular meta los <canvas> en el DOM
    setTimeout(() => {
      this.rebuildCharts();
    }, 0);
  }
  }
