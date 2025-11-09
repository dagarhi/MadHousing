import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerShellComponent } from '../../../../shared/components/drawer-shell/drawer-shell.component';
import { LucideAngularModule } from 'lucide-angular';
import { HistorialService } from '../../../../core/services/historial.service';
import { HistorialItem } from '../../../../core/models/historial.model';

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

  constructor(public historial: HistorialService) {}

  eliminar(fecha: string) {
    this.historial.eliminar(fecha);
  }

  borrarTodos() {
    this.historial.borrarTodos();
  }

  toggleDrawer(open: boolean) {
    this.opened = open;
    this.openedChange.emit(this.opened); 
  }
  onClose() {
    this.opened = false;
    this.openedChange.emit(false);
  }
  onOpenedChange(value: boolean) {
    this.opened = value;
    this.openedChange.emit(value);
  }
}
