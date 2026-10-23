import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CredencialesDispositivo } from '../models/embarque.models';

const K = {
  apiBaseUrl: 'apiBaseUrl',
  token: 'token',
  claveHmac: 'claveHmac',
  dispositivoId: 'dispositivoId',
  operador: 'operador',
  salidaActualId: 'salidaActualId',
} as const;

/**
 * Configuración y credenciales de la tablet. Persiste en Capacitor Preferences
 * (que en navegador usa almacenamiento local) y cachea en signals para acceso
 * síncrono (p. ej. el token en cada request, o la clave HMAC al validar).
 *
 * La clave HMAC y el token NUNCA se hardcodean: se obtienen en el pareo.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly apiBaseUrl = signal<string>('');
  readonly token = signal<string>('');
  readonly claveHmacBase64 = signal<string>('');
  readonly dispositivoId = signal<number | null>(null);
  readonly operador = signal<string>('');
  readonly salidaActualId = signal<number | null>(null);

  /** Carga todo desde Preferences a los signals. Llamar al iniciar la app. */
  async cargar(): Promise<void> {
    this.apiBaseUrl.set((await Preferences.get({ key: K.apiBaseUrl })).value ?? '');
    this.token.set((await Preferences.get({ key: K.token })).value ?? '');
    this.claveHmacBase64.set((await Preferences.get({ key: K.claveHmac })).value ?? '');
    const disp = (await Preferences.get({ key: K.dispositivoId })).value;
    this.dispositivoId.set(disp ? Number(disp) : null);
    this.operador.set((await Preferences.get({ key: K.operador })).value ?? '');
    const sal = (await Preferences.get({ key: K.salidaActualId })).value;
    this.salidaActualId.set(sal ? Number(sal) : null);
  }

  /** ¿La tablet está pareada (tiene token y clave)? */
  estaPareado(): boolean {
    return !!this.token() && !!this.claveHmacBase64() && !!this.dispositivoId();
  }

  async setApiBaseUrl(url: string): Promise<void> {
    const limpio = (url ?? '').trim().replace(/\/+$/, '');
    this.apiBaseUrl.set(limpio);
    await Preferences.set({ key: K.apiBaseUrl, value: limpio });
  }

  /** Guarda las credenciales obtenidas en el pareo. */
  async guardarCredenciales(c: CredencialesDispositivo): Promise<void> {
    this.token.set(c.token);
    this.claveHmacBase64.set(c.claveHmac);
    this.dispositivoId.set(c.dispositivoId);
    await Preferences.set({ key: K.token, value: c.token });
    await Preferences.set({ key: K.claveHmac, value: c.claveHmac });
    await Preferences.set({ key: K.dispositivoId, value: String(c.dispositivoId) });
  }

  async setOperador(nombre: string): Promise<void> {
    this.operador.set(nombre ?? '');
    await Preferences.set({ key: K.operador, value: nombre ?? '' });
  }

  async setSalidaActual(salidaId: number | null): Promise<void> {
    this.salidaActualId.set(salidaId);
    if (salidaId == null) await Preferences.remove({ key: K.salidaActualId });
    else await Preferences.set({ key: K.salidaActualId, value: String(salidaId) });
  }

  /** Identificador que se envía como DispositivoId en las lecturas. */
  dispositivoIdTexto(): string {
    const id = this.dispositivoId();
    return id != null ? String(id) : 'sin-parear';
  }

  /** Borra el pareo (token + clave + id). Usar al despairear. */
  async limpiarPareo(): Promise<void> {
    this.token.set('');
    this.claveHmacBase64.set('');
    this.dispositivoId.set(null);
    await Preferences.remove({ key: K.token });
    await Preferences.remove({ key: K.claveHmac });
    await Preferences.remove({ key: K.dispositivoId });
  }
}
