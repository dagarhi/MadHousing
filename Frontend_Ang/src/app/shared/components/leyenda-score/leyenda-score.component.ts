import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-leyenda-score',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leyenda-score.component.html',
  styleUrls: ['./leyenda-score.component.scss'],
})
export class LeyendaScoreComponent {
  /** Si el mapa está en modo oscuro */
  @Input() isDark = false;

  /** Si se muestra como minimizada o desplegada */
  expanded = false;

  toggle() {
    this.expanded = !this.expanded;
  }

  get gradientStyle() {
    return {
      background: 'linear-gradient(to right, #e74c3c, #f39c12, #f1c40f, #2ecc71, #27ae60)',
    };
  }
}
