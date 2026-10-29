import React, { useState } from 'react';
import { Plus, QrCode, Search, LogOut } from 'lucide-react';
import { NavTab } from './Sidebar';

interface HeaderProps {
  activeTab: NavTab;
  onOpenScanner: () => void;
  onNewOrder: () => void;
  onSearchLookup: (query: string) => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenScanner,
  onNewOrder,
  onSearchLookup,
  onLogout,
}) => {
  const [query, setQuery] = useState('');

  const getBreadcrumb = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Inicio';
      case 'pedidos':
        return 'Pedidos';
      case 'clientes':
        return 'Clientes';
      case 'caja':
        return 'Caja';
      case 'configuracion':
        return 'Ajustes';
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearchLookup(query.trim());
    }
  };

  return (
    <header className="h-14 sm:h-16 border-b border-neutral-200 bg-white px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0 no-print shadow-2xs">
      {/* Zone 1: Title & Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="lg:hidden flex items-center gap-1.5 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neutral-900 text-white font-black text-xs flex items-center justify-center">
            LG
          </div>
          <span className="font-bold text-xs sm:text-sm tracking-tight text-neutral-900">eLeGe</span>
          <span className="text-neutral-300">/</span>
        </div>
        <h1 className="text-sm sm:text-base font-bold text-neutral-900 truncate">
          {getBreadcrumb()}
        </h1>
      </div>

      {/* Zone 2: Instant Search */}
      <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center max-w-sm flex-1 mx-4">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearchLookup(e.target.value);
            }}
            placeholder="Buscar por cliente, pedido o prenda..."
            className="w-full bg-neutral-100 border border-neutral-200 focus:border-neutral-400 focus:bg-white text-xs text-neutral-900 placeholder:text-neutral-500 rounded-xl pl-9 pr-3 py-2 outline-none transition-all"
          />
        </div>
      </form>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenScanner}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-xl transition-colors cursor-pointer"
        >
          <QrCode className="w-4 h-4 text-emerald-600" />
          <span className="whitespace-nowrap">Escanear QR</span>
        </button>

        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-98"
          title="Crear nuevo pedido"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nuevo Pedido</span>
        </button>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="lg:hidden p-1.5 sm:p-2 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
