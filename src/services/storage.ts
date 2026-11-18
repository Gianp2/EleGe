/**
 * Repositorio desacoplado de persistencia en localStorage para Lavadero eLeGe.
 * Diseñado con una interfaz orientada a repositorios para facilitar
 * la futura migración directa a Google Cloud Firestore.
 */

import {
  Cliente,
  Pedido,
  Prenda,
  Pago,
  RegistroAvisoWhatsApp,
  ResumenKPIs,
  ResumenClienteMetricas,
  ConfiguracionSistema,
  BackupPackage,
  BackupMetadata,
  BackupValidationResult,
  MovimientoCaja,
  MovimientoCajaCambio,
  SesionCaja,
  ResumenCaja,
  TipoMovimientoCaja,
  CategoriaMovimientoCaja,
  MetodoPago,
} from '../types';
import { codificarQRCliente, codificarQRPedido, codificarQRPrenda } from '../utils/qr';
import {
  normalizarTelefonoWhatsApp,
  getLocalDateKey,
  CATEGORIA_CAJA_LABELS,
  CATEGORIAS_INGRESO,
  CATEGORIAS_EGRESO,
} from '../utils/formatters';

const STORAGE_KEYS = {
  CLIENTES: 'elege_clientes_v1',
  PEDIDOS: 'elege_pedidos_v1',
  CONFIGURACION: 'elege_configuracion_v1',
  INITIALIZED: 'elege_initialized_v1',
  SAFETY_SNAPSHOT: 'elege_safety_snapshot_pre_restore',
  MOVIMIENTOS_CAJA: 'elege_movimientos_caja_v1',
  SESIONES_CAJA: 'elege_sesiones_caja_v1',
  CAJA_PAGOS_HISTORIAL: 'elege_caja_pagos_historial_v1',
  DEMO_CLEANED: 'elege_demo_cleaned_v1',
};

const CONFIGURACION_DEFAULT: ConfiguracionSistema = {
  nombreComercio: 'Lavadero eLeGe',
  telefono: '11 4589-2234',
  direccion: 'Av. Corrientes 3450, CABA',
  lemaOTicketPie: '¡Muchas gracias por su confianza! Lavado artesanal y cuidado de prendas.',
  formatoTicketDefecto: '80mm',
  monedaSimbolo: '$',
  diasEstimadosEntregaDefecto: 2,
  notificarWhatsAppAuto: true,
};


const DEMO_PEDIDO_IDS = new Set(['PED-2400', 'PED-2401', 'PED-2402', 'PED-2403']);
const DEMO_CLIENTES_FIRMAS: Record<string, { nombre: string; telefono: string }> = {
  'CLI-101': { nombre: 'Martín', telefono: '11 4589-2234' },
  'CLI-102': { nombre: 'Florencia', telefono: '11 6784-9012' },
  'CLI-103': { nombre: 'Agustín', telefono: '11 3412-8877' },
  'CLI-104': { nombre: 'Valentina', telefono: '11 5566-3344' },
};

class StorageService {
  private listeners: Array<() => void> = [];

  constructor() {
    this.initIfEmpty();
  }

  private initIfEmpty(): void {
    try {
      const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!initialized) {
        localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(CONFIGURACION_DEFAULT));
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
        localStorage.setItem(STORAGE_KEYS.DEMO_CLEANED, 'true');
      } else {
        if (!localStorage.getItem(STORAGE_KEYS.CONFIGURACION)) {
          localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(CONFIGURACION_DEFAULT));
        }

        // Limpieza única de registros de ejemplo pre-cargados en navegadores anteriores
        if (localStorage.getItem(STORAGE_KEYS.DEMO_CLEANED) !== 'true') {
          const pedidosActuales: Pedido[] = JSON.parse(
            localStorage.getItem(STORAGE_KEYS.PEDIDOS) || '[]'
          );
          const pedidosLimpios = Array.isArray(pedidosActuales)
            ? pedidosActuales.filter((p) => !DEMO_PEDIDO_IDS.has(p.id))
            : [];
          localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify(pedidosLimpios));

