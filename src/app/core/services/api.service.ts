import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import {
  CredencialesDispositivo,
  EmbarqueLecturaInput,
  EmbarqueResultado,
  ManifiestoApi,
  SalidaApi,
} from '../models/embarque.models';

/**
 * Cliente de la WebAPI de embarque. La base sale de ConfigService.apiBaseUrl y el
 * token de dispositivo (Bearer) de ConfigService.token, salvo el registro de pareo.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private config = inject(ConfigService);

  private base(): string {
    const b = this.config.apiBaseUrl();
    if (!b) throw new Error('No está configurada la URL del servidor.');
    return b;
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.config.token()}` });
  }

  /** Pareo: registra la tablet con el código y obtiene token + clave HMAC. Sin Bearer. */
  registrar(codigoPareo: string): Promise<CredencialesDispositivo> {
    return firstValueFrom(
      this.http.post<CredencialesDispositivo>(
        `${this.base()}/api/dispositivos/registrar`,
        { codigoPareo },
      ),
    );
  }

  getSalidas(fecha: string): Promise<SalidaApi[]> {
    return firstValueFrom(
      this.http.get<SalidaApi[]>(`${this.base()}/api/salidas`, {
        params: { fecha },
        headers: this.authHeaders(),
      }),
    );
  }

  getManifiesto(salidaId: number): Promise<ManifiestoApi> {
    return firstValueFrom(
      this.http.get<ManifiestoApi>(`${this.base()}/api/manifiesto/${salidaId}`, {
        headers: this.authHeaders(),
      }),
    );
  }

  enviarEmbarques(lecturas: EmbarqueLecturaInput[]): Promise<EmbarqueResultado[]> {
    return firstValueFrom(
      this.http.post<EmbarqueResultado[]>(
        `${this.base()}/api/embarques`,
        lecturas,
        { headers: this.authHeaders() },
      ),
    );
  }
}
