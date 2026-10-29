/**
 * Generador de Identificadores Únicos y Seguros para Lavadero eLeGe
 * Evita colisiones por concurrencia o contadores locales, generando
 * identificadores conformes a la expresión regular de seguridad: ^[a-zA-Z0-9_\-]+$
 */

function getRandomSuffix(length = 6): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  // Usar Web Crypto API nativa para generación criptográficamente segura
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
}

/**
 * Genera un ID seguro para un Cliente (ej: "CLI_24a1b_8f3c")
 */
export function generateClienteId(): string {
  const timestamp = Date.now().toString(36);
  const suffix = getRandomSuffix(5);
  return `CLI_${timestamp}_${suffix}`;
}

/**
 * Genera un ID seguro para un Pedido (ej: "PED_24a1b_9x2k")
 */
export function generatePedidoId(): string {
  const timestamp = Date.now().toString(36);
  const suffix = getRandomSuffix(5);
  return `PED_${timestamp}_${suffix}`;
}

/**
 * Genera el código visible amigable para el mostrador (ej: "#5824")
 */
export function generateCodigoVisible(correlativo?: number): string {
  if (correlativo && correlativo > 0) {
    return `#${correlativo.toString().padStart(4, '0')}`;
  }
  // Generar número de 4 dígitos basado en entropía
  const random4 = Math.floor(1000 + Math.random() * 9000);
  return `#${random4}`;
}

/**
 * Genera un ID seguro para una Prenda vinculada a su pedido (ej: "PRN_PED_24a1b_9x2k_1_7k9a")
 */
export function generatePrendaId(pedidoId: string, index: number): string {
  const cleanPedidoId = pedidoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = getRandomSuffix(4);
  return `PRN_${cleanPedidoId}_${index + 1}_${suffix}`;
}

/**
 * Genera un ID seguro para un Pago (ej: "PAG_24a1b_3m9p")
 */
export function generatePagoId(): string {
  const timestamp = Date.now().toString(36);
  const suffix = getRandomSuffix(6);
  return `PAG_${timestamp}_${suffix}`;
}

/**
 * Genera un ID seguro para un Registro de Auditoría (ej: "AUD_24a1b_7h2q")
 */
export function generateAuditoriaId(): string {
  const timestamp = Date.now().toString(36);
  const suffix = getRandomSuffix(6);
  return `AUD_${timestamp}_${suffix}`;
}
