import { Routes } from '@angular/router';
import { Pareo } from './pages/pareo/pareo';
import { Salidas } from './pages/salidas/salidas';
import { Escaneo } from './pages/escaneo/escaneo';
import { Resumen } from './pages/resumen/resumen';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pareo' },
  { path: 'pareo', component: Pareo },
  { path: 'salidas', component: Salidas },
  { path: 'escaneo', component: Escaneo },
  { path: 'resumen', component: Resumen },
  { path: '**', redirectTo: 'pareo' },
];
