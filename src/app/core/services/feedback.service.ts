import { Injectable } from '@angular/core';
import { Haptics } from '@capacitor/haptics';
import { ResultadoEmbarque } from '../models/embarque.models';

/**
 * Feedback sonoro + háptico por resultado de lectura. El sonido se genera con la
 * Web Audio API (sin archivos) y la vibración con @capacitor/haptics (+ fallback
 * a navigator.vibrate en navegador). Cada resultado tiene un patrón distinto para
 * que el operador lo reconozca sin mirar la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private ctx?: AudioContext;

  private audio(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor!();
    }
    return this.ctx;
  }

  async reproducir(resultado: ResultadoEmbarque): Promise<void> {
    this.vibrar(resultado);
    switch (resultado) {
      case 'Embarcado':
        await this.tono(880, 150); // agudo, corto y alegre
        break;
      case 'Duplicado':
        await this.secuencia([[660, 110, 50], [660, 110, 0]]); // doble medio
        break;
      case 'FueraDeManifiesto':
        await this.secuencia([[520, 120, 40], [720, 170, 0]]); // sube
        break;
      case 'NoCorresponde':
        await this.secuencia([[720, 120, 40], [500, 170, 0]]); // baja
        break;
      case 'NoValido':
        await this.tono(190, 450, 'square'); // buzz grave de error
        break;
    }
  }

  private async tono(freq: number, durMs: number, tipo: OscillatorType = 'sine'): Promise<void> {
    try {
      const ctx = this.audio();
      if (ctx.state === 'suspended') await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tipo;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durMs / 1000);
      await new Promise((r) => setTimeout(r, durMs));
    } catch {
      // Sin audio disponible: seguimos sin romper.
    }
  }

  /** Secuencia de [frecuencia, duración, pausaDespués]. */
  private async secuencia(pasos: [number, number, number][]): Promise<void> {
    for (const [freq, dur, pausa] of pasos) {
      await this.tono(freq, dur);
      if (pausa) await new Promise((r) => setTimeout(r, pausa));
    }
  }

  private vibrar(resultado: ResultadoEmbarque): void {
    const patronWeb: number | number[] =
      resultado === 'Embarcado' ? 80
      : resultado === 'Duplicado' ? [60, 60, 60]
      : resultado === 'NoValido' ? 400
      : 200;
    const durHaptics =
      resultado === 'NoValido' ? 400 : resultado === 'Embarcado' ? 80 : 200;

    try { void Haptics.vibrate({ duration: durHaptics }); } catch { /* noop */ }
    try { (navigator as unknown as { vibrate?: (p: number | number[]) => void }).vibrate?.(patronWeb); } catch { /* noop */ }
  }
}
