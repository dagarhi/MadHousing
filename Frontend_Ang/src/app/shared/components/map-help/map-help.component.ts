import {
  AfterViewInit,
  Component,
  Input,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule } from '@jsverse/transloco';

// ─────────────────────────────────────────────────────────────────────────────
// SLIDES DEL TUTORIAL — define icono + claves i18n. El texto vive en
// `assets/i18n/{es,en}.json` bajo `TUTORIAL.SLIDES.*`. Para añadir/quitar slides,
// edita esta lista Y los JSON correspondientes.
// ─────────────────────────────────────────────────────────────────────────────
interface TutorialSlide {
  icon: string;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: TutorialSlide[] = [
  { icon: 'house',        titleKey: 'TUTORIAL.SLIDES.WELCOME.TITLE',        bodyKey: 'TUTORIAL.SLIDES.WELCOME.BODY' },
  { icon: 'search',       titleKey: 'TUTORIAL.SLIDES.SEARCH.TITLE',         bodyKey: 'TUTORIAL.SLIDES.SEARCH.BODY' },
  { icon: 'layers',       titleKey: 'TUTORIAL.SLIDES.MAP_MODES.TITLE',      bodyKey: 'TUTORIAL.SLIDES.MAP_MODES.BODY' },
  { icon: 'sparkles',     titleKey: 'TUTORIAL.SLIDES.SCORE.TITLE',          bodyKey: 'TUTORIAL.SLIDES.SCORE.BODY' },
  { icon: 'map-pin',      titleKey: 'TUTORIAL.SLIDES.ENVIRONMENT.TITLE',    bodyKey: 'TUTORIAL.SLIDES.ENVIRONMENT.BODY' },
  { icon: 'route',        titleKey: 'TUTORIAL.SLIDES.SPATIAL_TOOLS.TITLE',  bodyKey: 'TUTORIAL.SLIDES.SPATIAL_TOOLS.BODY' },
  { icon: 'heart',        titleKey: 'TUTORIAL.SLIDES.FAVS_HISTORY.TITLE',   bodyKey: 'TUTORIAL.SLIDES.FAVS_HISTORY.BODY' },
  { icon: 'bar-chart-3',  titleKey: 'TUTORIAL.SLIDES.STATS_COMP.TITLE',     bodyKey: 'TUTORIAL.SLIDES.STATS_COMP.BODY' },
  { icon: 'calculator',   titleKey: 'TUTORIAL.SLIDES.MORTGAGE.TITLE',       bodyKey: 'TUTORIAL.SLIDES.MORTGAGE.BODY' },
  { icon: 'languages',    titleKey: 'TUTORIAL.SLIDES.PREFERENCES.TITLE',    bodyKey: 'TUTORIAL.SLIDES.PREFERENCES.BODY' },
];

@Component({
  selector: 'app-map-help',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    LucideAngularModule,
    TranslocoModule,
  ],
  templateUrl: './map-help.component.html',
  styleUrls: ['./map-help.component.scss'],
})
export class MapHelpComponent implements AfterViewInit {

  @ViewChild('helpDialog') helpDialogTpl!: TemplateRef<any>;

  @Input() userKey?: string;

  showInfoButton = false;
  slideIndex = 0;
  readonly slides = SLIDES;

  constructor(private dialog: MatDialog) {}

  private get storageKey(): string {
    return this.userKey ? `mapHelpSeen:${this.userKey}` : 'mapHelpSeen';
  }

  get current(): TutorialSlide {
    return this.slides[this.slideIndex];
  }

  get isFirst(): boolean { return this.slideIndex === 0; }
  get isLast(): boolean  { return this.slideIndex === this.slides.length - 1; }

  ngAfterViewInit(): void {
    const alreadySeen = localStorage.getItem(this.storageKey) === 'true';
    if (!alreadySeen) {
      this.openDialog();
    } else {
      this.showInfoButton = true;
    }
  }

  openDialog(): void {
    this.slideIndex = 0;
    const ref = this.dialog.open(this.helpDialogTpl, {
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'help-dialog-panel',
      backdropClass: 'help-dialog-backdrop',
    });

    ref.afterClosed().subscribe(() => {
      localStorage.setItem(this.storageKey, 'true');
      this.showInfoButton = true;
    });
  }

  goTo(index: number): void {
    if (index === this.slideIndex) return;
    if (index < 0 || index >= this.slides.length) return;
    this.slideIndex = index;
  }

  prev(): void { if (!this.isFirst) this.goTo(this.slideIndex - 1); }
  next(): void { if (!this.isLast)  this.goTo(this.slideIndex + 1); }
}
