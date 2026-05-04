
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { importProvidersFrom, isDevMode, LOCALE_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { withInterceptors } from '@angular/common/http';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './transloco-loader';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeEn from '@angular/common/locales/en';
import { LanguageService } from './app/core/services/language.service';

// Registramos los locales que usa la app — necesario para que los pipes
// `date`, `number` y `currency` formateen según el idioma activo.
registerLocaleData(localeEs);
registerLocaleData(localeEn);

// 👇 Lucide
import { BrushCleaning, EyeOff, HelpCircle, LucideAngularModule, ArrowLeft } from 'lucide-angular';
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ruler,
  Sparkles,
  Layers,
  Flame,
  MapPin,
  RefreshCcw,
  LogOut,
  Columns3,
  Eye,
  Navigation2,
  ListOrdered,
  House,
  Compass,
  Info,
  Shield,
  ExternalLink,
  Calculator,
  Footprints,
  Bike,
  Car,
  Clock,
  Route,
  ArrowLeftRight,
  Wrench,
  Trees,
  TrainFront,
  GraduationCap,
  Cross,
  ShoppingCart,
  Languages,
  Users,
} from 'lucide-angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTransloco({
      config: {
        availableLangs: ['es', 'en'],
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    {
      // LOCALE_ID se resuelve una vez al arrancar la app (Angular no soporta
      // cambio de locale en caliente sin recargar). Usamos el idioma que
      // LanguageService eligió en su detectInitial(): localStorage → navigator → 'es'.
      provide: LOCALE_ID,
      useFactory: (lang: LanguageService) => lang.current === 'en' ? 'en' : 'es',
      deps: [LanguageService],
    },
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
        EyeOff,
        Navigation2,
        ListOrdered,
        House,
        Compass,
        Info,
        HelpCircle,
        Shield,
        ArrowLeft,
        ExternalLink,
        ChevronDown,
        ChevronLeft,
        ChevronRight,
        Calculator,
        Footprints,
        Bike,
        Car,
        Clock,
        Route,
        ArrowLeftRight,
        Wrench,
        Trees,
        TrainFront,
        GraduationCap,
        Cross,
        ShoppingCart,
        Languages,
        Users,
      })
    ),
  ],
}).catch((err) => console.error(err));
