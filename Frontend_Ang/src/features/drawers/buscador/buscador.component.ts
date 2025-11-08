import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { PisosService } from '../../../app/core/services/pisos.service';
import { FiltrosBuscar } from '../../../app/models/filtros.model';
import { Propiedad } from '../../../app/models/propiedad.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-drawer-buscador',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    LucideAngularModule
  ],
  templateUrl: './buscador.component.html',
  styleUrls: ['./buscador.component.scss']
})
export class DrawerBuscadorComponent implements OnInit {
  @Output() resultadosBusqueda = new EventEmitter<Propiedad[]>();
  form!: FormGroup;
  resultados: Propiedad[] = [];
  cargando = false;

  constructor(private fb: FormBuilder, private pisosService: PisosService) {}

  ngOnInit() {
    this.form = this.fb.group({
      ciudad: ['Madrid'],
      operation: ['sale'],
      minPrice: [],
      maxPrice: [],
      minSize: [],
      maxSize: [],
      rooms: [],
      hasLift: [false]
    });
  }

  aplicarFiltros() {
    const filtros: FiltrosBuscar = this.form.value as FiltrosBuscar;
    this.cargando = true;

    this.pisosService.buscar(filtros).subscribe({
      next: (res) => {
        this.resultados = res.propiedades || [];
        this.cargando = false;
        console.log('Resultados:', this.resultados.length);
        this.resultadosBusqueda.emit(this.resultados);
      },
      error: (err) => {
        console.error('Error en búsqueda', err);
        this.cargando = false;
      }
    });
  }
}
