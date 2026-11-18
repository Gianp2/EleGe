import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Shirt,
  Download,
  FileText,
  Plus,
  Minus,
  Search,
  Sparkles,
  Edit3,
  Ban,
  History,
  Info,
} from 'lucide-react';
import {
  ResumenKPIs,
  Pedido,
  MovimientoCaja,
  TipoMovimientoCaja,
} from '../../types';
import {
  formatMoneda,
  formatFechaHora,
  METODO_PAGO_LABELS,
  CATEGORIA_CAJA_LABELS,
  SERVICIOS_INFO,
  getLocalDateKey,
  getStartOfWeekDateKey,
  getStartOfMonthDateKey,
} from '../../utils/formatters';
import { storage } from '../../services/storage';
import { MovimientoCajaModal } from './MovimientoCajaModal';
import { AsistenteCajaPanel } from './AsistenteCajaPanel';

interface CashAndReportsViewProps {
  kpis: ResumenKPIs;
  pedidos: Pedido[];
}

type PeriodoCaja = 'hoy' | 'semana' | 'mes' | 'personalizado' | 'todos';

export const CashAndReportsView: React.FC<CashAndReportsViewProps> = ({ pedidos }) => {
  const hoyStr = getLocalDateKey();
  const [periodo, setPeriodo] = useState<PeriodoCaja>('hoy');
  const [fechaDesdeCustom, setFechaDesdeCustom] = useState<string>(getStartOfMonthDateKey());
  const [fechaHastaCustom, setFechaHastaCustom] = useState<string>(hoyStr);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoMovimientoCaja>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');
  const [mostrarAnulados, setMostrarAnulados] = useState<boolean>(true);
  const [mostrarAsistente, setMostrarAsistente] = useState<boolean>(false);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  // Modales de Caja
  const [movModal, setMovModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit' | 'annul';
    tipoInicial?: TipoMovimientoCaja;
    movimiento?: MovimientoCaja | null;
  }>({ isOpen: false, mode: 'create', tipoInicial: 'egreso', movimiento: null });

  const [isPrintingReport, setIsPrintingReport] = useState<boolean>(false);

  const forceRefresh = () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    const unsub = storage.subscribe(forceRefresh);
    return () => unsub();
  }, []);

  const rangoFechas = useMemo(() => {
    const now = new Date();
    if (periodo === 'hoy') {
      return { fechaDesde: hoyStr, fechaHasta: hoyStr, label: 'Hoy' };
    }
    if (periodo === 'semana') {
      return {
        fechaDesde: getStartOfWeekDateKey(now),
        fechaHasta: hoyStr,
        label: 'Esta Semana',
      };
    }
    if (periodo === 'mes') {
      return {
        fechaDesde: getStartOfMonthDateKey(now),
        fechaHasta: hoyStr,
        label: 'Este Mes',
      };
    }
    if (periodo === 'personalizado') {
      return {
        fechaDesde: fechaDesdeCustom || undefined,
        fechaHasta: fechaHastaCustom || undefined,
        label: `${fechaDesdeCustom || '...'} al ${fechaHastaCustom || '...'}`,
      };
    }
    return { fechaDesde: undefined, fechaHasta: undefined, label: 'Histórico completo' };
  }, [periodo, fechaDesdeCustom, fechaHastaCustom, hoyStr]);

  const { movimientosFiltrados, resumen } = useMemo(() => {
    return storage.getResumenCaja({
      fechaDesde: rangoFechas.fechaDesde,
      fechaHasta: rangoFechas.fechaHasta,
      tipo: filtroTipo,
      categoria: filtroCategoria,
      metodo: filtroMetodo,
      busqueda,
    });
  }, [rangoFechas, filtroTipo, filtroCategoria, filtroMetodo, busqueda, refreshTick, pedidos]);

  const movimientosVisibles = useMemo(() => {
    if (mostrarAnulados) return movimientosFiltrados;
    return movimientosFiltrados.filter((m) => !m.anulado);
  }, [movimientosFiltrados, mostrarAnulados]);

  // Ranking de servicios (excluye pedidos cancelados)
  const rankingServicios = useMemo(() => {
    const conteo: Record<string, { cant: number; total: number }> = {};
    pedidos.forEach((ped) => {
      if (ped.estadoGeneral === 'cancelado') return;
      ped.prendas.forEach((prenda) => {
        const serv = prenda.servicio;
        if (!conteo[serv]) conteo[serv] = { cant: 0, total: 0 };
        conteo[serv].cant++;
        conteo[serv].total += prenda.precio;
      });
    });
    return Object.entries(conteo).sort((a, b) => b[1].cant - a[1].cant);
  }, [pedidos]);

  const categoriasEgresoOrdenadas = useMemo(() => {
    return Object.entries(resumen.desgloseEgresosCategoria).sort((a, b) => b[1] - a[1]);
  }, [resumen.desgloseEgresosCategoria]);

  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Fecha y Hora',
      'Tipo',
      'Categoría',
      'Concepto',
      'Cliente',
      'Pedido',
      'Medio de Pago',
      'Origen',
      'Estado',
      'Importe',
      'Observaciones',
    ];

    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = movimientosVisibles.map((m) => [
      escapeCsv(m.id),
      escapeCsv(formatFechaHora(m.fecha)),
      escapeCsv(m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'),
      escapeCsv(CATEGORIA_CAJA_LABELS[m.categoria] || m.categoria),
      escapeCsv(m.concepto),
      escapeCsv(m.clienteNombre || '-'),
      escapeCsv(m.codigoPedido || '-'),
      escapeCsv(METODO_PAGO_LABELS[m.metodo] || m.metodo),
      escapeCsv(m.origen === 'pedido_pago' ? 'Cobro de pedido' : 'Manual'),
      escapeCsv(m.anulado ? `Anulado (${m.motivoAnulacion || ''})` : 'Vigente'),
      m.anulado ? 0 : m.tipo === 'ingreso' ? m.monto : -m.monto,
      escapeCsv(m.observaciones || ''),
    ]);

    const csvBody = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `caja_elege_${periodo}_${hoyStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    setIsPrintingReport(true);
    const cleanup = () => setIsPrintingReport(false);
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      window.print();
    }, 120);
    setTimeout(cleanup, 3000);
  };

  const configComercio = storage.getConfiguracion();

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* BARRA DE ACCIONES RÁPIDAS DE CAJA */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 no-print">
        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setMovModal({ isOpen: true, mode: 'create', tipoInicial: 'ingreso', movimiento: null })
            }
            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Ingreso</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setMovModal({ isOpen: true, mode: 'create', tipoInicial: 'egreso', movimiento: null })
            }
            className="inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[42px] text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Minus className="w-4 h-4 shrink-0" />
            <span>Egreso / Gasto</span>
          </button>
        </div>

        <div className="grid grid-cols-3 sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarAsistente((v) => !v)}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 min-h-[40px] text-xs font-bold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
              mostrarAsistente
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border-neutral-300'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="sm:hidden">Asistente</span>
            <span className="hidden sm:inline">Asistente eLeGe</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 min-h-[40px] text-xs font-bold text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="Descargar planilla CSV compatible con Excel"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">CSV</span>
            <span className="hidden sm:inline">CSV / Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 min-h-[40px] text-xs font-bold text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="Imprimir o guardar reporte en PDF"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* ASISTENTE DE CAJA (VOZ / TECLADO) */}
      {mostrarAsistente && (
        <div className="no-print">
          <AsistenteCajaPanel
            onMovementSaved={forceRefresh}
            onApplyFilters={(filters) => {
              setPeriodo(filters.periodo);
              if (filters.tipo) setFiltroTipo(filters.tipo);
              if (filters.categoria) setFiltroCategoria(filters.categoria);
              if (filters.metodo) setFiltroMetodo(filters.metodo);
            }}
          />
        </div>
      )}

      {/* 4 TARJETAS KPI COMPACTAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 no-print">
        {/* 1. Ingresos */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1">
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-bold">Ingresos</span>
              <DollarSign className="hidden sm:block w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="text-xs text-neutral-500">
              {resumen.cantidadIngresos} operación(es) · {rangoFechas.label}
            </div>
          </div>
          <div className="text-right sm:text-left shrink-0">
            <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-700 whitespace-nowrap">
              {formatMoneda(resumen.ingresosPeriodo)}
            </div>
          </div>
        </div>

        {/* 2. Egresos */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1">
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-bold">Egresos</span>
              <TrendingDown className="hidden sm:block w-4 h-4 text-rose-600 shrink-0" />
            </div>
            <div className="text-xs text-neutral-500">
              {resumen.cantidadEgresos} gasto(s) · {rangoFechas.label}
            </div>
          </div>
          <div className="text-right sm:text-left shrink-0">
            <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-rose-700 whitespace-nowrap">
              {formatMoneda(resumen.egresosPeriodo)}
            </div>
          </div>
        </div>

        {/* 3. Balance Neto */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1">
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-bold">Balance Neto</span>
              <TrendingUp
                className={`hidden sm:block w-4 h-4 shrink-0 ${
                  resumen.balanceNetoPeriodo >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              />
            </div>
            <div className="text-xs text-neutral-500">Ingresos menos egresos</div>
          </div>
          <div className="text-right sm:text-left shrink-0">
            <div
              className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums whitespace-nowrap ${
                resumen.balanceNetoPeriodo >= 0 ? 'text-neutral-900' : 'text-rose-700'
              }`}
            >
              {formatMoneda(resumen.balanceNetoPeriodo)}
            </div>
          </div>
        </div>

        {/* 4. Saldo de Caja (Efectivo físico separado de medios digitales) */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs min-w-0 flex sm:block items-center justify-between gap-3 sm:space-y-1">
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex items-center justify-between gap-1 text-neutral-600">
              <span className="text-xs sm:text-sm font-bold">Saldo de Caja</span>
              <Wallet className="hidden sm:block w-4 h-4 text-neutral-800 shrink-0" />
            </div>
            <div className="text-xs font-semibold text-emerald-800 sm:hidden">Efectivo físico</div>
          </div>
          <div className="text-right sm:text-left shrink-0 space-y-0.5">
            <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-neutral-900 whitespace-nowrap">
              {formatMoneda(resumen.efectivoDisponible)}
            </div>
            <div className="text-xs text-neutral-600 flex sm:flex-wrap items-center justify-end sm:justify-between gap-1">
              <span className="hidden sm:inline font-semibold text-emerald-800">Efectivo físico</span>
              <span className="font-mono text-neutral-500 whitespace-nowrap">
                Digital: {formatMoneda(resumen.saldoDigitalDisponible)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AVISO SEPARADO DE SALDOS PENDIENTES POR COBRAR */}
      <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs no-print">
        <div className="flex items-center gap-2 text-amber-900 min-w-0">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Saldos pendientes de clientes:</strong> no se suman como ingresos hasta que se cobran al entregar.
          </span>
        </div>
        <span className="font-mono font-extrabold text-amber-800 text-sm shrink-0">
          {formatMoneda(resumen.saldosPorCobrarClientes)} por cobrar
        </span>
      </div>

      {/* DESGLOSE POR MEDIO DE PAGO Y GASTOS POR CATEGORÍA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 no-print">
        <div className="lg:col-span-2 p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-neutral-600 shrink-0" />
            <span>Medios de Pago ({rangoFechas.label})</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['efectivo', 'transferencia', 'debito', 'credito'] as const).map((met) => {
              const info = resumen.desgloseMetodos[met];
              return (
                <div
                  key={met}
                  className="p-2.5 sm:p-3 rounded-xl bg-neutral-50 border border-neutral-200 min-w-0 space-y-1"
                >
                  <span className="text-xs text-neutral-700 block font-bold truncate">
                    {METODO_PAGO_LABELS[met]}
                  </span>
                  <div className="text-sm sm:text-base font-extrabold font-mono tabular-nums text-neutral-900 whitespace-nowrap">
                    {formatMoneda(info.neto)}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500 flex flex-wrap gap-x-2">
                    <span className="text-emerald-700 whitespace-nowrap">+{formatMoneda(info.ingresos)}</span>
                    {info.egresos > 0 && (
                      <span className="text-rose-700 whitespace-nowrap">-{formatMoneda(info.egresos)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Egresos por categoría */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
            Egresos por Categoría
          </h3>
          {categoriasEgresoOrdenadas.length === 0 ? (
            <div className="p-4 text-center text-xs text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200">
              Sin egresos en este período.
            </div>
          ) : (
            <div className="space-y-1.5">
              {categoriasEgresoOrdenadas.map(([cat, total]) => (
                <div
                  key={cat}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-xs"
                >
                  <span className="font-semibold text-neutral-800 truncate">
                    {(CATEGORIA_CAJA_LABELS as Record<string, string>)[cat] || cat}
                  </span>
                  <span className="font-mono font-extrabold text-rose-700 shrink-0">
                    {formatMoneda(total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FILTROS Y BUSCADOR */}
      <div className="space-y-2.5 no-print">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          {/* Selector de Período en fila única deslizable */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-xl border border-neutral-200 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: 'Semana' },
                { id: 'mes', label: 'Mes' },
                { id: 'personalizado', label: 'Personalizado' },
                { id: 'todos', label: 'Histórico' },
              ] as Array<{ id: PeriodoCaja; label: string }>
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`shrink-0 min-h-[38px] px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  periodo === p.id
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Filtros secundarios */}
          <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-2">
            <div className="relative col-span-2 lg:flex-1 lg:min-w-[180px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar concepto, cliente o #pedido..."
                className="w-full min-h-[42px] bg-white border border-neutral-300 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-neutral-900 outline-none"
              />
            </div>

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as 'todos' | TipoMovimientoCaja)}
              aria-label="Filtrar por tipo de movimiento"
              className="col-span-1 min-h-[40px] bg-white border border-neutral-300 text-xs font-semibold text-neutral-800 rounded-xl px-2.5 sm:px-3 py-2 outline-none cursor-pointer"
            >
              <option value="todos">Todos los tipos</option>
              <option value="ingreso">Solo Ingresos</option>
              <option value="egreso">Solo Egresos</option>
            </select>

            <select
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
              aria-label="Filtrar por medio de pago"
              className="col-span-1 min-h-[40px] bg-white border border-neutral-300 text-xs font-semibold text-neutral-800 rounded-xl px-2.5 sm:px-3 py-2 outline-none cursor-pointer"
            >
              <option value="todos">Todos los medios</option>
              {Object.entries(METODO_PAGO_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              aria-label="Filtrar por categoría"
              className="col-span-2 lg:w-auto min-h-[40px] bg-white border border-neutral-300 text-xs font-semibold text-neutral-800 rounded-xl px-2.5 sm:px-3 py-2 outline-none cursor-pointer"
            >
              <option value="todas">Todas las categorías</option>
              {Object.entries(CATEGORIA_CAJA_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rango personalizado */}
        {periodo === 'personalizado' && (
          <div className="p-3 rounded-xl bg-white border border-neutral-200 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
              <label className="font-bold text-neutral-700">Desde:</label>
              <input
                type="date"
                value={fechaDesdeCustom}
                onChange={(e) => setFechaDesdeCustom(e.target.value)}
                className="w-full sm:w-auto bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 font-mono text-neutral-900"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
              <label className="font-bold text-neutral-700">Hasta:</label>
              <input
                type="date"
                value={fechaHastaCustom}
                onChange={(e) => setFechaHastaCustom(e.target.value)}
                className="w-full sm:w-auto bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 font-mono text-neutral-900"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 px-1">
          <span>
            Mostrando <strong className="text-neutral-900">{movimientosVisibles.length}</strong>{' '}
            movimiento(s)
          </span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarAnulados}
              onChange={(e) => setMostrarAnulados(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-neutral-300"
            />
            <span>Mostrar movimientos anulados</span>
          </label>
        </div>

        {/* HISTORIAL CRONOLÓGICO DE MOVIMIENTOS */}
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          {movimientosVisibles.length === 0 ? (
            <div className="p-8 text-center text-xs sm:text-sm text-neutral-500">
              No se registraron movimientos con los filtros seleccionados.
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Fecha / Hora</th>
                      <th className="py-3 px-4">Tipo / Categoría</th>
                      <th className="py-3 px-4">Concepto y Detalle</th>
                      <th className="py-3 px-4">Medio</th>
                      <th className="py-3 px-4 text-right">Importe</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {movimientosVisibles.map((mov) => (
                      <tr
                        key={mov.id}
                        className={`transition-colors ${
                          mov.anulado ? 'bg-neutral-50/70 opacity-65' : 'hover:bg-neutral-50/80'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-neutral-600 whitespace-nowrap">
                          {formatFechaHora(mov.fecha)}
                        </td>
                        <td className="py-3 px-4 space-y-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {mov.anulado ? (
                              <span className="text-[11px] font-bold text-neutral-700 px-2 py-0.5 rounded-md bg-neutral-200 border border-neutral-300">
                                Anulado
                              </span>
                            ) : mov.tipo === 'ingreso' ? (
                              <span className="text-[11px] font-bold text-emerald-800 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
                                Ingreso
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-rose-800 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200">
                                Egreso
                              </span>
                            )}
                            {mov.codigoPedido && (
                              <span className="text-[11px] font-mono font-bold text-neutral-800 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200">
                                {mov.codigoPedido}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-600 font-medium">
                            {CATEGORIA_CAJA_LABELS[mov.categoria] || mov.categoria}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div
                            className={`font-bold text-neutral-900 ${
                              mov.anulado ? 'line-through' : ''
                            }`}
                          >
                            {mov.concepto}
                          </div>
                          {mov.clienteNombre && (
                            <div className="text-[11px] text-neutral-600">
                              Cliente: <strong>{mov.clienteNombre}</strong>
                            </div>
                          )}
                          {mov.observaciones && (
                            <div className="text-[11px] text-neutral-500 italic">
                              {mov.observaciones}
                            </div>
                          )}
                          {mov.anulado && mov.motivoAnulacion && (
                            <div className="text-[11px] text-rose-700 font-medium">
                              Motivo anulación: {mov.motivoAnulacion}
                            </div>
                          )}
                          {mov.historialCambios && mov.historialCambios.length > 0 && (
                            <div className="text-[11px] text-amber-800 inline-flex items-center gap-1 mt-0.5">
                              <History className="w-3 h-3" />
                              <span>Editado ({mov.historialCambios.length})</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-neutral-700 font-medium whitespace-nowrap">
                          {METODO_PAGO_LABELS[mov.metodo] || mov.metodo}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-extrabold whitespace-nowrap ${
                            mov.anulado
                              ? 'text-neutral-400 line-through'
                              : mov.tipo === 'ingreso'
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {mov.tipo === 'ingreso' ? '+' : '-'}
                          {formatMoneda(mov.monto)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {!mov.anulado ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setMovModal({
                                    isOpen: true,
                                    mode: 'edit',
                                    movimiento: mov,
                                  })
                                }
                                className="p-1.5 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                                title="Corregir movimiento"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setMovModal({
                                    isOpen: true,
                                    mode: 'annul',
                                    movimiento: mov,
                                  })
                                }
                                className="p-1.5 text-neutral-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Anular movimiento"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-neutral-400 font-medium">Sin acciones</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-neutral-200">
                {movimientosVisibles.map((mov) => (
                  <div
                    key={mov.id}
                    className={`p-3.5 space-y-2 ${mov.anulado ? 'bg-neutral-50/80 opacity-70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {mov.anulado ? (
                            <span className="text-[11px] font-bold text-neutral-700 px-2 py-0.5 rounded-md bg-neutral-200 border border-neutral-300">
                              Anulado
                            </span>
                          ) : mov.tipo === 'ingreso' ? (
                            <span className="text-[11px] font-bold text-emerald-800 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
                              Ingreso
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-rose-800 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200">
                              Egreso
                            </span>
                          )}
                          {mov.codigoPedido && (
                            <span className="text-[11px] font-mono font-bold text-neutral-800 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200">
                              {mov.codigoPedido}
                            </span>
                          )}
                          <span className="text-[11px] text-neutral-500 font-medium">
                            {CATEGORIA_CAJA_LABELS[mov.categoria] || mov.categoria}
                          </span>
                        </div>
                        <div
                          className={`text-sm font-bold text-neutral-900 break-words ${
                            mov.anulado ? 'line-through' : ''
                          }`}
                        >
                          {mov.concepto}
                        </div>
                        {mov.clienteNombre && (
                          <div className="text-xs text-neutral-600">{mov.clienteNombre}</div>
                        )}
                      </div>

                      <div
                        className={`text-right font-mono font-extrabold text-base shrink-0 ${
                          mov.anulado
                            ? 'text-neutral-400 line-through'
                            : mov.tipo === 'ingreso'
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {mov.tipo === 'ingreso' ? '+' : '-'}
                        {formatMoneda(mov.monto)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                      <span className="font-medium text-neutral-800">
                        {METODO_PAGO_LABELS[mov.metodo] || mov.metodo}
                      </span>
                      <span className="font-mono text-neutral-500">
                        {formatFechaHora(mov.fecha)}
                      </span>
                    </div>

                    {mov.observaciones && (
                      <div className="text-xs text-neutral-500 italic break-words">
                        {mov.observaciones}
                      </div>
                    )}

                    {mov.anulado && mov.motivoAnulacion && (
                      <div className="text-xs text-rose-700 font-medium break-words">
                        Motivo anulación: {mov.motivoAnulacion}
                      </div>
                    )}

                    {!mov.anulado && (
                      <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                        <button
                          type="button"
                          onClick={() =>
                            setMovModal({ isOpen: true, mode: 'edit', movimiento: mov })
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Corregir</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMovModal({ isOpen: true, mode: 'annul', movimiento: mov })
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[38px] text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Anular</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ESTADÍSTICAS DE SERVICIOS */}
      <div className="p-3.5 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3 no-print">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-2">
          <Shirt className="w-4 h-4 text-neutral-600 shrink-0" />
          <span>Servicios Más Solicitados</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {rankingServicios.map(([servKey, data]) => {
            const servInfo =
              (SERVICIOS_INFO as Record<string, { label: string }>)[servKey] || {
                label: servKey,
              };
            return (
              <div
                key={servKey}
                className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between gap-2 min-w-0"
              >
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-neutral-900 break-words">
                    {servInfo.label}
                  </div>
                  <div className="text-xs text-neutral-500 font-mono mt-0.5">
                    {data.cant} prenda(s)
                  </div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className="text-xs sm:text-sm font-extrabold text-neutral-900">
                    {formatMoneda(data.total)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ÁREA IMPRIMIBLE PARA EXPORTAR PDF (solo montada durante impresión) */}
      {isPrintingReport && (
        <div className="printable-area w-full max-w-4xl mx-auto p-6 bg-white text-black space-y-4">
          <div className="border-b-2 border-black pb-3 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold">{configComercio.nombreComercio}</h1>
              <p className="text-xs">
                Reporte de Caja y Balance · Período: {rangoFechas.label}
              </p>
            </div>
            <div className="text-right text-xs font-mono">
              <div>Emitido: {formatFechaHora(new Date().toISOString())}</div>
              <div>{configComercio.telefono}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs border-b border-neutral-300 pb-3">
            <div className="p-2 border border-neutral-300 rounded">
              <div className="font-bold">Ingresos</div>
              <div className="text-base font-mono font-extrabold">
                {formatMoneda(resumen.ingresosPeriodo)}
              </div>
            </div>
            <div className="p-2 border border-neutral-300 rounded">
              <div className="font-bold">Egresos</div>
              <div className="text-base font-mono font-extrabold">
                {formatMoneda(resumen.egresosPeriodo)}
              </div>
            </div>
            <div className="p-2 border border-neutral-300 rounded">
              <div className="font-bold">Balance Neto</div>
              <div className="text-base font-mono font-extrabold">
                {formatMoneda(resumen.balanceNetoPeriodo)}
              </div>
            </div>
            <div className="p-2 border border-neutral-300 rounded">
              <div className="font-bold">Efectivo Disponible</div>
              <div className="text-base font-mono font-extrabold">
                {formatMoneda(resumen.efectivoDisponible)}
              </div>
              <div className="text-[10px]">
                Digital: {formatMoneda(resumen.saldoDigitalDisponible)}
              </div>
            </div>
          </div>

          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1.5 pr-2">Fecha</th>
                <th className="py-1.5 pr-2">Tipo</th>
                <th className="py-1.5 pr-2">Categoría</th>
                <th className="py-1.5 pr-2">Concepto</th>
                <th className="py-1.5 pr-2">Medio</th>
                <th className="py-1.5 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {movimientosVisibles
                .filter((m) => !m.anulado)
                .map((m) => (
                  <tr key={m.id} className="border-b border-neutral-200">
                    <td className="py-1.5 pr-2 font-mono whitespace-nowrap">
                      {formatFechaHora(m.fecha)}
                    </td>
                    <td className="py-1.5 pr-2">
                      {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                    </td>
                    <td className="py-1.5 pr-2">
                      {CATEGORIA_CAJA_LABELS[m.categoria] || m.categoria}
                    </td>
                    <td className="py-1.5 pr-2">
                      {m.concepto}
                      {m.clienteNombre ? ` (${m.clienteNombre})` : ''}
                    </td>
                    <td className="py-1.5 pr-2">
                      {METODO_PAGO_LABELS[m.metodo] || m.metodo}
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold whitespace-nowrap">
                      {m.tipo === 'ingreso' ? '+' : '-'}
                      {formatMoneda(m.monto)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALES */}
      <MovimientoCajaModal
        isOpen={movModal.isOpen}
        onClose={() => setMovModal((prev) => ({ ...prev, isOpen: false }))}
        mode={movModal.mode}
        tipoInicial={movModal.tipoInicial}
        movimiento={movModal.movimiento}
        onSaved={forceRefresh}
      />
    </div>
  );
};
