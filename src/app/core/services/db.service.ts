import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import {
  BoletoLocal,
  EmbarqueResultado,
  LecturaLocal,
  SalidaLocal,
} from '../models/embarque.models';
import { EstadoBoletoLocal } from './embarque.service';

/**
 * Base local (IndexedDB via Dexie) de la tablet.
 *  - salidas:  salidas cacheadas para elegir/re-abrir.
 *  - boletos:  manifiesto de la salida + estado de embarque local.
 *  - lecturas: bitácora local de TODAS las lecturas, con cola de sincronización.
 */
@Injectable({ providedIn: 'root' })
export class DbService extends Dexie {
  salidas!: Table<SalidaLocal, number>;
  boletos!: Table<BoletoLocal, number>;
  lecturas!: Table<LecturaLocal, string>;

  constructor() {
    super('canoero-embarque');
    this.version(1).stores({
      salidas: 'salidaId, fecha',
      boletos: 'bolId, salidaId',
      lecturas: 'idempotencyKey, salidaId, sincronizado',
    });
  }

  // ---- Salidas ----

  async guardarSalidas(fecha: string, salidas: SalidaLocal[]): Promise<void> {
    await this.transaction('rw', this.salidas, async () => {
      await this.salidas.where('fecha').equals(fecha).delete();
      if (salidas.length) await this.salidas.bulkPut(salidas);
    });
  }

  getSalidasPorFecha(fecha: string): Promise<SalidaLocal[]> {
    return this.salidas.where('fecha').equals(fecha).toArray();
  }

  getSalida(salidaId: number): Promise<SalidaLocal | undefined> {
    return this.salidas.get(salidaId);
  }

  // ---- Manifiesto (boletos) ----

  /** Reemplaza el manifiesto local de una salida. */
  async guardarManifiesto(salidaId: number, boletos: BoletoLocal[]): Promise<void> {
    await this.transaction('rw', this.boletos, async () => {
      await this.boletos.where('salidaId').equals(salidaId).delete();
      if (boletos.length) await this.boletos.bulkPut(boletos);
    });
  }

  getManifiesto(salidaId: number): Promise<BoletoLocal[]> {
    return this.boletos.where('salidaId').equals(salidaId).toArray();
  }

  /** Lookup para la decisión de embarque (existe / ya embarcado). */
  async estadoBoleto(bolId: number): Promise<EstadoBoletoLocal | undefined> {
    const b = await this.boletos.get(bolId);
    if (!b) return { existe: false, embarcado: false };
    return { existe: true, embarcado: b.embarcado };
  }

  /** Marca un boleto como embarcado en el manifiesto local (optimista). */
  async marcarEmbarcadoLocal(bolId: number): Promise<void> {
    await this.boletos.update(bolId, { embarcado: true });
  }

  async resumenSalida(salidaId: number): Promise<{ total: number; embarcados: number }> {
    const boletos = await this.getManifiesto(salidaId);
    return {
      total: boletos.length,
      embarcados: boletos.filter((b) => b.embarcado).length,
    };
  }

  // ---- Lecturas (cola de sincronización) ----

  encolarLectura(lectura: LecturaLocal): Promise<string> {
    return this.lecturas.put(lectura);
  }

  lecturasPorSalida(salidaId: number): Promise<LecturaLocal[]> {
    return this.lecturas.where('salidaId').equals(salidaId).reverse().sortBy('fechaHoraLectura');
  }

  lecturasPendientes(): Promise<LecturaLocal[]> {
    return this.lecturas.where('sincronizado').equals(0).toArray();
  }

  contarPendientes(): Promise<number> {
    return this.lecturas.where('sincronizado').equals(0).count();
  }

  /** Marca lecturas como sincronizadas según la respuesta del servidor. */
  async aplicarResultadosSync(resultados: EmbarqueResultado[]): Promise<void> {
    await this.transaction('rw', this.lecturas, async () => {
      for (const r of resultados) {
        await this.lecturas.update(r.idempotencyKey, {
          sincronizado: 1,
          resultadoServidor: r.resultadoServidor,
        });
      }
    });
  }

  /** Borra todo el estado local (p. ej. al despairear el dispositivo). */
  async limpiarTodo(): Promise<void> {
    await this.transaction('rw', this.salidas, this.boletos, this.lecturas, async () => {
      await this.salidas.clear();
      await this.boletos.clear();
      await this.lecturas.clear();
    });
  }
}
