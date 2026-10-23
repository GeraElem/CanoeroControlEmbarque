import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { DbService } from '../../core/services/db.service';
import { ApiService } from '../../core/services/api.service';
import { ScannerService } from '../../core/services/scanner.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { EmbarqueService } from '../../core/services/embarque.service';
import { QrService } from '../../core/services/qr.service';
import { FirmaHmacService } from '../../core/services/firma-hmac.service';
import {
  BoletoLocal,
  LecturaLocal,
  OrigenLectura,
  ResultadoEmbarque,
  SalidaLocal,
} from '../../core/models/embarque.models';

interface ResultadoVista {
  resultado: ResultadoEmbarque;
  titulo: string;
  color: string;
  pasajero: string;
  detalle: string;
}

@Component({
  selector: 'app-escaneo',
  imports: [FormsModule, DatePipe],
  templateUrl: './escaneo.html',
  styleUrl: './escaneo.scss',
})
export class Escaneo {
  readonly config = inject(ConfigService);
  private db = inject(DbService);
  private api = inject(ApiService);
  private scanner = inject(ScannerService);
  private feedback = inject(FeedbackService);
  private embarque = inject(EmbarqueService);
  private qr = inject(QrService);
  private firma = inject(FirmaHmacService);
  private router = inject(Router);

  salida = signal<SalidaLocal | null>(null);
  boletos = signal<BoletoLocal[]>([]);
  readonly total = computed(() => this.boletos().length);
  readonly embarcados = computed(() => this.boletos().filter((b) => b.embarcado).length);

  resultado = signal<ResultadoVista | null>(null);
  escaneando = signal(false);
  scannerDisponible = signal(false);
  pendientes = signal(0);
  sincronizando = signal(false);
  mensajeSync = signal('');

  // Búsqueda manual
  panelManual = signal(false);
  filtroManual = signal('');
  readonly resultadosManual = computed(() => {
    const f = this.filtroManual().trim().toLowerCase();
    if (!f) return this.boletos().slice(0, 50);
    return this.boletos()
      .filter((b) => (b.pasajero ?? '').toLowerCase().includes(f) || String(b.bolId).includes(f))
      .slice(0, 50);
  });

  // Simulación (navegador)
  qrManual = signal('');

