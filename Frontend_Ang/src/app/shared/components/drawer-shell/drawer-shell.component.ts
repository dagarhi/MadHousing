import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostBinding,
  Renderer2,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-drawer-shell',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './drawer-shell.component.html',
  styleUrls: ['./drawer-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerShellComponent implements OnChanges {
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  @Input() title: string | null = null;
  @Input() position: 'left' | 'right' = 'right';
  @Input() width = '420px';
  @Input() zIndex = 5000;
  @Input() loading = false;
  @Input() showClose = true;
  @Input() disableBackdropClose = false;

  @HostBinding('class.open') get isOpen() { return this.opened; }

  constructor(private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['opened']) {
      if (this.opened) {
        this.renderer.addClass(document.body, 'drawer-open');
      } else {
        this.renderer.removeClass(document.body, 'drawer-open');
      }
    }
  }

  /** Cierre programático reutilizable */
  private closeInternal() {
    if (!this.opened) return;
    this.opened = false;
    this.openedChange.emit(false); // 🔴 CLAVE
  }

  onCloseClick(event: MouseEvent) {
    event.stopPropagation();
    this.closeInternal();
  }

  onBackdropClick() {
    if (!this.disableBackdropClose) this.closeInternal();
  }

  /** Cerrar con ESC */
  @HostListener('document:keydown.escape')
  onEsc() {
    this.closeInternal();
  }
}
