import React, { useState } from 'react';
import {
  Search,
  Plus,
  Shirt,
  Printer,
  Eye,
} from 'lucide-react';
import { Pedido, EstadoPedido } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { formatMoneda, formatFechaCorta } from '../../utils/formatters';
import { storage } from '../../services/storage';

interface OrderListViewProps {
  pedidos: Pedido[];
  onOpenNewOrder: () => void;
  onSelectOrder: (pedido: Pedido) => void;
  onOpenTicket: (pedido: Pedido) => void;
  initialEstadoFilter?: EstadoPedido | 'todos';
  initialSearch?: string;
}

export const OrderListView: React.FC<OrderListViewProps> = ({
  pedidos,
  onOpenNewOrder,
  onSelectOrder,
  onOpenTicket,
  initialEstadoFilter = 'todos',
  initialSearch = '',
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedido | 'todos'>(initialEstadoFilter);
  const [filtroPago, setFiltroPago] = useState<'todos' | 'con_deuda' | 'pagados'>('todos');

  const clientesMap = new Map(storage.getClientes().map((c) => [c.id, c]));

  // Filtrado de pedidos
  const pedidosFiltrados = pedidos.filter((pedido) => {
    const cliente = clientesMap.get(pedido.clienteId);
    const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido} ${cliente.telefono}` : '';
    const prendasTexto = pedido.prendas.map((p) => `${p.tipo} ${p.descripcion}`).join(' ');
    const textoCompleto = `${pedido.codigoVisible} ${pedido.id} ${clienteNombre} ${prendasTexto}`.toLowerCase();

    if (searchTerm.trim() && !textoCompleto.includes(searchTerm.toLowerCase().trim())) {
      return false;
    }

    if (filtroEstado !== 'todos' && pedido.estadoGeneral !== filtroEstado) {
      return false;
    }

    if (filtroPago === 'con_deuda' && pedido.saldoPendiente <= 0) {
      return false;
    }
    if (filtroPago === 'pagados' && pedido.saldoPendiente > 0) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Barra de Filtros y Herramientas */}
      <div className="flex flex-col gap-3">
        {/* Fila superior: Buscador + Botón Nuevo */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código (#2401), cliente, prenda..."
              className="w-full bg-white border border-neutral-300 focus:border-neutral-500 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 rounded-xl pl-10 pr-3 py-2 outline-none shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={onOpenNewOrder}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo Pedido</span>
          </button>
        </div>

        {/* Fila inferior: Segmented Controls de Estados */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-200">
          {/* Tabs de Estado General */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200 overflow-x-auto max-w-full">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'recibido', label: 'Recibidos' },
                { id: 'en_proceso', label: 'En Proceso' },
                { id: 'listo', label: 'Listos para Retirar' },
                { id: 'entregado', label: 'Entregados' },
                { id: 'cancelado', label: 'Anulados' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltroEstado(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  filtroEstado === tab.id
                    ? 'bg-white text-neutral-900 font-bold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtro de Saldos */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-neutral-500 font-medium text-[11px] mr-1 hidden sm:inline">Cobro:</span>
            <select
              value={filtroPago}
              onChange={(e) => setFiltroPago(e.target.value as any)}
              className="bg-white border border-neutral-300 text-neutral-800 font-medium text-xs rounded-xl px-3 py-1.5 outline-none shadow-2xs"
            >
              <option value="todos">Todos los pagos</option>
              <option value="con_deuda">Con saldo adeudado</option>
              <option value="pagados">Totalmente pagados</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Pedidos */}
      {pedidosFiltrados.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-neutral-200 text-neutral-500 space-y-2 shadow-xs">
          <Shirt className="w-8 h-8 mx-auto text-neutral-400" />
          <p className="text-sm font-bold text-neutral-800">No se encontraron pedidos</p>
          <p className="text-xs">
            {searchTerm || filtroEstado !== 'todos' || filtroPago !== 'todos'
              ? 'Probá ajustando los filtros de búsqueda'
              : 'Creá un nuevo pedido de lavandería para comenzar'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          {/* Vista Desktop (Tabla) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Pedido #</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Prendas y Servicios</th>
                  <th className="py-3.5 px-4">Fecha Entrega</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4 text-right">Total / Saldo</th>
                  <th className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {pedidosFiltrados.map((pedido) => {
                  const cliente = clientesMap.get(pedido.clienteId);
                  const tieneSaldo = pedido.saldoPendiente > 0;

                  return (
                    <tr
                      key={pedido.id}
                      className="hover:bg-neutral-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectOrder(pedido)}
                    >
                      <td className="py-3.5 px-4 font-mono font-extrabold text-neutral-900 group-hover:text-amber-700 transition-colors">
                        {pedido.codigoVisible}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-neutral-900">
                          {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente mostrador'}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-500">
                          {cliente?.telefono || '-'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-neutral-900 font-semibold truncate">
                          {pedido.prendas.length} prenda(s):{' '}
                          {pedido.prendas.map((p) => p.tipo).join(', ')}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate">
                          {pedido.prendas.map((p) => p.descripcion).filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-neutral-700">
                        {formatFechaCorta(pedido.fechaEstimadaEntrega)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge tipo="pedido" estado={pedido.estadoGeneral} size="sm" />
                          <StatusBadge tipo="pago" estado={pedido.estadoPago} size="sm" />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-neutral-900 text-sm">{formatMoneda(pedido.total)}</div>
                        {tieneSaldo ? (
                          <div className="text-[11px] text-amber-700 font-bold">
                            Resta: {formatMoneda(pedido.saldoPendiente)}
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-700 font-semibold">Abonado</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenTicket(pedido)}
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                            title="Imprimir ticket térmico"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectOrder(pedido)}
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                            title="Ver ficha del pedido"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Vista Móvil (Tarjetas táctiles) */}
          <div className="md:hidden divide-y divide-neutral-200">
            {pedidosFiltrados.map((pedido) => {
              const cliente = clientesMap.get(pedido.clienteId);
              const tieneSaldo = pedido.saldoPendiente > 0;

              return (
                <div
                  key={pedido.id}
                  onClick={() => onSelectOrder(pedido)}
                  className="p-4 hover:bg-neutral-50 transition-colors space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-neutral-900 text-base">
                          {pedido.codigoVisible}
                        </span>
                        <StatusBadge tipo="pedido" estado={pedido.estadoGeneral} size="sm" />
                      </div>
                      <div className="text-xs font-bold text-neutral-900 mt-0.5">
                        {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'}
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="font-bold text-neutral-900 text-sm">{formatMoneda(pedido.total)}</div>
                      {tieneSaldo ? (
                        <div className="text-[11px] text-amber-700 font-bold">
                          Debe: {formatMoneda(pedido.saldoPendiente)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-700 font-semibold">Pagado</div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-neutral-600 truncate">
                    {pedido.prendas.length} prenda(s): {pedido.prendas.map((p) => p.tipo).join(', ')}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-100">
                    <span>Entrega: {formatFechaCorta(pedido.fechaEstimadaEntrega)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTicket(pedido);
                      }}
                      className="text-neutral-700 font-semibold hover:text-neutral-900 flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ticket</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
