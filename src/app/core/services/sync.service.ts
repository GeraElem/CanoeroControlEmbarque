import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';
import { ApiService } from './api.service';

/**
 * Sincronización de la cola de lecturas con el servidor. Reutilizable por las
 * pantallas de escaneo y resumen.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private db = inject(DbService);
  private api = inject(ApiService);

  hayConexion(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  contarPendientes(): Promise<number> {
    return this.db.contarPendientes();
  }

  /**
   * Envía las lecturas pendientes y aplica los resultados. Devuelve la cantidad
   * enviada. Lanza si falla la llamada (para que el llamador muestre el error).
   */
  async enviarPendientes(): Promise<number> {
    const pend = await this.db.lecturasPendientes();
    if (pend.length === 0) return 0;

    const resultados = await this.api.enviarEmbarques(
      pend.map((p) => ({
        idempotencyKey: p.idempotencyKey,
        bolId: p.bolId,
        salidaId: p.salidaId,
        resultado: p.resultado,
        origen: p.origen,
        fechaHoraLectura: p.fechaHoraLectura,
        dispositivoId: p.dispositivoId,
        operador: p.operador,
      })),
    );
    await this.db.aplicarResultadosSync(resultados);
    return resultados.length;
  }
}
