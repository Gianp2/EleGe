import React, { useState, useEffect } from 'react';
import {
  Phone,
  MessageCircle,
  Plus,
  Edit2,
  Calendar,
  Sparkles,
  Printer,
  ChevronDown,
  ChevronUp,
  Receipt,
} from 'lucide-react';
import { Cliente, Pedido, ResumenClienteMetricas } from '../../types';
import { Modal } from '../common/Modal';
import { StatusBadge } from '../common/StatusBadge';
import {
  formatMoneda,
  formatFechaCorta,
  formatFechaHora,
  normalizarTelefonoWhatsApp,
  SERVICIOS_INFO,
  METODO_PAGO_LABELS,
} from '../../utils/formatters';
import { generarQRDataURL } from '../../utils/qr';
import { storage } from '../../services/storage';

interface ClientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onEditClient: (cliente: Cliente) => void;
  onNewOrderForClient: (cliente: Cliente) => void;
  onSelectOrder: (pedido: Pedido) => void;
}

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  isOpen,
  onClose,
  cliente,
  onEditClient,
  onNewOrderForClient,
  onSelectOrder,
}) => {
  const [metricas, setMetricas] = useState<ResumenClienteMetricas | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [showPrintCard, setShowPrintCard] = useState(false);

  useEffect(() => {
    if (cliente && isOpen) {
      const met = storage.getMetricasCliente(cliente.id);
      setMetricas(met);
      const ped = storage.getPedidos().filter((p) => p.clienteId === cliente.id);
      // Ordenar pedidos por fecha más reciente
      ped.sort((a, b) => new Date(b.fechaRecepcion).getTime() - new Date(a.fechaRecepcion).getTime());
      setPedidos(ped);
      generarQRDataURL(cliente.qrPayload, 180).then((url) => setQrUrl(url));
      // Auto expandir el pedido más reciente si existe
      if (ped.length > 0) {
        setExpandedOrders({ [ped[0].id]: true });
      }
    }
  }, [cliente, isOpen]);

  if (!isOpen || !cliente) return null;

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const handleWhatsAppDirecto = () => {
    const tel = normalizarTelefonoWhatsApp(cliente.telefono);
    const mensaje = encodeURIComponent(
      `Hola ${cliente.nombre}, te contactamos desde Lavadero eLeGe por tus prendas de lavandería.`
    );
    window.open(`https://wa.me/${tel}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  };

  const handlePrintClientCard = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${cliente.nombre} ${cliente.apellido || ''}`}
      subtitle={`ID: ${cliente.id} · Cliente registrado el ${formatFechaCorta(cliente.fechaAlta)}`}
      maxWidth="3xl"
    >
      <div className="space-y-5">
        {/* Encabezado: Ficha de Contacto + QR Permanente */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-4 p-4 rounded-2xl bg-white border border-neutral-200 shadow-2xs">
          <div className="space-y-3 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 bg-neutral-100 px-3 py-1 rounded-xl">
                <Phone className="w-4 h-4 text-neutral-500" />
                <span className="font-mono">{cliente.telefono}</span>
              </div>

              {metricas && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                    metricas.clasificacion === 'frecuente'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : metricas.clasificacion === 'nuevo'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-neutral-100 text-neutral-800 border-neutral-300'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    Cliente {metricas.clasificacion.charAt(0).toUpperCase() + metricas.clasificacion.slice(1)}
                  </span>
                </span>
              )}
            </div>

            {cliente.observaciones && (
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 leading-relaxed">
                <span className="text-neutral-500 font-bold block text-[11px] mb-0.5">
                  Observaciones / Preferencias:
                </span>
                {cliente.observaciones}
              </div>
            )}

            {/* Acciones de Contacto y Edición */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleWhatsAppDirecto}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 hover:bg-emerald-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Contactar WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditClient(cliente);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar datos</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPrintCard(!showPrintCard)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{showPrintCard ? 'Ocultar Tarjeta QR' : 'Ver Tarjeta QR'}</span>
              </button>
            </div>
          </div>

          {/* Tarjeta de QR Permanente */}
          <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl flex flex-col items-center justify-center shrink-0 self-center sm:self-start shadow-2xs">
            {qrUrl ? (
              <img src={qrUrl} alt="QR Cliente" className="w-24 h-24 object-contain bg-white p-1 rounded-xl border border-neutral-200" />
            ) : (
              <div className="w-24 h-24 bg-neutral-200 animate-pulse rounded-xl" />
            )}
            <span className="text-[11px] font-mono text-neutral-900 font-black mt-1.5 tracking-wider">
              {cliente.id}
            </span>
            <span className="text-[10px] text-neutral-500 font-sans font-medium">QR Permanente</span>
          </div>
        </div>

        {/* Tarjeta Imprimible Desplegable para el Cliente */}
        {showPrintCard && (
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-neutral-700" />
                Tarjeta / Credencial de Cliente Lavadero eLeGe
              </span>
              <button
                type="button"
                onClick={handlePrintClientCard}
                className="px-3 py-1 bg-neutral-900 text-white rounded-lg text-xs font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Imprimir Tarjeta
              </button>
            </div>

            <div className="printable-area max-w-sm mx-auto p-4 bg-white border border-neutral-300 rounded-xl text-center space-y-2 shadow-xs">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-neutral-900">
                Lavadero eLeGe
              </h3>
              <p className="text-[11px] text-neutral-500">Credencial Permanente de Cliente</p>
              {qrUrl && <img src={qrUrl} alt="QR" className="w-32 h-32 mx-auto object-contain my-2" />}
              <div className="font-mono text-xs font-extrabold text-neutral-900">{cliente.id}</div>
              <div className="font-bold text-xs text-neutral-900">
                {cliente.nombre} {cliente.apellido || ''}
              </div>
              <div className="font-mono text-[11px] text-neutral-600">{cliente.telefono}</div>
              <p className="text-[10px] text-neutral-400 pt-1">
                Presentá este código al dejar o retirar tus prendas
              </p>
            </div>
          </div>
        )}

        {/* Métricas y Estadísticas Calculadas en Tiempo Real */}
        {metricas && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
              <span className="text-[11px] font-bold text-neutral-500 block">Total Pedidos</span>
              <span className="text-lg font-bold text-neutral-900 font-mono tabular-nums">
                {metricas.totalPedidos}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
              <span className="text-[11px] font-bold text-neutral-500 block">Total Invertido</span>
              <span className="text-lg font-bold text-neutral-900 font-mono tabular-nums">
                {formatMoneda(metricas.totalGastado)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
              <span className="text-[11px] font-bold text-neutral-500 block">Saldo Adeudado</span>
              <span
                className={`text-lg font-bold font-mono tabular-nums ${
                  metricas.saldoDeuda > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatMoneda(metricas.saldoDeuda)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs">
              <span className="text-[11px] font-bold text-neutral-500 block">Prendas en Lavadero</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-lg font-bold text-neutral-900 font-mono tabular-nums">
                  {metricas.prendasEnLavadero}
                </span>
                {metricas.prendasActivasListas > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    ({metricas.prendasActivasListas} listas)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Historial Completo de Pedidos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-neutral-600" />
              Historial de Pedidos y Prendas ({pedidos.length})
            </h4>

            <button
              type="button"
              onClick={() => {
                onClose();
                onNewOrderForClient(cliente);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Pedido</span>
            </button>
          </div>

          {pedidos.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 rounded-xl bg-neutral-50 border border-neutral-200">
              Este cliente aún no registra pedidos en el historial.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {pedidos.map((ped) => {
                const isExpanded = Boolean(expandedOrders[ped.id]);

                return (
                  <div
                    key={ped.id}
                    className="p-3.5 rounded-xl bg-white border border-neutral-200 shadow-2xs transition-all space-y-2.5"
                  >
                    {/* Fila principal del pedido */}
                    <div
                      className="flex items-center justify-between gap-3 cursor-pointer group"
                      onClick={() => toggleOrderExpand(ped.id)}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black font-mono text-neutral-900 group-hover:text-amber-700 transition-colors">
                            {ped.codigoVisible}
                          </span>
                          <StatusBadge tipo="pedido" estado={ped.estadoGeneral} size="sm" />
                          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-neutral-400" />
                            {formatFechaCorta(ped.fechaRecepcion)}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600">
                          {ped.prendas.length} prenda(s) registrada(s)
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-neutral-900">
                            {formatMoneda(ped.total)}
                          </div>
                          {ped.saldoPendiente > 0 ? (
                            <span className="text-[11px] font-mono text-amber-700 font-bold block">
                              Debe {formatMoneda(ped.saldoPendiente)}
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-emerald-700 font-semibold block">
                              Pagado
                            </span>
                          )}
                        </div>

                        <div className="text-neutral-400 group-hover:text-neutral-700">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Detalle Desplegable: Prendas y Pagos */}
                    {isExpanded && (
                      <div className="pt-2.5 border-t border-neutral-100 space-y-3">
                        {/* Lista detallada de Prendas */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                            Prendas del pedido:
                          </span>
                          <div className="divide-y divide-neutral-100 rounded-lg bg-neutral-50 p-2 border border-neutral-200">
                            {ped.prendas.map((prn) => {
                              const infoServicio = SERVICIOS_INFO[prn.servicio];
                              return (
                                <div key={prn.id} className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-neutral-900">{prn.tipo}</span>
                                      <span className="text-[10px] text-neutral-500 bg-white px-1.5 py-0.2 rounded border border-neutral-200">
                                        {infoServicio?.label || prn.servicio}
                                      </span>
                                    </div>
                                    {prn.descripcion && (
                                      <p className="text-[11px] text-neutral-600">{prn.descripcion}</p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <StatusBadge tipo="prenda" estado={prn.estado} size="sm" />
                                    <span className="font-mono font-bold text-neutral-900 text-xs">
                                      {formatMoneda(prn.precio)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Pagos y Señas */}
                        {ped.pagos && ped.pagos.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                              Historial de Pagos / Señas:
                            </span>
                            <div className="space-y-1 bg-white p-2 rounded-lg border border-neutral-200 text-xs">
                              {ped.pagos.map((pago) => (
                                <div key={pago.id} className="flex items-center justify-between text-[11px]">
                                  <span className="text-neutral-600">
                                    {formatFechaHora(pago.fecha)} · {METODO_PAGO_LABELS[pago.metodo] || pago.metodo}{' '}
                                    {pago.esSenia && <strong className="text-neutral-900">(Seña)</strong>}
                                  </span>
                                  <span className="font-mono font-bold text-emerald-700">
                                    {formatMoneda(pago.monto)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Botón para ver ficha completa del pedido */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectOrder(ped);
                            }}
                            className="text-xs font-bold text-neutral-900 hover:underline cursor-pointer"
                          >
                            Abrir ficha completa del pedido →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
