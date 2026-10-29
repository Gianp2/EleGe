import React from 'react';
import { EstadoPedido, EstadoPrenda, EstadoPago } from '../../types';
import { ESTADO_PRENDA_CONFIG, ESTADO_PAGO_CONFIG } from '../../utils/formatters';

interface StatusBadgeProps {
  tipo: 'prenda' | 'pedido' | 'pago';
  estado: EstadoPrenda | EstadoPedido | EstadoPago;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ tipo, estado, size = 'sm' }) => {
  const isSmall = size === 'sm';
  const sizeClasses = isSmall ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  if (tipo === 'pago') {
    const config = ESTADO_PAGO_CONFIG[estado as EstadoPago] || {
      label: estado,
      color: 'text-neutral-700',
      bg: 'bg-neutral-100 border border-neutral-200',
    };
    return (
      <span
        className={`inline-flex items-center font-bold rounded-lg whitespace-nowrap shrink-0 ${sizeClasses} ${config.color} ${config.bg}`}
      >
        {config.label}
      </span>
    );
  }

  const config = ESTADO_PRENDA_CONFIG[estado as EstadoPrenda] || {
    label: estado,
    color: 'text-neutral-700',
    bg: 'bg-neutral-100',
    border: 'border-neutral-200',
  };

  return (
    <span
      className={`inline-flex items-center font-bold rounded-lg border whitespace-nowrap shrink-0 ${sizeClasses} ${config.color} ${config.bg} ${config.border}`}
    >
      {config.label}
    </span>
  );
};
