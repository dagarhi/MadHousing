import {
  Component,
  Output,
  EventEmitter,
  Input,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule } from '@jsverse/transloco';
import {
  animate,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { Modo } from '../../../core/services/map-layer-manager.service';

export type PoiKey = 'transport' | 'health' | 'education' | 'park' | 'commerce' | 'bike';

interface PoiOption {
  key: PoiKey;
  labelKey: string;
  icon: string;
}

interface LayerOption {
  value: Modo;
  labelKey: string;
}

const LAYERS: LayerOption[] = [
  { value: 'coropletico', labelKey: 'MAP_CONTROLS.LAYER_CHORO' },
  { value: 'heat',        labelKey: 'MAP_CONTROLS.LAYER_HEAT'  },
  { value: 'marcadores',  labelKey: 'MAP_CONTROLS.LAYER_PINS'  },
];

const POIS: PoiOption[] = [
  { key: 'transport', labelKey: 'DRAWER_ENTORNO.CATEGORIES.TRANSPORT', icon: 'train-front' },
  { key: 'health',    labelKey: 'DRAWER_ENTORNO.CATEGORIES.HEALTH',    icon: 'cross' },
  { key: 'education', labelKey: 'DRAWER_ENTORNO.CATEGORIES.EDUCATION', icon: 'graduation-cap' },
  { key: 'park',      labelKey: 'DRAWER_ENTORNO.CATEGORIES.PARK',      icon: 'trees' },
  { key: 'commerce',  labelKey: 'DRAWER_ENTORNO.CATEGORIES.COMMERCE',  icon: 'shopping-cart' },
  { key: 'bike',      labelKey: 'DRAWER_ENTORNO.CATEGORIES.BIKE',      icon: 'bike' },
];

@Component({
  selector: 'app-map-controls',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TranslocoModule],
  templateUrl: './map-controls.component.html',
  styleUrls: ['./map-controls.component.scss'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ height: '0', opacity: 0, overflow: 'hidden' }),
        animate('180ms ease', style({ height: '*', opacity: 1, overflow: 'hidden' })),
      ]),
      transition(':leave', [
        style({ overflow: 'hidden' }),
        animate('140ms ease', style({ height: '0', opacity: 0 })),
      ]),
    ]),
  ],
})
export class MapControlsComponent {
  @Input() activeLayer: Modo = 'heat';

  @Input() radiusActive: boolean = false;
  @Input() isochroneOpen: boolean = false;
  @Input() routeActive: boolean = false;

  @Input() poisActive: Record<PoiKey, boolean> = {
    transport: false,
    health:    false,
    education: false,
    park:      false,
    commerce:  false,
    bike:      false,
  };

  @Output() layerChange        = new EventEmitter<Modo>();
  @Output() onClear            = new EventEmitter<void>();
  @Output() onCenter           = new EventEmitter<void>();
  @Output() onRadiusToggle     = new EventEmitter<void>();
  @Output() onIsochroneToggle  = new EventEmitter<void>();
  @Output() onRouteToggle      = new EventEmitter<void>();
  @Output() poiToggle          = new EventEmitter<PoiKey>();

  open       = false;
  openUpward = false;
  alignRight = false;
  readonly layers = LAYERS;
  readonly pois   = POIS;

  constructor(private el: ElementRef<HTMLElement>) {}

  toggle(e: MouseEvent): void {
    e.stopPropagation();
    this.open = !this.open;
    if (this.open) this.calcDirection();
  }

  @HostListener('transitionend', ['$event'])
  onSnap(e: TransitionEvent): void {
    if (e.propertyName === 'left' && this.open) this.calcDirection();
  }

  private calcDirection(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.openUpward = (window.innerHeight - rect.bottom) < 180;
    this.alignRight = (window.innerWidth  - rect.left)   < 170;
  }

  selectLayer(layer: Modo, e: MouseEvent): void {
    e.stopPropagation();
    this.activeLayer = layer;
    this.layerChange.emit(layer);
  }

  clear(e: MouseEvent): void {
    e.stopPropagation();
    this.onClear.emit();
    this.open = false;
  }

  center(e: MouseEvent): void {
    e.stopPropagation();
    this.onCenter.emit();
  }

  toggleRadius(e: MouseEvent): void {
    e.stopPropagation();
    this.onRadiusToggle.emit();
    this.open = false;
  }

  toggleIsochrone(e: MouseEvent): void {
    e.stopPropagation();
    this.onIsochroneToggle.emit();
    this.open = false;
  }

  toggleRoute(e: MouseEvent): void {
    e.stopPropagation();
    this.onRouteToggle.emit();
    this.open = false;
  }

  togglePoi(key: PoiKey, e: MouseEvent): void {
    e.stopPropagation();
    this.poiToggle.emit(key);
  }
}
