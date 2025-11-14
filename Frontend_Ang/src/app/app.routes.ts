import { Routes } from '@angular/router';
import { PantallaInicialComponent } from './shared/features/inicio/pantalla-inicial/pantalla-inicial.component';
import { VistaMapaComponent } from './shared/features/mapa/vista-mapa/vista-mapa.component';
import { authGuard } from './core/guards/auth.guard'; // ajusta la ruta si la carpeta es distinta

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },

  // Pantalla inicial = pantalla pública (login / selección de usuario)
  { path: 'inicio', component: PantallaInicialComponent },

  // Mapa protegido: solo entra si está autenticado
  {
    path: 'mapa',
    component: VistaMapaComponent,
    canActivate: [authGuard],
  },

  { path: '**', redirectTo: 'inicio' },
];
