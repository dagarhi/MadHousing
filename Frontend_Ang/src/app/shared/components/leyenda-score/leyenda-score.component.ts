import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { PALETTE_RDYLGN } from '../../../core/styles/score-colors';

@Component({
  selector: 'app-leyenda-score',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './leyenda-score.component.html',
  styleUrls: ['./leyenda-score.component.scss'],
})
export class LeyendaScoreComponent {
  expanded = false;
  palette= PALETTE_RDYLGN;

  toggle() {
    this.expanded = !this.expanded;
  }

  get gradientStyle() {
    const stops = this.palette
      .map(stop => `${stop.color} ${stop.at * 100}%`)
      .join(', ');

    return {
      background: `linear-gradient(to right, ${stops})`,
    };
  }
}
