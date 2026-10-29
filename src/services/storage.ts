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
} from '../types';
import { codificarQRCliente, codificarQRPedido, codificarQRPrenda } from '../utils/qr';
import { normalizarTelefonoWhatsApp } from '../utils/formatters';

const STORAGE_KEYS = {
  CLIENTES: 'elege_clientes_v1',
  PEDIDOS: 'elege_pedidos_v1',
  CONFIGURACION: 'elege_configuracion_v1',
  INITIALIZED: 'elege_initialized_v1',
  SAFETY_SNAPSHOT: 'elege_safety_snapshot_pre_restore',
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


// Datos iniciales de demostración reales y coherentes
const CLIENTES_INICIALES: Cliente[] = [
  {
    id: 'CLI-101',
    nombre: 'Martín',
    apellido: 'Soria',
    telefono: '11 4589-2234',
    observaciones: 'Cliente habitual. Cuidado extra con camisas de lino.',
    fechaAlta: new Date(Date.now() - 30 * 86400000).toISOString(),
    qrPayload: codificarQRCliente('CLI-101'),
  },
  {
    id: 'CLI-102',
    nombre: 'Florencia',
    apellido: 'Gómez',
    telefono: '11 6784-9012',
    observaciones: 'Retira siempre después de las 18:00 hs.',
    fechaAlta: new Date(Date.now() - 15 * 86400000).toISOString(),
    qrPayload: codificarQRCliente('CLI-102'),
  },
  {
    id: 'CLI-103',
    nombre: 'Agustín',
    apellido: 'Rossi',
    telefono: '11 3412-8877',
    observaciones: 'Pago siempre con transferencia.',
    fechaAlta: new Date(Date.now() - 7 * 86400000).toISOString(),
    qrPayload: codificarQRCliente('CLI-103'),
  },
  {
    id: 'CLI-104',
    nombre: 'Valentina',
    apellido: 'Vázquez',
    telefono: '11 5566-3344',
    observaciones: 'Solicita perfume suave en las prendas.',
    fechaAlta: new Date(Date.now() - 3 * 86400000).toISOString(),
    qrPayload: codificarQRCliente('CLI-104'),
  },
];

function crearDatosIniciales(): { clientes: Cliente[]; pedidos: Pedido[] } {
  const hoy = new Date();
  const fechaHoyStr = hoy.toISOString();
  
  const fechaEstimada1 = new Date(hoy.getTime() + 86400000).toISOString().split('T')[0];
  const fechaEstimada2 = new Date(hoy.getTime() + 2 * 86400000).toISOString().split('T')[0];
  const fechaEstimadaAyer = new Date(hoy.getTime() - 86400000).toISOString().split('T')[0];

  const pedidos: Pedido[] = [
    // Pedido 1: Listo para retirar, tiene saldo adeudado
    {
      id: 'PED-2401',
      codigoVisible: '#2401',
      clienteId: 'CLI-101',
      fechaRecepcion: new Date(hoy.getTime() - 2 * 86400000).toISOString(),
      fechaEstimadaEntrega: fechaEstimadaAyer,
      prendas: [
        {
          id: 'PRN-2401-1',
          pedidoId: 'PED-2401',
          clienteId: 'CLI-101',
          tipo: 'Traje 2 piezas',
          descripcion: 'Gris marengo, saco y pantalón entallado',
          servicio: 'tintoreria',
          precio: 7500,
          observaciones: 'Botón superior del saco flojo',
          estado: 'listo',
          qrPayload: codificarQRPrenda('PRN-2401-1', 'PED-2401', 'CLI-101'),
          fechaActualizacion: new Date(hoy.getTime() - 86400000).toISOString(),
        },
        {
          id: 'PRN-2401-2',
          pedidoId: 'PED-2401',
          clienteId: 'CLI-101',
          tipo: 'Camisa de vestir',
          descripcion: 'Blanca cuello italiano, talle 41',
          servicio: 'lavado_planchado',
          precio: 4800,
          observaciones: 'Mancha leve de café en puño derecho tratada',
          estado: 'listo',
          qrPayload: codificarQRPrenda('PRN-2401-2', 'PED-2401', 'CLI-101'),
          fechaActualizacion: new Date(hoy.getTime() - 86400000).toISOString(),
        },
      ],
      total: 12300,
      saldoPendiente: 6300,
      estadoPago: 'parcial',
      estadoGeneral: 'listo',
      observacionesGenerales: 'Prendas con funda protectora.',
      pagos: [
        {
          id: 'PAG-1001',
          pedidoId: 'PED-2401',
          clienteId: 'CLI-101',
          fecha: new Date(hoy.getTime() - 2 * 86400000).toISOString(),
          monto: 6000,
          metodo: 'efectivo',
          nota: 'Seña inicial en mostrador',
          esSenia: true,
        },
      ],
      avisosWhatsApp: [],
      qrPayload: codificarQRPedido('PED-2401'),
    },

    // Pedido 2: Mixto (1 prenda lista, 1 prenda en proceso)
    {
      id: 'PED-2402',
      codigoVisible: '#2402',
      clienteId: 'CLI-102',
      fechaRecepcion: new Date(hoy.getTime() - 1 * 86400000).toISOString(),
      fechaEstimadaEntrega: fechaEstimada1,
      prendas: [
        {
          id: 'PRN-2402-1',
          pedidoId: 'PED-2402',
          clienteId: 'CLI-102',
          tipo: 'Acolchado 2 plazas',
          descripcion: 'Estampado nórdico plumas reversible',
          servicio: 'acolchados_frazadas',
          precio: 9500,
          observaciones: 'Etiqueta original desgastada',
          estado: 'listo',
          qrPayload: codificarQRPrenda('PRN-2402-1', 'PED-2402', 'CLI-102'),
          fechaActualizacion: new Date().toISOString(),
        },
        {
          id: 'PRN-2402-2',
          pedidoId: 'PED-2402',
          clienteId: 'CLI-102',
          tipo: 'Cortinas dobles',
          descripcion: 'Voile blanco 2 paños de 2.20m',
          servicio: 'cortinas',
          precio: 6200,
          observaciones: 'Dobladillo descosido en un extremo',
          estado: 'en_proceso',
          qrPayload: codificarQRPrenda('PRN-2402-2', 'PED-2402', 'CLI-102'),
          fechaActualizacion: new Date().toISOString(),
        },
      ],
      total: 15700,
      saldoPendiente: 15700,
      estadoPago: 'pendiente',
      estadoGeneral: 'en_proceso',
      observacionesGenerales: 'Avisar cuando ambas estén listas.',
      pagos: [],
      avisosWhatsApp: [],
      qrPayload: codificarQRPedido('PED-2402'),
    },

    // Pedido 3: Recibido hoy temprano, pagado por adelantado
    {
      id: 'PED-2403',
      codigoVisible: '#2403',
      clienteId: 'CLI-103',
      fechaRecepcion: fechaHoyStr,
      fechaEstimadaEntrega: fechaEstimada2,
      prendas: [
        {
          id: 'PRN-2403-1',
          pedidoId: 'PED-2403',
          clienteId: 'CLI-103',
          tipo: 'Pantalón de vestir',
          descripcion: 'Gris oscuro franela talle 44',
          servicio: 'solo_planchado',
          precio: 2600,
          estado: 'recibido',
          qrPayload: codificarQRPrenda('PRN-2403-1', 'PED-2403', 'CLI-103'),
          fechaActualizacion: fechaHoyStr,
        },
        {
          id: 'PRN-2403-2',
          pedidoId: 'PED-2403',
          clienteId: 'CLI-103',
          tipo: 'Camperón de plumas',
          descripcion: 'Negro con capucha desmontable Columbia',
          servicio: 'desmanchado_especial',
          precio: 5900,
          observaciones: 'Mancha de grasa en bolsillo frontal',
          estado: 'recibido',
          qrPayload: codificarQRPrenda('PRN-2403-2', 'PED-2403', 'CLI-103'),
          fechaActualizacion: fechaHoyStr,
        },
      ],
      total: 8500,
      saldoPendiente: 0,
      estadoPago: 'pagado',
      estadoGeneral: 'recibido',
      observacionesGenerales: 'Abonó total por adelantado.',
      pagos: [
        {
          id: 'PAG-1002',
          pedidoId: 'PED-2403',
          clienteId: 'CLI-103',
          fecha: fechaHoyStr,
          monto: 8500,
          metodo: 'transferencia',
          nota: 'Comprobante #99482',
          esSenia: false,
        },
      ],
      avisosWhatsApp: [],
      qrPayload: codificarQRPedido('PED-2403'),
    },

    // Pedido 4: Entregado y pagado
    {
      id: 'PED-2400',
      codigoVisible: '#2400',
      clienteId: 'CLI-104',
      fechaRecepcion: new Date(hoy.getTime() - 4 * 86400000).toISOString(),
      fechaEstimadaEntrega: fechaEstimadaAyer,
      prendas: [
        {
          id: 'PRN-2400-1',
          pedidoId: 'PED-2400',
          clienteId: 'CLI-104',
          tipo: 'Vestido de fiesta',
          descripcion: 'Verde esmeralda satén largo',
          servicio: 'tintoreria',
          precio: 7500,
          estado: 'entregado',
          qrPayload: codificarQRPrenda('PRN-2400-1', 'PED-2400', 'CLI-104'),
          fechaActualizacion: new Date(hoy.getTime() - 86400000).toISOString(),
        },
      ],
      total: 7500,
      saldoPendiente: 0,
      estadoPago: 'pagado',
      estadoGeneral: 'entregado',
      fechaEntregaEfectiva: new Date(hoy.getTime() - 86400000).toISOString(),
      pagos: [
        {
          id: 'PAG-1000',
          pedidoId: 'PED-2400',
          clienteId: 'CLI-104',
          fecha: new Date(hoy.getTime() - 4 * 86400000).toISOString(),
          monto: 7500,
          metodo: 'debito',
          nota: 'Cobrado con terminal posnet',
          esSenia: false,
        },
      ],
      avisosWhatsApp: [
        {
          fecha: new Date(hoy.getTime() - 2 * 86400000).toISOString(),
          pedidoId: 'PED-2400',
          clienteId: 'CLI-104',
          telefono: '11 5566-3344',
          mensaje: 'Aviso de retiro enviado por WhatsApp',
        },
      ],
      qrPayload: codificarQRPedido('PED-2400'),
    },
  ];

  return { clientes: CLIENTES_INICIALES, pedidos };
}

class StorageService {
  private listeners: Array<() => void> = [];

  constructor() {
    this.initIfEmpty();
  }

  private initIfEmpty(): void {
    try {
      const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!initialized) {
        const { clientes, pedidos } = crearDatosIniciales();
        localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(clientes));
        localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify(pedidos));
        localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(CONFIGURACION_DEFAULT));
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
      } else if (!localStorage.getItem(STORAGE_KEYS.CONFIGURACION)) {
        localStorage.setItem(STORAGE_KEYS.CONFIGURACION, JSON.stringify(CONFIGURACION_DEFAULT));
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

    // Recalcular totales contables
    pedido.total = pedido.prendas.reduce((acc, p) => acc + p.precio, 0);
    const totalPagado = pedido.pagos.reduce((acc, p) => acc + p.monto, 0);
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

    if (montoLimpio <= 0) {
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
      id: `PAG-${ahoraMs.toString().slice(-6)}`,
      pedidoId: pedido.id,
      clienteId: pedido.clienteId,
      fecha: new Date().toISOString(),
      monto: montoLimpio,
      metodo: pagoData.metodo,
      nota: pagoData.nota,
      esSenia: pagoData.esSenia,
    };

    pedido.pagos.push(nuevoPago);

    const totalPagado = pedido.pagos.reduce((acc, p) => acc + p.monto, 0);
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
    const hoyStr = ahora.toISOString().split('T')[0];

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

      if (pedido.fechaRecepcion.startsWith(hoyStr)) {
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
          prenda.fechaActualizacion.startsWith(hoyStr)
        ) {
          prendasEntregadasHoy++;
        }
      }

      // Pagos
      for (const pago of pedido.pagos) {
        if (pago.fecha.startsWith(hoyStr)) {
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
        pagos.push({
          ...pago,
          clienteNombre: clienteMap.get(pedido.clienteId) || 'Cliente no encontrado',
          codigoPedido: pedido.codigoVisible,
        });
      }
    }

    return pagos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
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
      versionApp: '1.3.0',
      versionEsquema: 1,
      fechaGeneracion: new Date().toISOString(),
      totalClientes: clientes.length,
      totalPedidos: pedidos.length,
      totalPrendas,
      totalPagos,
      importeTotalHistorico,
    };

    return {
      metadata,
      clientes,
      pedidos,
      configuracion,
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

    const packageSanitizado: BackupPackage = {
      metadata: {
        sistema: parsed.metadata?.sistema || 'Lavadero eLeGe',
        versionApp: parsed.metadata?.versionApp || '1.3.0',
        versionEsquema: parsed.metadata?.versionEsquema || 1,
        fechaGeneracion: parsed.metadata?.fechaGeneracion || new Date().toISOString(),
        totalClientes: clientesValidados.length,
        totalPedidos: pedidosValidados.length,
        totalPrendas,
        totalPagos,
        importeTotalHistorico: importeTotal,
      },
      clientes: clientesValidados,
      pedidos: pedidosValidados,
      configuracion: configuracionValida,
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
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
    this.initIfEmpty();
    this.notify();
  }
}

export const storage = new StorageService();
