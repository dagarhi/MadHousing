import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _dark = new BehaviorSubject<boolean>(
    localStorage.getItem('mh_theme') === 'dark'
  );

  readonly dark$ = this._dark.asObservable();

  get isDark(): boolean { return this._dark.value; }

  constructor() {
    this.apply(this._dark.value);
  }

  toggle(): void {
    const next = !this._dark.value;
    this._dark.next(next);
    localStorage.setItem('mh_theme', next ? 'dark' : 'light');
    this.apply(next);
  }

  private apply(dark: boolean): void {
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else       document.documentElement.removeAttribute('data-theme');
  }
}
