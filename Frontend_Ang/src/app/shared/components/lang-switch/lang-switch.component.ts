import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService } from '../../../core/services/language.service';

export type LangSwitchVariant = 'header-dark' | 'header-light' | 'floating';

/**
 * Toggle button between Spanish (ES) and English (EN). Lives in the header
 * of every top-level view (login, mapa, admin) for consistency.
 *
 * Variantes:
 *  - 'header-dark'  → cabecera magenta del mapa (texto blanco sobre semitransparente)
 *  - 'header-light' → cabecera clara del admin (pastilla con borde y primary)
 *  - 'floating'     → píldora absoluta superpuesta a un fondo (login)
 */
@Component({
  selector: 'app-lang-switch',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="lang-switch"
      [class.lang-switch--dark]="variant === 'header-dark'"
      [class.lang-switch--light]="variant === 'header-light'"
      [class.lang-switch--floating]="variant === 'floating'"
      (click)="toggle()"
      [attr.aria-label]="lang.current === 'es' ? 'Switch to English' : 'Cambiar a español'"
      [title]="lang.current === 'es' ? 'EN' : 'ES'">
      <span class="lang-switch__current">{{ lang.current === 'es' ? 'ES' : 'EN' }}</span>
    </button>
  `,
  styleUrls: ['./lang-switch.component.scss'],
})
export class LangSwitchComponent {
  @Input() variant: LangSwitchVariant = 'header-dark';

  constructor(public readonly lang: LanguageService) {}

  toggle(): void {
    this.lang.toggle();
  }
}
