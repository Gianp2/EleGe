import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { Cliente } from '../../types';
import type { ClientDraft } from '../../utils/voiceDraft';
import { Modal } from '../common/Modal';
import { codificarQRCliente } from '../../utils/qr';
import { storage } from '../../services/storage';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteEditar?: Cliente | null;
  initialDraft?: ClientDraft | null;
  onClientSaved: (cliente: Cliente) => void;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  clienteEditar,
  initialDraft,
  onClientSaved,
}) => {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clienteEditar) {
      setNombre(clienteEditar.nombre || '');
      setApellido(clienteEditar.apellido || '');
      setTelefono(clienteEditar.telefono || '');
      setObservaciones(clienteEditar.observaciones || '');
    } else {
      setNombre(initialDraft?.nombre || '');
      setApellido(initialDraft?.apellido || '');
      setTelefono(initialDraft?.telefono || '');
      setObservaciones('');
    }
    setError(null);
  }, [clienteEditar, isOpen, initialDraft]);

  // Detección en tiempo real de duplicados por teléfono normalizado
  const posibleDuplicado = useMemo(() => {
    if (!telefono || telefono.trim().length < 6) return null;
    return storage.verificarTelefonoExistente(telefono, clienteEditar?.id);
  }, [telefono, clienteEditar]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre del cliente es obligatorio.');
      return;
    }

    const soloDigitos = telefono.replace(/\D/g, '');
    if (soloDigitos.length < 8) {
      setError('Por favor ingresá un teléfono válido (mínimo 8 dígitos).');
      return;
    }

    const id = clienteEditar ? clienteEditar.id : storage.generarSiguienteIdCliente();
    const clienteData: Cliente = {
      id,
      nombre: nombre.trim(),
      apellido: apellido.trim() || undefined,
      telefono: telefono.trim(),
      observaciones: observaciones.trim() || undefined,
      fechaAlta: clienteEditar ? clienteEditar.fechaAlta : new Date().toISOString(),
      qrPayload: codificarQRCliente(id),
    };

    storage.saveCliente(clienteData);
    onClientSaved(clienteData);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={clienteEditar ? `Editar Cliente: ${clienteEditar.nombre} ${clienteEditar.apellido || ''}` : 'Alta de Cliente'}
      subtitle="Alta rápida con Nombre y Teléfono (demás datos opcionales)"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              Nombre <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Martín"
              className="w-full bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none shadow-2xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              Apellido <span className="text-neutral-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              placeholder="Ej: Soria"
              className="w-full bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none shadow-2xs font-medium"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-800 mb-1">
            Teléfono celular / WhatsApp <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Ej: 11 4589-2234 o 341 555-1234"
            className="w-full bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-mono font-semibold shadow-2xs"
          />
          <span className="text-[11px] text-neutral-500 mt-1 block">
            Utilizado para avisos automáticos de prendas listas vía WhatsApp y búsqueda rápida.
          </span>
        </div>

        {/* Alerta interactiva de posible duplicado */}
        {posibleDuplicado && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Posible cliente existente:</span>
              <p className="text-[11px] text-amber-800">
                Ya existe un cliente con este número telefónico:{' '}
                <strong className="text-neutral-900">
                  {posibleDuplicado.nombre} {posibleDuplicado.apellido || ''}
                </strong>{' '}
                ({posibleDuplicado.id}). Podés continuar si comparten teléfono (ej. familiares) o revisar el número.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-800 mb-1">
            Observaciones o preferencias <span className="text-neutral-400 font-normal">(opcional)</span>
          </label>
          <textarea
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej: Prefiere doblado en bolsa, almidón suave, retira por la tarde..."
            className="w-full bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none resize-none shadow-2xs"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <UserCheck className="w-4 h-4" />
            <span>{clienteEditar ? 'Guardar Cambios' : 'Registrar Cliente'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
