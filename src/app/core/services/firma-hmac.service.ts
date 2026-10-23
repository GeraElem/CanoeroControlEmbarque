import { Injectable } from '@angular/core';

/**
 * Firma HMAC-SHA256 del payload del QR, 100% offline con la Web Crypto API.
 *
 * DEBE producir la MISMA firma que el servidor (BusinessLogic.Embarque.FirmaHmac):
 *   sig = Base64URL( HMAC_SHA256(clave, m)[0..10] )
 * Vector de prueba (ver FIRMA_QR.md):
 *   clave "3q2+7wAAAA...", mensaje "1|10473|885|202609121430"  =>  "qH4B4W09tuPwAA"
 */
@Injectable({ providedIn: 'root' })
export class FirmaHmacService {
  /** Cantidad de bytes de la firma truncada. */
  static readonly FIRMA_BYTES = 10;

  /** Calcula la firma (Base64URL sin relleno) del mensaje con la clave dada. */
  async computar(clave: Uint8Array, mensaje: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      clave as unknown as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const full = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mensaje)),
    );
    return this.base64Url(full.slice(0, FirmaHmacService.FIRMA_BYTES));
  }

  /** Verifica en tiempo constante que la firma recibida corresponda al mensaje. */
  async verificar(clave: Uint8Array, mensaje: string, firmaRecibida: string): Promise<boolean> {
    if (!firmaRecibida) return false;
    const esperada = await this.computar(clave, mensaje);
    return this.comparacionTiempoConstante(esperada, firmaRecibida);
  }

  /** Convierte bytes a Base64URL sin relleno ('+'->'-', '/'->'_', sin '='). */
  private base64Url(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private comparacionTiempoConstante(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }

  /** Decodifica la clave HMAC entregada en el pareo (Base64) a bytes. */
  static claveDesdeBase64(claveBase64: string): Uint8Array {
    const bin = atob(claveBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
}
