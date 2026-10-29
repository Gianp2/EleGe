import React, { useState, useEffect } from 'react';
import {
  User,
  Printer,
  MessageCircle,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Prenda, Pedido, Cliente, EstadoPrenda } from '../../types';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import {
  formatMoneda,
  formatFechaHora,
  formatFechaCorta,
  SERVICIOS_INFO,
  generarEnlaceWhatsApp,
} from '../../utils/formatters';
import { generarQRDataURL } from '../../utils/qr';
import { storage } from '../../services/storage';

interface GarmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prendaId: string | null;
  onOpenTicket: (pedido: Pedido, prendaParaEtiqueta?: Prenda) => void;
  onOpenOrder: (pedido: Pedido) => void;
  onOpenClient: (cliente: Cliente) => void;
}

export const GarmentDetailModal: React.FC<GarmentDetailModalProps> = ({
  isOpen,
  onClose,
  prendaId,
  onOpenTicket,
  onOpenOrder,
  onOpenClient,
}) => {
  const [data, setData] = useState<{ prenda: Prenda; pedido: Pedido; cliente?: Cliente } | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [mostrarAlertaEntregaConSaldo, setMostrarAlertaEntregaConSaldo] = useState(false);
  const [montoCobroInmediato, setMontoCobroInmediato] = useState<number>(0);
  const [metodoCobro, setMetodoCobro] = useState<'efectivo' | 'transferencia' | 'debito'>('efectivo');

  const refrescarDatos = () => {
    if (!prendaId) {
      setData(null);
      return;
    }
    const found = storage.buscarPrendaPorId(prendaId);
    if (found) {
      setData({ ...found });
      setMontoCobroInmediato(found.pedido.saldoPendiente);
      generarQRDataURL(found.prenda.qrPayload, 160).then((url) => setQrImageUrl(url));
    } else {
      setData(null);
    }
  };

  useEffect(() => {
    if (isOpen && prendaId) {
      refrescarDatos();
      setMostrarAlertaEntregaConSaldo(false);
    }
  }, [isOpen, prendaId]);

  if (!isOpen || !data) return null;

  const { prenda, pedido, cliente } = data;
  const servicioDetalle = SERVICIOS_INFO[prenda.servicio] || { label: prenda.servicio, precioSugerido: prenda.precio };
  const tieneSaldoPendiente = pedido.saldoPendiente > 0;

  const handleCambiarEstado = (nuevoEstado: EstadoPrenda) => {
    if (nuevoEstado === 'entregado' && tieneSaldoPendiente) {
      setMostrarAlertaEntregaConSaldo(true);
      return;
    }

    ejecutarCambioEstado(nuevoEstado);
  };

  const ejecutarCambioEstado = (nuevoEstado: EstadoPrenda) => {
    storage.actualizarEstadoPrenda(prenda.id, nuevoEstado);
    setMostrarAlertaEntregaConSaldo(false);
    refrescarDatos();
  };

  const handleCobrarYEntregar = () => {
    if (montoCobroInmediato > 0) {
      storage.registrarPago({
        pedidoId: pedido.id,
        monto: montoCobroInmediato,
        metodo: metodoCobro,
        nota: `Cobro al retirar prenda ${prenda.id}`,
      });
    }
    ejecutarCambioEstado('entregado');
  };

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
      prendaId: prenda.id,
      pedidoId: pedido.id,
      clienteId: cliente.id,
      telefono: telefonoNormalizado,
      mensaje,
    });

    window.open(url, '_blank', 'noopener,noreferrer');
    refrescarDatos();
  };

  const ultimosAvisos = pedido.avisosWhatsApp || [];
  const yaSeAviso = ultimosAvisos.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ficha de Prenda: ${prenda.id}`}
      subtitle={`Pedido ${pedido.codigoVisible} · Ingreso: ${formatFechaCorta(pedido.fechaRecepcion)}`}
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {/* Encabezado Principal: QR visual + Datos Prenda */}
        <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
          {/* QR thumbnail */}
          <div className="flex flex-col items-center justify-center p-2.5 bg-white border border-neutral-200 rounded-xl shrink-0 mx-auto sm:mx-0 shadow-2xs">
            {qrImageUrl ? (
              <img src={qrImageUrl} alt="QR Prenda" className="w-24 h-24 object-contain" />
            ) : (
              <div className="w-24 h-24 bg-neutral-100 animate-pulse rounded" />
            )}
            <span className="text-[11px] font-mono text-neutral-900 mt-1 font-extrabold">
              {prenda.id}
            </span>
          </div>

          {/* Información de la prenda */}
          <div className="flex-1 space-y-2 text-left w-full">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-neutral-900">{prenda.tipo}</h3>
                <p className="text-xs text-neutral-600 mt-0.5">{prenda.descripcion}</p>
              </div>
              <StatusBadge tipo="prenda" estado={prenda.estado} size="md" />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200 text-xs">
              <div>
                <span className="text-neutral-500 block text-[11px] font-medium">Servicio</span>
                <span className="font-bold text-neutral-800">{servicioDetalle.label}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] font-medium">Precio prenda</span>
                <span className="font-mono font-extrabold text-neutral-900">
                  {formatMoneda(prenda.precio)}
                </span>
              </div>
            </div>

            {prenda.observaciones && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <span className="font-bold text-[11px] block">Observaciones / Manchas previas:</span>
                <span>{prenda.observaciones}</span>
              </div>
            )}
          </div>
        </div>

        {/* Cliente y Pedido Asociados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Ficha Cliente */}
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="flex items-center gap-1 font-bold text-neutral-700">
                  <User className="w-3.5 h-3.5" />
                  Cliente
                </span>
                {cliente && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenClient(cliente);
                    }}
                    className="text-[11px] font-bold text-neutral-700 hover:text-neutral-900 flex items-center gap-0.5 hover:underline cursor-pointer"
                  >
                    Ver ficha <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {cliente ? (
                <div>
                  <div className="text-sm font-extrabold text-neutral-900">
                    {cliente.nombre} {cliente.apellido}
                  </div>
                  <div className="text-xs font-mono text-neutral-600 mt-0.5 font-medium">
                    Tel: {cliente.telefono}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-500">Cliente no registrado</div>
              )}
            </div>
          </div>

          {/* Ficha Pedido y Saldos */}
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="flex items-center gap-1 font-bold text-neutral-700">
                  Pedido {pedido.codigoVisible}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenOrder(pedido);
                  }}
                  className="text-[11px] font-bold text-neutral-700 hover:text-neutral-900 flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  Ver pedido <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-[11px] text-neutral-500 block font-medium">Saldo del pedido</span>
                  <span
                    className={`text-base font-mono font-extrabold ${
                      tieneSaldoPendiente ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatMoneda(pedido.saldoPendiente)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-neutral-500 block font-medium">Total pedido</span>
                  <span className="text-xs font-mono text-neutral-800 font-bold">
                    {formatMoneda(pedido.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ALERTA DE COBRO PENDIENTE AL ENTREGAR */}
        {mostrarAlertaEntregaConSaldo && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">
                  Atención: El pedido tiene saldo adeudado ({formatMoneda(pedido.saldoPendiente)})
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Podés cobrar el saldo pendiente en este momento antes de registrar la entrega.
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
                  value={montoCobroInmediato}
                  onChange={(e) => setMontoCobroInmediato(Number(e.target.value))}
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs text-neutral-900 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] text-amber-900 font-bold mb-1">
                  Medio de pago
                </label>
                <select
                  value={metodoCobro}
                  onChange={(e) => setMetodoCobro(e.target.value as any)}
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
                onClick={() => setMostrarAlertaEntregaConSaldo(false)}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => ejecutarCambioEstado('entregado')}
                className="px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-xl cursor-pointer"
              >
                Entregar SIN cobrar saldo
              </button>
              <button
                type="button"
                onClick={handleCobrarYEntregar}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs cursor-pointer active:scale-98"
              >
                Cobrar {formatMoneda(montoCobroInmediato)} y Entregar
              </button>
            </div>
          </div>
        )}

        {/* CAMBIO DE ESTADO EN 1 CLIC */}
        <div>
          <label className="block text-xs font-bold text-neutral-800 mb-2">
            Cambiar estado de esta prenda:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['recibido', 'en_proceso', 'listo', 'entregado'] as EstadoPrenda[]).map((est) => {
              const isSelected = prenda.estado === est;
              const labels: Record<EstadoPrenda, string> = {
                recibido: '1. Recibido',
                en_proceso: '2. En Proceso',
                listo: '3. Listo',
                entregado: '4. Entregado',
              };

              return (
                <button
                  key={est}
                  type="button"
                  onClick={() => handleCambiarEstado(est)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  {labels[est]}
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTÓN WHATSAPP Y REGISTRO DE AVISOS */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-neutral-900">Notificación al Cliente</span>
              </div>
              <p className="text-xs text-neutral-600 mt-0.5">
                Envía mensaje con el estado del pedido, resumen de prendas y saldo a abonar.
              </p>
            </div>

            <button
              type="button"
              disabled={!cliente || prenda.estado !== 'listo'}
              onClick={handleWhatsApp}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                prenda.estado === 'listo'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-98'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed opacity-60'
              }`}
              title={
                prenda.estado !== 'listo'
                  ? 'Se habilita cuando la prenda está en estado "Listo"'
                  : 'Abre WhatsApp con mensaje listo para enviar'
              }
            >
              <MessageCircle className="w-4 h-4" />
              <span>Avisar por WhatsApp</span>
            </button>
          </div>

          {yaSeAviso && (
            <div className="pt-2 border-t border-neutral-200 text-[11px] text-neutral-600">
              <span className="text-emerald-700 font-bold">Historial de avisos: </span>
              Iniciado {ultimosAvisos.length} vez/veces. Último aviso:{' '}
              <span className="font-mono text-neutral-800 font-medium">
                {formatFechaHora(ultimosAvisos[ultimosAvisos.length - 1].fecha)}
              </span>
            </div>
          )}
        </div>

        {/* BOTONES DE IMPRESIÓN Y ACCIONES */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenTicket(pedido, prenda)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Etiqueta QR Prenda</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenTicket(pedido)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Ticket Térmico Cliente</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
          >
            Cerrar ficha
          </button>
        </div>
      </div>
    </Modal>
  );
};
