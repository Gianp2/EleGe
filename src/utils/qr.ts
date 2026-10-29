/**
 * Generación y decodificación de Códigos QR para Lavadero eLeGe
 */
import QRCode from 'qrcode';

export interface QRPayloadPrenda {
  type: 'GARMENT';
  id: string;
  pedidoId: string;
  clienteId: string;
}

export interface QRPayloadCliente {
  type: 'CLIENT';
  id: string;
}

export interface QRPayloadPedido {
  type: 'ORDER';
  id: string;
}

export type QRPayloadDecoded = QRPayloadPrenda | QRPayloadCliente | QRPayloadPedido;

/**
 * Codifica una prenda en formato QR estándar
 */
export function codificarQRPrenda(prendaId: string, pedidoId: string, clienteId: string): string {
  return `ELEG:GARMENT:${prendaId}:${pedidoId}:${clienteId}`;
}

export function codificarQRCliente(clienteId: string): string {
  return `ELEG:CLIENT:${clienteId}`;
}

export function codificarQRPedido(pedidoId: string): string {
  return `ELEG:ORDER:${pedidoId}`;
}

/**
 * Decodifica cualquier QR o código de barras ingresado por lector o cámara
 * con tolerancia a caracteres especiales, URLs o formatos estándar.
 */
export function decodificarQR(codigoCrudo: string): QRPayloadDecoded | null {
  if (!codigoCrudo) return null;
  // Limpiar caracteres invisibles, saltos de línea o retornos de carro habituales en escáneres USB
  const texto = codigoCrudo.replace(/[\r\n\t]/g, '').trim();

  // Caso 1: Formato estructurado ELEG:GARMENT:id:pedidoId:clienteId
  if (texto.includes('ELEG:GARMENT:')) {
    const sub = texto.slice(texto.indexOf('ELEG:GARMENT:'));
    const partes = sub.split(':');
    return {
      type: 'GARMENT',
      id: partes[2] || '',
      pedidoId: partes[3] || '',
      clienteId: partes[4] || '',
    };
  }

  // Caso 2: Formato estructurado ELEG:CLIENT:id
  if (texto.includes('ELEG:CLIENT:')) {
    const sub = texto.slice(texto.indexOf('ELEG:CLIENT:'));
    const partes = sub.split(':');
    return {
      type: 'CLIENT',
      id: partes[2] || '',
    };
  }

  // Caso 3: Formato estructurado ELEG:ORDER:id
  if (texto.includes('ELEG:ORDER:')) {
    const sub = texto.slice(texto.indexOf('ELEG:ORDER:'));
    const partes = sub.split(':');
    return {
      type: 'ORDER',
      id: partes[2] || '',
    };
  }

  // Caso 4: Código directo de Prenda (ej: PRN-2401-1)
  const matchPrn = texto.match(/PRN-\d+-\d+/i);
  if (matchPrn) {
    return {
      type: 'GARMENT',
      id: matchPrn[0].toUpperCase(),
      pedidoId: '',
      clienteId: '',
    };
  }

  // Caso 5: Código directo de Pedido (ej: PED-2401 o #2401 o 2401)
  const matchPed = texto.match(/PED-\d+/i);
  if (matchPed) {
    return {
      type: 'ORDER',
      id: matchPed[0].toUpperCase(),
    };
  }

  const matchNumPed = texto.match(/#?(\d{4,})/);
  if (matchNumPed && !texto.startsWith('54')) {
    return {
      type: 'ORDER',
      id: `PED-${matchNumPed[1]}`,
    };
  }

  // Caso 6: Código directo de Cliente (ej: CLI-101)
  const matchCli = texto.match(/CLI-\d+/i);
  if (matchCli) {
    return {
      type: 'CLIENT',
      id: matchCli[0].toUpperCase(),
    };
  }

  return null;
}

/**
 * Genera una Data URL (imagen PNG en Base64) a partir del texto
 */
export async function generarQRDataURL(texto: string, ancho: number = 240): Promise<string> {
  try {
    return await QRCode.toDataURL(texto, {
      width: ancho,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (error) {
    console.error('Error generando QR code:', error);
    return '';
  }
}
