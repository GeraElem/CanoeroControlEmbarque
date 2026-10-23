import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-pareo',
  imports: [FormsModule],
  templateUrl: './pareo.html',
  styleUrl: './pareo.scss',
})
export class Pareo {
  readonly config = inject(ConfigService);
  private api = inject(ApiService);
  private router = inject(Router);

  url = signal(this.config.apiBaseUrl());
  codigo = signal('');
  operador = signal(this.config.operador());
  procesando = signal(false);
  error = signal('');

  readonly pareado = computed(() => this.config.estaPareado());

  async parear(): Promise<void> {
    this.error.set('');
    const url = this.url().trim();
    const codigo = this.codigo().trim();
    if (!url) { this.error.set('Ingresá la URL del servidor.'); return; }
    if (!codigo) { this.error.set('Ingresá el código de pareo.'); return; }

    this.procesando.set(true);
    try {
      await this.config.setApiBaseUrl(url);
      if (this.operador().trim()) await this.config.setOperador(this.operador().trim());
      const cred = await this.api.registrar(codigo);
      await this.config.guardarCredenciales(cred);
      await this.router.navigate(['/salidas']);
    } catch (e: unknown) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.procesando.set(false);
    }
  }

  async continuar(): Promise<void> {
    if (this.operador().trim() && this.operador().trim() !== this.config.operador()) {
      await this.config.setOperador(this.operador().trim());
    }
    await this.router.navigate(['/salidas']);
  }

  async despairear(): Promise<void> {
    if (!confirm('¿Desvincular esta tablet? Vas a tener que parearla de nuevo.')) return;
    await this.config.limpiarPareo();
  }

  private mensajeError(e: unknown): string {
    const err = e as { error?: { message?: string } | string; status?: number; message?: string };
    if (err?.error && typeof err.error === 'object' && err.error.message) return err.error.message;
    if (typeof err?.error === 'string' && err.error) return err.error;
    if (err?.status === 0) return 'No se pudo conectar al servidor. Revisá la URL y la red.';
    return err?.message || 'No se pudo parear la tablet.';
  }
}
