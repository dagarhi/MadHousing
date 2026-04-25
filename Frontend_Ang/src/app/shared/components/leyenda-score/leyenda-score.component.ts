import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule } from '@jsverse/transloco';
import { PALETTE_RDYLGN } from '../../../core/styles/score-colors';

@Component({
  selector: 'app-leyenda-score',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TranslocoModule],
  templateUrl: './leyenda-score.component.html',
  styleUrls: ['./leyenda-score.component.scss'],
})
export class LeyendaScoreComponent {
  expanded   = false;
  openUpward = true;  // por defecto sube (posición BL original)
  alignRight = false;
  palette    = PALETTE_RDYLGN;

  constructor(private el: ElementRef<HTMLElement>) {}

  toggle(): void {
    this.expanded = !this.expanded;
    if (this.expanded) this.calcDirection();
  }

  @HostListener('transitionend', ['$event'])
  onSnap(e: TransitionEvent): void {
    if (e.propertyName === 'left' && this.expanded) this.calcDirection();
  }

  private calcDirection(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.openUpward = (window.innerHeight - rect.bottom) < 200;
    this.alignRight = (window.innerWidth  - rect.left)   < 280;
  }

  get gradientStyle() {
    const stops = this.palette
      .map(stop => `${stop.color} ${stop.at * 100}%`)
      .join(', ');
    return { background: `linear-gradient(to right, ${stops})` };
  }
}
