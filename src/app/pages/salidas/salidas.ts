import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { ApiService } from '../../core/services/api.service';
import { DbService } from '../../core/services/db.service';
import { BoletoLocal, SalidaApi } from '../../core/models/embarque.models';

@Component({
  selector: 'app-salidas',
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './salidas.html',
  styleUrl: './salidas.scss',
})
export class Salidas {
  readonly config = inject(ConfigService);
  private api = inject(ApiService);
  private db = inject(DbService);
  private router = inject(Router);

  fecha = signal(this.hoyIso());
  salidas = signal<SalidaApi[]>([]);
  cargando = signal(false);
  error = signal('');
  offline = signal(false);
  abriendo = signal<number | null>(null);

  // Agrupación Mañana (< 13:00) / Tarde (>= 13:00).
  readonly manana = computed(() => this.salidas().filter((s) => this.horaNum(s) < 13));
  readonly tarde = computed(() => this.salidas().filter((s) => this.horaNum(s) >= 13));

  constructor() {
    if (!this.config.estaPareado()) {
      this.router.navigate(['/pareo']);
      return;
    }
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.error.set('');
    this.offline.set(false);
    this.cargando.set(true);
    try {
      const data = await this.api.getSalidas(this.fecha());
      this.salidas.set(data);
      await this.db.guardarSalidas(
        this.fecha(),
        data.map((s) => ({ ...s, fecha: this.fecha() })),
      );
    } catch (e) {
      // Sin conexión: caemos al cache local de esa fecha.
      const local = await this.db.getSalidasPorFecha(this.fecha());
      if (local.length) {
        this.salidas.set(local);
        this.offline.set(true);
      } else {
        this.salidas.set([]);
        this.error.set(this.mensajeError(e));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  async abrir(s: SalidaApi): Promise<void> {
    if (this.abriendo()) return;
    this.abriendo.set(s.salidaId);
    this.error.set('');
    try {
      const m = await this.api.getManifiesto(s.salidaId);
      const boletos: BoletoLocal[] = m.boletos.map((b) => ({
        bolId: b.bolId,
        salidaId: s.salidaId,
        pasajero: b.pasajero,
        tipo: b.tipo,
        embarcado: b.embarcado,
      }));
      await this.db.guardarManifiesto(s.salidaId, boletos);
      await this.config.setSalidaActual(s.salidaId);
      await this.router.navigate(['/escaneo']);
    } catch (e) {
      // Si ya hay manifiesto cacheado de esa salida, se puede seguir offline.
      const local = await this.db.getManifiesto(s.salidaId);
      if (local.length) {
        await this.config.setSalidaActual(s.salidaId);
        await this.router.navigate(['/escaneo']);
      } else {
        this.error.set('No se pudo descargar el manifiesto. ' + this.mensajeError(e));
      }
    } finally {
      this.abriendo.set(null);
    }
  }

  volverAlPareo(): void {
    this.router.navigate(['/pareo']);
  }

  horaTexto(s: SalidaApi): string {
    const d = new Date(s.fechaHora);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private horaNum(s: SalidaApi): number {
    return new Date(s.fechaHora).getHours();
  }

  private hoyIso(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private mensajeError(e: unknown): string {
    const err = e as { status?: number; error?: { message?: string }; message?: string };
    if (err?.status === 0) return 'Sin conexión con el servidor.';
    if (err?.error?.message) return err.error.message;
    return err?.message || 'Error al cargar las salidas.';
  }
}
