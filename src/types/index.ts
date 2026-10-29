/**
 * Modelos de datos para el sistema de gestión Lavadero eLeGe
 */

export type EstadoPrenda = 'recibido' | 'en_proceso' | 'listo' | 'entregado';

export type EstadoPedido = 'recibido' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado';

export type EstadoPago = 'pendiente' | 'parcial' | 'pagado';

export type MetodoPago = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'otro';

export type TipoServicio = 
  | 'lavado_planchado'
  | 'solo_lavado'
  | 'solo_planchado'
  | 'tintoreria'
  | 'desmanchado_especial'
  | 'acolchados_frazadas'
  | 'cortinas'
  | 'valet_express';

export type ClasificacionCliente = 'nuevo' | 'ocasional' | 'frecuente';

export interface Prenda {
  id: string; // ej: "PRN-2401-1"
  pedidoId: string;
  clienteId: string;
  tipo: string; // ej: "Camisa", "Pantalón", "Acolchado 2 plazas", "Traje 2 piezas"
  descripcion: string; // Color, marca, detalles (ej: "Azul marino talle L, Zara")
  servicio: TipoServicio;
  precio: number;
  observaciones?: string; // Manchas preexistentes, botones faltantes, roturas
  estado: EstadoPrenda;
  qrPayload: string; // Payload codificado en el QR de la prenda
  fechaActualizacion?: string;
}

export interface Pago {
  id: string; // ej: "PAG-1001"
  pedidoId: string;
  clienteId: string;
  fecha: string; // ISO string
  monto: number;
  metodo: MetodoPago;
  nota?: string;
  esSenia?: boolean;
}

export interface RegistroAvisoWhatsApp {
  fecha: string; // ISO string
  prendaId?: string;
  pedidoId: string;
  clienteId: string;
  telefono: string;
  mensaje: string;
}

export interface Pedido {
  id: string; // ej: "PED-2401"
  codigoVisible: string; // "#2401"
  clienteId: string;
  fechaRecepcion: string; // ISO string
  fechaEstimadaEntrega: string; // YYYY-MM-DD
  prendas: Prenda[];
  total: number;
  saldoPendiente: number;
  estadoPago: EstadoPago;
  estadoGeneral: EstadoPedido;
  observacionesGenerales?: string;
  pagos: Pago[];
  avisosWhatsApp: RegistroAvisoWhatsApp[];
  qrPayload: string;
  fechaEntregaEfectiva?: string;
}

export interface Cliente {
  id: string; // ej: "CLI-101"
  nombre: string;
  apellido?: string; // Opcional para alta rápida
  telefono: string;
  observaciones?: string;
  fechaAlta: string; // ISO string
  qrPayload: string; // Identificador QR permanente
  activo?: boolean; // Estado de actividad (desactivación lógica)
}

export interface ResumenClienteMetricas {
  totalPedidos: number;
  totalGastado: number;
  saldoDeuda: number;
  ultimoPedidoFecha?: string;
  prendasEnLavadero: number;
  pedidosActivos: number;
  prendasActivasListas: number;
  clasificacion: ClasificacionCliente;
}

export interface ResumenKPIs {
  pedidosHoy: number;
  prendasEnProceso: number;
  prendasListas: number;
  prendasEntregadasHoy: number;
  ingresosHoy: number;
  ingresosMes: number;
  totalSaldoPorCobrar: number;
  pedidosPendientesRetiro: number;
}

export interface ConfiguracionSistema {
  nombreComercio: string;
  telefono: string;
  direccion: string;
  lemaOTicketPie: string;
  formatoTicketDefecto: '80mm' | '58mm';
  monedaSimbolo: string;
  diasEstimadosEntregaDefecto: number;
  notificarWhatsAppAuto: boolean;
  fechaUltimaModificacion?: string;
}

export interface BackupMetadata {
  sistema: string;
  versionApp: string;
  versionEsquema: number;
  fechaGeneracion: string;
  totalClientes: number;
  totalPedidos: number;
  totalPrendas: number;
  totalPagos: number;
  importeTotalHistorico: number;
}

export interface BackupPackage {
  metadata: BackupMetadata;
  clientes: Cliente[];
  pedidos: Pedido[];
  configuracion: ConfiguracionSistema;
}

export interface BackupValidationResult {
  esValido: boolean;
  errores: string[];
  advertencias: string[];
  resumen?: {
    fecha: string;
    totalClientes: number;
    totalPedidos: number;
    totalPrendas: number;
    totalPagos: number;
    importeTotal: number;
    versionEsquema: number;
  };
  backupPackage?: BackupPackage;
}

