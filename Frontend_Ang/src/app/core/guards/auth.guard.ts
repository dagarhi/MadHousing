import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service'; 

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    // Hay sesión => dejamos pasar al mapa
    return true;
  }

  // Sin sesión => volvemos a la pantalla inicial (login)
  router.navigate(['/inicio'], {
    queryParams: { returnUrl: state.url },
  });
  return false;
};
