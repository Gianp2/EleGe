import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Calendar,
  User,
  Shirt,
  UserPlus,
  AlertTriangle,
  Check,
  X,
  Mic, MicOff, WandSparkles,
} from 'lucide-react';
import { Cliente, Pedido, Prenda, TipoServicio, MetodoPago, Pago } from '../../types';
import { Modal } from '../common/Modal';
import {
  formatMoneda,
  SERVICIOS_INFO,
  METODO_PAGO_LABELS,
} from '../../utils/formatters';
import { codificarQRPedido, codificarQRPrenda, codificarQRCliente } from '../../utils/qr';
import { storage } from '../../services/storage';
import { parseDictation } from '../../utils/dictationParser';
import { useSpeechDictation } from '../../hooks/useSpeechDictation';

interface OrderCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientePreseleccionado?: Cliente | null;
  onOrderCreated: (pedido: Pedido) => void;
  onOpenCreateClientModal?: () => void;
  initialDictation?: string;
}

const PRENDAS_RAPIDAS = [
  'Camisa de vestir',
  'Pantalón de vestir',
  'Traje 2 piezas',
  'Acolchado 2 plazas',
  'Vestido de fiesta',
  'Campera de plumas',
  'Sábanas juego completo',
  'Cortinas (paño)',
  'Frazada gruesa',
];

