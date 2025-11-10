
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

// 👇 Lucide
import { LucideAngularModule } from 'lucide-angular';
import {
  Heart,
  HeartOff,
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
  Funnel,
  Euro,
  ChevronsDown,
  ChevronsUp,
  Ruler,
  Sparkles,
  Layers,
  Flame,
  MapPin
  
} from 'lucide-angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    // 👇 REGISTRO GLOBAL DE ICONOS
    importProvidersFrom(
      LucideAngularModule.pick({
        Heart,
        HeartOff,
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
        Funnel,
        Euro,
        ChevronsDown,
        ChevronsUp,
        Ruler,
        Sparkles,
        Layers,
        Flame,
        MapPin
      })
    ),
  ],
}).catch((err) => console.error(err));
