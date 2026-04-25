import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LanguageService } from './core/services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent {
  // Inyectamos LanguageService para que se construya al arrancar la app:
  // su constructor lee localStorage y propaga el idioma a Transloco antes de
  // que cualquier componente con `transloco` empiece a renderizar.
  constructor(private readonly _lang: LanguageService) {}
}
