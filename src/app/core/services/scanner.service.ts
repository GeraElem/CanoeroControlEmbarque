import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * Abstracción del escáner de QR (ML Kit on-device).
 * En navegador (plataforma 'web') no está disponible: la pantalla usa el modo
 * "simular lectura" para probar la lógica sin cámara.
 */
@Injectable({ providedIn: 'root' })
export class ScannerService {
  esWeb(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  async disponible(): Promise<boolean> {
    if (this.esWeb()) return false;
    try {
      return (await BarcodeScanner.isSupported()).supported;
    } catch {
      return false;
    }
  }

  async asegurarPermiso(): Promise<boolean> {
    try {
      const actual = await BarcodeScanner.checkPermissions();
      if (actual.camera === 'granted' || actual.camera === 'limited') return true;
      const pedido = await BarcodeScanner.requestPermissions();
      return pedido.camera === 'granted' || pedido.camera === 'limited';
    } catch {
      return false;
    }
  }

  /** Abre el escáner y devuelve el contenido del QR, o null si se canceló/falló. */
  async escanearUno(): Promise<string | null> {
    try {
      if (Capacitor.getPlatform() === 'android') {
        try {
          const mod = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
          if (!mod.available) await BarcodeScanner.installGoogleBarcodeScannerModule();
        } catch {
          // Si falla la verificación/instalación del módulo, intentamos igual.
        }
      }
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      return barcodes?.[0]?.rawValue ?? null;
    } catch {
      return null;
    }
  }
}
