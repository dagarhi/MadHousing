import {
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  Renderer2,
} from '@angular/core';
import { ButtonPositionService } from '../../core/services/button-position.service';

const SNAP_TRANSITION = 'top 0.3s cubic-bezier(0.34,1.56,0.64,1), left 0.3s cubic-bezier(0.34,1.56,0.64,1)';
const DRAG_THRESHOLD  = 6;
const OVERLAY_ID      = 'snap-zones-overlay';

@Directive({
  selector: '[appSnapDrag]',
  standalone: true,
})
export class SnapDragDirective implements OnInit, OnDestroy {

  @Input() snapId!: string;
  @Input() defaultZone = 'TL';

  private el: HTMLElement;
  private dragging  = false;
  private moved     = false;
  private startPX   = 0;
  private startPY   = 0;
  private startTop  = 0;
  private startLeft = 0;

  private readonly boundMove   = this.onMove.bind(this);
  private readonly boundUp     = this.onUp.bind(this);
  private readonly boundResize = this.onWindowResize.bind(this);

  constructor(
    elRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private svc: ButtonPositionService,
  ) {
    this.el = elRef.nativeElement;
  }

  ngOnInit(): void {
    this.renderer.setStyle(this.el, 'position',    'fixed');
    this.renderer.setStyle(this.el, 'right',       'auto');
    this.renderer.setStyle(this.el, 'bottom',      'auto');
    this.renderer.setStyle(this.el, 'z-index',     '1500');
    this.renderer.setStyle(this.el, 'transition',  SNAP_TRANSITION);
    this.renderer.setStyle(this.el, 'user-select', 'none');

    // Registrar en el servicio para que otras directivas puedan moverlo
    this.svc.register(this.snapId, { snapToZone: this.snapToZone.bind(this) });

    requestAnimationFrame(() => {
      const savedZone = this.svc.getCurrentZone(this.snapId, this.defaultZone);
      this.snapToZone(savedZone, false);
    });

    this.el.addEventListener('pointerdown', this.onDown.bind(this));
    window.addEventListener('resize', this.boundResize);
  }

  private onWindowResize(): void {
    const zone = this.svc.getCurrentZone(this.snapId, this.defaultZone);
    this.snapToZone(zone, false);
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  private onDown(e: PointerEvent): void {
    this.dragging  = true;
    this.moved     = false;
    this.startPX   = e.clientX;
    this.startPY   = e.clientY;
    const rect     = this.el.getBoundingClientRect();
    this.startTop  = rect.top;
    this.startLeft = rect.left;

    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup',   this.boundUp);
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.startPX;
    const dy = e.clientY - this.startPY;

    if (!this.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      this.moved = true;
      this.renderer.setStyle(this.el, 'transition', 'none');
      this.renderer.setStyle(this.el, 'cursor', 'grabbing');
      this.showOverlay();
    }

    if (!this.moved) return;

    e.preventDefault();
    this.renderer.setStyle(this.el, 'top',  `${this.startTop  + dy}px`);
    this.renderer.setStyle(this.el, 'left', `${this.startLeft + dx}px`);

    const rect      = this.el.getBoundingClientRect();
    const nearestId = this.svc.findNearestZone(
      rect.left + rect.width  / 2,
      rect.top  + rect.height / 2,
      rect.width, rect.height,
    );
    this.highlightZone(nearestId);
  }

  private onUp(e: PointerEvent): void {
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup',   this.boundUp);

    if (!this.dragging) return;
    this.dragging = false;

    this.renderer.setStyle(this.el, 'cursor', '');
    this.hideOverlay();

    if (!this.moved) return;

    // Suprimir el click que el navegador sintetiza tras pointerup
    this.el.addEventListener('click', (ce: Event) => {
      ce.stopPropagation();
      ce.preventDefault();
    }, { once: true, capture: true });

    const rect       = this.el.getBoundingClientRect();
    const targetZone = this.svc.findNearestZone(
      rect.left + rect.width  / 2,
      rect.top  + rect.height / 2,
      rect.width, rect.height,
    );
    const fromZone = this.svc.getCurrentZone(this.snapId, this.defaultZone);

    // Intercambiar si la zona de destino está ocupada
    this.svc.swapIfNeeded(this.snapId, targetZone, fromZone);

    // Mover este botón a la zona de destino
    this.snapToZone(targetZone, true);
    this.svc.setZone(this.snapId, targetZone);
  }

  // ── Posicionamiento (público para que el servicio pueda moverlo) ─────────────

  snapToZone(zoneId: string, animated: boolean): void {
    const { top, left } = this.svc.getZonePosition(
      zoneId,
      this.el.offsetWidth,
      this.el.offsetHeight,
    );
    this.renderer.setStyle(this.el, 'transition', animated ? SNAP_TRANSITION : 'none');
    this.renderer.setStyle(this.el, 'top',  `${top}px`);
    this.renderer.setStyle(this.el, 'left', `${left}px`);
  }

  // ── Overlay de zonas ────────────────────────────────────────────────────────

  private showOverlay(): void {
    this.hideOverlay();
    const overlay     = document.createElement('div');
    overlay.id        = OVERLAY_ID;
    overlay.className = 'snap-zones-overlay';

    const elW = this.el.offsetWidth;
    const elH = this.el.offsetHeight;

    for (const zone of this.svc.zones) {
      const { top, left } = this.svc.getZonePosition(zone.id, elW, elH);
      const dot = document.createElement('div');
      dot.className         = 'snap-zone-ghost';
      dot.dataset['zoneId'] = zone.id;
      dot.style.top         = `${top}px`;
      dot.style.left        = `${left}px`;
      dot.style.width       = `${elW}px`;
      dot.style.height      = `${elH}px`;

      // Marcar zonas ya ocupadas con estilo diferente
      const occupant = this.svc.findOccupant(zone.id, this.snapId);
      if (occupant) dot.classList.add('snap-zone-ghost--occupied');

      overlay.appendChild(dot);
    }

    document.body.appendChild(overlay);
  }

  private highlightZone(activeId: string): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.querySelectorAll<HTMLElement>('.snap-zone-ghost').forEach(dot => {
      dot.classList.toggle('snap-zone-ghost--active', dot.dataset['zoneId'] === activeId);
    });
  }

  private hideOverlay(): void {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  ngOnDestroy(): void {
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup',   this.boundUp);
    window.removeEventListener('resize',      this.boundResize);
    this.hideOverlay();
    this.svc.unregister(this.snapId);
  }
}
