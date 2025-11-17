import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service'; 

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  const hadUser = !!auth.getCurrentUser();

  if (hadUser) {
    auth.logout('expired'); 
  } else {
    router.navigate(['/inicio'], {
      queryParams: { returnUrl: state.url },
    });
  }

  return false;
};
