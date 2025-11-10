import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerShellComponent } from '../../../../shared/components/drawer-shell/drawer-shell.component';
import { LucideAngularModule } from 'lucide-angular';
import { BusquedaService } from '../../../../core/services/busqueda.service';
import { ZonasService } from '../../../../core/services/zonas.service';
import { FiltroBusqueda } from '../../../../core/models/filtros.model';
import { Propiedad } from '../../../../core/models/propiedad.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-buscador',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatFormFieldModule,
    DrawerShellComponent, 
    MatInputModule,
    MatIconModule,
    LucideAngularModule],
  templateUrl: './buscador.component.html',
  styleUrls: ['./buscador.component.scss'],
})
export class BuscadorComponent implements OnChanges {
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();
  @Output() resultados = new EventEmitter<{ pisos: Propiedad[]; filtros: FiltroBusqueda }>();

  // Estado
  zonas: Record<string, any> = {};
  ciudad = '';
  distrito = '';
  barrio = '';
  operation: 'sale' | 'rent' = 'rent';
  priceRange = [0, 0];
  sizeRange = [0, 0];
  scoreRange = [0, 100];
  rooms: number | null = null;
  floor: number | null = null;
  loading = false;
  loadingZonas = true;
  noData = false;
  stats: any = null;

  constructor(private busqueda: BusquedaService, private zonasSrv: ZonasService) {}

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['opened'] && this.opened) {
      await this.cargarZonas();
    }
  }

  async cargarZonas() {
    this.loadingZonas = true;
    try {
      this.zonas = await this.zonasSrv.getZonasJerarquicas().toPromise();
    } catch (err) {
      console.error('Error cargando zonas', err);
      this.zonas = {};
    } finally {
      this.loadingZonas = false;
    }
  }

  get ciudadesOptions() {
    return Object.keys(this.zonas || {}).map((c) => c);
  }

  get distritosOptions() {
    return this.ciudad ? Object.keys(this.zonas[this.ciudad] || {}) : [];
  }

  get barriosOptions() {
    return this.ciudad && this.distrito ? this.zonas[this.ciudad][this.distrito] || [] : [];
  }

  resetDependientes() {
    this.distrito = '';
    this.barrio = '';
  }

  async cargarStatsZona() {
    const zonaSeleccionada = this.barrio || this.distrito || this.ciudad;
    if (!zonaSeleccionada) return;

    this.loading = true;
    try {
      const res = await this.busqueda.buscar({ ciudad: zonaSeleccionada, operation: this.operation }).toPromise();
      const s = (res as any)?.stats || {};
      this.stats = s;

      if (s.price && s.size && s.score) {
        this.priceRange = [s.price.min, s.price.max];
        this.sizeRange = [s.size.min, s.size.max];
        this.scoreRange = [s.score.min, s.score.max];
        this.noData = false;
      } else {
        this.noData = true;
      }
    } catch (err) {
      console.error('Error cargando stats:', err);
      this.noData = true;
    } finally {
      this.loading = false;
    }
  }

  async buscarPisos() {
    const zonaSeleccionada = this.barrio || this.distrito || this.ciudad;
    if (!zonaSeleccionada) {
      alert('Selecciona una zona válida');
      return;
    }

    const filtros: FiltroBusqueda = {
      ciudad: zonaSeleccionada,
      operation: this.operation,
      min_price: this.priceRange[0],
      max_price: this.priceRange[1],
      min_size: this.sizeRange[0],
      max_size: this.sizeRange[1],
      min_score: this.scoreRange[0],
      max_score: this.scoreRange[1],
      rooms: this.rooms ?? undefined,
      floor: this.floor ?? undefined,
    };

    try {
      this.loading = true;
      const pisos = await this.busqueda.buscarTodasPaginas(filtros);
      this.resultados.emit({ pisos, filtros });
      console.log('🟢 Emitiendo resultados al mapa:', pisos.length, 'pisos');
      this.opened = false;
      this.openedChange.emit(false);
    } catch (err) {
      const e = err as Error;
      alert('Error al buscar pisos: ' + e.message);
    } finally {
      this.loading = false;
    }
  }

  async mostrarTodos() {
    try {
      this.loading = true;
      const res = await this.busqueda.buscarTodo(this.operation).toPromise();
      const pisos = (res as any)?.propiedades ?? [];
      this.resultados.emit({ pisos, filtros: { operation: this.operation, mostrarTodo: true } });
      this.opened = false;
      this.openedChange.emit(false);
    } catch (err) {
      const e = err as Error;
      alert('Error al cargar todos los datos: ' + e.message);
    } finally {
      this.loading = false;
    }
  }

  onOpenedChange(value: boolean) {
    this.opened = value;
    this.openedChange.emit(value);
  }

  // Normaliza los pares min/max, asegurando límites de stats y orden
  onRangeInput(
    kind: 'price' | 'size' | 'score',
    idx: 0 | 1,
    value: number | string
  ) {
    const num = Number(value ?? 0);
    const bounds = this.stats?.[kind] ?? { min: 0, max: Number.MAX_SAFE_INTEGER };
    const clamp = (v: number) => Math.max(bounds.min, Math.min(bounds.max, v));

    // Trabajamos sobre la referencia correcta
    const target = kind === 'price' ? this.priceRange
                : kind === 'size'  ? this.sizeRange
                :                    this.scoreRange;

    target[idx] = clamp(num);

    // Asegurar orden min ≤ max
    if (target[0] > target[1]) {
      if (idx === 0) target[1] = target[0];
      else target[0] = target[1];
    }
  }

}
