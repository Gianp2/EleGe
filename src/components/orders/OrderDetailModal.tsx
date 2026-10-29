import React, { useState, useEffect } from 'react';
import {
  Shirt,
  User,
  Printer,
  MessageCircle,
  AlertTriangle,
  Plus,
  DollarSign,
  ExternalLink,
  Calendar,
  Save,
  Trash2,
} from 'lucide-react';
import { Pedido, Prenda, Cliente, EstadoPrenda, MetodoPago, TipoServicio } from '../../types';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import {
  formatMoneda,
  formatFechaCorta,
  formatFechaHora,
  SERVICIOS_INFO,
  METODO_PAGO_LABELS,
  generarEnlaceWhatsApp,
} from '../../utils/formatters';
import { storage } from '../../services/storage';

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onOpenTicket: (pedido: Pedido, prendaParaEtiqueta?: Prenda) => void;
  onOpenClient: (cliente: Cliente) => void;
  onOpenPrendaDetail: (prendaId: string) => void;
  onOrderDeleted?: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  pedido: pedidoInicial,
  onOpenTicket,
  onOpenClient,
  onOpenPrendaDetail,
  onOrderDeleted,
}) => {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  // Registro de pago parcial / total
  const [mostrarFormPago, setMostrarFormPago] = useState(false);
  const [montoPago, setMontoPago] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [notaPago, setNotaPago] = useState<string>('');
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [procesandoPago, setProcesandoPago] = useState(false);

  // Advertencia de entrega con saldo pendiente
  const [alertaEntregaPendiente, setAlertaEntregaPendiente] = useState<{
    mostrar: boolean;
    prendaId?: string;
    esTodoElPedido?: boolean;
  }>({ mostrar: false });

  // Agregar prenda a pedido existente
  const [mostrarFormAgregarPrenda, setMostrarFormAgregarPrenda] = useState(false);
  const [nuevoTipoPrenda, setNuevoTipoPrenda] = useState('');
  const [nuevaDescPrenda, setNuevaDescPrenda] = useState('');
  const [nuevoServicioPrenda, setNuevoServicioPrenda] = useState<TipoServicio>('lavado_planchado');
  const [nuevoPrecioPrenda, setNuevoPrecioPrenda] = useState(SERVICIOS_INFO['lavado_planchado'].precioSugerido);
  const [nuevasObsPrenda, setNuevasObsPrenda] = useState('');

  // Edición de fecha estimada
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [nuevaFechaEstimada, setNuevaFechaEstimada] = useState('');

  // Confirmar eliminación
  const [mostrarConfirmarEliminar, setMostrarConfirmarEliminar] = useState(false);

  const refrescar = () => {
    if (!pedidoInicial) return;
    const actualizado = storage.getPedidoById(pedidoInicial.id);
    if (actualizado) {
      setPedido({ ...actualizado });
      setCliente(storage.getClienteById(actualizado.clienteId) || null);
      setMontoPago(actualizado.saldoPendiente);
      setNuevaFechaEstimada(actualizado.fechaEstimadaEntrega);
    }
  };

  useEffect(() => {
    if (isOpen && pedidoInicial) {
      refrescar();
      setMostrarFormPago(false);
      setMostrarFormAgregarPrenda(false);
      setEditandoFecha(false);
      setAlertaEntregaPendiente({ mostrar: false });
      setMostrarConfirmarEliminar(false);
      setErrorPago(null);
    }
  }, [isOpen, pedidoInicial]);

  if (!isOpen || !pedido) return null;

  // Cambiar estado de una prenda individual
  const handleCambiarEstadoPrenda = (prenda: Prenda, nuevoEstado: EstadoPrenda) => {
    if (nuevoEstado === 'entregado' && pedido.saldoPendiente > 0) {
      setAlertaEntregaPendiente({
        mostrar: true,
        prendaId: prenda.id,
        esTodoElPedido: false,
      });
      return;
    }

    storage.actualizarEstadoPrenda(prenda.id, nuevoEstado);
    refrescar();
  };

  // Cambiar todas las prendas a un estado
  const handleCambiarTodoEstado = (nuevoEstado: EstadoPrenda) => {
    if (nuevoEstado === 'entregado' && pedido.saldoPendiente > 0) {
      setAlertaEntregaPendiente({
        mostrar: true,
        esTodoElPedido: true,
      });
      return;
    }

    pedido.prendas.forEach((p) => {
      storage.actualizarEstadoPrenda(p.id, nuevoEstado);
    });
    refrescar();
  };

  // Registrar cobro
  const handleRegistrarPago = (e: React.FormEvent) => {
    e.preventDefault();
    if (procesandoPago) return;

    setErrorPago(null);
    setProcesandoPago(true);

    const resultado = storage.registrarPago({
      pedidoId: pedido.id,
      monto: montoPago,
      metodo: metodoPago,
      nota: notaPago.trim() || undefined,
    });

    setProcesandoPago(false);

    if (!resultado.ok) {
      setErrorPago(resultado.error || 'Error al registrar el pago');
      return;
    }

    setMostrarFormPago(false);
    setNotaPago('');
    refrescar();
  };

  // Cobrar saldo adeudado y entregar
  const handleCobrarYEntregar = () => {
    if (montoPago > 0 && pedido.saldoPendiente > 0) {
      storage.registrarPago({
        pedidoId: pedido.id,
        monto: montoPago,
        metodo: metodoPago,
        nota: 'Cobro de saldo al momento de la entrega',
      });
    }

    if (alertaEntregaPendiente.esTodoElPedido) {
      pedido.prendas.forEach((p) => {
        storage.actualizarEstadoPrenda(p.id, 'entregado');
      });
    } else if (alertaEntregaPendiente.prendaId) {
      storage.actualizarEstadoPrenda(alertaEntregaPendiente.prendaId, 'entregado');
    }

    setAlertaEntregaPendiente({ mostrar: false });
    refrescar();
  };

  // Agregar prenda al pedido existente
  const handleAgregarPrendaExistente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTipoPrenda.trim()) return;

    const res = storage.agregarPrendaAPedido(pedido.id, {
      tipo: nuevoTipoPrenda.trim(),
      descripcion: nuevaDescPrenda.trim(),
      servicio: nuevoServicioPrenda,
      precio: nuevoPrecioPrenda,
      observaciones: nuevasObsPrenda.trim() || undefined,
    });

    if (res.ok) {
      setMostrarFormAgregarPrenda(false);
      setNuevoTipoPrenda('');
      setNuevaDescPrenda('');
      setNuevasObsPrenda('');
      refrescar();
    }
  };

  // Guardar cambio de fecha estimada
  const handleGuardarFecha = () => {
    if (nuevaFechaEstimada && nuevaFechaEstimada !== pedido.fechaEstimadaEntrega) {
      pedido.fechaEstimadaEntrega = nuevaFechaEstimada;
      storage.savePedido(pedido);
      setEditandoFecha(false);
      refrescar();
    } else {
      setEditandoFecha(false);
    }
  };

  // Eliminar pedido
  const handleEliminarPedido = () => {
    storage.deletePedido(pedido.id);
    onClose();
    if (onOrderDeleted) onOrderDeleted();
  };

  // Avisar por WhatsApp
  const handleWhatsApp = () => {
    if (!cliente) return;

    const prendasResumen = pedido.prendas
      .map((p) => `${p.tipo} (${p.descripcion})`)
      .join(', ');

    const { url, mensaje, telefonoNormalizado } = generarEnlaceWhatsApp({
      nombreCliente: `${cliente.nombre} ${cliente.apellido}`,
      telefono: cliente.telefono,
      codigoPedido: pedido.codigoVisible,
      prendasResumen,
      saldoPendiente: pedido.saldoPendiente,
      total: pedido.total,
    });

    storage.registrarAvisoWhatsApp({
      fecha: new Date().toISOString(),
      pedidoId: pedido.id,
      clienteId: cliente.id,
      telefono: telefonoNormalizado,
      mensaje,
    });

    window.open(url, '_blank', 'noopener,noreferrer');
    refrescar();
  };

  const estaListoParaRetirar =
    pedido.estadoGeneral === 'listo' || pedido.prendas.some((p) => p.estado === 'listo');
  const avisos = pedido.avisosWhatsApp || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Pedido ${pedido.codigoVisible}`}
      subtitle={`Ingresó: ${formatFechaHora(pedido.fechaRecepcion)} · Estimada: ${formatFechaCorta(pedido.fechaEstimadaEntrega)}`}
      maxWidth="3xl"
    >
      <div className="space-y-5">
        {/* ENCABEZADO: CLIENTE + ESTADOS + SALDO */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
          {/* Cliente */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">Cliente</span>
            {cliente ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenClient(cliente);
                  }}
                  className="text-sm font-extrabold text-neutral-900 hover:text-amber-800 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {cliente.nombre} {cliente.apellido}
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                </button>
                <div className="text-xs font-mono text-neutral-600 mt-0.5">{cliente.telefono}</div>
              </div>
            ) : (
              <span className="text-xs text-neutral-500">Cliente mostrador</span>
            )}
          </div>

          {/* Estado General y Fecha Estimada */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
              Estado del Pedido
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge tipo="pedido" estado={pedido.estadoGeneral} size="md" />
              <StatusBadge tipo="pago" estado={pedido.estadoPago} size="md" />
            </div>

            <div className="pt-1 flex items-center gap-1.5 text-xs text-neutral-600">
              {editandoFecha ? (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={nuevaFechaEstimada}
                    onChange={(e) => setNuevaFechaEstimada(e.target.value)}
                    className="bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleGuardarFecha}
                    className="p-1 text-emerald-700 hover:text-emerald-900 bg-emerald-50 rounded"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span>Entrega: <strong className="text-neutral-900 font-bold">{formatFechaCorta(pedido.fechaEstimadaEntrega)}</strong></span>
                  <button
                    type="button"
                    onClick={() => setEditandoFecha(true)}
                    className="text-[10px] text-neutral-400 hover:text-neutral-900 hover:underline cursor-pointer"
                  >
                    (Cambiar)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Balance Financiero */}
          <div className="space-y-1 text-left sm:text-right">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
              Saldo Pendiente
            </span>
            <div
              className={`text-2xl font-mono font-extrabold tabular-nums ${
                pedido.saldoPendiente > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatMoneda(pedido.saldoPendiente)}
            </div>
            <div className="text-xs text-neutral-600">
              Total: <span className="font-mono font-bold text-neutral-900">{formatMoneda(pedido.total)}</span>
            </div>
          </div>
        </div>

        {/* ALERTA DE COBRO PREVIO A ENTREGA */}
        {alertaEntregaPendiente.mostrar && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">
                  Advertencia: El pedido tiene un saldo adeudado de {formatMoneda(pedido.saldoPendiente)}
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  ¿Deseás registrar el cobro del saldo pendiente en este momento antes de entregar?
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-200">
              <div>
                <label className="block text-[11px] text-amber-900 font-bold mb-1">
                  Monto a cobrar ahora
                </label>
                <input
                  type="number"
                  min="0"
                  max={pedido.saldoPendiente}
                  value={montoPago}
                  onChange={(e) => setMontoPago(Number(e.target.value))}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs text-neutral-900 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] text-amber-900 font-bold mb-1">
                  Medio de pago
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs text-neutral-900 font-semibold"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="debito">Tarjeta Débito</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAlertaEntregaPendiente({ mostrar: false })}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (alertaEntregaPendiente.esTodoElPedido) {
                    pedido.prendas.forEach((p) => storage.actualizarEstadoPrenda(p.id, 'entregado'));
                  } else if (alertaEntregaPendiente.prendaId) {
                    storage.actualizarEstadoPrenda(alertaEntregaPendiente.prendaId, 'entregado');
                  }
                  setAlertaEntregaPendiente({ mostrar: false });
                  refrescar();
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-xl cursor-pointer"
              >
                Entregar SIN cobrar
              </button>
              <button
                type="button"
                onClick={handleCobrarYEntregar}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs cursor-pointer active:scale-98"
              >
                Cobrar {formatMoneda(montoPago)} y Entregar
              </button>
            </div>
          </div>
        )}

        {/* LISTADO DE PRENDAS CON CONTROL INDIVIDUAL */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
              <Shirt className="w-4 h-4 text-neutral-600" />
              Prendas del Pedido ({pedido.prendas.length})
            </h4>

            {/* Acciones */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setMostrarFormAgregarPrenda(!mostrarFormAgregarPrenda)}
                className="px-2.5 py-1 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Agregar prenda</span>
              </button>

              <button
                type="button"
                onClick={() => handleCambiarTodoEstado('listo')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-bold text-[11px] transition-colors cursor-pointer"
              >
                Todo Listo
              </button>
              <button
                type="button"
                onClick={() => handleCambiarTodoEstado('entregado')}
                className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-800 border border-neutral-300 hover:bg-neutral-200 font-bold text-[11px] transition-colors cursor-pointer"
              >
                Todo Entregado
              </button>
            </div>
          </div>

          {/* Formulario de agregar prenda a pedido existente */}
          {mostrarFormAgregarPrenda && (
            <form
              onSubmit={handleAgregarPrendaExistente}
              className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-300 space-y-3"
            >
              <div className="text-xs font-bold text-neutral-900">
                Agregar prenda adicional al Pedido {pedido.codigoVisible}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Tipo de prenda (ej: Bufanda de lana)"
                  value={nuevoTipoPrenda}
                  onChange={(e) => setNuevoTipoPrenda(e.target.value)}
                  className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900"
                />
                <input
                  type="text"
                  placeholder="Descripción (color, marca)"
                  value={nuevaDescPrenda}
                  onChange={(e) => setNuevaDescPrenda(e.target.value)}
                  className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={nuevoServicioPrenda}
                  onChange={(e) => {
                    const serv = e.target.value as TipoServicio;
                    setNuevoServicioPrenda(serv);
                    setNuevoPrecioPrenda(SERVICIOS_INFO[serv].precioSugerido);
                  }}
                  className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900"
                >
                  {Object.entries(SERVICIOS_INFO).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.label} ({formatMoneda(s.precioSugerido)})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={nuevoPrecioPrenda}
                  onChange={(e) => setNuevoPrecioPrenda(Number(e.target.value))}
                  className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 font-mono font-bold"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarFormAgregarPrenda(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-neutral-900 text-white font-bold text-xs rounded-lg hover:bg-neutral-800"
                >
                  Guardar Prenda
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {pedido.prendas.map((prenda) => (
              <div
                key={prenda.id}
                className="p-3.5 rounded-2xl bg-white border border-neutral-200 shadow-2xs space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenPrendaDetail(prenda.id);
                        }}
                        className="text-xs font-mono font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded-md border border-neutral-200 cursor-pointer"
                        title="Ver ficha individual de esta prenda"
                      >
                        {prenda.id}
                      </button>
                      <span className="text-xs font-bold text-neutral-900">{prenda.tipo}</span>
                      <span className="text-[11px] text-neutral-500 font-medium">
                        · {SERVICIOS_INFO[prenda.servicio]?.label}
                      </span>
                    </div>
                    {prenda.descripcion && (
                      <p className="text-xs text-neutral-600">{prenda.descripcion}</p>
                    )}
                    {prenda.observaciones && (
                      <p className="text-xs text-amber-800 font-medium">
                        Obs: {prenda.observaciones}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-extrabold text-neutral-900 mr-2">
                      {formatMoneda(prenda.precio)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenTicket(pedido, prenda)}
                      className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                      title="Imprimir etiqueta individual de esta prenda"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Selector de estado individual para esta prenda */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-neutral-100">
                  <span className="text-[11px] font-bold text-neutral-500 mr-1">Estado:</span>
                  {(['recibido', 'en_proceso', 'listo', 'entregado'] as EstadoPrenda[]).map((est) => {
                    const isSelected = prenda.estado === est;
                    const labels: Record<EstadoPrenda, string> = {
                      recibido: 'Recibido',
                      en_proceso: 'En Proceso',
                      listo: 'Listo',
                      entregado: 'Entregado',
                    };
                    return (
                      <button
                        key={est}
                        type="button"
                        onClick={() => handleCambiarEstadoPrenda(prenda, est)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg transition-all cursor-pointer font-semibold ${
                          isSelected
                            ? 'bg-neutral-900 text-white font-bold shadow-xs'
                            : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 border border-neutral-200'
                        }`}
                      >
                        {labels[est]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECCIÓN PAGOS Y SEÑAS */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Historial de Pagos y Señas
            </span>

            {pedido.saldoPendiente > 0 && !mostrarFormPago && (
              <button
                type="button"
                onClick={() => {
                  setMontoPago(pedido.saldoPendiente);
                  setMostrarFormPago(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Pago</span>
              </button>
            )}
          </div>

          {/* Formulario de registro de pago */}
          {mostrarFormPago && (
            <form
              onSubmit={handleRegistrarPago}
              className="p-3.5 rounded-xl bg-white border border-neutral-200 space-y-3 shadow-2xs"
            >
              {errorPago && (
                <div className="text-xs text-rose-800 p-2 bg-rose-50 rounded-lg border border-rose-200 font-medium">
                  {errorPago}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Monto a abonar ($)</label>
                  <input
                    type="number"
                    min="1"
                    max={pedido.saldoPendiente}
                    required
                    value={montoPago}
                    onChange={(e) => setMontoPago(Number(e.target.value))}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-1.5 text-xs text-neutral-900 font-mono font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Medio de pago</label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-1.5 text-xs text-neutral-900 outline-none font-medium"
                  >
                    {Object.entries(METODO_PAGO_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Nota / N° Operación</label>
                  <input
                    type="text"
                    value={notaPago}
                    onChange={(e) => setNotaPago(e.target.value)}
                    placeholder="Ej: Transf. Galicia #9921"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-1.5 text-xs text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarFormPago(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesandoPago}
                  className="px-4 py-1.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  Confirmar Cobro de {formatMoneda(montoPago)}
                </button>
              </div>
            </form>
          )}

          {/* Lista de pagos realizados */}
          {pedido.pagos.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">No hay pagos registrados para este pedido.</p>
          ) : (
            <div className="space-y-1.5">
              {pedido.pagos.map((pago) => (
                <div
                  key={pago.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-neutral-200 text-xs shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-emerald-700 font-mono">
                      {formatMoneda(pago.monto)}
                    </span>
                    <span className="text-neutral-600 font-medium">
                      via {METODO_PAGO_LABELS[pago.metodo]}
                    </span>
                    {pago.esSenia && (
                      <span className="text-[10px] text-amber-800 font-bold px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200">
                        Seña inicial
                      </span>
                    )}
                    {pago.nota && (
                      <span className="text-neutral-500 truncate max-w-xs">
                        · {pago.nota}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-neutral-500 text-[11px]">
                    {formatFechaHora(pago.fecha)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECCIÓN WHATSAPP */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-neutral-900">Notificación de Retiro</span>
            </div>
            <p className="text-xs text-neutral-600">
              {avisos.length > 0
                ? `Último aviso iniciado el ${formatFechaHora(avisos[avisos.length - 1].fecha)}.`
                : 'Envía aviso con el detalle de las prendas y saldo a cobrar al retirar.'}
            </p>
          </div>

          <button
            type="button"
            disabled={!cliente}
            onClick={handleWhatsApp}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              estaListoParaRetirar
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-98'
                : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Avisar por WhatsApp</span>
          </button>
        </div>

        {/* DIÁLOGO CONFIRMACIÓN ANULACIÓN */}
        {mostrarConfirmarEliminar && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-2">
            <div className="text-xs font-bold text-rose-900">
              ¿Confirmás la anulación de este pedido ({pedido.codigoVisible})?
            </div>
            <p className="text-xs text-rose-800">
              Esta acción no se puede deshacer. Se removerán sus prendas del inventario.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMostrarConfirmarEliminar(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarPedido}
                className="px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700"
              >
                Sí, anular pedido
              </button>
            </div>
          </div>
        )}

        {/* PIE DE MODAL: IMPRESIÓN Y CIERRE */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenTicket(pedido)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ticket Térmico</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenTicket(pedido, pedido.prendas[0])}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Etiquetas de Prendas</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMostrarConfirmarEliminar(true)}
              className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 rounded-xl transition-colors"
              title="Anular pedido"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
