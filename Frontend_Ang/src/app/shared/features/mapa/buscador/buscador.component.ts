import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerShellComponent } from '../../../../shared/components/drawer-shell/drawer-shell.component';
import { LucideAngularModule } from 'lucide-angular';

import { BusquedaService } from '../../../../core/services/busqueda.service';
import { ZonasService } from '../../../../core/services/zonas.service';
import { HistorialService } from '../../../../core/services/historial.service';

import { FiltroBusqueda } from '../../../../core/models/filtros.model';
import { Propiedad } from '../../../../core/models/propiedad.model';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

type Rango = [number, number];

@Component({
  selector: 'app-buscador',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DrawerShellComponent,
    LucideAngularModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './buscador.component.html',
  styleUrls: ['./buscador.component.scss']
})
export class BuscadorComponent implements OnChanges {
  // Drawer API
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  // Emite resultados al mapa
  @Output() resultados = new EventEmitter<{ pisos: Propiedad[]; filtros: FiltroBusqueda }>();

  // --- Zonas jerárquicas (forma original: ciudad -> distrito -> [barrios])
  zonas: Record<string, any> = {};
  get ciudadesOptions() {
    return Object.keys(this.zonas || {});
  }
  get distritosOptions() {
    return this.ciudad ? Object.keys(this.zonas[this.ciudad] || {}) : [];
  }
  get barriosOptions() {
    return this.ciudad && this.distrito ? (this.zonas[this.ciudad]?.[this.distrito] || []) : [];
  }

  // Selecciones actuales
  ciudad = '';
  distrito = '';
  barrio = '';
  operation: 'rent' | 'sale' = 'rent';

  // Rangos
  priceRange: Rango = [0, 0];
  sizeRange: Rango  = [0, 0];
  scoreRange: Rango = [0, 100];

  // Filtros extra
  rooms: number | null = null;
  floor: number | null = null;

  // Estado
  loading = false;
  loadingZonas = true;
  noData = false;

  // Stats para acotar rangos
  private readonly DEFAULT_STATS = {
    price: { min: 0, max: 1_000_000 },
    size:  { min: 0, max: 500 },
    score: { min: 0, max: 100 },
  };
  stats = { ...this.DEFAULT_STATS };

  constructor(
    private readonly busqueda: BusquedaService,
    private readonly zonasSrv: ZonasService,
    private readonly historialSrv: HistorialService,
  ) {}

  // 🧩 Clave: cuando se abre el drawer, cargamos zonas (comportamiento original)
  async ngOnChanges(changes: SimpleChanges) {
    if (changes['opened']?.currentValue === true) {
      await this.cargarZonas();
    }
  }

  // ====== API pública para el Drawer de Historial ======
  async aplicarFiltros(f: FiltroBusqueda, autoBuscar = true) {
    this.ciudad   = (f as any).ciudad ?? '';
    this.distrito = (f as any).distrito ?? '';
    this.barrio   = (f as any).barrio ?? '';
    this.operation = (f as any).operation ?? 'rent';

    this.priceRange = [
      (f as any).min_price ?? this.priceRange[0],
      (f as any).max_price ?? this.priceRange[1],
    ] as Rango;
    this.sizeRange = [
      (f as any).min_size ?? this.sizeRange[0],
      (f as any).max_size ?? this.sizeRange[1],
    ] as Rango;
    this.scoreRange = [
      (f as any).min_score ?? this.scoreRange[0],
      (f as any).max_score ?? this.scoreRange[1],
    ] as Rango;

    this.rooms = (f as any).rooms ?? this.rooms;
    this.floor = (f as any).floor ?? this.floor;

    await this.cargarStatsZona();

    if (autoBuscar) 
      await this.buscarPisos();
  }

  // ====== Zonas / Stats ======
  async cargarZonas() {
    this.loadingZonas = true;
    try {
      // Devuelve la jerarquía ciudad -> distrito -> [barrios]
      this.zonas = await this.zonasSrv.getZonasJerarquicas().toPromise();
    } catch (err) {
      console.error('Error cargando zonas', err);
      this.zonas = {};
    } finally {
      this.loadingZonas = false;
    }
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
      // Pides stats con tu endpoint actual y reajustas rangos
      const res = await this.busqueda.buscar({ ciudad: zonaSeleccionada, operation: this.operation }).toPromise();
      const s = (res as any)?.stats || {};
      this.stats = s;

      if (s.price && s.size && s.score) {
        this.priceRange = [s.price.min, s.price.max];
        this.sizeRange  = [s.size.min,  s.size.max];
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

  // ====== Rango inputs ======
  onRangeInput(kind: 'price' | 'size' | 'score', idx: 0 | 1, raw: any) {
    const bounds = (this.stats as any)?.[kind] ?? { min: 0, max: Number.MAX_SAFE_INTEGER };
    const clamp = (v: number) => Math.max(bounds.min, Math.min(bounds.max, v));
    const num = Number(raw ?? 0);

    const target = kind === 'price' ? this.priceRange
                : kind === 'size'  ? this.sizeRange
                :                    this.scoreRange;

    target[idx] = clamp(num);
    if (target[0] > target[1]) {
      if (idx === 0) target[1] = target[0]; else target[0] = target[1];
    }
  }

  // ====== Búsqueda ======
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
    } as unknown as FiltroBusqueda;

    try {
      this.loading = true;
      const pisos = await this.busqueda.buscarTodasPaginas(filtros);
      this.resultados.emit({ pisos, filtros });

      // ✅ Guardar historial por sesión
      this.historialSrv.add(filtros);

      this.onOpenedChange(false);
    } catch (err) {
      const e = err as Error;
      alert('Error al buscar pisos: ' + e.message);
    } finally {
      this.loading = false;
    }
  }
  limpiarFiltros() {

    this.ciudad = '';
    this.distrito = '';
    this.barrio = '';


    this.operation = 'rent';
    this.stats = { ...this.DEFAULT_STATS };

    this.priceRange = [this.stats.price.min, this.stats.price.max];
    this.sizeRange  = [this.stats.size.min,  this.stats.size.max];
    this.scoreRange = [this.stats.score.min, this.stats.score.max];

    // Filtros avanzados
    this.rooms = null;
    this.floor = null;

    // Estado
    this.noData = false;
  }


  onOpenedChange(v: boolean) {
    this.opened = v;
    this.openedChange.emit(v);
  }
}
