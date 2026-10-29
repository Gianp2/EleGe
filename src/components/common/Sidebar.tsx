import {
  LayoutDashboard,
  Shirt,
  Users,
  QrCode,
  ReceiptText,
  RotateCcw,
  Settings,
  LogOut,
} from 'lucide-react';
import { ResumenKPIs } from '../../types';

export type NavTab = 'dashboard' | 'pedidos' | 'clientes' | 'caja' | 'configuracion';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenScanner: () => void;
  onNewOrder: () => void;
  kpis: ResumenKPIs;
  onResetData: () => void;
  onLogout?: () => void;
  userEmail?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenScanner,
  kpis,
  onResetData,
  onLogout,
  userEmail,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'pedidos' as NavTab,
      label: 'Pedidos y Prendas',
      icon: Shirt,
      badge: kpis.pedidosPendientesRetiro > 0 ? `${kpis.pedidosPendientesRetiro} listos` : undefined,
    },
    {
      id: 'clientes' as NavTab,
      label: 'Clientes',
      icon: Users,
    },
    {
      id: 'caja' as NavTab,
      label: 'Caja y Reportes',
      icon: ReceiptText,
    },
    {
      id: 'configuracion' as NavTab,
      label: 'Configuración',
      icon: Settings,
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-neutral-200 bg-white p-4 shrink-0 justify-between select-none shadow-xs">
      <div className="space-y-6">
        {/* Brand Zone */}
        <div className="px-2 py-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-extrabold text-sm tracking-tight shadow-xs">
              LG
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-neutral-900 block leading-tight">
                Lavadero eLeGe
              </span>
              <span className="text-[11px] text-neutral-500 font-mono tracking-wider uppercase block">
                Control Operativo
              </span>
            </div>
          </div>
        </div>

        {/* Action Direct Button */}
        <div className="px-1">
          <button
            type="button"
            onClick={onOpenScanner}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-300 rounded-xl transition-all cursor-pointer group shadow-2xs"
          >
            <QrCode className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            <span>Lector QR / Escáner</span>
          </button>
        </div>

        {/* Navigation links */}
        <nav className="space-y-1">
          <div className="px-2 pb-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Módulos
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                      isActive
                        ? 'bg-neutral-800 text-emerald-300 border-neutral-700'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area */}
      <div className="pt-3 border-t border-neutral-200 space-y-2.5 px-2">
        {/* Usuario Administradora */}
        <div className="p-2 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 block font-semibold">
              Administradora
            </span>
            <span className="text-xs font-semibold text-neutral-800 truncate block" title={userEmail || 'admin@elege.com'}>
              {userEmail || 'admin@elege.com'}
            </span>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <span>v1.2.0 · LocalStorage</span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Operativo
          </span>
        </div>
        <button
          type="button"
          onClick={onResetData}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
          title="Restaura los datos de demostración iniciales"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar datos demo</span>
        </button>
      </div>
    </aside>
  );
};
