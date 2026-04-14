import {
  Component,
  Output,
  EventEmitter,
  Input,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  animate,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { Modo } from '../../../core/services/map-layer-manager.service';

interface LayerOption {
  value: Modo;
  label: string;
}

const LAYERS: LayerOption[] = [
  { value: 'coropletico', label: 'Coroplético' },
  { value: 'heat',        label: 'Heatmap'     },
  { value: 'chinchetas',  label: 'Chinchetas'  },
];

@Component({
  selector: 'app-map-controls',
  standalone: true,
  imports: [CommonModule],
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

  @Output() layerChange = new EventEmitter<Modo>();
  @Output() onClear     = new EventEmitter<void>();
  @Output() onCenter    = new EventEmitter<void>();

  open = false;
  readonly layers = LAYERS;

  constructor(private el: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.el.nativeElement.contains(e.target as Node)) {
      this.open = false;
    }
  }

  toggle(e: MouseEvent): void {
    e.stopPropagation();
    this.open = !this.open;
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
}
