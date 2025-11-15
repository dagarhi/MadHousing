import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private renderer: Renderer2;
  private isDarkSubject = new BehaviorSubject<boolean>(false);
  isDark$ = this.isDarkSubject.asObservable();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    const stored = (typeof window !== 'undefined') ? localStorage.getItem('theme') : null;
    this.setDark(stored === 'dark');
  }

  toggle(): void { this.setDark(!this.isDarkSubject.value); }

  setDark(value: boolean): void {
    this.isDarkSubject.next(value);
    if (typeof window !== 'undefined') localStorage.setItem('theme', value ? 'dark' : 'light');

    // body class (compat) + atributo en html (scope de variables)
    if (value) this.renderer.addClass(document.body, 'dark-theme');
    else this.renderer.removeClass(document.body, 'dark-theme');
    this.renderer.setAttribute(document.documentElement, 'data-theme', value ? 'dark' : 'light');
    this.renderer.setStyle(document.documentElement, 'color-scheme', value ? 'dark' : 'light');

    // MUY IMPORTANTE: overlays de Angular Material/CDK
    const overlay = document.querySelector('.cdk-overlay-container') as HTMLElement | null;
    if (overlay) {
      if (value) overlay.classList.add('dark-theme'); else overlay.classList.remove('dark-theme');
      overlay.setAttribute('data-theme', value ? 'dark' : 'light');
    }
  }
}