          const clientesConPedidosReales = new Set(pedidosLimpios.map((p) => p.clienteId));
          const clientesActuales: Cliente[] = JSON.parse(
            localStorage.getItem(STORAGE_KEYS.CLIENTES) || '[]'
          );
          const clientesLimpios = Array.isArray(clientesActuales)
            ? clientesActuales.filter((c) => {
                const firma = DEMO_CLIENTES_FIRMAS[c.id];
                if (!firma) return true;
                if (clientesConPedidosReales.has(c.id)) return true;
                return c.nombre !== firma.nombre || c.telefono !== firma.telefono;
              })
            : [];
          localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(clientesLimpios));
          localStorage.removeItem(STORAGE_KEYS.SESIONES_CAJA);
          localStorage.setItem(STORAGE_KEYS.DEMO_CLEANED, 'true');
        }
      }
    } catch (e) {
      console.error('Error inicializando localStorage:', e);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(l => {
      try {
        l();
      } catch (err) {
        console.error('Error in storage listener:', err);
      }
    });
  }

  // --- CLIENTES ---

  public getClientes(): Cliente[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public getClienteById(id: string): Cliente | undefined {
    return this.getClientes().find(c => c.id === id);
  }

  public saveCliente(cliente: Cliente): void {
    const clientes = this.getClientes();
    const index = clientes.findIndex(c => c.id === cliente.id);
    if (index >= 0) {
      clientes[index] = cliente;
    } else {
      clientes.push(cliente);
    }
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(clientes));
    this.notify();
  }

  public deleteCliente(id: string): { ok: boolean; error?: string } {
    const pedidos = this.getPedidos().filter(p => p.clienteId === id);
    if (pedidos.length > 0) {
      return {
        ok: false,
        error: `No se puede eliminar el cliente porque posee ${pedidos.length} pedido(s) asociados en el historial.`,
      };
    }
    const clientes = this.getClientes().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(clientes));
    this.notify();
    return { ok: true };
  }

  public generarSiguienteIdCliente(): string {
    const clientes = this.getClientes();
    const numeros = clientes
      .map(c => {
        const match = c.id.match(/CLI-(\d+)/);
        return match ? parseInt(match[1], 10) : 100;
      })
      .filter(n => !isNaN(n));
    const max = numeros.length > 0 ? Math.max(...numeros) : 100;
    return `CLI-${max + 1}`;
  }

  /**
   * Detección de posibles clientes duplicados por teléfono normalizado
   */
  public verificarTelefonoExistente(telefono: string, excluirClienteId?: string): Cliente | null {
    if (!telefono) return null;
    const telNormalizado = normalizarTelefonoWhatsApp(telefono);
    if (!telNormalizado || telNormalizado.length < 8) return null;

    const clientes = this.getClientes();
    for (const c of clientes) {
      if (excluirClienteId && c.id === excluirClienteId) continue;
      const cTelNorm = normalizarTelefonoWhatsApp(c.telefono);
      if (cTelNorm && cTelNorm === telNormalizado) {
        return c;
      }
    }
    return null;
  }

  // --- PEDIDOS ---

  public getPedidos(): Pedido[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PEDIDOS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public getPedidoById(id: string): Pedido | undefined {
    return this.getPedidos().find(p => p.id === id);
  }

  public getPedidoByCodigo(codigo: string): Pedido | undefined {
    const limpio = codigo.trim().replace(/^#/, '');
    return this.getPedidos().find(p => p.codigoVisible.replace(/^#/, '') === limpio || p.id === codigo);
  }

  public savePedido(pedido: Pedido): void {
    const pedidos = this.getPedidos();
    const index = pedidos.findIndex(p => p.id === pedido.id);
    if (index >= 0) {
      pedidos[index] = pedido;
    } else {
      pedidos.unshift(pedido);
    }
    localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify(pedidos));
    this.notify();
  }

  public deletePedido(id: string): boolean {
    const pedidos = this.getPedidos().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify(pedidos));
    this.notify();
    return true;
  }

  public generarSiguienteIdPedido(): { id: string; codigoVisible: string } {
    const pedidos = this.getPedidos();
    const numeros = pedidos
      .map(p => {
        const match = p.id.match(/PED-(\d+)/);
        return match ? parseInt(match[1], 10) : 2400;
      })
      .filter(n => !isNaN(n));
    const max = numeros.length > 0 ? Math.max(...numeros) : 2400;
    const siguiente = max + 1;
    return {
      id: `PED-${siguiente}`,
      codigoVisible: `#${siguiente}`,
    };
  }

  // --- PRENDAS Y RECÁLCULO CONSISTENTE ---

  public buscarPrendaPorId(prendaId: string): { prenda: Prenda; pedido: Pedido; cliente?: Cliente } | null {
    const pedidos = this.getPedidos();
    for (const pedido of pedidos) {
      const prenda = pedido.prendas.find(p => p.id === prendaId);
      if (prenda) {
        const cliente = this.getClienteById(pedido.clienteId);
        return { prenda, pedido, cliente };
      }
    }
    return null;
  }

  public recalcularEstadoGeneralPedido(pedido: Pedido): void {
    if (!pedido.prendas || pedido.prendas.length === 0) {
      pedido.estadoGeneral = 'recibido';
      return;
    }

    const todasEntregadas = pedido.prendas.every(p => p.estado === 'entregado');
    const todasListasOEntregadas = pedido.prendas.every(p => p.estado === 'listo' || p.estado === 'entregado');
    const algunaLista = pedido.prendas.some(p => p.estado === 'listo');
    const algunaEnProceso = pedido.prendas.some(p => p.estado === 'en_proceso');

    if (todasEntregadas) {
      pedido.estadoGeneral = 'entregado';
      if (!pedido.fechaEntregaEfectiva) {
        pedido.fechaEntregaEfectiva = new Date().toISOString();
      }
    } else if (todasListasOEntregadas) {
      pedido.estadoGeneral = 'listo';
    } else if (algunaEnProceso || algunaLista) {
      pedido.estadoGeneral = 'en_proceso';
    } else {
      pedido.estadoGeneral = 'recibido';
    }
  }

  public actualizarEstadoPrenda(
    prendaId: string,
    nuevoEstado: Prenda['estado']
  ): { ok: boolean; pedidoActualizado?: Pedido; error?: string } {
    const match = this.buscarPrendaPorId(prendaId);
    if (!match) {
      return { ok: false, error: 'Prenda no encontrada' };
    }

    const { pedido } = match;
    const prendaIndex = pedido.prendas.findIndex(p => p.id === prendaId);
    if (prendaIndex < 0) return { ok: false, error: 'Prenda no encontrada' };

    pedido.prendas[prendaIndex].estado = nuevoEstado;
    pedido.prendas[prendaIndex].fechaActualizacion = new Date().toISOString();

    this.recalcularEstadoGeneralPedido(pedido);

    this.savePedido(pedido);
    return { ok: true, pedidoActualizado: pedido };
  }

  public agregarPrendaAPedido(
    pedidoId: string,
    nuevaPrendaData: Omit<Prenda, 'id' | 'pedidoId' | 'clienteId' | 'qrPayload' | 'estado'>
  ): { ok: boolean; pedido?: Pedido; error?: string } {
    const pedido = this.getPedidoById(pedidoId);
    if (!pedido) return { ok: false, error: 'Pedido no encontrado' };

    const nuevoIndex = pedido.prendas.length + 1;
    const nuevoPrendaId = `PRN-${pedido.id.replace('PED-', '')}-${nuevoIndex}`;

    const nuevaPrenda: Prenda = {
      ...nuevaPrendaData,
      id: nuevoPrendaId,
      pedidoId: pedido.id,
      clienteId: pedido.clienteId,
      estado: 'recibido',
      qrPayload: codificarQRPrenda(nuevoPrendaId, pedido.id, pedido.clienteId),
      fechaActualizacion: new Date().toISOString(),
    };

    pedido.prendas.push(nuevaPrenda);

    // Recalcular totales contables (excluyendo pagos anulados)
    pedido.total = pedido.prendas.reduce((acc, p) => acc + p.precio, 0);
    const totalPagado = pedido.pagos
      .filter((p) => !p.anulado)
      .reduce((acc, p) => acc + p.monto, 0);
    pedido.saldoPendiente = Math.max(0, Math.round(pedido.total - totalPagado));

    if (pedido.saldoPendiente === 0) {
      pedido.estadoPago = 'pagado';
    } else if (totalPagado > 0) {
      pedido.estadoPago = 'parcial';
    } else {
      pedido.estadoPago = 'pendiente';
    }

    this.recalcularEstadoGeneralPedido(pedido);
    this.savePedido(pedido);
    return { ok: true, pedido };
  }

  // --- PAGOS Y PREVENCIÓN DE DUPLICADOS ---

  public registrarPago(pagoData: {
    pedidoId: string;
    monto: number;
    metodo: Pago['metodo'];
    nota?: string;
    esSenia?: boolean;
  }): { ok: boolean; pedido?: Pedido; error?: string } {
    const pedido = this.getPedidoById(pagoData.pedidoId);
    if (!pedido) {
      return { ok: false, error: 'Pedido no encontrado' };
    }

    const montoLimpio = Math.round(pagoData.monto);

    if (!Number.isFinite(montoLimpio) || montoLimpio <= 0) {
      return { ok: false, error: 'El monto del pago debe ser mayor a cero' };
    }

    if (montoLimpio > pedido.saldoPendiente) {
      return {
        ok: false,
        error: `El monto ($ ${montoLimpio}) no puede superar el saldo pendiente actual ($ ${pedido.saldoPendiente})`,
      };
    }

    // Prevención de pagos duplicados instantáneos
    const ahoraMs = Date.now();
    const esDuplicadoReciente = pedido.pagos.some((p) => {
      if (p.anulado) return false;
      const tiempoPago = new Date(p.fecha).getTime();
      return (
        p.monto === montoLimpio &&
        p.metodo === pagoData.metodo &&
        ahoraMs - tiempoPago < 3000
      );
    });

    if (esDuplicadoReciente) {
      return { ok: false, error: 'Se detectó un pago idéntico procesado recientemente.' };
    }

    const nuevoPago: Pago = {
      id: `PAG-${ahoraMs.toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
      pedidoId: pedido.id,
      clienteId: pedido.clienteId,
      fecha: new Date().toISOString(),
      monto: montoLimpio,
      metodo: pagoData.metodo,
      nota: pagoData.nota,
      esSenia: pagoData.esSenia,
    };

    pedido.pagos.push(nuevoPago);

    const totalPagado = pedido.pagos
      .filter((p) => !p.anulado)
      .reduce((acc, p) => acc + p.monto, 0);
    pedido.saldoPendiente = Math.max(0, Math.round(pedido.total - totalPagado));

    if (pedido.saldoPendiente === 0) {
      pedido.estadoPago = 'pagado';
    } else if (totalPagado > 0) {
      pedido.estadoPago = 'parcial';
    } else {
      pedido.estadoPago = 'pendiente';
    }

    this.savePedido(pedido);
    return { ok: true, pedido };
  }

  // --- WHATSAPP ---

  public registrarAvisoWhatsApp(registro: RegistroAvisoWhatsApp): void {
    const pedido = this.getPedidoById(registro.pedidoId);
    if (!pedido) return;
    pedido.avisosWhatsApp = pedido.avisosWhatsApp || [];
    pedido.avisosWhatsApp.push(registro);
    this.savePedido(pedido);
  }

  // --- KPIS Y REPORTES ---

  public getKPIs(): ResumenKPIs {
    const pedidos = this.getPedidos();
    const ahora = new Date();
    const hoyStr = getLocalDateKey(ahora);

    let pedidosHoy = 0;
    let prendasEnProceso = 0;
    let prendasListas = 0;
    let prendasEntregadasHoy = 0;
    let ingresosHoy = 0;
    let ingresosMes = 0;
    let totalSaldoPorCobrar = 0;
    let pedidosPendientesRetiro = 0;

    for (const pedido of pedidos) {
      if (pedido.estadoGeneral === 'cancelado') continue;

      if (getLocalDateKey(pedido.fechaRecepcion) === hoyStr) {
        pedidosHoy++;
      }

      if (pedido.estadoGeneral === 'listo') {
        pedidosPendientesRetiro++;
      }

      totalSaldoPorCobrar += pedido.saldoPendiente;

      // Prendas
      for (const prenda of pedido.prendas) {
        if (prenda.estado === 'en_proceso') prendasEnProceso++;
        if (prenda.estado === 'listo') prendasListas++;
        if (
          prenda.estado === 'entregado' &&
          prenda.fechaActualizacion &&
          getLocalDateKey(prenda.fechaActualizacion) === hoyStr
        ) {
          prendasEntregadasHoy++;
        }
      }

      // Pagos (excluye anulados)
      for (const pago of pedido.pagos) {
        if (pago.anulado) continue;
        if (getLocalDateKey(pago.fecha) === hoyStr) {
          ingresosHoy += pago.monto;
        }
        const fechaPago = new Date(pago.fecha);
        const esMismoMesYAno =
          fechaPago.getFullYear() === ahora.getFullYear() &&
          fechaPago.getMonth() === ahora.getMonth();
        if (esMismoMesYAno) {
          ingresosMes += pago.monto;
        }
      }
    }

    // Incluir también ingresos manuales vigentes en KPIs de ingresos reales de caja
    const manuales = this.getMovimientosCajaManuales();
    for (const mov of manuales) {
      if (mov.anulado || mov.tipo !== 'ingreso') continue;
      if (getLocalDateKey(mov.fecha) === hoyStr) {
        ingresosHoy += mov.monto;
      }
      const f = new Date(mov.fecha);
      if (f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth()) {
        ingresosMes += mov.monto;
      }
    }

    return {
      pedidosHoy,
      prendasEnProceso,
      prendasListas,
      prendasEntregadasHoy,
      ingresosHoy,
      ingresosMes,
      totalSaldoPorCobrar,
      pedidosPendientesRetiro,
    };
  }

  public getMetricasCliente(clienteId: string): ResumenClienteMetricas {
    const pedidos = this.getPedidos().filter(p => p.clienteId === clienteId && p.estadoGeneral !== 'cancelado');
    let totalGastado = 0;
    let saldoDeuda = 0;
    let prendasEnLavadero = 0;
    let pedidosActivos = 0;
    let prendasActivasListas = 0;
    let ultimoPedidoFecha: string | undefined;

    for (const pedido of pedidos) {
      totalGastado += pedido.total;
      saldoDeuda += pedido.saldoPendiente;

      if (!ultimoPedidoFecha || new Date(pedido.fechaRecepcion) > new Date(ultimoPedidoFecha)) {
        ultimoPedidoFecha = pedido.fechaRecepcion;
      }

      if (pedido.estadoGeneral !== 'entregado') {
        pedidosActivos++;
      }

      for (const prenda of pedido.prendas) {
        if (prenda.estado !== 'entregado') {
          prendasEnLavadero++;
        }
        if (prenda.estado === 'listo') {
          prendasActivasListas++;
        }
      }
    }

    // Clasificación automática
    let clasificacion: ResumenClienteMetricas['clasificacion'] = 'nuevo';
    if (pedidos.length >= 3) {
      clasificacion = 'frecuente';
    } else if (pedidos.length >= 1) {
      clasificacion = 'ocasional';
    }

    return {
      totalPedidos: pedidos.length,
      totalGastado,
      saldoDeuda,
      ultimoPedidoFecha,
      prendasEnLavadero,
      pedidosActivos,
      prendasActivasListas,
      clasificacion,
    };
  }

  public getTodosLosPagos(): (Pago & { clienteNombre?: string; codigoPedido?: string })[] {
    const pedidos = this.getPedidos();
    const clientes = this.getClientes();
    const clienteMap = new Map(clientes.map(c => [c.id, `${c.nombre} ${c.apellido || ''}`.trim()]));

    const pagos: (Pago & { clienteNombre?: string; codigoPedido?: string })[] = [];
    for (const pedido of pedidos) {
      for (const pago of pedido.pagos) {
        if (pago.anulado) continue;
        pagos.push({
          ...pago,
          clienteNombre: clienteMap.get(pedido.clienteId) || 'Cliente no encontrado',
          codigoPedido: pedido.codigoVisible,
        });
      }
    }

    return pagos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  // --- MÓDULO CAJA Y BALANCE ---

  private getHistorialPagosMap(): Record<string, MovimientoCajaCambio[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CAJA_PAGOS_HISTORIAL);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveHistorialPago(pagoId: string, cambio: MovimientoCajaCambio): void {
    const map = this.getHistorialPagosMap();
    map[pagoId] = [...(map[pagoId] || []), cambio];
    localStorage.setItem(STORAGE_KEYS.CAJA_PAGOS_HISTORIAL, JSON.stringify(map));
  }

  public getMovimientosCajaManuales(): MovimientoCaja[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MOVIMIENTOS_CAJA);
      const list: MovimientoCaja[] = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /**
   * Devuelve todos los movimientos reales de Caja:
   * - Proyección determinística y sin duplicados (Set por pago.id) de todos los cobros y señas de pedidos.
   * - Movimientos manuales (ingresos manuales y todos los egresos).
   * Los saldos pendientes de pedidos NUNCA se incluyen como ingresos hasta que se cobran.
   */
  public getMovimientosCajaUnificados(incluirAnulados = true): MovimientoCaja[] {
    const pedidos = this.getPedidos();
    const clientes = this.getClientes();
    const clienteMap = new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellido || ''}`.trim()]));
    const historialPagos = this.getHistorialPagosMap();

    const pagosProcesadosIds = new Set<string>();
    const movimientosDePagos: MovimientoCaja[] = [];

    for (const pedido of pedidos) {
      const nombreCliente = clienteMap.get(pedido.clienteId) || 'Cliente mostrador';
      for (const pago of pedido.pagos || []) {
        if (!pago.id || pagosProcesadosIds.has(pago.id)) continue;
        pagosProcesadosIds.add(pago.id);

        if (!incluirAnulados && pago.anulado) continue;

        movimientosDePagos.push({
          id: `CAJ-PAG-${pago.id}`,
          tipo: 'ingreso',
          categoria: pago.esSenia ? 'senia_pedido' : 'cobro_pedido',
          concepto: pago.esSenia
            ? `Seña Pedido ${pedido.codigoVisible}`
            : `Cobro Pedido ${pedido.codigoVisible}`,
          monto: pago.monto,
          fecha: pago.fecha,
          metodo: pago.metodo,
          pedidoId: pedido.id,
          codigoPedido: pedido.codigoVisible,
          clienteId: pedido.clienteId,
          clienteNombre: nombreCliente,
          pagoIdRelacionado: pago.id,
          observaciones: pago.nota || undefined,
          origen: 'pedido_pago',
          anulado: Boolean(pago.anulado),
          motivoAnulacion: pago.motivoAnulacion,
          anuladoAt: pago.anuladoAt,
          historialCambios: historialPagos[pago.id],
          creadoEn: pago.fecha,
        });
      }
    }

    const manuales = this.getMovimientosCajaManuales().filter((m) =>
      incluirAnulados ? true : !m.anulado
    );

    const todos = [...movimientosDePagos, ...manuales];
    return todos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  public registrarMovimientoCaja(data: {
    tipo: TipoMovimientoCaja;
    categoria: CategoriaMovimientoCaja;
    concepto: string;
    monto: number;
    fecha?: string;
    metodo: MetodoPago;
    pedidoId?: string;
    codigoPedido?: string;
    clienteId?: string;
    clienteNombre?: string;
    observaciones?: string;
  }): { ok: boolean; movimiento?: MovimientoCaja; error?: string } {
    const montoLimpio = Math.round(Number(data.monto));
    if (!Number.isFinite(montoLimpio) || montoLimpio <= 0) {
      return { ok: false, error: 'El importe debe ser un número mayor a cero.' };
    }

    const conceptoLimpio = (data.concepto || '').trim();
    if (conceptoLimpio.length < 2) {
      return { ok: false, error: 'El concepto es obligatorio (mínimo 2 caracteres).' };
    }

    if (data.tipo === 'ingreso' && !CATEGORIAS_INGRESO.includes(data.categoria)) {
      return { ok: false, error: 'La categoría seleccionada no corresponde a un ingreso.' };
    }
    if (data.tipo === 'egreso' && !CATEGORIAS_EGRESO.includes(data.categoria)) {
      return { ok: false, error: 'La categoría seleccionada no corresponde a un egreso.' };
    }

    const manuales = this.getMovimientosCajaManuales();
    const ahoraMs = Date.now();

    // Prevención de duplicación por doble clic (3 segundos)
    const duplicado = manuales.some((m) => {
      if (m.anulado) return false;
      const creadoMs = new Date(m.creadoEn).getTime();
      return (
        m.tipo === data.tipo &&
        m.categoria === data.categoria &&
        m.concepto.toLowerCase() === conceptoLimpio.toLowerCase() &&
        m.monto === montoLimpio &&
        m.metodo === data.metodo &&
        ahoraMs - creadoMs < 3500
      );
    });

    if (duplicado) {
      return { ok: false, error: 'Movimiento idéntico recién registrado. Evitando duplicación.' };
    }

    const ahoraIso = new Date().toISOString();
    const fechaFinal = data.fecha && !isNaN(new Date(data.fecha).getTime()) ? data.fecha : ahoraIso;

    const nuevoMovimiento: MovimientoCaja = {
      id: `CAJ-${ahoraMs.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      tipo: data.tipo,
      categoria: data.categoria,
      concepto: conceptoLimpio,
      monto: montoLimpio,
      fecha: fechaFinal,
      metodo: data.metodo,
      pedidoId: data.pedidoId,
      codigoPedido: data.codigoPedido,
      clienteId: data.clienteId,
      clienteNombre: data.clienteNombre,
      observaciones: data.observaciones?.trim() || undefined,
      origen: 'manual',
      anulado: false,
      creadoEn: ahoraIso,
    };

    manuales.unshift(nuevoMovimiento);
    localStorage.setItem(STORAGE_KEYS.MOVIMIENTOS_CAJA, JSON.stringify(manuales));
    this.notify();
    return { ok: true, movimiento: nuevoMovimiento };
  }

  public corregirMovimientoCaja(
    id: string,
    cambios: {
      concepto?: string;
      categoria?: CategoriaMovimientoCaja;
      monto?: number;
      metodo?: MetodoPago;
      fecha?: string;
      observaciones?: string;
    },
    motivo: string
  ): { ok: boolean; error?: string } {
    const motivoLimpio = (motivo || '').trim();
    if (motivoLimpio.length < 3) {
      return { ok: false, error: 'Indicá un motivo válido (mínimo 3 caracteres) para registrar la corrección.' };
    }

    if (cambios.monto !== undefined) {
      const m = Math.round(Number(cambios.monto));
      if (!Number.isFinite(m) || m <= 0) {
        return { ok: false, error: 'El nuevo importe debe ser mayor a cero.' };
      }
    }

    const ahoraIso = new Date().toISOString();

    // Caso 1: Movimiento proyectado desde un Pago de Pedido
    if (id.startsWith('CAJ-PAG-')) {
      const pagoId = id.replace('CAJ-PAG-', '');
      const pedidos = this.getPedidos();
      for (const pedido of pedidos) {
        const pagoIdx = pedido.pagos.findIndex((p) => p.id === pagoId);
        if (pagoIdx === -1) continue;

        const pagoActual = pedido.pagos[pagoIdx];
        if (pagoActual.anulado) {
          return { ok: false, error: 'No se puede editar un cobro que ya fue anulado.' };
        }

        const nuevoMonto = cambios.monto !== undefined ? Math.round(cambios.monto) : pagoActual.monto;
        const nuevoMetodo = cambios.metodo ?? pagoActual.metodo;
        const nuevaNota = cambios.observaciones !== undefined ? cambios.observaciones.trim() : pagoActual.nota;
        const nuevaFecha = cambios.fecha || pagoActual.fecha;

        const otrosPagosTotal = pedido.pagos
          .filter((p, idx) => idx !== pagoIdx && !p.anulado)
          .reduce((acc, p) => acc + p.monto, 0);

        if (otrosPagosTotal + nuevoMonto > pedido.total) {
          return {
            ok: false,
            error: `El monto ($${nuevoMonto}) haría que los cobros superen el total del pedido ($${pedido.total}).`,
          };
        }

        const cambioRegistro: MovimientoCajaCambio = {
          fecha: ahoraIso,
          motivo: motivoLimpio,
          detalle: `Corrección de cobro en pedido ${pedido.codigoVisible}`,
          montoAnterior: pagoActual.monto,
          montoNuevo: nuevoMonto,
          metodoAnterior: pagoActual.metodo,
          metodoNuevo: nuevoMetodo,
        };

        pedido.pagos[pagoIdx] = {
          ...pagoActual,
          monto: nuevoMonto,
          metodo: nuevoMetodo,
          nota: nuevaNota || undefined,
          fecha: nuevaFecha,
        };

        const totalPagado = pedido.pagos
          .filter((p) => !p.anulado)
          .reduce((acc, p) => acc + p.monto, 0);
        pedido.saldoPendiente = Math.max(0, Math.round(pedido.total - totalPagado));
        pedido.estadoPago =
          pedido.saldoPendiente === 0 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente';

        this.saveHistorialPago(pagoId, cambioRegistro);
        this.savePedido(pedido);
        return { ok: true };
      }
      return { ok: false, error: 'No se encontró el cobro asociado al pedido.' };
    }

    // Caso 2: Movimiento manual de Caja
    const manuales = this.getMovimientosCajaManuales();
    const idx = manuales.findIndex((m) => m.id === id);
    if (idx === -1) {
      return { ok: false, error: 'Movimiento de caja no encontrado.' };
    }

    const actual = manuales[idx];
    if (actual.anulado) {
      return { ok: false, error: 'No se puede corregir un movimiento ya anulado.' };
    }

    const nuevoConcepto = cambios.concepto !== undefined ? cambios.concepto.trim() : actual.concepto;
    if (nuevoConcepto.length < 2) {
      return { ok: false, error: 'El concepto no puede quedar vacío.' };
    }

    const nuevoMonto = cambios.monto !== undefined ? Math.round(cambios.monto) : actual.monto;
    const nuevaCategoria = cambios.categoria ?? actual.categoria;
    const nuevoMetodo = cambios.metodo ?? actual.metodo;
    const nuevaFecha = cambios.fecha || actual.fecha;
    const nuevasObs =
      cambios.observaciones !== undefined ? cambios.observaciones.trim() || undefined : actual.observaciones;

    const detalles: string[] = [];
    if (nuevoMonto !== actual.monto) detalles.push(`Importe: $${actual.monto} → $${nuevoMonto}`);
    if (nuevoMetodo !== actual.metodo) detalles.push(`Medio: ${actual.metodo} → ${nuevoMetodo}`);
    if (nuevoConcepto !== actual.concepto) detalles.push(`Concepto: "${actual.concepto}" → "${nuevoConcepto}"`);
    if (nuevaCategoria !== actual.categoria) {
      detalles.push(`Categoría: ${CATEGORIA_CAJA_LABELS[actual.categoria]} → ${CATEGORIA_CAJA_LABELS[nuevaCategoria]}`);
    }

    const registroCambio: MovimientoCajaCambio = {
      fecha: ahoraIso,
      motivo: motivoLimpio,
      detalle: detalles.length > 0 ? detalles.join(' · ') : 'Actualización de fecha u observaciones',
      montoAnterior: actual.monto,
      montoNuevo: nuevoMonto,
      conceptoAnterior: actual.concepto,
      conceptoNuevo: nuevoConcepto,
      metodoAnterior: actual.metodo,
      metodoNuevo: nuevoMetodo,
      categoriaAnterior: actual.categoria,
      categoriaNuevo: nuevaCategoria,
    };

    manuales[idx] = {
      ...actual,
      concepto: nuevoConcepto,
      categoria: nuevaCategoria,
      monto: nuevoMonto,
      metodo: nuevoMetodo,
      fecha: nuevaFecha,
      observaciones: nuevasObs,
      actualizadoEn: ahoraIso,
      historialCambios: [...(actual.historialCambios || []), registroCambio],
    };

    localStorage.setItem(STORAGE_KEYS.MOVIMIENTOS_CAJA, JSON.stringify(manuales));
    this.notify();
    return { ok: true };
  }

  public anularMovimientoCaja(id: string, motivo: string): { ok: boolean; error?: string } {
    const motivoLimpio = (motivo || '').trim();
    if (motivoLimpio.length < 3) {
      return { ok: false, error: 'Debe ingresar un motivo de anulación (mínimo 3 caracteres).' };
    }

    const ahoraIso = new Date().toISOString();

    if (id.startsWith('CAJ-PAG-')) {
      const pagoId = id.replace('CAJ-PAG-', '');
      const pedidos = this.getPedidos();
      for (const pedido of pedidos) {
        const pagoIdx = pedido.pagos.findIndex((p) => p.id === pagoId);
        if (pagoIdx === -1) continue;

        const pagoActual = pedido.pagos[pagoIdx];
        if (pagoActual.anulado) {
          return { ok: false, error: 'Este cobro ya fue anulado anteriormente.' };
        }

        pedido.pagos[pagoIdx] = {
          ...pagoActual,
          anulado: true,
          motivoAnulacion: motivoLimpio,
          anuladoAt: ahoraIso,
        };

        const totalPagado = pedido.pagos
          .filter((p) => !p.anulado)
          .reduce((acc, p) => acc + p.monto, 0);
        pedido.saldoPendiente = Math.max(0, Math.round(pedido.total - totalPagado));
        pedido.estadoPago =
          pedido.saldoPendiente === 0 && pedido.total > 0
            ? 'pagado'
            : totalPagado > 0
            ? 'parcial'
            : 'pendiente';

        this.saveHistorialPago(pagoId, {
          fecha: ahoraIso,
          motivo: motivoLimpio,
          detalle: `Anulación de cobro $${pagoActual.monto} (pedido ${pedido.codigoVisible})`,
          montoAnterior: pagoActual.monto,
          montoNuevo: 0,
        });

        this.savePedido(pedido);
        return { ok: true };
      }
      return { ok: false, error: 'Pago no encontrado.' };
    }

    const manuales = this.getMovimientosCajaManuales();
    const idx = manuales.findIndex((m) => m.id === id);
    if (idx === -1) return { ok: false, error: 'Movimiento no encontrado.' };
    if (manuales[idx].anulado) return { ok: false, error: 'Este movimiento ya está anulado.' };

    const actual = manuales[idx];
    manuales[idx] = {
      ...actual,
      anulado: true,
      motivoAnulacion: motivoLimpio,
      anuladoAt: ahoraIso,
      actualizadoEn: ahoraIso,
      historialCambios: [
        ...(actual.historialCambios || []),
        {
          fecha: ahoraIso,
          motivo: motivoLimpio,
          detalle: `Anulación de movimiento ($${actual.monto})`,
          montoAnterior: actual.monto,
          montoNuevo: 0,
        },
      ],
    };

    localStorage.setItem(STORAGE_KEYS.MOVIMIENTOS_CAJA, JSON.stringify(manuales));
    this.notify();
    return { ok: true };
  }

  // --- SESIONES DE CAJA (APERTURA / CIERRE / ARQUEO) ---

  public getSesionesCaja(): SesionCaja[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SESIONES_CAJA);
      const list: SesionCaja[] = raw ? JSON.parse(raw) : [];
      return Array.isArray(list)
        ? list.sort((a, b) => new Date(b.horaApertura).getTime() - new Date(a.horaApertura).getTime())
        : [];
    } catch {
      return [];
    }
  }

  public getSesionCajaActiva(): SesionCaja | null {
    return this.getSesionesCaja().find((s) => !s.cerrada) || null;
  }

  public getUltimaSesionCerrada(): SesionCaja | null {
    return this.getSesionesCaja().find((s) => s.cerrada) || null;
  }

  public abrirCaja(
    saldoInicialEfectivo: number,
    saldoInicialDigital = 0,
    notasApertura = ''
  ): { ok: boolean; sesion?: SesionCaja; error?: string } {
    if (this.getSesionCajaActiva()) {
      return { ok: false, error: 'Ya existe una caja abierta actualmente. Cerrala antes de abrir una nueva.' };
    }

    const efLimpio = Math.round(Number(saldoInicialEfectivo));
    const digLimpio = Math.round(Number(saldoInicialDigital || 0));
    if (!Number.isFinite(efLimpio) || efLimpio < 0) {
      return { ok: false, error: 'El saldo inicial en efectivo no puede ser negativo.' };
    }
    if (!Number.isFinite(digLimpio) || digLimpio < 0) {
      return { ok: false, error: 'El saldo inicial digital no puede ser negativo.' };
    }

    const ahora = new Date();
    const nuevaSesion: SesionCaja = {
      id: `SES-${getLocalDateKey(ahora)}-${ahora.getTime().toString(36).slice(-4).toUpperCase()}`,
      fecha: getLocalDateKey(ahora),
      horaApertura: ahora.toISOString(),
      saldoInicialEfectivo: efLimpio,
      saldoInicialDigital: digLimpio,
      notasApertura: notasApertura.trim() || undefined,
      cerrada: false,
    };

    const sesiones = this.getSesionesCaja();
    sesiones.unshift(nuevaSesion);
    localStorage.setItem(STORAGE_KEYS.SESIONES_CAJA, JSON.stringify(sesiones));
    this.notify();
    return { ok: true, sesion: nuevaSesion };
  }

  public actualizarSaldoInicialCaja(
    sesionId: string,
    nuevoSaldoEfectivo: number,
    motivo: string
  ): { ok: boolean; error?: string } {
    const motivoLimpio = (motivo || '').trim();
    if (motivoLimpio.length < 3) {
      return { ok: false, error: 'Ingresá un motivo válido para ajustar el saldo inicial.' };
    }
    const efLimpio = Math.round(Number(nuevoSaldoEfectivo));
    if (!Number.isFinite(efLimpio) || efLimpio < 0) {
      return { ok: false, error: 'El saldo inicial no puede ser negativo.' };
    }

    const sesiones = this.getSesionesCaja();
    const idx = sesiones.findIndex((s) => s.id === sesionId);
    if (idx === -1) return { ok: false, error: 'Sesión de caja no encontrada.' };
    if (sesiones[idx].cerrada) return { ok: false, error: 'No se puede modificar una caja ya cerrada.' };

    const anterior = sesiones[idx].saldoInicialEfectivo;
    sesiones[idx] = {
      ...sesiones[idx],
      saldoInicialEfectivo: efLimpio,
      historialAjustes: [
        ...(sesiones[idx].historialAjustes || []),
        {
          fecha: new Date().toISOString(),
          saldoAnterior: anterior,
          saldoNuevo: efLimpio,
          motivo: motivoLimpio,
        },
      ],
    };

    localStorage.setItem(STORAGE_KEYS.SESIONES_CAJA, JSON.stringify(sesiones));
    this.notify();
    return { ok: true };
  }

  private getMovimientosDeSesion(sesion: SesionCaja): MovimientoCaja[] {
    const sesiones = this.getSesionesCaja();
    const hayCierrePrevioMismoDia = sesiones.some(
      (s) =>
        s.id !== sesion.id &&
        s.cerrada &&
        s.fecha === sesion.fecha &&
        s.horaCierre &&
        new Date(s.horaCierre).getTime() <= new Date(sesion.horaApertura).getTime()
    );

    const todos = this.getMovimientosCajaUnificados(false);
    const aperturaMs = new Date(sesion.horaApertura).getTime();

    return todos.filter((m) => {
      if (hayCierrePrevioMismoDia) {
        return new Date(m.fecha).getTime() >= aperturaMs;
      }
      // Si es la primera apertura del día, incluir movimientos reales desde el inicio de ese día
      return getLocalDateKey(m.fecha) >= sesion.fecha;
    });
  }

  public cerrarCaja(
    sesionId: string,
    arqueoRealEfectivo: number,
    observacionesCierre = ''
  ): { ok: boolean; sesion?: SesionCaja; error?: string } {
    const arqueoLimpio = Math.round(Number(arqueoRealEfectivo));
    if (!Number.isFinite(arqueoLimpio) || arqueoLimpio < 0) {
      return { ok: false, error: 'El efectivo contado en el arqueo no puede ser negativo.' };
    }

    const sesiones = this.getSesionesCaja();
    const idx = sesiones.findIndex((s) => s.id === sesionId);
    if (idx === -1) return { ok: false, error: 'Sesión de caja no encontrada.' };
    if (sesiones[idx].cerrada) return { ok: false, error: 'Esta sesión de caja ya se encuentra cerrada.' };

    const sesion = sesiones[idx];
    const movsSesion = this.getMovimientosDeSesion(sesion);

    let ingresosEfectivo = 0;
    let egresosEfectivo = 0;
    let totalIngresos = 0;
    let totalEgresos = 0;

    for (const m of movsSesion) {
      if (m.tipo === 'ingreso') {
        totalIngresos += m.monto;
        if (m.metodo === 'efectivo') ingresosEfectivo += m.monto;
      } else {
        totalEgresos += m.monto;
        if (m.metodo === 'efectivo') egresosEfectivo += m.monto;
      }
    }

    const efectivoEsperado = sesion.saldoInicialEfectivo + ingresosEfectivo - egresosEfectivo;
    const diferenciaArqueo = arqueoLimpio - efectivoEsperado;
    const balanceNeto = totalIngresos - totalEgresos;
    const saldoTotalFinal =
      sesion.saldoInicialEfectivo + (sesion.saldoInicialDigital || 0) + balanceNeto;

    const sesionCerrada: SesionCaja = {
      ...sesion,
      cerrada: true,
      horaCierre: new Date().toISOString(),
      arqueoRealEfectivo: arqueoLimpio,
      diferenciaArqueo,
      observacionesCierre: observacionesCierre.trim() || undefined,
      resumenCierre: {
        ingresosEfectivo,
        egresosEfectivo,
        efectivoEsperado,
        totalIngresos,
        totalEgresos,
        balanceNeto,
        saldoTotalFinal,
      },
    };

    sesiones[idx] = sesionCerrada;
    localStorage.setItem(STORAGE_KEYS.SESIONES_CAJA, JSON.stringify(sesiones));
    this.notify();
    return { ok: true, sesion: sesionCerrada };
  }

  /**
   * Calcula métricas completas de Caja:
   * - Balance económico del período filtrado (Ingresos, Egresos, Balance Neto).
   * - Saldo real disponible separado estrictamente en Efectivo físico vs Medios Digitales.
   * - Saldos pendientes de clientes reportados aparte (nunca sumados como ingresos).
   */
  public getResumenCaja(filtros?: {
    fechaDesde?: string; // YYYY-MM-DD
    fechaHasta?: string; // YYYY-MM-DD
    tipo?: 'todos' | TipoMovimientoCaja;
    categoria?: string;
    metodo?: string;
    busqueda?: string;
  }): { movimientosFiltrados: MovimientoCaja[]; resumen: ResumenCaja } {
    const todosVigentes = this.getMovimientosCajaUnificados(false);
    const todosConAnulados = this.getMovimientosCajaUnificados(true);

    const aplicaFiltro = (m: MovimientoCaja) => {
      const fKey = getLocalDateKey(m.fecha);
      if (filtros?.fechaDesde && fKey < filtros.fechaDesde) return false;
      if (filtros?.fechaHasta && fKey > filtros.fechaHasta) return false;
      if (filtros?.tipo && filtros.tipo !== 'todos' && m.tipo !== filtros.tipo) return false;
      if (filtros?.categoria && filtros.categoria !== 'todas' && m.categoria !== filtros.categoria) {
        return false;
      }
      if (filtros?.metodo && filtros.metodo !== 'todos' && m.metodo !== filtros.metodo) {
        return false;
      }
      if (filtros?.busqueda && filtros.busqueda.trim() !== '') {
        const q = filtros.busqueda.trim().toLowerCase();
        const texto = `${m.concepto} ${m.clienteNombre || ''} ${m.codigoPedido || ''} ${m.observaciones || ''} ${CATEGORIA_CAJA_LABELS[m.categoria] || ''}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    };

    const movimientosFiltrados = todosConAnulados.filter(aplicaFiltro);
    const vigentesPeriodo = todosVigentes.filter(aplicaFiltro);

    let ingresosPeriodo = 0;
    let egresosPeriodo = 0;
    let cantidadIngresos = 0;
    let cantidadEgresos = 0;

    const desgloseMetodos: Record<MetodoPago, { ingresos: number; egresos: number; neto: number }> = {
      efectivo: { ingresos: 0, egresos: 0, neto: 0 },
      transferencia: { ingresos: 0, egresos: 0, neto: 0 },
      debito: { ingresos: 0, egresos: 0, neto: 0 },
      credito: { ingresos: 0, egresos: 0, neto: 0 },
      otro: { ingresos: 0, egresos: 0, neto: 0 },
    };
    const desgloseEgresosCategoria: Record<string, number> = {};

    for (const m of vigentesPeriodo) {
      const met = desgloseMetodos[m.metodo] ? m.metodo : 'otro';
      if (m.tipo === 'ingreso') {
        ingresosPeriodo += m.monto;
        cantidadIngresos++;
        desgloseMetodos[met].ingresos += m.monto;
        desgloseMetodos[met].neto += m.monto;
      } else {
        egresosPeriodo += m.monto;
        cantidadEgresos++;
        desgloseMetodos[met].egresos += m.monto;
        desgloseMetodos[met].neto -= m.monto;
        desgloseEgresosCategoria[m.categoria] =
          (desgloseEgresosCategoria[m.categoria] || 0) + m.monto;
      }
    }

    // Saldo real de Caja (Efectivo físico separado de transferencias/tarjetas)
    const sesionActiva = this.getSesionCajaActiva();
    const ultimaCerrada = this.getUltimaSesionCerrada();

    let saldoInicialEfectivo = 0;
    let saldoInicialDigital = 0;
    let movimientosCajaReal: MovimientoCaja[] = todosVigentes;

    if (sesionActiva) {
      saldoInicialEfectivo = sesionActiva.saldoInicialEfectivo;
      saldoInicialDigital = sesionActiva.saldoInicialDigital || 0;
      movimientosCajaReal = this.getMovimientosDeSesion(sesionActiva);
    } else if (ultimaCerrada && ultimaCerrada.horaCierre) {
      saldoInicialEfectivo = ultimaCerrada.arqueoRealEfectivo ?? 0;
      saldoInicialDigital = 0;
      const cierreMs = new Date(ultimaCerrada.horaCierre).getTime();
      movimientosCajaReal = todosVigentes.filter((m) => new Date(m.fecha).getTime() > cierreMs);
    }

    let efectivoNeto = 0;
    let digitalNeto = 0;
    for (const m of movimientosCajaReal) {
      const signo = m.tipo === 'ingreso' ? 1 : -1;
      if (m.metodo === 'efectivo') {
        efectivoNeto += signo * m.monto;
      } else {
        digitalNeto += signo * m.monto;
      }
    }

    const efectivoDisponible = saldoInicialEfectivo + efectivoNeto;
    const saldoDigitalDisponible = saldoInicialDigital + digitalNeto;
    const saldoCajaTotal = efectivoDisponible + saldoDigitalDisponible;

    // Saldos pendientes de clientes (informativo, nunca contado como ingreso)
    const saldosPorCobrarClientes = this.getPedidos()
      .filter((p) => p.estadoGeneral !== 'cancelado')
      .reduce((acc, p) => acc + (p.saldoPendiente || 0), 0);

    return {
      movimientosFiltrados,
      resumen: {
        ingresosPeriodo,
        egresosPeriodo,
        balanceNetoPeriodo: ingresosPeriodo - egresosPeriodo,
        cantidadIngresos,
        cantidadEgresos,
        saldoInicialEfectivo,
        saldoInicialDigital,
        efectivoDisponible,
        saldoDigitalDisponible,
        saldoCajaTotal,
        saldosPorCobrarClientes,
        desgloseMetodos,
        desgloseEgresosCategoria,
        sesionActiva,
      },
    };
  }

  // --- CONFIGURACIÓN DEL SISTEMA ---

  public getConfiguracion(): ConfiguracionSistema {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CONFIGURACION);
      if (!raw) {
        localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(CONFIGURACION_DEFAULT));
        return { ...CONFIGURACION_DEFAULT };
      }
      return { ...CONFIGURACION_DEFAULT, ...JSON.parse(raw) };
    } catch {
      return { ...CONFIGURACION_DEFAULT };
    }
  }

  public saveConfiguracion(cambios: Partial<ConfiguracionSistema>): ConfiguracionSistema {
    const actual = this.getConfiguracion();
    const actualizada: ConfiguracionSistema = {
      ...actual,
      ...cambios,
      fechaUltimaModificacion: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(actualizada));
    this.notify();
    return actualizada;
  }

  // --- COPIAS DE SEGURIDAD (BACKUP Y RESTAURACIÓN) ---

  public exportarBackup(): BackupPackage {
    const clientes = this.getClientes();
    const pedidos = this.getPedidos();
    const configuracion = this.getConfiguracion();
    const movimientosCaja = this.getMovimientosCajaManuales();
    const sesionesCaja = this.getSesionesCaja();

    let totalPrendas = 0;
    let totalPagos = 0;
    let importeTotalHistorico = 0;

    for (const ped of pedidos) {
      totalPrendas += ped.prendas?.length || 0;
      totalPagos += ped.pagos?.length || 0;
      importeTotalHistorico += ped.total || 0;
    }

    const metadata: BackupMetadata = {
      sistema: 'Lavadero eLeGe',
      versionApp: '1.4.0',
      versionEsquema: 2,
      fechaGeneracion: new Date().toISOString(),
      totalClientes: clientes.length,
      totalPedidos: pedidos.length,
      totalPrendas,
      totalPagos,
      importeTotalHistorico,
      totalMovimientosCaja: movimientosCaja.length,
      totalSesionesCaja: sesionesCaja.length,
    };

    return {
      metadata,
      clientes,
      pedidos,
      configuracion,
      movimientosCaja,
      sesionesCaja,
    };
  }

  public validarBackup(contenido: string | unknown): BackupValidationResult {
    const errores: string[] = [];
    const advertencias: string[] = [];

    let parsed: any;
    if (typeof contenido === 'string') {
      try {
        parsed = JSON.parse(contenido);
      } catch (err: any) {
        return {
          esValido: false,
          errores: [`El archivo no contiene un formato JSON válido: ${err.message}`],
          advertencias: [],
        };
      }
    } else {
      parsed = contenido;
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        esValido: false,
        errores: ['El archivo está vacío o no representa un objeto válido de copia de seguridad.'],
        advertencias: [],
      };
    }

    // 1. Verificación de Metadata y Firma
    if (!parsed.metadata) {
      advertencias.push('El archivo no contiene metadatos formales de respaldo. Se intentará reconstrucción.');
    } else {
      if (parsed.metadata.versionEsquema && parsed.metadata.versionEsquema > 1) {
        advertencias.push(`El respaldo proviene de un esquema superior (${parsed.metadata.versionEsquema}). Se procesará con compatibilidad.`);
      }
    }

    // 2. Validación de Clientes
    if (!Array.isArray(parsed.clientes)) {
      errores.push('El archivo no contiene una lista válida de clientes ("clientes" debe ser un arreglo).');
    }

    // 3. Validación de Pedidos
    if (!Array.isArray(parsed.pedidos)) {
      errores.push('El archivo no contiene una lista válida de pedidos ("pedidos" debe ser un arreglo).');
    }

    if (errores.length > 0) {
      return { esValido: false, errores, advertencias };
    }

    // Inspección profunda de integridad
    const clientesMap = new Map<string, Cliente>();
    const clientesValidados: Cliente[] = [];

    parsed.clientes.forEach((c: any, idx: number) => {
      if (!c.id || typeof c.id !== 'string') {
        c.id = `CLI-${100 + idx}`;
        advertencias.push(`Cliente en posición #${idx + 1} no tenía ID válido. Asignado ${c.id}.`);
      }
      if (!c.nombre || typeof c.nombre !== 'string') {
        errores.push(`El cliente ${c.id} carece de nombre obligatorio.`);
      }
      if (!c.telefono || typeof c.telefono !== 'string') {
        errores.push(`El cliente ${c.id} carece de número telefónico obligatorio.`);
      }

      // Asegurar QR payload
      if (!c.qrPayload) {
        c.qrPayload = codificarQRCliente(c.id);
      }
      if (!c.fechaAlta) {
        c.fechaAlta = new Date().toISOString();
      }

      clientesMap.set(c.id, c);
      clientesValidados.push(c);
    });

    let totalPrendas = 0;
    let totalPagos = 0;
    let importeTotal = 0;
    const pedidosValidados: Pedido[] = [];

    parsed.pedidos.forEach((p: any, idx: number) => {
      if (!p.id || typeof p.id !== 'string') {
        errores.push(`El pedido en posición #${idx + 1} no tiene un ID válido.`);
        return;
      }
      if (!p.codigoVisible) {
        p.codigoVisible = `#${p.id.replace('PED-', '')}`;
      }
      if (!p.clienteId) {
        errores.push(`El pedido ${p.id} no posee clienteId asociado.`);
        return;
      }

      // Verificación de referencia huérfana
      if (!clientesMap.has(p.clienteId)) {
        advertencias.push(`El pedido ${p.id} referencia a un cliente inexistente (${p.clienteId}). Se creará un registro recuperado para evitar referencias rotas.`);
        const clienteRecuperado: Cliente = {
          id: p.clienteId,
          nombre: `Cliente Recuperado (${p.clienteId})`,
          telefono: '00000000',
          observaciones: 'Cliente autogenerado para preservar integridad de pedidos en restauración',
          fechaAlta: p.fechaRecepcion || new Date().toISOString(),
          qrPayload: codificarQRCliente(p.clienteId),
        };
        clientesMap.set(p.clienteId, clienteRecuperado);
        clientesValidados.push(clienteRecuperado);
      }

      // Asegurar prendas
      if (!Array.isArray(p.prendas)) {
        p.prendas = [];
        advertencias.push(`El pedido ${p.id} no tenía lista de prendas. Se inicializó vacía.`);
      }

      p.prendas.forEach((prn: any, prnIdx: number) => {
        if (!prn.id) prn.id = `PRN-${p.id.replace('PED-', '')}-${prnIdx + 1}`;
        if (!prn.tipo) prn.tipo = 'Prenda general';
        if (typeof prn.precio !== 'number') prn.precio = 0;
        if (!prn.qrPayload) prn.qrPayload = codificarQRPrenda(prn.id, p.id, p.clienteId);
        if (!prn.estado) prn.estado = 'recibido';
        totalPrendas++;
      });

      // Asegurar pagos
      if (!Array.isArray(p.pagos)) {
        p.pagos = [];
      }
      p.pagos.forEach((pago: any) => {
        if (typeof pago.monto !== 'number') pago.monto = 0;
        totalPagos++;
      });

      // Recalcular consistencia numérica
      const totalPrendasPrecio = p.prendas.reduce((acc: number, pr: Prenda) => acc + (pr.precio || 0), 0);
      p.total = typeof p.total === 'number' && p.total > 0 ? p.total : totalPrendasPrecio;
      importeTotal += p.total;

      const totalAbonado = p.pagos.reduce((acc: number, pag: Pago) => acc + (pag.monto || 0), 0);
      p.saldoPendiente = Math.max(0, p.total - totalAbonado);
      p.estadoPago = p.saldoPendiente === 0 ? 'pagado' : totalAbonado > 0 ? 'parcial' : 'pendiente';

      if (!p.qrPayload) {
        p.qrPayload = codificarQRPedido(p.id);
      }
      if (!p.avisosWhatsApp) {
        p.avisosWhatsApp = [];
      }

      pedidosValidados.push(p);
    });

    if (errores.length > 0) {
      return { esValido: false, errores, advertencias };
    }

    const configuracionValida: ConfiguracionSistema = {
      ...CONFIGURACION_DEFAULT,
      ...(parsed.configuracion || {}),
    };

    const movimientosCajaValidos: MovimientoCaja[] = Array.isArray(parsed.movimientosCaja)
      ? parsed.movimientosCaja.filter((m: any) => m && typeof m.id === 'string' && typeof m.monto === 'number')
      : [];
    const sesionesCajaValidas: SesionCaja[] = Array.isArray(parsed.sesionesCaja)
      ? parsed.sesionesCaja.filter((s: any) => s && typeof s.id === 'string')
      : [];

    const packageSanitizado: BackupPackage = {
      metadata: {
        sistema: parsed.metadata?.sistema || 'Lavadero eLeGe',
        versionApp: parsed.metadata?.versionApp || '1.4.0',
        versionEsquema: parsed.metadata?.versionEsquema || 2,
        fechaGeneracion: parsed.metadata?.fechaGeneracion || new Date().toISOString(),
        totalClientes: clientesValidados.length,
        totalPedidos: pedidosValidados.length,
        totalPrendas,
        totalPagos,
        importeTotalHistorico: importeTotal,
        totalMovimientosCaja: movimientosCajaValidos.length,
        totalSesionesCaja: sesionesCajaValidas.length,
      },
      clientes: clientesValidados,
      pedidos: pedidosValidados,
      configuracion: configuracionValida,
      movimientosCaja: movimientosCajaValidos,
      sesionesCaja: sesionesCajaValidas,
    };

    return {
      esValido: true,
      errores: [],
      advertencias,
      resumen: {
        fecha: packageSanitizado.metadata.fechaGeneracion,
        totalClientes: packageSanitizado.metadata.totalClientes,
        totalPedidos: packageSanitizado.metadata.totalPedidos,
        totalPrendas,
        totalPagos,
        importeTotal,
        versionEsquema: packageSanitizado.metadata.versionEsquema,
        totalMovimientosCaja: movimientosCajaValidos.length,
      },
      backupPackage: packageSanitizado,
    };
  }

  public crearSnapshotSeguridad(): BackupPackage {
    const snapshot = this.exportarBackup();
    try {
      localStorage.setItem(STORAGE_KEYS.SAFETY_SNAPSHOT, JSON.stringify(snapshot));
    } catch (err) {
      console.error('Error al guardar snapshot previo de seguridad:', err);
    }
    return snapshot;
  }

  public obtenerSnapshotSeguridad(): BackupPackage | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SAFETY_SNAPSHOT);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public restaurarSnapshotSeguridad(): { exito: boolean; mensaje: string } {
    const snapshot = this.obtenerSnapshotSeguridad();
    if (!snapshot) {
      return { exito: false, mensaje: 'No existe un respaldo de seguridad previo guardado en este equipo.' };
    }
    return this.restaurarBackup(snapshot, false);
  }

  public restaurarBackup(
    backupPackage: BackupPackage,
    crearRespaldoPrevio: boolean = true
  ): { exito: boolean; mensaje: string; snapshotCreado?: BackupPackage } {
    let snapshotCreado: BackupPackage | undefined;
    if (crearRespaldoPrevio) {
      snapshotCreado = this.crearSnapshotSeguridad();
    }

    const validation = this.validarBackup(backupPackage);
    if (!validation.esValido || !validation.backupPackage) {
      return {
        exito: false,
        mensaje: `No se pudo restaurar el respaldo: ${validation.errores.join(' ')}`,
      };
    }

    try {
      const sanitized = validation.backupPackage;
      localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(sanitized.clientes));
      localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify(sanitized.pedidos));
      localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(sanitized.configuracion));
      if (sanitized.movimientosCaja) {
        localStorage.setItem(STORAGE_KEYS.MOVIMIENTOS_CAJA, JSON.stringify(sanitized.movimientosCaja));
      }
      if (sanitized.sesionesCaja) {
        localStorage.setItem(STORAGE_KEYS.SESIONES_CAJA, JSON.stringify(sanitized.sesionesCaja));
      }
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');

      this.notify();

      return {
        exito: true,
        mensaje: `Se restauraron exitosamente ${sanitized.clientes.length} clientes, ${sanitized.pedidos.length} pedidos y sus configuraciones.`,
        snapshotCreado,
      };
    } catch (err: any) {
      console.error('Error restaurando backup en localStorage:', err);
      return {
        exito: false,
        mensaje: `Error al escribir los datos restaurados en el almacenamiento local: ${err.message}`,
      };
    }
  }

  // --- REINICIAR Y RESPALDO ---

  public resetearDatos(): void {
    localStorage.removeItem(STORAGE_KEYS.CLIENTES);
    localStorage.removeItem(STORAGE_KEYS.PEDIDOS);
    localStorage.removeItem(STORAGE_KEYS.MOVIMIENTOS_CAJA);
    localStorage.removeItem(STORAGE_KEYS.SESIONES_CAJA);
    localStorage.removeItem(STORAGE_KEYS.CAJA_PAGOS_HISTORIAL);
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
    this.initIfEmpty();
    this.notify();
  }
}

export const storage = new StorageService();
