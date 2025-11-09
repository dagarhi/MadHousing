
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { importProvidersFrom } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';

// 👇 Lucide
import { LucideAngularModule } from 'lucide-angular';
import {
  Heart,
  History,
  BarChart3,
  Scale,
  Search,
  X,
  Trash2,
  Trash,
  Map,
  Moon,
  Sun,
} from 'lucide-angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
    // 👇 REGISTRO GLOBAL DE ICONOS
    importProvidersFrom(
      LucideAngularModule.pick({
        Heart,
        History,
        BarChart3,
        Scale,
        Search,
        X,
        Trash2,
        Trash,
        Map,
        Moon,
        Sun,
      })
    ),
  ],
}).catch((err) => console.error(err));
