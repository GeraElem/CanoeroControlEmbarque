// Modelos del dominio de embarque (app tablet).
// El contrato del QR y la firma están documentados en el backend:
//   BussinessLogic/Embarque/FIRMA_QR.md

/** Resultado de una lectura de embarque (coincide con el backend). */
export type ResultadoEmbarque =
  | 'Embarcado'
  | 'Duplicado'
  | 'FueraDeManifiesto'
  | 'NoCorresponde'
  | 'NoValido';

/** Origen de la lectura. */
export type OrigenLectura = 'QR' | 'Manual';

/** Payload del QR ya parseado (formato: 1|BolId|SalId|FechaSalida|firma). */
export interface QrPayload {
  version: string;
  bolId: number;
  salId: number;
  /** Fecha de salida en formato yyyyMMddHHmm (tal como viaja firmada en el QR). */
  fechaSalida: string;
  firma: string;
}

/** Resultado del parseo/verificación de bajo nivel del QR. */
export type ResultadoQr = 'Ok' | 'FormatoInvalido' | 'FirmaInvalida';

export interface ParseoQr {
  resultado: ResultadoQr;
  payload?: QrPayload;
}

// ---- DTOs de la API (camelCase, como responde el WebApi) ----

export interface SalidaApi {
  salidaId: number;
  descripcion: string;
  fechaHora: string;
  cantidadBoletos: number;
}

export interface BoletoManifiesto {
  bolId: number;
  pasajero: string;
  tipo: string;
  embarcado: boolean;
}

export interface ManifiestoApi {
  salida: { salidaId: number; descripcion: string; fechaHora: string };
  boletos: BoletoManifiesto[];
}

/** Lectura que se envía a POST /api/embarques. */
export interface EmbarqueLecturaInput {
  idempotencyKey: string;
  bolId: number | null;
  salidaId: number;
  resultado: ResultadoEmbarque;
  origen: OrigenLectura;
  fechaHoraLectura: string; // ISO
  dispositivoId: string;
  operador?: string | null;
}

/** Respuesta por lectura de POST /api/embarques. */
export interface EmbarqueResultado {
  idempotencyKey: string;
  aplicado: boolean;
  resultadoServidor: ResultadoEmbarque;
}

/** Credenciales que la tablet obtiene en el pareo. */
export interface CredencialesDispositivo {
  dispositivoId: number;
  token: string;
  claveHmac: string; // Base64 de 32 bytes
}

// ---- Modelos de almacenamiento local (Dexie / IndexedDB) ----

/** Salida cacheada localmente (para elegir y re-abrir offline). */
export interface SalidaLocal {
  salidaId: number;
  descripcion: string;
  fechaHora: string;
  cantidadBoletos: number;
  fecha: string; // yyyy-MM-dd (para filtrar por día)
}

/** Boleto del manifiesto local, con su estado de embarque en la tablet. */
export interface BoletoLocal {
  bolId: number;
  salidaId: number;
  pasajero: string;
  tipo: string;
  embarcado: boolean;
}

/** Lectura registrada localmente y encolada para sincronizar. */
export interface LecturaLocal extends EmbarqueLecturaInput {
  /** 0 = pendiente de enviar, 1 = ya sincronizada. */
  sincronizado: 0 | 1;
  /** Resultado autoritativo devuelto por el servidor (al sincronizar). */
  resultadoServidor?: ResultadoEmbarque;
}
