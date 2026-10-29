import React from 'react';
import {
  Shirt,
  Clock,
  CheckCircle2,
  DollarSign,
  Plus,
  ArrowRight,
  TrendingUp,
  MessageCircle,
} from 'lucide-react';
import { Pedido, ResumenKPIs } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { formatMoneda, formatFechaCorta } from '../../utils/formatters';
import { storage } from '../../services/storage';

interface DashboardViewProps {
  kpis: ResumenKPIs;
  pedidos: Pedido[];
  onNewOrder: () => void;
  onSelectOrder: (pedido: Pedido) => void;
  onGoToPedidos: (filtroEstado?: any) => void;
  onGoToCaja: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  kpis,
  pedidos,
  onNewOrder,
  onSelectOrder,
  onGoToPedidos,
  onGoToCaja,
}) => {
  const clientesMap = new Map(storage.getClientes().map((c) => [c.id, c]));

  // Pedidos listos esperando retiro
  const pedidosListosRetiro = pedidos
    .filter((p) => p.estadoGeneral === 'listo')
    .slice(0, 5);

  // Pedidos recientes (últimos 6 creados)
  const pedidosRecientes = [...pedidos]
    .sort((a, b) => new Date(b.fechaRecepcion).getTime() - new Date(a.fechaRecepcion).getTime())
    .slice(0, 6);

  return (
    <div className="w-full min-w-0 max-w-full space-y-5 sm:space-y-6">
      {/* TARJETA HERO OPERATIVA: ACCIONES PRINCIPALES */}
      <div className="min-w-0 p-4 sm:p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 border border-neutral-200">
              Operaciones del Día
            </span>
            <span className="text-xs text-neutral-500 capitalize">
              {new Date().toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900">
            Lavadero eLeGe
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600">
            Control integral de recepción, seguimiento por QR, caja y entrega de prendas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full min-w-0 md:w-auto">
          <button
            type="button"
            onClick={onNewOrder}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo Pedido</span>
          </button>
        </div>
      </div>

      {/* STRIP DE KPIS PRINCIPALES */}
      <div className="grid min-w-0 grid-cols-2 lg:grid-cols-5 gap-3">
        {/* KPI 1: Pedidos Hoy */}
        <div className="min-w-0 p-3 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-start justify-between gap-2 text-neutral-500">
            <span className="min-w-0 text-xs font-semibold break-words">Pedidos Hoy</span>
            <Shirt className="w-4 h-4 shrink-0 text-neutral-400" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold break-words [overflow-wrap:anywhere] text-neutral-900 font-mono tabular-nums">{kpis.pedidosHoy}</div>
          <div className="text-[11px] text-neutral-500">Recibidos en el turno</div>
        </div>

        {/* KPI 2: Prendas en Proceso */}
        <div
          onClick={() => onGoToPedidos('en_proceso')}
          className="min-w-0 p-3 sm:p-4 rounded-2xl bg-white hover:bg-sky-50/50 border border-neutral-200 hover:border-sky-300 shadow-xs transition-colors cursor-pointer space-y-1"
        >
          <div className="flex items-start justify-between gap-2 text-neutral-500">
            <span className="min-w-0 text-xs font-semibold break-words">En Lavado / Planchado</span>
            <Clock className="w-4 h-4 shrink-0 text-sky-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold break-words [overflow-wrap:anywhere] text-sky-700 font-mono tabular-nums">{kpis.prendasEnProceso}</div>
          <div className="text-[11px] text-neutral-500">Prendas en máquinas</div>
        </div>

        {/* KPI 3: Listas para Retirar */}
        <div
          onClick={() => onGoToPedidos('listo')}
          className="min-w-0 p-3 sm:p-4 rounded-2xl bg-white hover:bg-emerald-50/50 border border-neutral-200 hover:border-emerald-300 shadow-xs transition-colors cursor-pointer space-y-1"
        >
          <div className="flex items-start justify-between gap-2 text-neutral-500">
            <span className="min-w-0 text-xs font-semibold break-words">Listas p/ Retiro</span>
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold break-words [overflow-wrap:anywhere] text-emerald-700 font-mono tabular-nums">{kpis.prendasListas}</div>
          <div className="text-[11px] text-neutral-500">Listas para el cliente</div>
        </div>

        {/* KPI 4: Ingresos Hoy */}
        <div
          onClick={onGoToCaja}
          className="min-w-0 p-3 sm:p-4 rounded-2xl bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 shadow-xs transition-colors cursor-pointer space-y-1"
        >
          <div className="flex items-start justify-between gap-2 text-neutral-500">
            <span className="min-w-0 text-xs font-semibold break-words">Caja de Hoy</span>
            <DollarSign className="w-4 h-4 shrink-0 text-neutral-800" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold break-words [overflow-wrap:anywhere] text-neutral-900 font-mono tabular-nums">
            {formatMoneda(kpis.ingresosHoy)}
          </div>
          <div className="text-[11px] text-neutral-500">Pagos y señas recibidos</div>
        </div>

        {/* KPI 5: Saldo por Cobrar */}
        <div
          onClick={onGoToCaja}
          className="min-w-0 p-3 sm:p-4 rounded-2xl bg-white hover:bg-amber-50/50 border border-neutral-200 hover:border-amber-300 shadow-xs transition-colors cursor-pointer space-y-1 col-span-2 lg:col-span-1"
        >
          <div className="flex items-start justify-between gap-2 text-neutral-500">
            <span className="min-w-0 text-xs font-semibold break-words">Saldos por Cobrar</span>
            <TrendingUp className="w-4 h-4 shrink-0 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold break-words [overflow-wrap:anywhere] text-amber-700 font-mono tabular-nums">
            {formatMoneda(kpis.totalSaldoPorCobrar)}
          </div>
          <div className="text-[11px] text-neutral-500">Deudas en pedidos activos</div>
        </div>
      </div>

      {/* SECCIÓN DOBLE: PENDIENTES DE RETIRO + PEDIDOS RECIENTES */}
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Columna Izquierda: Pedidos Listos para Retiro Inmediato */}
        <div className="min-w-0 p-3 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 min-w-0 flex-wrap">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                Listos para Retirar ({pedidosListosRetiro.length})
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Prendas listas esperando entrega o aviso por WhatsApp
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToPedidos('listo')}
              className="shrink-0 text-xs font-semibold text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 hover:underline cursor-pointer"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {pedidosListosRetiro.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-neutral-50 text-neutral-500 text-xs border border-neutral-100">
              No hay pedidos pendientes de retiro en este momento.
            </div>
          ) : (
            <div className="space-y-2">
              {pedidosListosRetiro.map((ped) => {
                const cliente = clientesMap.get(ped.clienteId);
                const tieneSaldo = ped.saldoPendiente > 0;
                const yaAvisado = ped.avisosWhatsApp && ped.avisosWhatsApp.length > 0;

                return (
                  <div
                    key={ped.id}
                    onClick={() => onSelectOrder(ped)}
                    className="min-w-0 p-3 sm:p-3.5 rounded-xl bg-neutral-50/70 hover:bg-neutral-100/90 border border-neutral-200/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 cursor-pointer group"
                  >
                    <div className="min-w-0 w-full flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-mono font-extrabold text-neutral-900 text-xs group-hover:text-amber-700 transition-colors">
                          {ped.codigoVisible}
                        </span>
                        <span className="min-w-0 break-words text-xs font-bold text-neutral-900">
                          {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'}
                        </span>
                        {yaAvisado && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
                            <MessageCircle className="w-2.5 h-2.5" /> Avisado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-600 break-words [overflow-wrap:anywhere]">
                        {ped.prendas.length} prenda(s): {ped.prendas.map((p) => p.tipo).join(', ')}
                      </div>
                    </div>

                    <div className="w-full min-w-0 text-left sm:text-right sm:w-auto sm:shrink-0">
                      {tieneSaldo ? (
                        <div className="text-xs font-mono font-bold text-amber-700 break-words [overflow-wrap:anywhere]">
                          Cobrar {formatMoneda(ped.saldoPendiente)}
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-emerald-700 font-bold">
                          Abonado
                        </div>
                      )}
                      <div className="text-[11px] text-neutral-500 font-mono break-words [overflow-wrap:anywhere]">
                        Total {formatMoneda(ped.total)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna Derecha: Pedidos Recientes */}
        <div className="min-w-0 p-3 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2 min-w-0 flex-wrap">
                <Clock className="w-4 h-4 shrink-0 text-neutral-500" />
                Últimos Pedidos Recibidos
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Ingresos recientes en el mostrador
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToPedidos('todos')}
              className="shrink-0 text-xs font-semibold text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 hover:underline cursor-pointer"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2">
            {pedidosRecientes.map((ped) => {
              const cliente = clientesMap.get(ped.clienteId);

              return (
                <div
                  key={ped.id}
                  onClick={() => onSelectOrder(ped)}
                  className="min-w-0 p-3 sm:p-3.5 rounded-xl bg-neutral-50/70 hover:bg-neutral-100/90 border border-neutral-200/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-neutral-900 text-xs group-hover:text-amber-700 transition-colors">
                        {ped.codigoVisible}
                      </span>
                      <StatusBadge tipo="pedido" estado={ped.estadoGeneral} size="sm" />
                      <span className="min-w-0 break-words text-xs font-semibold text-neutral-800">
                        {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 break-words">
                      Entrega estimada: {formatFechaCorta(ped.fechaEstimadaEntrega)}
                    </div>
                  </div>

                  <div className="w-full min-w-0 text-left sm:text-right sm:w-auto sm:shrink-0">
                    <div className="text-xs font-mono font-bold text-neutral-900 break-words [overflow-wrap:anywhere]">
                      {formatMoneda(ped.total)}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 break-words [overflow-wrap:anywhere]">
                      {ped.saldoPendiente > 0 ? (
                        <span className="text-amber-700 font-semibold">Resta: {formatMoneda(ped.saldoPendiente)}</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Abonado</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
