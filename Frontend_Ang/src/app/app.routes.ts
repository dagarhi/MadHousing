import { Routes } from '@angular/router';
import { PantallaInicialComponent } from './shared/features/inicio/pantalla-inicial/pantalla-inicial.component'; 
import { VistaMapaComponent } from './shared/features/mapa/vista-mapa/vista-mapa.component'; 

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', component: PantallaInicialComponent },
  { path: 'mapa', component: VistaMapaComponent },
  { path: '**', redirectTo: 'inicio' },
];
