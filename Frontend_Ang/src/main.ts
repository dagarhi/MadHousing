import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { AppComponent } from './app/app';
import { LucideAngularModule } from 'lucide-angular';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  Layers,
  Layers2,
  Eye,
  EyeOff,
  BarChart3,
  Heart,
  Menu,
  Search,
  X,
  Sun,
  Moon
} from 'lucide-angular';

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(
      HttpClientModule,
      LucideAngularModule.pick({
        Layers,
        Layers2,
        Eye,
        EyeOff,
        BarChart3,
        Heart,
        Menu,
        Search,
        X,
        Sun,
        Moon
      })
    ),
    provideAnimations(),
  ],
}).catch((err) => console.error(err));
