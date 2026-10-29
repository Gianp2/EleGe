import React, { useState } from 'react';
import {
  DollarSign,
  Calendar,
  Download,
  TrendingUp,
  CreditCard,
  Shirt,
} from 'lucide-react';
import { Pago, ResumenKPIs, Pedido, MetodoPago, TipoServicio } from '../../types';
import {
  formatMoneda,
  formatFechaHora,
  METODO_PAGO_LABELS,
  SERVICIOS_INFO,
} from '../../utils/formatters';
import { storage } from '../../services/storage';

interface CashAndReportsViewProps {
  kpis: ResumenKPIs;
  pedidos: Pedido[];
}

export const CashAndReportsView: React.FC<CashAndReportsViewProps> = ({ kpis, pedidos }) => {
  const [filtroPeriodo, setFiltroPeriodo] = useState<'hoy' | 'mes' | 'todos'>('hoy');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('todos');

  const todosLosPagos = storage.getTodosLosPagos();
  const hoyStr = new Date().toISOString().split('T')[0];
  const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const pagosFiltrados = todosLosPagos.filter((p) => {
    if (filtroPeriodo === 'hoy' && !p.fecha.startsWith(hoyStr)) {
      return false;
    }
    if (filtroPeriodo === 'mes' && new Date(p.fecha) < primerDiaMes) {
      return false;
    }

    if (filtroMetodo !== 'todos' && p.metodo !== filtroMetodo) {
      return false;
    }

    return true;
  });

  const totalRecaudadoPeriodo = pagosFiltrados.reduce((acc, p) => acc + p.monto, 0);

  const desgloseMetodos: Record<MetodoPago, number> = {
    efectivo: 0,
    transferencia: 0,
    debito: 0,
    credito: 0,
    otro: 0,
  };

  pagosFiltrados.forEach((p) => {
    if (desgloseMetodos[p.metodo] !== undefined) {
      desgloseMetodos[p.metodo] += p.monto;
    } else {
      desgloseMetodos.otro += p.monto;
    }
  });

  const conteoServicios: Record<string, { cant: number; total: number }> = {};
  pedidos.forEach((ped) => {
    ped.prendas.forEach((prenda) => {
      const serv = prenda.servicio;
      if (!conteoServicios[serv]) {
        conteoServicios[serv] = { cant: 0, total: 0 };
      }
      conteoServicios[serv].cant++;
      conteoServicios[serv].total += prenda.precio;
    });
  });

  const rankingServicios = Object.entries(conteoServicios).sort(
    (a, b) => b[1].cant - a[1].cant
  );

  const handleExportCSV = () => {
    const headers = ['ID Pago', 'Fecha y Hora', 'Pedido', 'Cliente', 'Monto', 'Medio de Pago', 'Tipo', 'Nota'];
    const rows = pagosFiltrados.map((p) => [
      p.id,
      p.fecha,
      p.codigoPedido || '',
      `"${p.clienteNombre || ''}"`,
      p.monto,
      METODO_PAGO_LABELS[p.metodo] || p.metodo,
      p.esSenia ? 'Seña inicial' : 'Cobro',
      `"${p.nota || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `caja_elege_${filtroPeriodo}_${hoyStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* TARJETAS RESUMEN DE CAJA */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Recaudación Total del Período */}
        <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-bold">Recaudación Filtrada</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700">
            {formatMoneda(totalRecaudadoPeriodo)}
          </div>
          <div className="text-[11px] text-neutral-500">
            {pagosFiltrados.length} cobro(s) en {filtroPeriodo === 'hoy' ? 'el día de hoy' : filtroPeriodo === 'mes' ? 'el mes en curso' : 'todo el historial'}
          </div>
        </div>

        {/* Ingresos Mensuales Acumulados */}
        <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-bold">Caja Total del Mes</span>
            <Calendar className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-neutral-900">
            {formatMoneda(kpis.ingresosMes)}
          </div>
          <div className="text-[11px] text-neutral-500">Desde el 1° del mes actual</div>
        </div>

        {/* Saldos Pendientes de Cobro */}
        <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-bold">Total Saldos Pendientes</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-amber-700">
            {formatMoneda(kpis.totalSaldoPorCobrar)}
          </div>
          <div className="text-[11px] text-neutral-500">A cobrar en la entrega</div>
        </div>
      </div>

      {/* DESGLOSE POR MEDIO DE PAGO */}
      <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-neutral-600" />
          Desglose por Medios de Pago ({filtroPeriodo.toUpperCase()})
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-xs text-neutral-600 block font-semibold">Efectivo</span>
            <div className="text-base font-extrabold font-mono tabular-nums text-neutral-900 mt-0.5">
              {formatMoneda(desgloseMetodos.efectivo)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-xs text-neutral-600 block font-semibold">Transferencia</span>
            <div className="text-base font-extrabold font-mono tabular-nums text-neutral-900 mt-0.5">
              {formatMoneda(desgloseMetodos.transferencia)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-xs text-neutral-600 block font-semibold">Tarjeta Débito</span>
            <div className="text-base font-extrabold font-mono tabular-nums text-neutral-900 mt-0.5">
              {formatMoneda(desgloseMetodos.debito)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-xs text-neutral-600 block font-semibold">Tarjeta Crédito</span>
            <div className="text-base font-extrabold font-mono tabular-nums text-neutral-900 mt-0.5">
              {formatMoneda(desgloseMetodos.credito)}
            </div>
          </div>
        </div>
      </div>

      {/* TABLA DE MOVIMIENTOS Y FILTROS */}
      <div className="space-y-3">
        {/* Filtros */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
            <button
              type="button"
              onClick={() => setFiltroPeriodo('hoy')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filtroPeriodo === 'hoy'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setFiltroPeriodo('mes')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filtroPeriodo === 'mes'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => setFiltroPeriodo('todos')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filtroPeriodo === 'todos'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Histórico Completo
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
              className="bg-white border border-neutral-300 text-xs font-semibold text-neutral-800 rounded-xl px-3 py-1.5 outline-none shadow-2xs"
            >
              <option value="todos">Todos los métodos</option>
              <option value="efectivo">Solo Efectivo</option>
              <option value="transferencia">Solo Transferencia</option>
              <option value="debito">Solo Débito</option>
              <option value="credito">Solo Crédito</option>
            </select>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-neutral-800 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Tabla de Cobros */}
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          {pagosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No se registraron movimientos en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">Fecha y Hora</th>
                    <th className="py-3.5 px-4">Pedido #</th>
                    <th className="py-3.5 px-4">Cliente</th>
                    <th className="py-3.5 px-4">Medio de Pago</th>
                    <th className="py-3.5 px-4">Tipo</th>
                    <th className="py-3.5 px-4">Nota / Operación</th>
                    <th className="py-3.5 px-4 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {pagosFiltrados.map((pago) => (
                    <tr key={pago.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-neutral-600">
                        {formatFechaHora(pago.fecha)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-extrabold text-neutral-900">
                        {pago.codigoPedido || '-'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-neutral-900">
                        {pago.clienteNombre || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-700 font-medium">
                        {METODO_PAGO_LABELS[pago.metodo] || pago.metodo}
                      </td>
                      <td className="py-3.5 px-4">
                        {pago.esSenia ? (
                          <span className="text-[10px] font-bold text-amber-800 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200">
                            Seña
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-800 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
                            Cobro
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-500 italic">
                        {pago.nota || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-700">
                        {formatMoneda(pago.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ESTADÍSTICAS DE SERVICIOS */}
      <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
          <Shirt className="w-4 h-4 text-neutral-600" />
          Servicios Más Solicitados
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {rankingServicios.map(([servKey, data]) => {
            const servInfo = (SERVICIOS_INFO as Record<string, { label: string }>)[servKey] || { label: servKey };
            return (
              <div
                key={servKey}
                className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-neutral-900">{servInfo.label}</div>
                  <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                    {data.cant} prenda(s)
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-extrabold text-neutral-900">
                    {formatMoneda(data.total)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
