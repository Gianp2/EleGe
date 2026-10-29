import React from 'react';
import {
  LayoutDashboard,
  Shirt,
  Users,
  QrCode,
  ReceiptText,
  Settings,
} from 'lucide-react';
import { NavTab } from './Sidebar';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const tabs = [
    { id: 'dashboard' as NavTab, label: 'Inicio', icon: LayoutDashboard },
    { id: 'pedidos' as NavTab, label: 'Pedidos', icon: Shirt },
    { id: 'clientes' as NavTab, label: 'Clientes', icon: Users },
    { id: 'caja' as NavTab, label: 'Caja', icon: ReceiptText },
    { id: 'configuracion' as NavTab, label: 'Ajustes', icon: Settings },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 border-t border-neutral-200 backdrop-blur-md px-1 py-1 grid grid-cols-5 h-16 select-none no-print shadow-lg safe-bottom">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center h-full py-1 text-[11px] sm:text-xs font-medium transition-colors cursor-pointer select-none ${
              isActive ? 'text-neutral-950 font-bold' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <div className={`p-1 rounded-lg transition-colors ${isActive ? 'bg-neutral-100 text-neutral-950' : ''}`}>
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="truncate max-w-[95%] leading-tight mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
