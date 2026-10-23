import { Injectable, inject } from '@angular/core';
import { QrService } from './qr.service';
import { ResultadoEmbarque } from '../models/embarque.models';

/** Estado local de un boleto en el manifiesto de la tablet. */
export interface EstadoBoletoLocal {
  existe: boolean;
  embarcado: boolean;
}

export interface EvaluacionEmbarque {
  resultado: ResultadoEmbarque;
  bolId: number | null;
}

/**
 * Decide el resultado de una lectura, 100% offline, siguiendo ARRANQUE_TECNICO §5.2:
 *
 *  1. Verificar firma del QR (QrService). Si no valida  -> NoValido.
 *  2. Si la salida del QR != salida controlada          -> NoCorresponde.
 *  3. Buscar el boleto en el manifiesto local:
 *       - no existe                                       -> FueraDeManifiesto
 *       - existe y no embarcado                           -> Embarcado
 *       - existe y ya embarcado                           -> Duplicado
 *
 * La decisión es pura: recibe un lookup del estado local del boleto. El llamador
 * (componente) hace las lecturas/escrituras en la base local y encola la lectura.
 */
@Injectable({ providedIn: 'root' })
export class EmbarqueService {
  private qr = inject(QrService);

  async evaluar(
    clave: Uint8Array,
    contenidoQr: string,
    salidaControladaId: number,
    buscarBoleto: (bolId: number) => EstadoBoletoLocal | undefined,
  ): Promise<EvaluacionEmbarque> {
    const parseo = await this.qr.parsear(clave, contenidoQr);

    // Firma inválida o formato roto => QR no válido.
    if (parseo.resultado !== 'Ok' || !parseo.payload) {
      return { resultado: 'NoValido', bolId: null };
    }

    const { bolId, salId } = parseo.payload;

    // QR válido pero de otra salida.
    if (salId !== salidaControladaId) {
      return { resultado: 'NoCorresponde', bolId };
    }

    const estado = buscarBoleto(bolId);

    if (!estado || !estado.existe) {
      // Firma válida y salida correcta, pero no está en el manifiesto local.
      return { resultado: 'FueraDeManifiesto', bolId };
    }
    if (estado.embarcado) {
      return { resultado: 'Duplicado', bolId };
    }
    return { resultado: 'Embarcado', bolId };
  }
}
