import {
  AfterViewInit,
  Component,
  Input,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';

// ─────────────────────────────────────────────────────────────────────────────
// ✏️  SLIDES DEL TUTORIAL — edita, añade o elimina entradas aquí libremente.
//    Cada slide necesita:
//      icon  → nombre de cualquier icono Lucide registrado en main.ts
//      title → título corto de la slide
//      desc  → párrafo explicativo (puede contener saltos de línea \n)
// ─────────────────────────────────────────────────────────────────────────────
interface TutorialSlide {
  icon: string;
  title: string;
  desc: string;
}

const SLIDES: TutorialSlide[] = [
  {
    icon: 'house',
    title: 'Bienvenido a MadHousing',
    desc: 'Tu herramienta para explorar el mercado inmobiliario de Madrid. Visualiza pisos, analiza zonas y toma decisiones más informadas.',
  },
  {
    icon: 'search',
    title: 'Busca pisos',
    desc: 'Usa el Buscador en la barra superior para filtrar por precio, tamaño, habitaciones o zona. Los resultados aparecen directamente en el mapa.',
  },
  {
    icon: 'layers',
    title: 'Tres modos de mapa',
    desc: 'Alterna entre el mapa de calor (densidad de pisos), el coroplético (valor medio por zona) y las chinchetas (ubicación exacta de cada piso).',
  },
  {
    icon: 'sparkles',
    title: 'Score de cada piso',
    desc: 'Cada propiedad tiene un score calculado automáticamente. Cuanto más alto, mejor relación calidad-precio según la zona y las características del piso.',
  },
  {
    icon: 'heart',
    title: 'Favoritos e historial',
    desc: 'Guarda los pisos que más te interesan en Favoritos. En Historial puedes recuperar búsquedas anteriores y reaplicar sus filtros al instante.',
  },
  {
    icon: 'bar-chart-3',
    title: 'Estadísticas y comparador',
    desc: 'Consulta estadísticas agregadas de tus resultados y compara pisos lado a lado para encontrar la mejor opción.',
  },
];
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-map-help',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    LucideAngularModule,
  ],
  templateUrl: './map-help.component.html',
  styleUrls: ['./map-help.component.scss'],
})
export class MapHelpComponent implements AfterViewInit {

  @ViewChild('helpDialog') helpDialogTpl!: TemplateRef<any>;

  @Input() userKey?: string;

  showInfoButton = false;
  slideIndex = 0;
  fading = false;
  readonly slides = SLIDES;

  constructor(private dialog: MatDialog) {}

  private get storageKey(): string {
    return this.userKey ? `mapHelpSeen:${this.userKey}` : 'mapHelpSeen';
  }

  get current(): TutorialSlide {
    return this.slides[this.slideIndex];
  }

  get isFirst(): boolean { return this.slideIndex === 0; }
  get isLast(): boolean  { return this.slideIndex === this.slides.length - 1; }

  ngAfterViewInit(): void {
    const alreadySeen = localStorage.getItem(this.storageKey) === 'true';
    if (!alreadySeen) {
      this.openDialog();
    } else {
      this.showInfoButton = true;
    }
  }

  openDialog(): void {
    this.slideIndex = 0;
    const ref = this.dialog.open(this.helpDialogTpl, {
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'help-dialog-panel',
      backdropClass: 'help-dialog-backdrop',
    });

    ref.afterClosed().subscribe(() => {
      localStorage.setItem(this.storageKey, 'true');
      this.showInfoButton = true;
    });
  }

  goTo(index: number): void {
    if (index === this.slideIndex || this.fading) return;
    this.fading = true;
    setTimeout(() => {
      this.slideIndex = index;
      this.fading = false;
    }, 140);
  }

  prev(): void { if (!this.isFirst) this.goTo(this.slideIndex - 1); }
  next(): void { if (!this.isLast)  this.goTo(this.slideIndex + 1); }
}
