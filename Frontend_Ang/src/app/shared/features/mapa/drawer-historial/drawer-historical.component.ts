import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../components/drawer-shell/drawer-shell.component';
import { LucideAngularModule } from 'lucide-angular';

import { HistorialService } from '../../../../core/services/historial.service';
import { HistorialItem } from '../../../../core/models/historial.model';
import { FiltroBusqueda } from '../../../../core/models/filtros.model';

@Component({
  selector: 'app-drawer-historial',
  standalone: true,
  imports: [CommonModule, DrawerShellComponent, LucideAngularModule],
  templateUrl: './drawer-historial.component.html',
  styleUrls: ['./drawer-historial.component.scss'],
})
export class DrawerHistorialComponent {
  @Input() opened = false;
  @Output() openedChange = new EventEmitter<boolean>();

  // Emite filtros al padre para reaplicar en el buscador
  @Output() reaplicar = new EventEmitter<FiltroBusqueda>();

  constructor(public historial: HistorialService) {}

  onOpenedChange(v: boolean) {
    this.opened = v;
    this.openedChange.emit(v);
  }

  onReaplicar(item: HistorialItem, cerrar = true) {
    this.reaplicar.emit(item.filtros);
    if (cerrar) this.onOpenedChange(false);
  }

  eliminar(item: HistorialItem) {
    console.log('[Drawer] eliminar', item.id);
    this.historial.eliminarById(item.id);
  }

  borrarTodos() {
    this.historial.borrarTodos();
  }

  trackById = (_: number, it: HistorialItem) => it.id;
}