  private clave: Uint8Array = new Uint8Array();
  private salidaId = 0;
  private ocultarTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!this.config.estaPareado()) {
      this.router.navigate(['/pareo']);
      return;
    }
    const sal = this.config.salidaActualId();
    if (sal == null) {
      this.router.navigate(['/salidas']);
      return;
    }
    this.salidaId = sal;
    this.clave = FirmaHmacService.claveDesdeBase64(this.config.claveHmacBase64());
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    this.salida.set((await this.db.getSalida(this.salidaId)) ?? null);
    this.boletos.set(await this.db.getManifiesto(this.salidaId));
    this.pendientes.set(await this.db.contarPendientes());
    this.scannerDisponible.set(await this.scanner.disponible());
  }

  // ---- Escaneo ----

  async escanear(): Promise<void> {
    if (this.escaneando()) return;
    this.escaneando.set(true);
    try {
      const permiso = await this.scanner.asegurarPermiso();
      if (!permiso) {
        this.mensajeSync.set('Sin permiso de cámara.');
        return;
      }
      const contenido = await this.scanner.escanearUno();
      if (contenido) await this.procesar(contenido, 'QR');
    } finally {
      this.escaneando.set(false);
    }
  }

  async procesarQrManual(): Promise<void> {
    const c = this.qrManual().trim();
    if (!c) return;
    await this.procesar(c, 'QR');
    this.qrManual.set('');
  }

  private async procesar(contenido: string, origen: OrigenLectura): Promise<void> {
    const ev = await this.embarque.evaluar(this.clave, contenido, this.salidaId, (bolId) => {
      const b = this.boletos().find((x) => x.bolId === bolId);
      return b ? { existe: true, embarcado: b.embarcado } : { existe: false, embarcado: false };
    });
    await this.aplicar(ev.resultado, ev.bolId, origen);
  }

  // ---- Manual ----

  async embarcarManual(b: BoletoLocal): Promise<void> {
    const resultado: ResultadoEmbarque = b.embarcado ? 'Duplicado' : 'Embarcado';
    this.panelManual.set(false);
    this.filtroManual.set('');
    await this.aplicar(resultado, b.bolId, 'Manual');
  }

  // ---- Aplicación del resultado (común a QR y manual) ----

  private async aplicar(
    resultado: ResultadoEmbarque,
    bolId: number | null,
    origen: OrigenLectura,
  ): Promise<void> {
    // 1) Registrar la lectura en la cola local.
    const lectura: LecturaLocal = {
      idempotencyKey: crypto.randomUUID(),
      bolId,
      salidaId: this.salidaId,
      resultado,
      origen,
      fechaHoraLectura: new Date().toISOString(),
      dispositivoId: this.config.dispositivoIdTexto(),
      operador: this.config.operador() || null,
      sincronizado: 0,
    };
    await this.db.encolarLectura(lectura);

    // 2) Marcado optimista si es primer embarque.
    if (resultado === 'Embarcado' && bolId != null) {
      this.boletos.update((lista) =>
        lista.map((b) => (b.bolId === bolId ? { ...b, embarcado: true } : b)),
      );
      await this.db.marcarEmbarcadoLocal(bolId);
    }

    // 3) Feedback (beep + vibración) y cartel grande.
    void this.feedback.reproducir(resultado);
    this.mostrarResultado(resultado, bolId);

    // 4) Contador de pendientes + intento de sync si hay conexión.
    this.pendientes.set(await this.db.contarPendientes());
    void this.sincronizarSilencioso();
  }

  private mostrarResultado(resultado: ResultadoEmbarque, bolId: number | null): void {
    const b = bolId != null ? this.boletos().find((x) => x.bolId === bolId) : undefined;
    const meta: Record<ResultadoEmbarque, { titulo: string; color: string }> = {
      Embarcado: { titulo: '✓ EMBARCADO', color: '#1e7e34' },
      Duplicado: { titulo: '⚠ YA EMBARCADO', color: '#e0a800' },
      FueraDeManifiesto: { titulo: 'FUERA DE MANIFIESTO', color: '#17a2b8' },
      NoCorresponde: { titulo: 'OTRA SALIDA', color: '#6f42c1' },
      NoValido: { titulo: '✕ QR NO VÁLIDO', color: '#c82333' },
    };
    this.resultado.set({
      resultado,
      titulo: meta[resultado].titulo,
      color: meta[resultado].color,
      pasajero: b?.pasajero ?? (bolId != null ? `Boleto ${bolId}` : ''),
      detalle: b?.tipo ?? '',
    });
    if (this.ocultarTimer) clearTimeout(this.ocultarTimer);
    this.ocultarTimer = setTimeout(() => this.resultado.set(null), 2200);
  }

  cerrarResultado(): void {
    if (this.ocultarTimer) clearTimeout(this.ocultarTimer);
    this.resultado.set(null);
  }

  // ---- Sincronización ----

  async sincronizar(): Promise<void> {
    if (this.sincronizando()) return;
    this.mensajeSync.set('');
    if (!navigator.onLine) {
      this.mensajeSync.set('Sin conexión. Se sincroniza cuando vuelva la red.');
      return;
    }
    this.sincronizando.set(true);
    try {
      const n = await this.enviarPendientes();
      this.mensajeSync.set(n > 0 ? `${n} lecturas sincronizadas.` : 'Todo al día.');
    } catch {
      this.mensajeSync.set('No se pudo sincronizar. Reintentá.');
    } finally {
      this.sincronizando.set(false);
    }
  }

  private async sincronizarSilencioso(): Promise<void> {
    if (!navigator.onLine || this.sincronizando()) return;
    this.sincronizando.set(true);
    try {
      await this.enviarPendientes();
    } catch {
      // Silencioso: queda pendiente para el próximo intento.
    } finally {
      this.sincronizando.set(false);
    }
  }

  private async enviarPendientes(): Promise<number> {
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
    this.pendientes.set(await this.db.contarPendientes());
    return resultados.length;
  }

  cambiarSalida(): void {
    this.router.navigate(['/salidas']);
  }

  verResumen(): void {
    this.router.navigate(['/resumen']);
  }

  // ---- Simulación de lecturas (solo navegador, para probar la lógica) ----

  async simular(tipo: 'ok' | 'duplicado' | 'otra' | 'fuera' | 'invalido'): Promise<void> {
    const sal = this.salida();
    if (!sal) return;
    const fecha = this.fechaSalidaQr(sal.fechaHora);

    let bolId: number;
    let salId = this.salidaId;
    let firmaOk = true;

    switch (tipo) {
      case 'ok': {
        const libre = this.boletos().find((b) => !b.embarcado);
        bolId = libre?.bolId ?? this.boletos()[0]?.bolId ?? 1;
        break;
      }
      case 'duplicado': {
        const emb = this.boletos().find((b) => b.embarcado) ?? this.boletos()[0];
        bolId = emb?.bolId ?? 1;
        break;
      }
      case 'otra':
        bolId = this.boletos()[0]?.bolId ?? 1;
        salId = this.salidaId + 1; // QR de otra salida
        break;
      case 'fuera':
        bolId = 9999999; // válido pero no está en el manifiesto
        break;
      case 'invalido':
        bolId = this.boletos()[0]?.bolId ?? 1;
        firmaOk = false;
        break;
    }

    const mensaje = this.qr.mensajeAFirmar(bolId, salId, fecha);
    let firma = await this.firma.computar(this.clave, mensaje);
    if (!firmaOk) firma = 'XXXXXXXXXXXX'; // firma alterada
    await this.procesar(`${mensaje}|${firma}`, 'QR');
  }

  private fechaSalidaQr(fechaHora: string): string {
    const d = new Date(fechaHora);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  }
}
