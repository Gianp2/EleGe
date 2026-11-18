import React from 'react';
import {
  Shirt,
  Clock,
  CheckCircle2,
  DollarSign,
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
  onSelectOrder: (pedido: Pedido) => void;
  onGoToPedidos: (filtroEstado?: any) => void;
  onGoToCaja: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  kpis,
  pedidos,
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
    <div className="space-y-4 sm:space-y-6">
      {/* RESUMEN DE BIENVENIDA SIMPLIFICADO */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-neutral-900">
            Resumen del Día
          </h2>
          <p className="text-xs sm:text-sm text-neutral-600 mt-0.5">
            Estado actual de prendas, retiros y caja.
          </p>
        </div>

        <span className="text-xs sm:text-sm font-medium text-neutral-600 capitalize shrink-0">
          {new Date().toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </span>
      </div>

      {/* STRIP DE KPIS PRINCIPALES */}
      <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* KPI 1: Pedidos Hoy */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1 min-w-0">
          <div className="flex items-center justify-between gap-1 text-neutral-600">
            <span className="text-xs sm:text-sm font-semibold truncate">Pedidos Hoy</span>
            <Shirt className="w-4 h-4 text-neutral-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-neutral-900 font-mono tabular-nums">
            {kpis.pedidosHoy}
          </div>
          <div className="text-xs text-neutral-500">En el día</div>
        </div>

        {/* KPI 2: Prendas en Proceso */}
        <div
          onClick={() => onGoToPedidos('en_proceso')}
          className="col-span-1 sm:col-span-2 lg:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-sky-50/50 border border-neutral-200 hover:border-sky-300 shadow-xs transition-colors cursor-pointer space-y-1 min-w-0"
        >
          <div className="flex items-center justify-between gap-1 text-neutral-600">
            <span className="text-xs sm:text-sm font-semibold truncate">En Proceso</span>
            <Clock className="w-4 h-4 text-sky-600 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-sky-700 font-mono tabular-nums">
            {kpis.prendasEnProceso}
          </div>
          <div className="text-xs text-neutral-500">Lavado / planchado</div>
        </div>

        {/* KPI 3: Listas para Retirar */}
        <div
          onClick={() => onGoToPedidos('listo')}
          className="col-span-2 sm:col-span-2 lg:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-emerald-50/50 border border-neutral-200 hover:border-emerald-300 shadow-xs transition-colors cursor-pointer min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1"
        >
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-semibold truncate">Listas Retiro</span>
              <CheckCircle2 className="hidden sm:block w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="text-xs text-neutral-500 sm:hidden">Para entregar</div>
          </div>
          <div className="text-right sm:text-left shrink-0 flex sm:block items-center gap-2">
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
              {kpis.prendasListas}
            </div>
            <CheckCircle2 className="sm:hidden w-4 h-4 text-emerald-600 shrink-0" />
            <div className="hidden sm:block text-xs text-neutral-500">Para entregar</div>
          </div>
        </div>

        {/* KPI 4: Ingresos Hoy */}
        <div
          onClick={onGoToCaja}
          className="col-span-2 sm:col-span-3 lg:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 shadow-xs transition-colors cursor-pointer min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1"
        >
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-semibold truncate">Caja de Hoy</span>
              <DollarSign className="hidden sm:block w-4 h-4 text-neutral-800 shrink-0" />
            </div>
            <div className="text-xs text-neutral-500 sm:hidden">Cobros del día</div>
          </div>
          <div className="text-right sm:text-left shrink-0">
            <div className="text-xl sm:text-2xl font-extrabold text-neutral-900 font-mono tabular-nums whitespace-nowrap">
              {formatMoneda(kpis.ingresosHoy)}
            </div>
            <div className="hidden sm:block text-xs text-neutral-500">Cobros del día</div>
          </div>
        </div>

        {/* KPI 5: Saldo por Cobrar */}
        <div
          onClick={onGoToCaja}
          className="col-span-2 sm:col-span-3 lg:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-amber-50/50 border border-neutral-200 hover:border-amber-300 shadow-xs transition-colors cursor-pointer min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1"
        >
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-semibold truncate">Saldos por Cobrar</span>
              <TrendingUp className="hidden sm:block w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <div className="text-xs text-neutral-500 sm:hidden">En pedidos activos</div>
          </div>
          <div className="text-right sm:text-left shrink-0">
            <div className="text-xl sm:text-2xl font-extrabold text-amber-700 font-mono tabular-nums whitespace-nowrap">
              {formatMoneda(kpis.totalSaldoPorCobrar)}
            </div>
            <div className="hidden sm:block text-xs text-neutral-500">En pedidos activos</div>
          </div>
        </div>
      </div>

      {/* SECCIÓN DOBLE: PENDIENTES DE RETIRO + PEDIDOS RECIENTES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Columna Izquierda: Pedidos Listos para Retiro Inmediato */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3 min-w-0">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Listos para Retirar ({pedidosListosRetiro.length})</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Esperando entrega o aviso por WhatsApp
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToPedidos('listo')}
              className="text-xs sm:text-sm font-semibold text-neutral-700 hover:text-neutral-950 flex items-center gap-1 hover:underline cursor-pointer shrink-0 whitespace-nowrap py-1.5 px-1"
            >
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pedidosListosRetiro.length === 0 ? (
            <div className="p-6 sm:p-8 text-center rounded-xl bg-neutral-50 text-neutral-600 text-xs sm:text-sm border border-neutral-100">
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
                    className="p-3 sm:p-3.5 min-h-[56px] rounded-xl bg-neutral-50/80 hover:bg-neutral-100 border border-neutral-200/80 transition-colors flex items-start justify-between gap-2.5 cursor-pointer group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="font-mono font-extrabold text-neutral-900 text-xs sm:text-sm group-hover:text-amber-700 transition-colors">
                          {ped.codigoVisible}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-neutral-900 break-words">
                          {cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Cliente'}
                        </span>
                        {yaAvisado && (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" /> Avisado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-600 line-clamp-2 sm:truncate">
                        {ped.prendas.length} prenda(s): {ped.prendas.map((p) => p.tipo).join(', ')}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {tieneSaldo ? (
                        <div className="text-xs sm:text-sm font-mono font-bold text-amber-700 tabular-nums whitespace-nowrap">
                          {formatMoneda(ped.saldoPendiente)}
                        </div>
                      ) : (
                        <div className="text-xs sm:text-sm font-mono text-emerald-700 font-bold whitespace-nowrap">
                          Abonado
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 font-mono tabular-nums whitespace-nowrap">
                        Tot. {formatMoneda(ped.total)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columna Derecha: Pedidos Recientes */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3 min-w-0">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-600 shrink-0" />
                <span>Últimos Pedidos</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Ingresos recientes en mostrador
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToPedidos('todos')}
              className="text-xs sm:text-sm font-semibold text-neutral-700 hover:text-neutral-950 flex items-center gap-1 hover:underline cursor-pointer shrink-0 whitespace-nowrap py-1.5 px-1"
            >
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pedidosRecientes.length === 0 ? (
            <div className="p-6 sm:p-8 text-center rounded-xl bg-neutral-50 text-neutral-600 text-xs sm:text-sm border border-neutral-100">
              Todavía no hay pedidos registrados. Tocá «Nuevo Pedido» para comenzar.
            </div>
          ) : (
            <div className="space-y-2">
              {pedidosRecientes.map((ped) => {
                const cliente = clientesMap.get(ped.clienteId);

                return (
                  <div
                    key={ped.id}
                    onClick={() => onSelectOrder(ped)}
                    className="p-3 sm:p-3.5 min-h-[56px] rounded-xl bg-neutral-50/80 hover:bg-neutral-100 border border-neutral-200/80 transition-colors flex items-start justify-between gap-2.5 cursor-pointer group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="font-mono font-extrabold text-neutral-900 text-xs sm:text-sm group-hover:text-amber-700 transition-colors">
                          {ped.codigoVisible}
                        </span>
                        <StatusBadge tipo="pedido" estado={ped.estadoGeneral} size="sm" />
                        <span className="text-xs sm:text-sm font-semibold text-neutral-900 break-words">
                          {cliente ? `${cliente.nombre} ${cliente.apellido || ''}`.trim() : 'Cliente'}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600">
                        Entrega: {formatFechaCorta(ped.fechaEstimadaEntrega)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs sm:text-sm font-mono font-bold text-neutral-900 tabular-nums whitespace-nowrap">
                        {formatMoneda(ped.total)}
                      </div>
                      <div className="text-xs font-mono text-neutral-600 tabular-nums whitespace-nowrap">
                        {ped.saldoPendiente > 0 ? (
                          <span className="text-amber-700 font-semibold">Debe {formatMoneda(ped.saldoPendiente)}</span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Abonado</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
