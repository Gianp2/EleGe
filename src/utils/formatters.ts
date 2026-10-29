/**
 * Utilidades de formateo para Lavadero eLeGe
 */

import { EstadoPedido, EstadoPrenda, EstadoPago, TipoServicio, MetodoPago } from '../types';

export function formatMoneda(monto: number): string {
  const limpio = isNaN(monto) ? 0 : Math.round(monto);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(limpio);
}

export function formatFechaCorta(fechaIsoOString: string): string {
  if (!fechaIsoOString) return '-';
  const fecha = new Date(fechaIsoOString);
  if (isNaN(fecha.getTime())) return fechaIsoOString;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);
}

export function formatFechaHora(fechaIsoOString: string): string {
  if (!fechaIsoOString) return '-';
  const fecha = new Date(fechaIsoOString);
  if (isNaN(fecha.getTime())) return fechaIsoOString;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

export function formatFechaTexto(fechaIsoOString: string): string {
  if (!fechaIsoOString) return '-';
  const fecha = new Date(fechaIsoOString);
  if (isNaN(fecha.getTime())) return fechaIsoOString;
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(fecha);
}

export const SERVICIOS_INFO: Record<TipoServicio, { label: string; precioSugerido: number }> = {
  lavado_planchado: { label: 'Lavado y Planchado', precioSugerido: 4800 },
  solo_lavado: { label: 'Solo Lavado', precioSugerido: 3200 },
  solo_planchado: { label: 'Solo Planchado', precioSugerido: 2600 },
  tintoreria: { label: 'Tintorería en Seco', precioSugerido: 7500 },
  desmanchado_especial: { label: 'Desmanchado Especial', precioSugerido: 5900 },
  acolchados_frazadas: { label: 'Acolchado / Frazada', precioSugerido: 9500 },
  cortinas: { label: 'Cortinas (por paño)', precioSugerido: 6200 },
  valet_express: { label: 'Servicio Express 24hs', precioSugerido: 8000 },
};

export const ESTADO_PRENDA_CONFIG: Record<EstadoPrenda | EstadoPedido, { label: string; color: string; bg: string; border: string }> = {
  recibido: {
    label: 'Recibido',
    color: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  en_proceso: {
    label: 'En Proceso',
    color: 'text-sky-800',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
  },
  listo: {
    label: 'Listo para retirar',
    color: 'text-emerald-800',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  entregado: {
    label: 'Entregado',
    color: 'text-neutral-600',
    bg: 'bg-neutral-100',
    border: 'border-neutral-200',
  },
  cancelado: {
    label: 'Anulado',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
};

export const ESTADO_PAGO_CONFIG: Record<EstadoPago, { label: string; color: string; bg: string }> = {
  pendiente: {
    label: 'Sin pago',
    color: 'text-rose-800',
    bg: 'bg-rose-50 border border-rose-200',
  },
  parcial: {
    label: 'Señado / Parcial',
    color: 'text-amber-800',
    bg: 'bg-amber-50 border border-amber-200',
  },
  pagado: {
    label: 'Totalmente Pagado',
    color: 'text-emerald-800',
    bg: 'bg-emerald-50 border border-emerald-200',
  },
};

export const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia Bancaria',
  debito: 'Tarjeta Débito',
  credito: 'Tarjeta Crédito',
  otro: 'Otro Medio',
};

/**
 * Normaliza número telefónico para wa.me de forma exhaustiva
 */
export function normalizarTelefonoWhatsApp(telefono: string): string {
  if (!telefono) return '';
  let digitos = telefono.replace(/\D/g, '');
  if (!digitos) return '';

  if (digitos.startsWith('549')) {
    return digitos;
  }

  if (digitos.startsWith('54')) {
    digitos = digitos.slice(2);
  }

  if (digitos.startsWith('0')) {
    digitos = digitos.slice(1);
  }

  if (digitos.startsWith('11') && digitos.slice(2).startsWith('15')) {
    digitos = '11' + digitos.slice(4);
  } else if (digitos.length === 11 && digitos.includes('15')) {
    const prefijo3 = digitos.slice(0, 3);
    if (digitos.slice(3, 5) === '15') {
      digitos = prefijo3 + digitos.slice(5);
    }
  }

  if (digitos.length >= 8 && digitos.length <= 11) {
    return `549${digitos}`;
  }

  return digitos;
}

/**
 * Genera el enlace wa.me y el mensaje predeterminado para el cliente
 */
export function generarEnlaceWhatsApp({
  nombreCliente,
  telefono,
  codigoPedido,
  prendasResumen,
  saldoPendiente,
  total,
}: {
  nombreCliente: string;
  telefono: string;
  codigoPedido: string;
  prendasResumen: string;
  saldoPendiente: number;
  total: number;
}): { url: string; mensaje: string; telefonoNormalizado: string } {
  const telefonoNormalizado = normalizarTelefonoWhatsApp(telefono);

  let mensaje = `Hola *${nombreCliente}*, ¡buenas noticias! 🧺✨\n\n`;
  mensaje += `Te informamos de *Lavadero eLeGe* que tu pedido *${codigoPedido}* ya está *LISTO PARA RETIRAR*.\n\n`;
  mensaje += `👕 *Detalle:* ${prendasResumen}\n`;
  mensaje += `💰 *Total del pedido:* ${formatMoneda(total)}\n`;

  if (saldoPendiente > 0) {
    mensaje += `⚠️ *Saldo pendiente al retirar:* ${formatMoneda(saldoPendiente)}\n`;
  } else {
    mensaje += `✅ *Estado de pago:* Totalmente abonado\n`;
  }

  mensaje += `\n📍 Podés pasar a retirarlo en nuestro local de Lunes a Sábados de 08:30 a 19:30 hs.\n`;
  mensaje += `¡Muchas gracias por confiar en Lavadero eLeGe!`;

  const url = `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;

  return { url, mensaje, telefonoNormalizado };
}
