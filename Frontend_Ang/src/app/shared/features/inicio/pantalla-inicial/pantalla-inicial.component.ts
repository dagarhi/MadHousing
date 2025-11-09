import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-pantalla-inicial',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pantalla-inicial.component.html',
  styleUrls: ['./pantalla-inicial.component.scss'],
})
export class PantallaInicialComponent {
  constructor(private router: Router) {}
  irAlMapa() {
    this.router.navigate(['/mapa']);
  }
}
