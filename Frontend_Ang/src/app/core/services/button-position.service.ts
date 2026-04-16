import { Injectable } from '@angular/core';

export interface SnapZone {
  id: string;
  fx: number; // fracción horizontal: 0 = izquierda, 1 = derecha
  fy: number; // fracción vertical:   0 = arriba,    1 = abajo
}

const HEADER_H = 56;
const MARGIN   = 12;

@Injectable({ providedIn: 'root' })
export class ButtonPositionService {

  readonly zones: SnapZone[] = [
    { id: 'TL', fx: 0, fy: 0   },
    { id: 'TR', fx: 1, fy: 0   },
    { id: 'ML', fx: 0, fy: 0.5 },
    { id: 'MR', fx: 1, fy: 0.5 },
    { id: 'BL', fx: 0, fy: 1   },
    { id: 'BR', fx: 1, fy: 1   },
  ];

  // Zona actual de cada botón (en memoria, sincronizada con localStorage)
  private currentZones = new Map<string, string>();

  // Registro de directivas activas para poder moverlas programáticamente
  private directives = new Map<string, { snapToZone: (zoneId: string, animated: boolean) => void }>();

  // ── Registro de directivas ────────────────────────────────────────────────

  register(snapId: string, directive: { snapToZone: (z: string, a: boolean) => void }): void {
    this.directives.set(snapId, directive);
  }

  unregister(snapId: string): void {
    this.directives.delete(snapId);
    this.currentZones.delete(snapId);
  }

  // ── Gestión de zonas ──────────────────────────────────────────────────────

  getCurrentZone(snapId: string, defaultZone: string): string {
    if (!this.currentZones.has(snapId)) {
      const saved = localStorage.getItem(`btn-zone:${snapId}`) ?? defaultZone;
      this.currentZones.set(snapId, saved);
    }
    return this.currentZones.get(snapId)!;
  }

  setZone(snapId: string, zoneId: string): void {
    this.currentZones.set(snapId, zoneId);
    localStorage.setItem(`btn-zone:${snapId}`, zoneId);
  }

  /** Devuelve el snapId del botón que ocupa esa zona, excluyendo al que se mueve */
  findOccupant(zoneId: string, excludeSnapId: string): string | null {
    for (const [id, zone] of this.currentZones) {
      if (id !== excludeSnapId && zone === zoneId) return id;
    }
    return null;
  }

  /** Si la zona de destino está ocupada, intercambia posiciones */
  swapIfNeeded(movingId: string, targetZone: string, fromZone: string): void {
    const occupantId = this.findOccupant(targetZone, movingId);
    if (!occupantId) return;

    const occupant = this.directives.get(occupantId);
    if (!occupant) return;

    // Mover al ocupante a la zona de origen del que se mueve
    occupant.snapToZone(fromZone, true);
    this.setZone(occupantId, fromZone);
  }

  // ── Cálculo de posiciones ─────────────────────────────────────────────────

  getZonePosition(zoneId: string, elW: number, elH: number): { top: number; left: number } {
    const zone  = this.zones.find(z => z.id === zoneId) ?? this.zones[0];
    const vpW   = window.innerWidth;
    const vpH   = window.innerHeight;
    const areaH = vpH - HEADER_H;

    const left = zone.fx === 0
      ? MARGIN
      : zone.fx === 1
        ? vpW - elW - MARGIN
        : (vpW - elW) / 2;

    const top = zone.fy === 0
      ? HEADER_H + MARGIN
      : zone.fy === 1
        ? vpH - elH - MARGIN
        : HEADER_H + (areaH - elH) / 2;

    return { top, left };
  }

  findNearestZone(centerX: number, centerY: number, elW: number, elH: number): string {
    let nearest = this.zones[0];
    let minDist = Infinity;

    for (const zone of this.zones) {
      const pos  = this.getZonePosition(zone.id, elW, elH);
      const zCX  = pos.left + elW / 2;
      const zCY  = pos.top  + elH / 2;
      const dist = Math.hypot(centerX - zCX, centerY - zCY);
      if (dist < minDist) { minDist = dist; nearest = zone; }
    }

    return nearest.id;
  }
}
