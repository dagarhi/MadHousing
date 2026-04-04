import { Routes } from '@angular/router';
import { PantallaInicialComponent } from './shared/features/inicio/pantalla-inicial/pantalla-inicial.component';
import { VistaMapaComponent } from './shared/features/mapa/vista-mapa/vista-mapa.component';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },

  { path: 'inicio', component: PantallaInicialComponent },

  {
    path: 'mapa',
    component: VistaMapaComponent,
    canActivate: [authGuard],
  },

  {
    path: 'admin',
    loadComponent: () => import('./shared/features/admin/admin.component').then(m => m.AdminComponent),
    canActivate: [adminGuard],
  },

  { path: '**', redirectTo: 'inicio' },
];
