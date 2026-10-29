import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  AlertCircle,
  Edit2,
  Trash2,
  Package,
  CheckCircle2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { Cliente, ClasificacionCliente } from '../../types';
import { formatMoneda, formatFechaCorta } from '../../utils/formatters';
import { storage } from '../../services/storage';

interface ClientListViewProps {
  clientes: Cliente[];
  onOpenNewClient: () => void;
  onSelectClient: (cliente: Cliente) => void;
  onEditClient: (cliente: Cliente) => void;
  onNewOrderForClient: (cliente: Cliente) => void;
  onDeleteClient: (cliente: Cliente) => void;
  searchFilter?: string;
}

type FiltroCategoria = 'todos' | 'deuda' | 'activos' | 'listas' | 'frecuentes' | 'nuevos';
type TipoOrdenamiento = 'recientes' | 'ultima_visita' | 'mas_frecuentes' | 'alfabetico';

export const ClientListView: React.FC<ClientListViewProps> = ({
  clientes,
  onOpenNewClient,
  onSelectClient,
  onEditClient,
  onNewOrderForClient,
  onDeleteClient,
  searchFilter = '',
}) => {
  const [searchTerm, setSearchTerm] = useState(searchFilter);
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('todos');
  const [ordenamiento, setOrdenamiento] = useState<TipoOrdenamiento>('ultima_visita');
  
  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [itemsPorPagina, setItemsPorPagina] = useState(15);

  // Mapeo precalculado de pedidos por cliente para búsquedas ultrarrápidas por código de pedido y última visita
  const { pedidosPorCliente, codigosPedidoPorCliente, ultimaVisitaPorCliente } = useMemo(() => {
    const pedidos = storage.getPedidos();
    const mapPed: Record<string, number> = {};
    const mapCodigos: Record<string, string[]> = {};
    const mapUltimaVisita: Record<string, string> = {};

    for (const p of pedidos) {
      mapPed[p.clienteId] = (mapPed[p.clienteId] || 0) + 1;
      
      if (!mapCodigos[p.clienteId]) mapCodigos[p.clienteId] = [];
      mapCodigos[p.clienteId].push(p.codigoVisible.toLowerCase());
      mapCodigos[p.clienteId].push(p.id.toLowerCase());

      const currentLatest = mapUltimaVisita[p.clienteId];
      if (!currentLatest || new Date(p.fechaRecepcion) > new Date(currentLatest)) {
        mapUltimaVisita[p.clienteId] = p.fechaRecepcion;
      }
    }

    return {
      pedidosPorCliente: mapPed,
      codigosPedidoPorCliente: mapCodigos,
      ultimaVisitaPorCliente: mapUltimaVisita,
    };
  }, [clientes]);

  // Caché de métricas para evitar recalcular reiteradamente
  const metricasPorCliente = useMemo(() => {
    const map: Record<string, ReturnType<typeof storage.getMetricasCliente>> = {};
    for (const c of clientes) {
      map[c.id] = storage.getMetricasCliente(c.id);
    }
    return map;
  }, [clientes]);

  // Conteo dinámico para insignias de las pestañas
  const conteoTabs = useMemo(() => {
    let conDeuda = 0;
    let conActivos = 0;
    let conListas = 0;
    let frecuentes = 0;
    let nuevos = 0;

    for (const c of clientes) {
      const m = metricasPorCliente[c.id];
      if (m) {
        if (m.saldoDeuda > 0) conDeuda++;
        if (m.pedidosActivos > 0) conActivos++;
        if (m.prendasActivasListas > 0) conListas++;
        if (m.clasificacion === 'frecuente') frecuentes++;
        if (m.clasificacion === 'nuevo') nuevos++;
      }
    }

    return {
      todos: clientes.length,
      deuda: conDeuda,
      activos: conActivos,
      listas: conListas,
      frecuentes,
      nuevos,
    };
  }, [clientes, metricasPorCliente]);

  // Filtrado y búsqueda instantánea
  const clientesFiltrados = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();

    return clientes.filter((c) => {
      // 1. Filtro de búsqueda
      if (query) {
        const nombreCompleto = `${c.nombre} ${c.apellido || ''}`.toLowerCase();
        const telefono = c.telefono.toLowerCase();
        const idCliente = c.id.toLowerCase();
        const codigosPedidos = codigosPedidoPorCliente[c.id] || [];

        const coincideTexto =
          nombreCompleto.includes(query) ||
          telefono.includes(query) ||
          idCliente.includes(query) ||
          codigosPedidos.some((cod) => cod.includes(query));

        if (!coincideTexto) return false;
      }

      // 2. Filtro por categoría
      const metricas = metricasPorCliente[c.id];
      if (!metricas) return true;

      switch (filtroCategoria) {
        case 'deuda':
          return metricas.saldoDeuda > 0;
        case 'activos':
          return metricas.pedidosActivos > 0;
        case 'listas':
          return metricas.prendasActivasListas > 0;
        case 'frecuentes':
          return metricas.clasificacion === 'frecuente';
        case 'nuevos':
          return metricas.clasificacion === 'nuevo';
        case 'todos':
        default:
          return true;
      }
    });
  }, [clientes, searchTerm, filtroCategoria, codigosPedidoPorCliente, metricasPorCliente]);

  // Ordenamiento
  const clientesOrdenados = useMemo(() => {
    return [...clientesFiltrados].sort((a, b) => {
      if (ordenamiento === 'recientes') {
        return new Date(b.fechaAlta).getTime() - new Date(a.fechaAlta).getTime();
      }
      if (ordenamiento === 'ultima_visita') {
        const fechaA = ultimaVisitaPorCliente[a.id] || a.fechaAlta;
        const fechaB = ultimaVisitaPorCliente[b.id] || b.fechaAlta;
        return new Date(fechaB).getTime() - new Date(fechaA).getTime();
      }
      if (ordenamiento === 'mas_frecuentes') {
        const pedA = metricasPorCliente[a.id]?.totalPedidos || 0;
        const pedB = metricasPorCliente[b.id]?.totalPedidos || 0;
        if (pedB !== pedA) return pedB - pedA;
        return (metricasPorCliente[b.id]?.totalGastado || 0) - (metricasPorCliente[a.id]?.totalGastado || 0);
      }
      if (ordenamiento === 'alfabetico') {
        const nomA = `${a.nombre} ${a.apellido || ''}`.trim().toLowerCase();
        const nomB = `${b.nombre} ${b.apellido || ''}`.trim().toLowerCase();
        return nomA.localeCompare(nomB);
      }
      return 0;
    });
  }, [clientesFiltrados, ordenamiento, ultimaVisitaPorCliente, metricasPorCliente]);

  // Cálculos de Paginación
  const totalPaginas = Math.ceil(clientesOrdenados.length / itemsPorPagina) || 1;
  const indexInicio = (paginaActual - 1) * itemsPorPagina;
  const clientesPaginados = clientesOrdenados.slice(indexInicio, indexInicio + itemsPorPagina);

  const cambiarPagina = (nuevaPagina: number) => {
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
      setPaginaActual(nuevaPagina);
    }
  };

  const handleCambioFiltro = (nuevoFiltro: FiltroCategoria) => {
    setFiltroCategoria(nuevoFiltro);
    setPaginaActual(1);
  };

  const handleCambioSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPaginaActual(1);
  };

  // Renderizador de insignia de clasificación
  const renderInsigniaClasificacion = (clasificacion: ClasificacionCliente) => {
    switch (clasificacion) {
      case 'frecuente':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
            Frecuente
          </span>
        );
      case 'ocasional':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
            Ocasional
          </span>
        );
      case 'nuevo':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Nuevo
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Barra de Herramientas y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Buscador Instantáneo Multi-campo */}
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleCambioSearch}
            placeholder="Buscar por nombre, apellido, teléfono, ID o N° de pedido (#2401)..."
            className="w-full bg-white border border-neutral-300 focus:border-neutral-500 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 rounded-xl pl-10 pr-3 py-2 outline-none shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setPaginaActual(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Acciones Superiores: Selector de orden y botón Nuevo Cliente */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-neutral-300 rounded-xl px-2.5 py-1.5 shadow-2xs text-xs text-neutral-700">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={ordenamiento}
              onChange={(e) => setOrdenamiento(e.target.value as TipoOrdenamiento)}
              aria-label="Criterio de ordenamiento de clientes"
              className="bg-transparent outline-none font-semibold text-neutral-800 cursor-pointer text-xs"
            >
              <option value="ultima_visita">Última visita</option>
              <option value="mas_frecuentes">Más frecuentes</option>
              <option value="recientes">Más recientes (Alta)</option>
              <option value="alfabetico">Alfabético (A-Z)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenNewClient}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* 2. Pestañas / Filtros de Estado */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          type="button"
          onClick={() => handleCambioFiltro('todos')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            filtroCategoria === 'todos'
              ? 'bg-neutral-900 text-white shadow-2xs'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <span>Todos</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filtroCategoria === 'todos' ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
            {conteoTabs.todos}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleCambioFiltro('deuda')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            filtroCategoria === 'deuda'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'bg-white text-neutral-700 hover:bg-amber-50 border border-neutral-200'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          <span>Con saldo deudor</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filtroCategoria === 'deuda' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-900'}`}>
            {conteoTabs.deuda}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleCambioFiltro('activos')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            filtroCategoria === 'activos'
              ? 'bg-neutral-900 text-white shadow-2xs'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-blue-600" />
          <span>Pedidos activos</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filtroCategoria === 'activos' ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
            {conteoTabs.activos}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleCambioFiltro('listas')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            filtroCategoria === 'listas'
              ? 'bg-emerald-700 text-white shadow-2xs'
              : 'bg-white text-neutral-700 hover:bg-emerald-50 border border-neutral-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Prendas listas</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filtroCategoria === 'listas' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-900'}`}>
            {conteoTabs.listas}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleCambioFiltro('frecuentes')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            filtroCategoria === 'frecuentes'
              ? 'bg-neutral-900 text-white shadow-2xs'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Frecuentes (≥3)</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filtroCategoria === 'frecuentes' ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
            {conteoTabs.frecuentes}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleCambioFiltro('nuevos')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            filtroCategoria === 'nuevos'
              ? 'bg-neutral-900 text-white shadow-2xs'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <span>Nuevos</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filtroCategoria === 'nuevos' ? 'bg-neutral-700 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
            {conteoTabs.nuevos}
          </span>
        </button>
      </div>

      {/* 3. Listado / Tabla Principal */}
      {clientesPaginados.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-neutral-200 text-neutral-500 space-y-2 shadow-xs">
          <Users className="w-8 h-8 mx-auto text-neutral-400" />
          <p className="text-sm font-bold text-neutral-800">No se encontraron clientes</p>
          <p className="text-xs">
            {searchTerm
              ? `No hay coincidencias para "${searchTerm}". Podés buscar por nombre, teléfono o número de pedido.`
              : 'No hay clientes registrados en esta categoría.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          {/* Vista Desktop (Tabla) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">ID / Tipo</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Última Visita</th>
                  <th className="py-3 px-4 text-center">En Proceso</th>
                  <th className="py-3 px-4 text-right">Pedidos</th>
                  <th className="py-3 px-4 text-right">Saldo Deuda</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {clientesPaginados.map((cliente) => {
                  const metricas = metricasPorCliente[cliente.id] || storage.getMetricasCliente(cliente.id);
                  const tieneDeuda = metricas.saldoDeuda > 0;
                  const ultimaVisita = ultimaVisitaPorCliente[cliente.id];

                  return (
                    <tr
                      key={cliente.id}
                      className="hover:bg-neutral-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectClient(cliente)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-mono font-bold text-neutral-700 text-xs">
                            {cliente.id}
                          </span>
                          {renderInsigniaClasificacion(metricas.clasificacion)}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-neutral-900 group-hover:text-amber-700 transition-colors">
                          {cliente.nombre} {cliente.apellido || ''}
                        </div>
                        {cliente.observaciones && (
                          <div className="text-[11px] text-neutral-500 max-w-xs truncate">
                            {cliente.observaciones}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-neutral-700">
                        {cliente.telefono}
                      </td>

                      <td className="py-3 px-4 text-neutral-600">
                        {ultimaVisita ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <span>{formatFechaCorta(ultimaVisita)}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400 italic">Sin visitas</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {metricas.prendasActivasListas > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {metricas.prendasActivasListas} lista(s)
                            </span>
                          ) : metricas.pedidosActivos > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                              <Package className="w-3 h-3 text-neutral-500" />
                              {metricas.pedidosActivos} activo(s)
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-neutral-900">
                        {metricas.totalPedidos}
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        {tieneDeuda ? (
                          <span className="text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                            {formatMoneda(metricas.saldoDeuda)}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">$ 0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onNewOrderForClient(cliente)}
                            className="p-1.5 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                            title="Crear pedido para este cliente"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditClient(cliente)}
                            className="p-1.5 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                            title="Editar datos del cliente"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteClient(cliente)}
                            className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Vista Móvil (Tarjetas táctiles compactas) */}
          <div className="md:hidden divide-y divide-neutral-200">
            {clientesPaginados.map((cliente) => {
              const metricas = metricasPorCliente[cliente.id] || storage.getMetricasCliente(cliente.id);
              const tieneDeuda = metricas.saldoDeuda > 0;

              return (
                <div
                  key={cliente.id}
                  onClick={() => onSelectClient(cliente)}
                  className="p-4 hover:bg-neutral-50 transition-colors space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-bold text-neutral-900 text-sm">
                        {cliente.nombre} {cliente.apellido || ''}
                      </div>
                      <div className="text-xs font-mono text-neutral-600 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-neutral-400" />
                        {cliente.telefono}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-neutral-700">
                        {cliente.id}
                      </span>
                      {renderInsigniaClasificacion(metricas.clasificacion)}
                    </div>
                  </div>

                  {metricas.prendasActivasListas > 0 && (
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{metricas.prendasActivasListas} prenda(s) listas para retirar</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-100">
                    <span className="text-neutral-500 font-mono">
                      {metricas.totalPedidos} pedidos realizados
                    </span>
                    {tieneDeuda ? (
                      <span className="text-amber-700 font-mono font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Deuda: {formatMoneda(metricas.saldoDeuda)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-mono font-semibold">Al día ($0)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. Barra de Paginación Accesible */}
          <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
            <div className="flex items-center gap-2">
              <span>
                Mostrando <strong className="text-neutral-900">{indexInicio + 1}</strong> a{' '}
                <strong className="text-neutral-900">
                  {Math.min(indexInicio + itemsPorPagina, clientesOrdenados.length)}
                </strong>{' '}
                de <strong className="text-neutral-900">{clientesOrdenados.length}</strong> clientes
              </span>

              <div className="flex items-center gap-1 ml-2 pl-2 border-l border-neutral-300">
                <span className="text-[11px] text-neutral-500">Filas:</span>
                <select
                  value={itemsPorPagina}
                  onChange={(e) => {
                    setItemsPorPagina(Number(e.target.value));
                    setPaginaActual(1);
                  }}
                  aria-label="Cantidad de clientes por página"
                  className="bg-white border border-neutral-300 rounded-lg px-2 py-0.5 text-xs text-neutral-800 outline-none font-semibold cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => cambiarPagina(paginaActual - 1)}
                disabled={paginaActual === 1}
                className="p-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4 text-neutral-700" />
              </button>

              {/* Botones de número de página */}
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 1)
                .map((p, idx, arr) => {
                  const esPrevGap = idx > 0 && p - arr[idx - 1] > 1;
                  return (
                    <React.Fragment key={p}>
                      {esPrevGap && <span className="px-1 text-neutral-400">...</span>}
                      <button
                        type="button"
                        onClick={() => cambiarPagina(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          paginaActual === p
                            ? 'bg-neutral-900 text-white shadow-2xs'
                            : 'bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              <button
                type="button"
                onClick={() => cambiarPagina(paginaActual + 1)}
                disabled={paginaActual === totalPaginas}
                className="p-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                title="Página siguiente"
              >
                <ChevronRight className="w-4 h-4 text-neutral-700" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