export const OrderCreateModal: React.FC<OrderCreateModalProps> = ({
  isOpen,
  onClose,
  clientePreseleccionado,
  onOrderCreated,
  onOpenCreateClientModal,
  initialDictation,
}) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>('');
  const [filtroCliente, setFiltroCliente] = useState<string>('');

  // Estado para alta rápida de cliente INLINE (sin perder prendas ni datos cargados)
  const [mostrarAltaRapida, setMostrarAltaRapida] = useState(false);
  const [rapidoNombre, setRapidoNombre] = useState('');
  const [rapidoApellido, setRapidoApellido] = useState('');
  const [rapidoTelefono, setRapidoTelefono] = useState('');
  const [errorAltaRapida, setErrorAltaRapida] = useState<string | null>(null);

  // Fecha estimada
  const defaultFechaEstimada = () => {
    const dias = storage.getConfiguracion().diasEstimadosEntregaDefecto || 2;
    const d = new Date(Date.now() + dias * 86400000);
    return d.toISOString().split('T')[0];
  };
  const [fechaEstimada, setFechaEstimada] = useState<string>(defaultFechaEstimada());

  // Observaciones generales
  const [observacionesGenerales, setObservacionesGenerales] = useState('');

  // Prendas en borrador
  const [prendas, setPrendas] = useState<
    Array<{
      tempId: string;
      tipo: string;
      descripcion: string;
      servicio: TipoServicio;
      precio: number;
      observaciones?: string;
    }>
  >([]);

  // Formulario de nueva prenda
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevoServicio, setNuevoServicio] = useState<TipoServicio>('lavado_planchado');
  const [nuevoPrecioInput, setNuevoPrecioInput] = useState<string>(String(SERVICIOS_INFO['lavado_planchado'].precioSugerido));
  const nuevoPrecio = nuevoPrecioInput.trim() === '' ? 0 : Number(nuevoPrecioInput);
  const setNuevoPrecio = (value: number) => setNuevoPrecioInput(String(value));
  const [nuevasObservaciones, setNuevasObservaciones] = useState('');

  // Seña inicial
  const [registrarSenia, setRegistrarSenia] = useState(false);
  const [montoSeniaInput, setMontoSeniaInput] = useState<string>('');
  const montoSenia = montoSeniaInput.trim() === '' ? 0 : Number(montoSeniaInput);
  const setMontoSenia = (value: number) => setMontoSeniaInput(String(value));
  const [metodoPagoSenia, setMetodoPagoSenia] = useState<MetodoPago>('efectivo');

  const [error, setError] = useState<string | null>(null);
  const [dictado, setDictado] = useState('');
  const [dictadoAvisos, setDictadoAvisos] = useState<string[]>([]);
  const [dictadoAplicado, setDictadoAplicado] = useState(false);
  const [fechaPorConfirmar, setFechaPorConfirmar] = useState(false);
  const [dictadoUltimoAplicado, setDictadoUltimoAplicado] = useState('');
  const speech = useSpeechDictation(text => {
    setDictado(prev => [prev, text].filter(Boolean).join(' ').slice(0, 2500));
    aplicarDictado(text);
  });


  useEffect(() => {
    if (isOpen) {
      const allClientes = storage.getClientes();
      setClientes(allClientes);
      if (clientePreseleccionado) {
        setClienteId(clientePreseleccionado.id);
      } else {
        setClienteId('');
      }
      setError(null);
      setMostrarAltaRapida(false);
      setFechaPorConfirmar(false);
    }
  }, [isOpen, clientePreseleccionado]);

  useEffect(() => {
    if (!isOpen) {
      speech.stop();
      return;
    }
    setDictado(initialDictation || '');
    setDictadoAplicado(false);
    setDictadoUltimoAplicado('');
    setDictadoAvisos([]);
  }, [isOpen, initialDictation]);

  const aplicarDictado = (source: string = dictado) => {
    const entrada = source.trim();
    if (!entrada || entrada === dictadoUltimoAplicado) return;
    const draft = parseDictation(source);
    const avisos = [...draft.pendientes];
    const allClientes = storage.getClientes();
    const phoneDigits = (draft.telefono || '').replace(/\D/g, '');
    const existingPhone = phoneDigits ? allClientes.find(c => c.telefono.replace(/\D/g, '') === phoneDigits) : undefined;
    const byName = draft.nombre ? allClientes.filter(c =>
      `${c.nombre} ${c.apellido || ''}`.trim().toLocaleLowerCase('es-AR') ===
      `${draft.nombre} ${draft.apellido || ''}`.trim().toLocaleLowerCase('es-AR')) : [];
    if (existingPhone) {
      setClienteId(existingPhone.id);
      if (draft.nombre && existingPhone.nombre.toLocaleLowerCase('es-AR') !== draft.nombre.toLocaleLowerCase('es-AR')) {
        avisos.push('El teléfono corresponde a otro nombre: verificá la identidad del cliente.');
      }
      setMostrarAltaRapida(false);
    } else if (byName.length === 1 && !phoneDigits) {
      setClienteId(byName[0].id);
      setMostrarAltaRapida(false);
      avisos.push('Revisá que sea el cliente correcto antes de guardar.');
    } else if (draft.nombre || draft.telefono) {
      setMostrarAltaRapida(true);
      setClienteId('');
      if (draft.nombre) setRapidoNombre(draft.nombre);
      if (draft.apellido) setRapidoApellido(draft.apellido);
      if (draft.telefono) setRapidoTelefono(draft.telefono);
      avisos.push('Cliente nuevo: revisá y pulsá «Crear y Seleccionar» antes de guardar el pedido.');
      if (byName.length > 1) avisos.push('Hay varios clientes con ese nombre: confirmá su teléfono.');
    }
    const listos = draft.prendas.filter(p => p.precio !== null && p.precio > 0);
    if (listos.length) {
      setPrendas(prev => [...prev, ...listos.map(p => ({
        tempId: `voz_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
        tipo: p.tipo, descripcion: p.descripcion, servicio: p.servicio, precio: p.precio!,
      }))]);
    }
    const sinPrecio = draft.prendas.find(p => p.precio === null);
    if (sinPrecio) {
      setNuevoTipo(sinPrecio.tipo);
      setNuevoServicio(sinPrecio.servicio);
      setNuevoPrecio(0);
      avisos.push('La primera prenda sin precio quedó preparada abajo. Completá su precio y agregala.');
    }
    if (draft.senia !== undefined) {
      setRegistrarSenia(draft.senia > 0);
      setMontoSenia(draft.senia);
    }
    if (draft.metodoPago) setMetodoPagoSenia(draft.metodoPago);
    if (draft.fecha) { setFechaEstimada(draft.fecha); setFechaPorConfirmar(false); }
    else if (draft.pendientes.some(x => x.includes('fecha de entrega'))) setFechaPorConfirmar(true);
    setDictadoAvisos(avisos.length ? avisos : ['Datos incorporados al borrador. Revisalos antes de confirmar.']);
    setDictadoAplicado(true);
    setDictadoUltimoAplicado(entrada);
    setError(null);
  };

  useEffect(() => {
    if (isOpen && initialDictation?.trim()) aplicarDictado(initialDictation);
  }, [isOpen, initialDictation]);

  // Actualizar precio sugerido al cambiar servicio
  const handleCambioServicio = (serv: TipoServicio) => {
    setNuevoServicio(serv);
    setNuevoPrecio(SERVICIOS_INFO[serv].precioSugerido);
  };

  const handleAgregarPrenda = () => {
    if (!nuevoTipo.trim()) {
      setError('Por favor especificá el tipo de prenda.');
      return;
    }
    if (nuevoPrecio <= 0) {
      setError('El precio de la prenda debe ser mayor a 0.');
      return;
    }

    setPrendas([
      ...prendas,
      {
        tempId: `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tipo: nuevoTipo.trim(),
        descripcion: nuevaDescripcion.trim(),
        servicio: nuevoServicio,
        precio: nuevoPrecio,
        observaciones: nuevasObservaciones.trim() || undefined,
      },
    ]);

    setNuevoTipo('');
    setNuevaDescripcion('');
    setNuevasObservaciones('');
    setNuevoServicio('lavado_planchado');
    setNuevoPrecio(SERVICIOS_INFO['lavado_planchado'].precioSugerido);
    setError(null);
  };

  const handleEliminarPrenda = (tempId: string) => {
    setPrendas(prendas.filter((p) => p.tempId !== tempId));
  };

  // Detección en vivo de duplicados durante el alta rápida inline
  const posibleDuplicadoAlta = useMemo(() => {
    if (!rapidoTelefono || rapidoTelefono.trim().length < 6) return null;
    return storage.verificarTelefonoExistente(rapidoTelefono);
  }, [rapidoTelefono]);

  // Ejecutar el Alta Rápida Inline conservando todos los datos del pedido
  const handleGuardarAltaRapida = () => {
    if (!rapidoNombre.trim()) {
      setErrorAltaRapida('El nombre es obligatorio.');
      return;
    }
    const soloDigitos = rapidoTelefono.replace(/\D/g, '');
    if (soloDigitos.length < 8) {
      setErrorAltaRapida('El teléfono debe tener al menos 8 dígitos.');
      return;
    }

    if (posibleDuplicadoAlta) {
      setErrorAltaRapida('Ese teléfono ya pertenece a otro cliente. Seleccionalo en lugar de duplicarlo.');
      return;
    }
    const nuevoId = storage.generarSiguienteIdCliente();
    const nuevoCliente: Cliente = {
      id: nuevoId,
      nombre: rapidoNombre.trim(),
      apellido: rapidoApellido.trim() || undefined,
      telefono: rapidoTelefono.trim(),
      fechaAlta: new Date().toISOString(),
      qrPayload: codificarQRCliente(nuevoId),
    };

    storage.saveCliente(nuevoCliente);

    // Actualizar lista local y seleccionar inmediatamente al nuevo cliente
    const nuevaLista = [...clientes, nuevoCliente];
    setClientes(nuevaLista);
    setClienteId(nuevoCliente.id);
    setFiltroCliente('');

    // Resetear formulario rápido y cerrar panel
    setRapidoNombre('');
    setRapidoApellido('');
    setRapidoTelefono('');
    setErrorAltaRapida(null);
    setMostrarAltaRapida(false);
  };

  const totalCalculado = prendas.reduce((acc, p) => acc + p.precio, 0);
  const saldoCalculado = registrarSenia ? Math.max(0, totalCalculado - montoSenia) : totalCalculado;

  const handleGuardarPedido = (e: React.FormEvent) => {
    e.preventDefault();
    if (speech.listening) { setError('Detené el dictado antes de confirmar el pedido.'); return; }
    if (fechaPorConfirmar) {
      setError('Confirmá la fecha de entrega. El dictado mencionó un día sin fecha exacta.');
      return;
    }
    if (!clienteId) {
      setError('Debes seleccionar o crear un cliente para el pedido.');
      return;
    }
    if (prendas.length === 0) {
      setError('Debes agregar al menos una prenda al pedido.');
      return;
    }
    if (mostrarAltaRapida) {
      setError('Primero creá o seleccioná el cliente antes de guardar el pedido.');
      return;
    }
    if (registrarSenia && (montoSenia < 0 || montoSenia > totalCalculado)) {
      setError('La seña no puede superar el monto total del pedido.');
      return;
    }

    const { id: nuevoPedidoId, codigoVisible } = storage.generarSiguienteIdPedido();

    const prendasFinales: Prenda[] = prendas.map((p, index) => {
      const prendaId = `PRN-${nuevoPedidoId.replace('PED-', '')}-${index + 1}`;
      return {
        id: prendaId,
        pedidoId: nuevoPedidoId,
        clienteId,
        tipo: p.tipo,
        descripcion: p.descripcion,
        servicio: p.servicio,
        precio: p.precio,
        observaciones: p.observaciones,
        estado: 'recibido',
        qrPayload: codificarQRPrenda(prendaId, nuevoPedidoId, clienteId),
      };
    });

    const pagos: Pago[] = [];
    if (registrarSenia && montoSenia > 0) {
      pagos.push({
        id: `PAG-${Date.now().toString().slice(-6)}`,
        pedidoId: nuevoPedidoId,
        clienteId,
        fecha: new Date().toISOString(),
        monto: montoSenia,
        metodo: metodoPagoSenia,
        nota: 'Seña inicial de recepción',
        esSenia: true,
      });
    }

    const nuevoPedido: Pedido = {
      id: nuevoPedidoId,
      codigoVisible,
      clienteId,
      fechaRecepcion: new Date().toISOString(),
      fechaEstimadaEntrega: fechaEstimada,
      prendas: prendasFinales,
      total: totalCalculado,
      saldoPendiente: saldoCalculado,
      estadoPago: saldoCalculado === 0 ? 'pagado' : registrarSenia && montoSenia > 0 ? 'parcial' : 'pendiente',
      estadoGeneral: 'recibido',
      observacionesGenerales: observacionesGenerales.trim() || undefined,
      pagos,
      avisosWhatsApp: [],
      qrPayload: codificarQRPedido(nuevoPedidoId),
    };

    storage.savePedido(nuevoPedido);
    onOrderCreated(nuevoPedido);
    onClose();
  };

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const clientesFiltrados = clientes.filter((c) =>
    `${c.nombre} ${c.apellido || ''} ${c.telefono} ${c.id}`.toLowerCase().includes(filtroCliente.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo pedido"
      subtitle="Completá los datos hablando, escribiendo o de forma manual"
      maxWidth="3xl"
    >
      <form onSubmit={handleGuardarPedido} className="space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        {/* Dictado asistido: solamente completa el formulario; jamás guarda automáticamente. */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3" aria-label="Carga por voz o texto">
          <div className="flex items-center gap-2">
            <WandSparkles className="w-4 h-4 text-neutral-800" />
            <div>
              <h3 className="text-sm font-bold">Dictá un pedido y revisá el borrador</h3>
              <p className="text-xs text-neutral-500">Decí nombre, teléfono, prendas, importes y entrega. El pedido se guarda solo cuando tocás «Crear pedido».</p>
            </div>
          </div>
          <textarea value={dictado} onChange={e => { setDictado(e.target.value); setDictadoAplicado(false); }}
            rows={3} maxLength={2500}
            className="w-full resize-y rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-neutral-600"
            placeholder="Ejemplo: Cliente María González, teléfono 3471555555, dos acolchados de 2 plazas a 12000 cada uno, seña 10000 en efectivo, entrega 15/11/2026" />
          {speech.error && <p role="alert" className="text-xs text-rose-700">{speech.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={speech.toggle} disabled={!speech.available && !speech.listening}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${speech.listening ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-neutral-300 bg-neutral-50 text-neutral-800'}`}>
              {speech.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {speech.listening ? 'Detener' : 'Dictar datos'}
            </button>
            <button type="button" onClick={() => aplicarDictado()} disabled={!dictado.trim() || (dictadoAplicado && dictado === dictadoUltimoAplicado)}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              Completar formulario
            </button>
          </div>
          {dictadoAplicado && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-bold">Borrador preparado. Revisá cliente, prendas, precios y entrega.</p>
              {dictadoAvisos.map((a,i) => <p key={i}>• {a}</p>)}
              <p>Podés editar o quitar prendas antes de confirmar el pedido. Si el dictado no entendió algo, completalo a mano.</p>
            </div>
          )}
        </section>

        {/* 1. SELECCIÓN O ALTA RÁPIDA DE CLIENTE */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <User className="w-4 h-4 text-neutral-600" />
              Cliente del Pedido
            </span>

            {!mostrarAltaRapida ? (
              <button
                type="button"
                onClick={() => setMostrarAltaRapida(true)}
                className="text-xs text-neutral-900 font-bold hover:underline flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-neutral-300 shadow-2xs hover:bg-neutral-100"
              >
                <UserPlus className="w-3.5 h-3.5 text-neutral-800" />
                <span>+ Alta Rápida de Cliente</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMostrarAltaRapida(false);
                  setErrorAltaRapida(null);
                }}
                className="text-xs text-neutral-500 font-bold hover:text-neutral-900 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cerrar Alta Rápida</span>
              </button>
            )}
          </div>

          {/* Formulario Inline de Alta Rápida (Sin perder el borrador de prendas) */}
          {mostrarAltaRapida ? (
            <div className="p-3.5 bg-white border border-neutral-300 rounded-xl space-y-3 shadow-2xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                <span className="text-xs font-bold text-neutral-900">
                  Nuevo Cliente (Alta Express sin salir del pedido)
                </span>
                <span className="text-[11px] text-neutral-500">Solo Nombre y Teléfono obligatorios</span>
              </div>

              {errorAltaRapida && (
                <div className="p-2 bg-rose-50 text-rose-700 text-xs rounded-lg font-medium">
                  {errorAltaRapida}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-0.5">
                    Nombre <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={rapidoNombre}
                    onChange={(e) => setRapidoNombre(e.target.value)}
                    placeholder="Ej: Marcelo"
                    autoFocus
                    className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-0.5">
                    Apellido <span className="text-neutral-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={rapidoApellido}
                    onChange={(e) => setRapidoApellido(e.target.value)}
                    placeholder="Ej: Bianchi"
                    className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-0.5">
                    Teléfono celular <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={rapidoTelefono}
                    onChange={(e) => setRapidoTelefono(e.target.value)}
                    placeholder="Ej: 11 5566-7788"
                    className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 font-mono outline-none"
                  />
                </div>
              </div>

              {/* Advertencia de duplicado telefónico */}
              {posibleDuplicadoAlta && (
                <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Teléfono ya asignado a:{' '}
                    <strong>
                      {posibleDuplicadoAlta.nombre} {posibleDuplicadoAlta.apellido || ''}
                    </strong>{' '}
                    ({posibleDuplicadoAlta.id}).
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarAltaRapida(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGuardarAltaRapida}
                  className="inline-flex items-center gap-1 px-4 py-1.5 bg-neutral-900 text-white font-bold text-xs rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Crear y Seleccionar</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <input
                  type="text"
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  placeholder="Buscar cliente por nombre o teléfono..."
                  className="w-full bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none shadow-2xs"
                />
              </div>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                aria-label="Seleccionar cliente registrado"
                className="bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none shadow-2xs font-medium cursor-pointer"
              >
                <option value="">Seleccioná un cliente</option>
                {clientesFiltrados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido || ''} ({c.telefono}) - {c.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {clienteSeleccionado && !mostrarAltaRapida && (
            <div className="flex items-center justify-between text-xs text-neutral-600 bg-white p-2.5 rounded-xl border border-neutral-200 shadow-2xs">
              <span>
                Asignado a:{' '}
                <strong className="text-neutral-900 font-bold">
                  {clienteSeleccionado.nombre} {clienteSeleccionado.apellido || ''}
                </strong>
                <span className="ml-2 font-mono text-[11px] text-neutral-500">({clienteSeleccionado.id})</span>
              </span>
              <span className="font-mono text-neutral-700 font-bold">{clienteSeleccionado.telefono}</span>
            </div>
          )}
        </div>

        {/* 2. AGREGADOR DE PRENDAS */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <Shirt className="w-4 h-4 text-neutral-600" />
              Prendas a Procesar ({prendas.length})
            </span>
            <span className="text-xs font-mono font-extrabold text-neutral-900">
              Subtotal: {formatMoneda(totalCalculado)}
            </span>
          </div>

          {/* Atajos de prendas comunes */}
          <div className="flex flex-wrap gap-1.5">
            {PRENDAS_RAPIDAS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setNuevoTipo(item)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 transition-colors shadow-2xs cursor-pointer"
              >
                + {item}
              </button>
            ))}
          </div>

          {/* Formulario de agregar prenda */}
          <div className="p-3.5 rounded-xl bg-white border border-neutral-200 space-y-3 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  Tipo de Prenda <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={nuevoTipo}
                  onChange={(e) => setNuevoTipo(e.target.value)}
                  placeholder="Ej: Camisa de vestir, Traje, Pantalón"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  Color / Marca / Descripción
                </label>
                <input
                  type="text"
                  value={nuevaDescripcion}
                  onChange={(e) => setNuevaDescripcion(e.target.value)}
                  placeholder="Ej: Azul marino Zara talle M"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Servicio requerido</label>
                <select
                  value={nuevoServicio}
                  onChange={(e) => handleCambioServicio(e.target.value as TipoServicio)}
                  aria-label="Servicio de lavandería para la prenda"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-medium cursor-pointer"
                >
                  {Object.entries(SERVICIOS_INFO).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label} ({formatMoneda(info.precioSugerido)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Precio por prenda ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={nuevoPrecioInput}
                  onChange={(e) => setNuevoPrecioInput(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="Ej: 12000"
                  inputMode="decimal"
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 font-mono font-bold outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Observaciones de estado previo (manchas, rasgaduras, botones)
              </label>
              <input
                type="text"
                value={nuevasObservaciones}
                onChange={(e) => setNuevasObservaciones(e.target.value)}
                placeholder="Ej: Mancha de café en puño derecho, botón faltante"
                className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-800 outline-none"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleAgregarPrenda}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs active:scale-98"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar prenda al pedido</span>
              </button>
            </div>
          </div>

          {/* Tabla de prendas añadidas */}
          {prendas.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {prendas.map((p, idx) => (
                <div
                  key={p.tempId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-neutral-200 text-xs shadow-2xs"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900 truncate">
                        {idx + 1}. {p.tipo}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        ({SERVICIOS_INFO[p.servicio]?.label})
                      </span>
                    </div>
                    {p.descripcion && (
                      <p className="text-[11px] text-neutral-600 truncate">{p.descripcion}</p>
                    )}
                    {p.observaciones && (
                      <p className="text-[11px] text-amber-700 font-medium truncate">
                        Obs: {p.observaciones}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-bold text-neutral-900">
                      {formatMoneda(p.precio)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEliminarPrenda(p.tempId)}
                      className="p-1 text-neutral-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                      title="Quitar prenda"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. FECHA ESTIMADA Y OBSERVACIONES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2">
            <label className="block text-xs font-bold text-neutral-800 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-neutral-600" />
              Fecha estimada de entrega
            </label>
            <input
              type="date"
              required
              value={fechaEstimada}
              onChange={(e) => { setFechaEstimada(e.target.value); setFechaPorConfirmar(false); }}
              className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-mono font-semibold shadow-2xs"
            />
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(Date.now() + 86400000);
                  setFechaEstimada(d.toISOString().split('T')[0]);
                  setFechaPorConfirmar(false);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-medium cursor-pointer shadow-2xs"
              >
                Mañana
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(Date.now() + 2 * 86400000);
                  setFechaEstimada(d.toISOString().split('T')[0]);
                  setFechaPorConfirmar(false);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-medium cursor-pointer shadow-2xs"
              >
                En 48 hs
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(Date.now() + 3 * 86400000);
                  setFechaEstimada(d.toISOString().split('T')[0]);
                  setFechaPorConfirmar(false);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 font-medium cursor-pointer shadow-2xs"
              >
                En 72 hs
              </button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2">
            <label className="block text-xs font-bold text-neutral-800">
              Observaciones generales del pedido
            </label>
            <input
              type="text"
              value={observacionesGenerales}
              onChange={(e) => setObservacionesGenerales(e.target.value)}
              placeholder="Ej: Guardar en funda con percha plástica"
              className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none shadow-2xs"
            />
          </div>
        </div>

        {/* 4. SEÑA Y PAGOS */}
        <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={registrarSenia}
                onChange={(e) => {
                  setRegistrarSenia(e.target.checked);
                  if (e.target.checked && montoSenia === 0) {
                    setMontoSenia(Math.round(totalCalculado / 2));
                  }
                }}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
              />
              <span className="text-xs font-bold text-neutral-800">
                Registrar pago o seña al recibir
              </span>
            </label>

            <div className="text-right">
              <span className="text-xs text-neutral-500 mr-2">Saldo pendiente:</span>
              <span
                className={`text-sm font-mono font-extrabold ${
                  saldoCalculado > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatMoneda(saldoCalculado)}
              </span>
            </div>
          </div>

          {registrarSenia && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-200">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Monto de la seña ($)</label>
                <input
                  type="number"
                  min="0"
                  max={totalCalculado}
                  value={montoSeniaInput}
                  onChange={(e) => setMontoSeniaInput(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="Ej: 5000"
                  inputMode="decimal"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs text-neutral-900 font-mono font-bold outline-none shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Medio de pago</label>
                <select
                  value={metodoPagoSenia}
                  onChange={(e) => setMetodoPagoSenia(e.target.value as MetodoPago)}
                  aria-label="Medio de pago para la seña inicial"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-medium shadow-2xs cursor-pointer"
                >
                  {Object.entries(METODO_PAGO_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* BOTÓN CREAR PEDIDO */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
          <div className="text-xs">
            <span className="text-neutral-500">Total a facturar: </span>
            <strong className="text-base font-mono text-neutral-900 font-extrabold ml-1">
              {formatMoneda(totalCalculado)}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={prendas.length === 0}
              className="px-5 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
            >
              Crear Pedido ({prendas.length} prendas)
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
