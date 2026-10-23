import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { DbService } from '../../core/services/db.service';
import { SyncService } from '../../core/services/sync.service';
import { BoletoLocal, ResultadoEmbarque, SalidaLocal } from '../../core/models/embarque.models';

interface ConteoResultado {
  resultado: ResultadoEmbarque;
  etiqueta: string;
  color: string;
  cantidad: number;
}

@Component({
  selector: 'app-resumen',
  imports: [DatePipe],
  templateUrl: './resumen.html',
  styleUrl: './resumen.scss',
})
export class Resumen {
  readonly config = inject(ConfigService);
  private db = inject(DbService);
  private sync = inject(SyncService);
  private router = inject(Router);

  salida = signal<SalidaLocal | null>(null);
  boletos = signal<BoletoLocal[]>([]);
  conteos = signal<ConteoResultado[]>([]);
  pendientesSync = signal(0);
  sincronizando = signal(false);
  mensajeSync = signal('');

  readonly total = computed(() => this.boletos().length);
  readonly embarcados = computed(() => this.boletos().filter((b) => b.embarcado).length);
  readonly faltan = computed(() => this.total() - this.embarcados());
  readonly porcentaje = computed(() =>
    this.total() ? Math.round((this.embarcados() * 100) / this.total()) : 0,
  );
  readonly noEmbarcados = computed(() => this.boletos().filter((b) => !b.embarcado));

  private salidaId = 0;

  private readonly META: Record<ResultadoEmbarque, { etiqueta: string; color: string }> = {
    Embarcado: { etiqueta: 'Embarcados', color: '#1e7e34' },
    Duplicado: { etiqueta: 'Duplicados', color: '#e0a800' },
    FueraDeManifiesto: { etiqueta: 'Fuera de manifiesto', color: '#17a2b8' },
    NoCorresponde: { etiqueta: 'Otra salida', color: '#6f42c1' },
    NoValido: { etiqueta: 'QR no válidos', color: '#c82333' },
  };

  constructor() {
    const sal = this.config.salidaActualId();
    if (!this.config.estaPareado() || sal == null) {
      this.router.navigate([this.config.estaPareado() ? '/salidas' : '/pareo']);
      return;
    }
    this.salidaId = sal;
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.salida.set((await this.db.getSalida(this.salidaId)) ?? null);
    this.boletos.set(await this.db.getManifiesto(this.salidaId));

    const lecturas = await this.db.lecturasPorSalida(this.salidaId);
    const orden: ResultadoEmbarque[] = [
      'Embarcado',
      'Duplicado',
      'FueraDeManifiesto',
      'NoCorresponde',
      'NoValido',
    ];
    this.conteos.set(
      orden.map((r) => ({
        resultado: r,
        etiqueta: this.META[r].etiqueta,
        color: this.META[r].color,
        cantidad: lecturas.filter((l) => l.resultado === r).length,
      })),
    );

    this.pendientesSync.set(await this.sync.contarPendientes());
  }

  async sincronizar(): Promise<void> {
    if (this.sincronizando()) return;
    this.mensajeSync.set('');
    if (!this.sync.hayConexion()) {
      this.mensajeSync.set('Sin conexión. Reintentá cuando vuelva la red.');
      return;
    }
    this.sincronizando.set(true);
    try {
      const n = await this.sync.enviarPendientes();
      this.pendientesSync.set(await this.sync.contarPendientes());
      this.mensajeSync.set(n > 0 ? `${n} lecturas sincronizadas.` : 'Todo al día.');
    } catch {
      this.mensajeSync.set('No se pudo sincronizar. Reintentá.');
    } finally {
      this.sincronizando.set(false);
    }
  }

  seguir(): void {
    this.router.navigate(['/escaneo']);
  }

  cambiarSalida(): void {
    this.router.navigate(['/salidas']);
  }
}
