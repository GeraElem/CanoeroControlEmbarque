import { Injectable, inject } from '@angular/core';
import { FirmaHmacService } from './firma-hmac.service';
import { ParseoQr, QrPayload } from '../models/embarque.models';

/**
 * Parseo y verificación de firma del QR del boleto, offline.
 * Formato: 1|BolId|SalId|FechaSalida|firma   (FechaSalida = yyyyMMddHHmm)
 *
 * Sólo resuelve si el QR está bien formado y su firma es auténtica.
 * Los resultados de negocio (Embarcado/Duplicado/FueraDeManifiesto/NoCorresponde)
 * se deciden después, contra el manifiesto local y la salida controlada.
 */
@Injectable({ providedIn: 'root' })
export class QrService {
  static readonly VERSION = '1';
  private static readonly SEP = '|';

  private firma = inject(FirmaHmacService);

  /** Arma el mensaje a firmar (los primeros 4 campos, sin la firma). */
  mensajeAFirmar(bolId: number, salId: number, fechaSalida: string): string {
    return [QrService.VERSION, bolId, salId, fechaSalida].join(QrService.SEP);
  }

  /** Parsea y verifica la firma de un contenido de QR con la clave del sistema. */
  async parsear(clave: Uint8Array, contenido: string): Promise<ParseoQr> {
    if (!contenido) return { resultado: 'FormatoInvalido' };

    const campos = contenido.split(QrService.SEP);
    if (campos.length !== 5) return { resultado: 'FormatoInvalido' };
    if (campos[0] !== QrService.VERSION) return { resultado: 'FormatoInvalido' };

    const bolId = Number(campos[1]);
    const salId = Number(campos[2]);
    const fechaSalida = campos[3];
    const firma = campos[4];

    if (!Number.isInteger(bolId) || !Number.isInteger(salId)) return { resultado: 'FormatoInvalido' };
    if (!/^\d{12}$/.test(fechaSalida)) return { resultado: 'FormatoInvalido' };

    const mensaje = this.mensajeAFirmar(bolId, salId, fechaSalida);
    const ok = await this.firma.verificar(clave, mensaje, firma);
    if (!ok) return { resultado: 'FirmaInvalida' };

    const payload: QrPayload = { version: campos[0], bolId, salId, fechaSalida, firma };
    return { resultado: 'Ok', payload };
  }
}
