import React, { useState, useEffect, useRef } from 'react';
import { NavTab, Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { DashboardView } from './components/dashboard/DashboardView';
import { OrderListView } from './components/orders/OrderListView';
import { OrderCreateModal } from './components/orders/OrderCreateModal';
import { OrderDetailModal } from './components/orders/OrderDetailModal';
import { ClientListView } from './components/clients/ClientListView';
import { ClientModal } from './components/clients/ClientModal';
import { ClientDetailModal } from './components/clients/ClientDetailModal';
import { QRScannerModal } from './components/scanner/QRScannerModal';
import { GarmentDetailModal } from './components/scanner/GarmentDetailModal';
import { ThermalTicketModal } from './components/tickets/ThermalTicketModal';
import { CashAndReportsView } from './components/cash/CashAndReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { storage } from './services/storage';
import { Cliente, Pedido, Prenda, ResumenKPIs, EstadoPedido } from './types';
import { QRPayloadDecoded, decodificarQR } from './utils/qr';
import { useAuth } from './context/AuthContext';
import { QrCode } from 'lucide-react';
import { LoginView } from './components/auth/LoginView';
import { AuthLoadingScreen } from './components/auth/AuthLoadingScreen';
import { AssistantPanel } from './components/assistant/AssistantPanel';

export default function App() {
  const { currentUser, isAuthorized, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [kpis, setKpis] = useState<ResumenKPIs>(storage.getKPIs());

  // Modales
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedPrendaId, setScannedPrendaId] = useState<string | null>(null);

  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [clientePreseleccionado, setClientePreseleccionado] = useState<Cliente | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Pedido | null>(null);

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clienteEditar, setClienteEditar] = useState<Cliente | null>(null);
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);

  const [ticketModal, setTicketModal] = useState<{
    isOpen: boolean;
    pedido: Pedido | null;
    prendaIndividual?: Prenda | null;
  }>({ isOpen: false, pedido: null });

  // Confirmación de eliminación de cliente
  const [confirmDeleteClient, setConfirmDeleteClient] = useState<{
    isOpen: boolean;
    cliente: Cliente | null;
    errorBloqueo?: string;
  }>({ isOpen: false, cliente: null });

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Filtros
  const [pedidoFiltroEstado, setPedidoFiltroEstado] = useState<EstadoPedido | 'todos'>('todos');
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Buffer para lectores de código de barras USB de pistola en cualquier pantalla
  const barcodeBufferRef = useRef<{ buffer: string; lastTime: number }>({ buffer: '', lastTime: 0 });

  const syncData = () => {
    setPedidos([...storage.getPedidos()]);
    setClientes([...storage.getClientes()]);
    setKpis({ ...storage.getKPIs() });
  };

  useEffect(() => {
    syncData();
    const unsubscribe = storage.subscribe(syncData);
    return () => unsubscribe();
  }, []);

  // Lector de pistola USB global protegido contra interferencias con formularios y búsquedas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está interactuando con un campo de formulario o búsqueda
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput) return;

      // Si hay modales de edición o creación abiertos, no secuestrar la vista
      if (isNewOrderOpen || isClientModalOpen || confirmDeleteClient.isOpen || confirmResetOpen) {
        return;
      }

      const now = Date.now();
      const ref = barcodeBufferRef.current;

      // Los lectores USB envían caracteres con < 50ms de intervalo
      if (now - ref.lastTime > 200) {
        ref.buffer = '';
      }
      ref.lastTime = now;

      if (e.key === 'Enter') {
        const rawCode = ref.buffer.trim();
        ref.buffer = '';
        if (rawCode.length >= 4) {
          const decoded = decodificarQR(rawCode);
          if (decoded) {
            handleScanSuccess(decoded, rawCode);
          }
        }
      } else if (e.key.length === 1) {
        ref.buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewOrderOpen, isClientModalOpen, confirmDeleteClient.isOpen, confirmResetOpen]);

  const handleScanSuccess = (decoded: QRPayloadDecoded, rawCode: string) => {
    if (decoded.type === 'GARMENT') {
      const match = storage.buscarPrendaPorId(decoded.id);
      if (match) {
        setScannedPrendaId(decoded.id);
      } else {
        alert(`La prenda con código "${decoded.id}" no se encuentra registrada.`);
      }
    } else if (decoded.type === 'ORDER') {
      const ped = storage.getPedidoById(decoded.id) || storage.getPedidoByCodigo(decoded.id);
      if (ped) {
        setSelectedOrder(ped);
      } else {
        alert(`El pedido "${decoded.id}" no se encuentra registrado.`);
      }
    } else if (decoded.type === 'CLIENT') {
      const cli = storage.getClienteById(decoded.id);
      if (cli) {
        setSelectedClient(cli);
      } else {
        alert(`El cliente "${decoded.id}" no se encuentra registrado.`);
      }
    }
  };

  const handleSearchLookup = (query: string) => {
    setGlobalSearch(query);
    const pedidoMatch = storage.getPedidoByCodigo(query);
    if (pedidoMatch) {
      setSelectedOrder(pedidoMatch);
      return;
    }

    const prendaMatch = storage.buscarPrendaPorId(query);
    if (prendaMatch) {
      setScannedPrendaId(query);
      return;
    }

    setActiveTab('pedidos');
  };

  const handleOpenNewClient = () => {
    setClienteEditar(null);
    setIsClientModalOpen(true);
  };

  const handleEditClient = (cli: Cliente) => {
    setClienteEditar(cli);
    setIsClientModalOpen(true);
  };

  const handleNewOrderForClient = (cli: Cliente) => {
    setClientePreseleccionado(cli);
    setIsNewOrderOpen(true);
  };

  // Verificación y confirmación de eliminación de clientes
  const handleDeleteClientClick = (cli: Cliente) => {
    const pedidosAsociados = storage.getPedidos().filter((p) => p.clienteId === cli.id);
    if (pedidosAsociados.length > 0) {
      setConfirmDeleteClient({
        isOpen: true,
        cliente: cli,
        errorBloqueo: `No se puede eliminar a ${cli.nombre} ${cli.apellido} porque tiene ${pedidosAsociados.length} pedido(s) asociados en el historial.`,
      });
    } else {
      setConfirmDeleteClient({
        isOpen: true,
        cliente: cli,
        errorBloqueo: undefined,
      });
    }
  };

  const ejecutarEliminarCliente = () => {
    if (confirmDeleteClient.cliente) {
      storage.deleteCliente(confirmDeleteClient.cliente.id);
      setConfirmDeleteClient({ isOpen: false, cliente: null });
    }
  };

  const handleOrderCreated = (nuevoPedido: Pedido) => {
    setTicketModal({
      isOpen: true,
      pedido: nuevoPedido,
    });
  };

  // 1. Pantalla de carga para evitar parpadeos mientras Firebase verifica la sesión
  if (loading) {
    return <AuthLoadingScreen />;
  }

  // 2. Si no hay sesión iniciada con UID autorizado de administradora, mostrar pantalla de Login
  if (!currentUser || !isAuthorized) {
    return <LoginView />;
  }

  return (
    <div className="flex h-dvh w-full max-w-full overflow-hidden bg-neutral-50 text-neutral-900 font-sans">
      {/* Sidebar de escritorio en fondo blanco */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setPedidoFiltroEstado('todos');
        }}
        onOpenScanner={() => setIsScannerOpen(true)}
        onNewOrder={() => {
          setClientePreseleccionado(null);
          setIsNewOrderOpen(true);
        }}
        kpis={kpis}
        onResetData={() => setConfirmResetOpen(true)}
        onLogout={logout}
        userEmail={currentUser.email}
      />

      {/* Área Principal de Contenido */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-neutral-50">
        {/* Header Superior Blanco */}
        <Header
          activeTab={activeTab}
          onNewOrder={() => {
            setClientePreseleccionado(null);
            setIsNewOrderOpen(true);
          }}
          onSearchLookup={handleSearchLookup}
          onLogout={logout}
        />

        {/* Viewport Scrolleable */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 pb-[calc(108px+env(safe-area-inset-bottom,0px))] lg:pb-8">
          <div className="max-w-6xl min-w-0 w-full mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                kpis={kpis}
                pedidos={pedidos}
                onNewOrder={() => {
                  setClientePreseleccionado(null);
                  setIsNewOrderOpen(true);
                }}
                onSelectOrder={(ped) => setSelectedOrder(ped)}
                onGoToPedidos={(filtro) => {
                  if (filtro) setPedidoFiltroEstado(filtro);
                  setActiveTab('pedidos');
                }}
                onGoToCaja={() => setActiveTab('caja')}
              />
            )}

            {activeTab === 'pedidos' && (
              <OrderListView
                pedidos={pedidos}
                onOpenNewOrder={() => {
                  setClientePreseleccionado(null);
                  setIsNewOrderOpen(true);
                }}
                onSelectOrder={(ped) => setSelectedOrder(ped)}
                onOpenTicket={(ped) => setTicketModal({ isOpen: true, pedido: ped })}
                initialEstadoFilter={pedidoFiltroEstado}
                initialSearch={globalSearch}
              />
            )}

            {activeTab === 'clientes' && (
              <ClientListView
                clientes={clientes}
                onOpenNewClient={handleOpenNewClient}
                onSelectClient={(cli) => setSelectedClient(cli)}
                onEditClient={handleEditClient}
                onNewOrderForClient={handleNewOrderForClient}
                onDeleteClient={handleDeleteClientClick}
                searchFilter={globalSearch}
              />
            )}

            {activeTab === 'caja' && (
              <CashAndReportsView kpis={kpis} pedidos={pedidos} />
            )}

            {activeTab === 'configuracion' && (
              <SettingsView onDataChanged={syncData} onLogout={logout} />
            )}
          </div>
        </main>

        {/* Acceso QR móvil: usa el escáner existente, sin duplicar la lógica. */}
        <button
          type="button"
          aria-label="Escanear código QR"
          title="Escanear código QR"
          onClick={() => setIsScannerOpen(true)}
          className="lg:hidden fixed right-4 bottom-[calc(92px+env(safe-area-inset-bottom,0px))] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-950 text-emerald-400 shadow-lg ring-1 ring-white/20 transition-colors hover:bg-neutral-800 active:bg-neutral-700 no-print"
        >
          <QrCode className="h-7 w-7" aria-hidden="true" />
        </button>

        {/* Barra de Navegación Móvil */}
        <BottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setPedidoFiltroEstado('todos');
          }}
        />
      </div>

      {/* Asistente de consultas, solo lectura. Ocultar mientras existan modales. */}
      {!isNewOrderOpen && !isScannerOpen && !isClientModalOpen &&
        !selectedOrder && !selectedClient && !scannedPrendaId &&
        !ticketModal.isOpen && !confirmDeleteClient.isOpen && !confirmResetOpen && (
          <AssistantPanel
            pedidos={pedidos}
            clientes={clientes}
            onSelectOrder={(pedido) => setSelectedOrder(pedido)}
          />
        )}

      {/* --- MODALES DEL SISTEMA --- */}

      {/* 1. Lector QR (Cámara y USB) */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* 2. Ficha Completa de Prenda Escaneada */}
      <GarmentDetailModal
        isOpen={Boolean(scannedPrendaId)}
        onClose={() => setScannedPrendaId(null)}
        prendaId={scannedPrendaId}
        onOpenTicket={(ped, prenda) => {
          setTicketModal({
            isOpen: true,
            pedido: ped,
            prendaIndividual: prenda,
          });
        }}
        onOpenOrder={(ped) => setSelectedOrder(ped)}
        onOpenClient={(cli) => setSelectedClient(cli)}
      />

      {/* 3. Nuevo Pedido */}
      <OrderCreateModal
        isOpen={isNewOrderOpen}
        onClose={() => {
          setIsNewOrderOpen(false);
          setClientePreseleccionado(null);
        }}
        clientePreseleccionado={clientePreseleccionado}
        onOrderCreated={handleOrderCreated}
        onOpenCreateClientModal={() => setIsClientModalOpen(true)}
      />

      {/* 4. Detalle de Pedido */}
      <OrderDetailModal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        pedido={selectedOrder}
        onOpenTicket={(ped, prenda) => {
          setTicketModal({
            isOpen: true,
            pedido: ped,
            prendaIndividual: prenda,
          });
        }}
        onOpenClient={(cli) => setSelectedClient(cli)}
        onOpenPrendaDetail={(id) => setScannedPrendaId(id)}
        onOrderDeleted={() => syncData()}
      />

      {/* 5. Crear / Editar Cliente */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => {
          setIsClientModalOpen(false);
          setClienteEditar(null);
        }}
        clienteEditar={clienteEditar}
        onClientSaved={(cli) => {
          setClientePreseleccionado(cli);
          syncData();
        }}
      />

      {/* 6. Detalle de Cliente con QR permanente */}
      <ClientDetailModal
        isOpen={Boolean(selectedClient)}
        onClose={() => setSelectedClient(null)}
        cliente={selectedClient}
        onEditClient={handleEditClient}
        onNewOrderForClient={handleNewOrderForClient}
        onSelectOrder={(ped) => setSelectedOrder(ped)}
      />

      {/* 7. Ticket Térmico y Etiquetas Adhesivas */}
      <ThermalTicketModal
        isOpen={ticketModal.isOpen}
        onClose={() => setTicketModal({ isOpen: false, pedido: null })}
        pedido={ticketModal.pedido}
        prendaIndividual={ticketModal.prendaIndividual}
      />

      {/* 8. Diálogo de Alerta / Confirmación de Eliminación de Cliente */}
      {confirmDeleteClient.errorBloqueo ? (
        <ConfirmDialog
          isOpen={confirmDeleteClient.isOpen}
          onClose={() => setConfirmDeleteClient({ isOpen: false, cliente: null })}
          onConfirm={() => setConfirmDeleteClient({ isOpen: false, cliente: null })}
          title="No se puede eliminar el cliente"
          message={confirmDeleteClient.errorBloqueo}
          confirmText="Entendido"
          variant="warning"
        />
      ) : (
        <ConfirmDialog
          isOpen={confirmDeleteClient.isOpen}
          onClose={() => setConfirmDeleteClient({ isOpen: false, cliente: null })}
          onConfirm={ejecutarEliminarCliente}
          title="Confirmar eliminación de cliente"
          message={`¿Estás seguro de que deseás eliminar al cliente ${confirmDeleteClient.cliente?.nombre} ${confirmDeleteClient.cliente?.apellido}? Esta acción no se puede deshacer.`}
          confirmText="Sí, eliminar cliente"
          cancelText="Cancelar"
          variant="danger"
        />
      )}

      {/* 9. Diálogo de Restauración de Datos Demo */}
      <ConfirmDialog
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          storage.resetearDatos();
          syncData();
        }}
        title="Restaurar datos de demostración"
        message="¿Estás seguro de que deseas restablecer los pedidos, clientes y pagos a los datos de demostración iniciales?"
        confirmText="Restablecer"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
}
