import React, { useState, useEffect } from 'react';
import { Printer, Tag, FileText } from 'lucide-react';
import { Pedido, Prenda, Cliente } from '../../types';
import { Modal } from '../common/Modal';
import { formatMoneda, formatFechaHora, formatFechaCorta, SERVICIOS_INFO } from '../../utils/formatters';
import { generarQRDataURL } from '../../utils/qr';
import { storage } from '../../services/storage';

interface ThermalTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  prendaIndividual?: Prenda | null;
}

export const ThermalTicketModal: React.FC<ThermalTicketModalProps> = ({
  isOpen,
  onClose,
  pedido,
  prendaIndividual,
}) => {
  const config = storage.getConfiguracion();
  const [modo, setModo] = useState<'ticket_cliente' | 'etiquetas_prendas'>('ticket_cliente');
  const [anchoPapel, setAnchoPapel] = useState<'80mm' | '58mm'>(config.formatoTicketDefecto || '80mm');
  const [pedidoQRUrl, setPedidoQRUrl] = useState<string>('');
  const [prendasQRMap, setPrendasQRMap] = useState<Record<string, string>>({});
  const [cliente, setCliente] = useState<Cliente | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = storage.getConfiguracion();
      setAnchoPapel(cfg.formatoTicketDefecto || '80mm');
    }
  }, [isOpen]);

  useEffect(() => {
    if (prendaIndividual) {
      setModo('etiquetas_prendas');
    } else {
      setModo('ticket_cliente');
    }
  }, [prendaIndividual, isOpen]);

  useEffect(() => {
    if (pedido) {
      const cli = storage.getClienteById(pedido.clienteId) || null;
      setCliente(cli);

      const qrWidth = anchoPapel === '58mm' ? 140 : 180;
      generarQRDataURL(pedido.qrPayload, qrWidth).then((url) => setPedidoQRUrl(url));

      const garmentQRWidth = anchoPapel === '58mm' ? 110 : 140;
      const promises = pedido.prendas.map(async (p) => {
        const url = await generarQRDataURL(p.qrPayload, garmentQRWidth);
        return { id: p.id, url };
      });

      Promise.all(promises).then((results) => {
        const map: Record<string, string> = {};
        results.forEach((r) => {
          map[r.id] = r.url;
        });
        setPrendasQRMap(map);
      });
    }
  }, [pedido, anchoPapel]);

  if (!isOpen || !pedido) return null;

  const handleImprimir = () => {
    window.print();
  };

  const prendasParaImprimir = prendaIndividual ? [prendaIndividual] : pedido.prendas;
  const es58mm = anchoPapel === '58mm';
  const anchoClase = es58mm ? 'max-w-[240px]' : 'max-w-[340px]';
  const fontSizeBase = es58mm ? 'text-[10px]' : 'text-[12px]';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vista de Impresión Térmica"
      subtitle={`Pedido ${pedido.codigoVisible} · Formato para impresora térmica POS`}
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Controles de Vista e Impresión */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-50 rounded-2xl border border-neutral-200 no-print">
          {/* Selector de Tipo */}
          <div className="flex items-center gap-1 p-1 bg-neutral-200 rounded-xl">
            <button
              type="button"
              onClick={() => setModo('ticket_cliente')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                modo === 'ticket_cliente'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ticket Cliente</span>
            </button>
            <button
              type="button"
              onClick={() => setModo('etiquetas_prendas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                modo === 'etiquetas_prendas'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>
                {prendaIndividual ? 'Etiqueta de Prenda' : 'Etiquetas de Prendas'}
              </span>
            </button>
          </div>

          {/* Ancho térmico & Botón Imprimir */}
          <div className="flex items-center gap-2">
            <select
              value={anchoPapel}
              onChange={(e) => setAnchoPapel(e.target.value as any)}
              className="bg-white border border-neutral-300 text-xs font-semibold text-neutral-800 rounded-xl px-3 py-1.5 outline-none shadow-2xs"
            >
              <option value="80mm">Rollo 80 mm (Estándar)</option>
              <option value="58mm">Rollo 58 mm (Compacto)</option>
            </select>

            <button
              type="button"
              onClick={handleImprimir}
              className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* CONTENEDOR DE IMPRESIÓN */}
        <div className="flex justify-center p-3 sm:p-6 bg-neutral-100 rounded-2xl border border-neutral-200 overflow-x-auto">
          {modo === 'ticket_cliente' ? (
            /* TICKET DE CLIENTE COMPLETO */
            <div
              className={`printable-area w-full ${anchoClase} bg-white text-neutral-950 p-3 sm:p-4 font-mono ${fontSizeBase} leading-tight shadow-md border border-neutral-300 rounded-sm`}
            >
              {/* Encabezado */}
              <div className="text-center pb-3 border-b border-dashed border-neutral-400 space-y-1">
                <div className="text-base font-black tracking-tight uppercase">
                  {config.nombreComercio || 'LAVADERO eLeGe'}
                </div>
                {config.direccion && (
                  <div className="text-[10px] text-neutral-600 font-sans">
                    {config.direccion} · Tel: {config.telefono}
                  </div>
                )}
                <div className="text-[10px] text-neutral-700">
                  Fecha: {formatFechaHora(pedido.fechaRecepcion)}
                </div>
                <div className="text-sm font-bold pt-1">
                  PEDIDO {pedido.codigoVisible}
                </div>
              </div>

              {/* Datos Cliente */}
              <div className="py-2 border-b border-dashed border-neutral-400 space-y-0.5 text-[11px]">
                <div>
                  <span className="font-bold">Cliente: </span>
                  {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente Mostrador'}
                </div>
                {cliente?.telefono && (
                  <div>
                    <span className="font-bold">Tel: </span>
                    {cliente.telefono}
                  </div>
                )}
                <div>
                  <span className="font-bold">Fecha Est. Entrega: </span>
                  {formatFechaCorta(pedido.fechaEstimadaEntrega)}
                </div>
              </div>

              {/* Detalle de Prendas */}
              <div className="py-2.5 border-b border-dashed border-neutral-400 space-y-2">
                <div className="flex justify-between font-bold text-[10px] uppercase text-neutral-600">
                  <span>Cant · Prenda / Servicio</span>
                  <span>Precio</span>
                </div>
                {pedido.prendas.map((p, idx) => (
                  <div key={p.id} className="text-[11px]">
                    <div className="flex justify-between font-bold">
                      <span>
                        {idx + 1}. {p.tipo}
                      </span>
                      <span>{formatMoneda(p.precio)}</span>
                    </div>
                    <div className="text-[10px] text-neutral-600">
                      {SERVICIOS_INFO[p.servicio]?.label || p.servicio}
                    </div>
                    {p.descripcion && (
                      <div className="text-[10px] text-neutral-500 italic">
                        {p.descripcion}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totales y Saldo */}
              <div className="py-2.5 border-b border-dashed border-neutral-400 space-y-1">
                <div className="flex justify-between font-bold text-[13px]">
                  <span>TOTAL:</span>
                  <span>{formatMoneda(pedido.total)}</span>
                </div>
                {pedido.pagos.map((pago) => (
                  <div key={pago.id} className="flex justify-between text-[11px] text-neutral-700">
                    <span>
                      {pago.esSenia ? 'Seña inicial:' : 'Pago recibido:'}
                    </span>
                    <span>- {formatMoneda(pago.monto)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-black text-sm pt-1.5 border-t border-neutral-300">
                  <span>SALDO A PAGAR:</span>
                  <span>{formatMoneda(pedido.saldoPendiente)}</span>
                </div>
              </div>

              {/* QR para retiro y seguimiento */}
              <div className="py-3 text-center flex flex-col items-center justify-center space-y-1">
                {pedidoQRUrl && (
                  <img
                    src={pedidoQRUrl}
                    alt="QR Pedido"
                    className={`${es58mm ? 'w-24 h-24' : 'w-28 h-28'} object-contain`}
                  />
                )}
                <div className="text-[9px] text-neutral-600 font-bold tracking-wider">
                  {pedido.id}
                </div>
                <div className="text-[9px] text-neutral-500 uppercase font-sans">
                  Escaneá para consultar estado
                </div>
              </div>

              {/* Pie de ticket */}
              <div className="pt-2 text-center text-[9px] text-neutral-600 leading-tight border-t border-dashed border-neutral-400 space-y-1 font-sans">
                <p>Conserve este comprobante para retirar sus prendas.</p>
                <p className="font-bold">
                  {config.lemaOTicketPie || '¡Muchas gracias por su preferencia!'}
                </p>
              </div>
            </div>
          ) : (
            /* ETIQUETAS INDIVIDUALES DE PRENDAS */
            <div className="space-y-4 w-full flex flex-col items-center">
              {prendasParaImprimir.map((prenda) => (
                <div
                  key={prenda.id}
                  className={`printable-area w-full ${anchoClase} bg-white text-neutral-950 p-2.5 sm:p-3 font-mono border-2 border-neutral-900 rounded-sm shadow-md flex items-center justify-between gap-2.5`}
                >
                  <div className="flex-1 space-y-0.5 text-left min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-600 font-sans">
                      Lavadero eLeGe · {pedido.codigoVisible}
                    </div>
                    <div className="text-xs font-black truncate">
                      {prenda.tipo}
                    </div>
                    <div className="text-[10px] text-neutral-700 truncate">
                      {prenda.descripcion}
                    </div>
                    <div className="text-[10px] font-bold text-neutral-900 truncate">
                      {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'}
                    </div>
                    <div className="text-[9px] text-neutral-500">
                      Entrega: {formatFechaCorta(pedido.fechaEstimadaEntrega)}
                    </div>
                    <div className="text-[9px] font-bold bg-neutral-100 px-1 py-0.5 inline-block rounded border border-neutral-300">
                      ID: {prenda.id}
                    </div>
                  </div>

                  <div className="shrink-0 text-center">
                    {prendasQRMap[prenda.id] ? (
                      <img
                        src={prendasQRMap[prenda.id]}
                        alt={`QR ${prenda.id}`}
                        className={`${es58mm ? 'w-16 h-16' : 'w-20 h-20'} object-contain`}
                      />
                    ) : (
                      <div className="w-16 h-16 bg-neutral-200 animate-pulse" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
