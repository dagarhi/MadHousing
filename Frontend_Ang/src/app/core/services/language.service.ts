import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';

export type AppLang = 'es' | 'en';

const STORAGE_KEY = 'mh_lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _lang = new BehaviorSubject<AppLang>(this.detectInitial());
  readonly lang$ = this._lang.asObservable();

  constructor(private readonly transloco: TranslocoService) {
    this.apply(this._lang.value);
  }

  get current(): AppLang {
    return this._lang.value;
  }

  toggle(): void {
    const next: AppLang = this._lang.value === 'es' ? 'en' : 'es';
    this.set(next);
  }

  set(lang: AppLang): void {
    if (lang === this._lang.value) return;
    this._lang.next(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    this.apply(lang);
  }

  private detectInitial(): AppLang {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
    return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
  }

  private apply(lang: AppLang): void {
    this.transloco.setActiveLang(lang);
    document.documentElement.setAttribute('lang', lang);
  }
}
