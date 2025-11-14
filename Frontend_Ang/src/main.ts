
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { withInterceptors } from '@angular/common/http';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';

// 👇 Lucide
import { BrushCleaning, EyeOff, LucideAngularModule } from 'lucide-angular';
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
  MapPin,
  RefreshCcw,
  LogOut,
  Columns3,
  Eye,
  
} from 'lucide-angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
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
        MapPin,
        RefreshCcw,
        BrushCleaning,
        LogOut,
        Columns3,
        Eye,
        EyeOff
      })
    ),
  ],
}).catch((err) => console.error(err));
