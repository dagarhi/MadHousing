import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private renderer: Renderer2;
  private isDarkSubject = new BehaviorSubject<boolean>(false);
  isDark$ = this.isDarkSubject.asObservable();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') this.setDark(true);
  }

  toggle() {
    const next = !this.isDarkSubject.value;
    this.setDark(next);
  }

  setDark(value: boolean) {
    this.isDarkSubject.next(value);
    localStorage.setItem('theme', value ? 'dark' : 'light');
    if (value) this.renderer.addClass(document.body, 'dark-theme');
    else this.renderer.removeClass(document.body, 'dark-theme');
  }
}
