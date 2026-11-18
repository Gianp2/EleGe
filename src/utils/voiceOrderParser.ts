/**
 * Intérprete inteligente de dictado por voz y texto para Nuevo Pedido (Lavadero eLeGe).
 * Diseñado para español rioplatense: distingue nombres, teléfonos, prendas, cantidades,
 * precios unitarios vs totales, señas, medios de pago, fechas de entrega y ambigüedades.
 */

import { Cliente, MetodoPago, TipoServicio } from '../types';
import { normalizarTelefonoWhatsApp } from './formatters';
import {
  normalizeSpanish,
  parseSpanishNumber,
  extractMonetaryAmount,
  detectPaymentMethod,
  parseDeliveryDateFromText,
} from './voiceNumbers';

export interface ParsedGarmentDraft {
  tempId: string;
  cantidad: number;
  tipo: string;
  descripcion: string;
  servicio: TipoServicio;
  precioUnitario: number | null; // null si faltó precio
  montoOriginalDetectado?: number;
  ambiguedadPrecio?: 'total_o_unitario' | 'sin_precio';
  observaciones?: string;
}

export interface OrderDictationDraft {
  textoOriginal: string;
  clienteExistente: Cliente | null;
  clienteNuevo: {
    nombre: string;
    apellido: string;
    telefono: string;
  } | null;
  prendas: ParsedGarmentDraft[];
  fechaEstimadaEntrega: string | null;
  fechaEstimadaLabel: string | null;
  senia: {
    monto: number | null;
    metodo: MetodoPago | null;
    esPagoTotal?: boolean;
  } | null;
  observacionesGenerales: string;
  pendientesConfirmacion: string[];
}

const GARMENT_KEYWORDS: Array<{
  patterns: RegExp[];
  canonical: string;
  defaultServicio: TipoServicio;
}> = [
  {
    patterns: [/\bacolchados?\b/, /\bedredon(?:es)?\b/, /\bplumon(?:es)?\b/],
    canonical: 'Acolchado',
    defaultServicio: 'acolchados_frazadas',
  },
  {
    patterns: [/\bfrazadas?\b/, /\bmantas?\b/, /\bcubrecamas?\b/],
    canonical: 'Frazada',
    defaultServicio: 'acolchados_frazadas',
  },
  {
    patterns: [/\bcamisas?\b/],
    canonical: 'Camisa',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\bpantalon(?:es)?\b/, /\bjeans?\b/],
    canonical: 'Pantalón',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\btrajes?\b/, /\bambos?\b/],
    canonical: 'Traje',
    defaultServicio: 'tintoreria',
  },
  {
    patterns: [/\bsacos?\b/, /\bblazers?\b/],
    canonical: 'Saco',
    defaultServicio: 'tintoreria',
  },
  {
    patterns: [/\bcamperas?\b/, /\bcamperon(?:es)?\b/, /\bparkas?\b/],
    canonical: 'Campera',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\bvestidos?\b/],
    canonical: 'Vestido',
    defaultServicio: 'tintoreria',
  },
  {
    patterns: [/\bcortinas?\b/, /\bpanos?\s+de\s+cortina\b/],
    canonical: 'Cortina',
    defaultServicio: 'cortinas',
  },
  {
    patterns: [/\bsabanas?\b/, /\bjuegos?\s+de\s+sabanas?\b/],
    canonical: 'Sábanas',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\bmanteles?\b/],
    canonical: 'Mantel',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\btoallas?\b/, /\btoallones?\b/],
    canonical: 'Toalla',
    defaultServicio: 'solo_lavado',
  },
  {
    patterns: [/\bremeras?\b/, /\bchombas?\b/, /\bpolos?\b/],
    canonical: 'Remera',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\bbuzos?\b/, /\bsweaters?\b/, /\bpullover(?:s)?\b/],
    canonical: 'Buzo / Sweater',
    defaultServicio: 'lavado_planchado',
  },
  {
    patterns: [/\balfombras?\b/],
    canonical: 'Alfombra',
    defaultServicio: 'desmanchado_especial',
  },
  {
    patterns: [/\btapados?\b/, /\babrigos?\b/, /\bsobretodos?\b/],
    canonical: 'Tapado / Abrigo',
    defaultServicio: 'tintoreria',
  },
  {
    patterns: [/\bprendas?\b/, /\bropas?\b/],
    canonical: 'Prenda',
    defaultServicio: 'lavado_planchado',
  },
];

function detectServiceOverride(text: string, fallback: TipoServicio): TipoServicio {
  const norm = normalizeSpanish(text);
  if (/\b(tintoreria|en\s+seco)\b/.test(norm)) return 'tintoreria';
  if (/\bsolo\s+lavado\b/.test(norm)) return 'solo_lavado';
  if (/\bsolo\s+planchado\b/.test(norm)) return 'solo_planchado';
  if (/\b(desmanchado|mancha\s+especial|sacar\s+mancha)\b/.test(norm)) return 'desmanchado_especial';
  if (/\b(express|urgente|24\s*hs|valet)\b/.test(norm)) return 'valet_express';
  if (/\b(lavado\s+y\s+planchado)\b/.test(norm)) return 'lavado_planchado';
  return fallback;
}

function detectGarmentMatch(text: string) {
  const norm = normalizeSpanish(text);
  for (const g of GARMENT_KEYWORDS) {
    if (g.patterns.some((p) => p.test(norm))) {
      return g;
    }
  }
  return null;
}

const QTY_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

/**
 * Extrae números telefónicos y devuelve el texto con el teléfono enmascarado
 * para impedir que los dígitos telefónicos sean confundidos con precios o cantidades.
 */
function extractAndMaskPhone(rawText: string): {
  phone: string | null;
  maskedText: string;
} {
  // 1) Con palabra clave explícita ("teléfono 11 4589-2234", "cel 3415551234", "whatsapp ...")
  const explicitMatch = rawText.match(
    /(?:tel[eé]fono|tel\.?|cel(?:ular)?|whatsapp|wsp|contacto|n[uú]mero(?:\s+de\s+tel[eé]fono)?)\s*[:\-]?\s*(\+?[\d][\d\s\-()]{6,18}\d)/i
  );
  if (explicitMatch) {
    const digits = explicitMatch[1].replace(/\D/g, '');
    if (digits.length >= 7) {
      return {
        phone: explicitMatch[1].trim(),
        maskedText: rawText.replace(explicitMatch[0], ' __PHONE_EXTRACTED__ '),
      };
    }
  }

  // 2) Secuencia telefónica típica argentina sin palabra clave (8 a 13 dígitos, ej: "11 4567-8901", "15 4455 6677", "+54 9 11...")
  const genericPhoneRegex = /(?<!\$)\b(?:\+?54\s*9?\s*)?(?:0?\s*(?:11|15|[23]\d{2,3}))[\s\-]?\d{3,4}[\s\-]?\d{4}\b|\b\d{8,13}\b/g;
  let match: RegExpExecArray | null;
  while ((match = genericPhoneRegex.exec(rawText)) !== null) {
    const rawCandidate = match[0];
    const digits = rawCandidate.replace(/\D/g, '');
    // Evitar confundir un precio grande tipo "100000" (6 dígitos) con un teléfono (8+ dígitos)
    if (digits.length >= 8 && digits.length <= 14) {
      return {
        phone: rawCandidate.trim(),
        maskedText: rawText.replace(rawCandidate, ' __PHONE_EXTRACTED__ '),
      };
    }
  }

  return { phone: null, maskedText: rawText };
}

/**
 * Divide un dictado largo en cláusulas lógicas sin romper una prenda de su precio
 * (ej: mantiene unido "Tres camisas, cinco mil pesos cada una").
 */
function splitDictationClauses(text: string): string[] {
  // Primero separar por saltos de línea, punto y coma, o punto seguido (respetando miles como 15.000)
  const hardParts = text
    .replace(/(?<!\d)\.(?!\d)/g, '\n')
    .replace(/[;]/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const result: string[] = [];

  const isPriceOnlyFragment = (frag: string) => {
    const norm = normalizeSpanish(frag);
    const hasPrice =
      extractMonetaryAmount(norm).amount !== null ||
      /\b(cada\s+un[oa]|c\/u|en\s+total|pesos?)\b/.test(norm);
    const hasGarment = detectGarmentMatch(norm) !== null;
    const isSenia = /\b(sena|seno|dejo|pago|abono|adelanto)\b/.test(norm);
    const isDate = /\b(entregar|entrega|para\s+el|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(
      norm
    );
    return hasPrice && !hasGarment && !isSenia && !isDate;
  };

  for (const part of hardParts) {
    // Separar por comas o conectores " y también / además / luego "
    const commaChunks = part
      .split(/\s*,\s*|\s+(?:ademas|tambien|luego)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const chunk of commaChunks) {
      if (result.length > 0 && isPriceOnlyFragment(chunk)) {
        // Pegar el precio a la prenda inmediatamente anterior
        result[result.length - 1] = `${result[result.length - 1]}, ${chunk}`;
        continue;
      }

      // Separar " y " solo cuando separa dos cláusulas distintas (no "lavado y planchado" o "dos plazas y media")
      const andParts = chunk.split(/\s+y\s+(?=(?:un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+|dejo|sen[ao]|pag[ao]|abon[ao]|entregar|para\s+el|tel|obs))/i);
      for (const ap of andParts) {
        const trimmed = ap.trim();
        if (!trimmed) continue;
        if (result.length > 0 && isPriceOnlyFragment(trimmed)) {
          result[result.length - 1] = `${result[result.length - 1]} ${trimmed}`;
        } else {
          result.push(trimmed);
        }
      }
    }
  }

  return result;
}

function isDepositClause(clause: string): boolean {
  const norm = normalizeSpanish(clause);
  return /\b(sena|seno|dejo|deja|adelanto|abono|abona|pago|paga|saldado|transferencia|efectivo|debito|credito)\b/.test(
    norm
  ) && detectGarmentMatch(norm) === null;
}

function isDateClause(clause: string): boolean {
  const norm = normalizeSpanish(clause);
  if (detectGarmentMatch(norm) !== null) return false;
  const parsed = parseDeliveryDateFromText(norm);
  return parsed.dateKey !== null;
}

function isObservationClause(clause: string): boolean {
  const norm = normalizeSpanish(clause);
  return /^(obs(?:ervacion(?:es)?)?|nota|aclaracion|cuidado|detalle)\b/.test(norm);
}

function extractClientFromClauses(
  clauses: string[],
  phone: string | null,
  clientesExistentes: Cliente[]
): {
  clienteExistente: Cliente | null;
  clienteNuevo: { nombre: string; apellido: string; telefono: string } | null;
  consumedIndices: Set<number>;
} {
  const consumedIndices = new Set<number>();
  let extractedName = '';

  // 1. Buscar marcador explícito de cliente en cualquier cláusula sin prenda
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i].replace(/__PHONE_EXTRACTED__/g, '').trim();
    if (!c) {
      consumedIndices.add(i);
      continue;
    }
    if (detectGarmentMatch(c) || isDepositClause(c) || isDateClause(c) || isObservationClause(c)) {
      continue;
    }

    const explicitNameMatch = c.match(
      /^(?:cliente|para|a\s+nombre\s+de|nombre|de\s+parte\s+de|sr\.?|sra\.?)\s*[:\-]?\s*(.+)$/i
    );
    if (explicitNameMatch) {
      extractedName = explicitNameMatch[1].trim();
      consumedIndices.add(i);
      break;
    }

    // Si es la primera cláusula y no es prenda/seña/fecha/obs, asumir nombre/apellido
    if (i === 0 && c.split(/\s+/).length <= 5 && !/\d{3,}/.test(c)) {
      extractedName = c.replace(/^(?:el|la)\s+/i, '').trim();
      consumedIndices.add(i);
      break;
    }
  }

  // Limpiar palabras de relleno del nombre
  extractedName = extractedName
    .replace(/\b(el\s+telefono|telefono|tel|cel|celular|es|numero)\b.*$/i, '')
    .replace(/[,.\-]+$/g, '')
    .trim();

  // 2. Buscar coincidencia en clientes existentes (primero por teléfono, luego por nombre)
  let clienteExistente: Cliente | null = null;
  if (phone) {
    const telNorm = normalizarTelefonoWhatsApp(phone);
    if (telNorm.length >= 8) {
      clienteExistente =
        clientesExistentes.find((cli) => normalizarTelefonoWhatsApp(cli.telefono) === telNorm) || null;
    }
  }

  if (!clienteExistente && extractedName) {
    const nameNorm = normalizeSpanish(extractedName);
    clienteExistente =
      clientesExistentes.find((cli) => {
        const full = normalizeSpanish(`${cli.nombre} ${cli.apellido || ''}`);
        return full === nameNorm || (nameNorm.length >= 4 && full.includes(nameNorm));
      }) || null;
  }

  if (clienteExistente) {
    return { clienteExistente, clienteNuevo: null, consumedIndices };
  }

  if (extractedName || phone) {
    const parts = extractedName.split(/\s+/).filter(Boolean);
    const nombre = parts[0] ? capitalizeWords(parts[0]) : '';
    const apellido = parts.length > 1 ? capitalizeWords(parts.slice(1).join(' ')) : '';
    return {
      clienteExistente: null,
      clienteNuevo: {
        nombre,
        apellido,
        telefono: phone || '',
      },
      consumedIndices,
    };
  }

  return { clienteExistente: null, clienteNuevo: null, consumedIndices };
}

function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseGarmentClause(clause: string, index: number): ParsedGarmentDraft | null {
  const garmentMatch = detectGarmentMatch(clause);
  if (!garmentMatch) return null;

  const norm = normalizeSpanish(clause);

  // 1) Cantidad al principio o antes de la prenda ("dos acolchados...", "3 camisas...")
  let cantidad = 1;
  const qtyRegex = /^\s*(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/i;
  const qtyMatch = norm.match(qtyRegex);
  if (qtyMatch) {
    const rawQty = qtyMatch[1].toLowerCase();
    cantidad = /^\d+$/.test(rawQty) ? parseInt(rawQty, 10) : QTY_WORDS[rawQty] || 1;
    if (cantidad <= 0 || cantidad > 50) cantidad = 1;
  }

  // 2) Precio y detección de precio unitario vs total
  const { amount: montoDetectado, matchedText } = extractMonetaryAmount(clause);
  const esUnitarioExplicito =
    /\b(cada\s+un[oa]|c\/u|por\s+unidad|por\s+prenda|por\s+pano)\b/.test(norm) ||
    /\ba\s+(?:\$?\s*\d|[a-z]+\s+mil)/.test(norm);
  const esTotalExplicito =
    /\b(en\s+total|total|por\s+todo|por\s+todos|por\s+todas|por\s+los\s+\w+|por\s+las\s+\w+)\b/.test(
      norm
    );

  let precioUnitario: number | null = null;
  let ambiguedadPrecio: ParsedGarmentDraft['ambiguedadPrecio'];

  if (montoDetectado !== null && montoDetectado > 0) {
    if (cantidad === 1) {
      precioUnitario = montoDetectado;
    } else if (esUnitarioExplicito && !esTotalExplicito) {
      precioUnitario = montoDetectado;
    } else if (esTotalExplicito && !esUnitarioExplicito) {
      precioUnitario = Math.round(montoDetectado / cantidad);
    } else {
      // Cantidad > 1 y precio sin aclaración explícita ("dos camisas diez mil")
      precioUnitario = montoDetectado;
      ambiguedadPrecio = 'total_o_unitario';
    }
  } else {
    ambiguedadPrecio = 'sin_precio';
  }

  // 3) Construir tipo + descripción limpia
  let cleaned = clause.trim();
  if (qtyMatch) {
    cleaned = cleaned.replace(new RegExp(`^\\s*${qtyMatch[1]}\\b`, 'i'), '').trim();
  }
  if (matchedText) {
    // Quitar la frase de precio del texto descriptivo de la prenda
    const escapedPrice = matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned
      .replace(
        new RegExp(
          `(?:,?\\s*(?:a|por|de)?\\s*)?${escapedPrice}(?:\\s*(?:cada\\s+un[oa]|c\\/u|en\\s+total|por\\s+unidad))?`,
          'i'
        ),
        ''
      )
      .trim();
  }
  cleaned = cleaned
    .replace(/\b(cada\s+un[oa]|c\/u|en\s+total|pesos?)\b/gi, '')
    .replace(/^[,.\-\s]+|[,.\-\s]+$/g, '')
    .trim();

  // Usar texto hablado refinado como tipo si describe tamaño/variante ("Acolchado de dos plazas")
  const tipo = cleaned.length >= 3 ? capitalizeFirst(cleaned) : garmentMatch.canonical;
  const servicio = detectServiceOverride(clause, garmentMatch.defaultServicio);

  // Detectar mancha / observación específica de prenda
  let observaciones: string | undefined;
  const obsMatch = clause.match(/\b(con\s+mancha[^,.;]*|mancha\s+de[^,.;]*|boton\s+flojo|roto[^,.;]*|descosid[oa][^,.;]*)/i);
  if (obsMatch) {
    observaciones = capitalizeFirst(obsMatch[0]);
  }

  return {
    tempId: `voice_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    cantidad,
    tipo,
    descripcion: '',
    servicio,
    precioUnitario,
    montoOriginalDetectado: montoDetectado ?? undefined,
    ambiguedadPrecio,
    observaciones,
  };
}

function capitalizeFirst(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Parsea un dictado completo de pedido y devuelve un borrador editable con advertencias explícitas.
 */
export function parseOrderDictation(
  rawText: string,
  clientesExistentes: Cliente[]
): OrderDictationDraft {
  const textoOriginal = rawText.trim();
  const pendientesConfirmacion: string[] = [];

  if (!textoOriginal) {
    return {
      textoOriginal: '',
      clienteExistente: null,
      clienteNuevo: null,
      prendas: [],
      fechaEstimadaEntrega: null,
      fechaEstimadaLabel: null,
      senia: null,
      observacionesGenerales: '',
      pendientesConfirmacion: ['Ingresá o dictá el pedido para generar el borrador.'],
    };
  }

  // Paso 1: Extraer y enmascarar teléfono antes de interpretar precios/cantidades
  const { phone, maskedText } = extractAndMaskPhone(textoOriginal);

  // Paso 2: Dividir en cláusulas manteniendo precios unidos a sus prendas
  const clauses = splitDictationClauses(maskedText);

  // Paso 3: Identificar cliente
  const { clienteExistente, clienteNuevo, consumedIndices } = extractClientFromClauses(
    clauses,
    phone,
    clientesExistentes
  );

  // Paso 4: Recorrer cláusulas restantes para prendas, seña, fecha y observaciones
  const prendas: ParsedGarmentDraft[] = [];
  let fechaEstimadaEntrega: string | null = null;
  let fechaEstimadaLabel: string | null = null;
  let seniaDetected = false;
  let seniaMonto: number | null = null;
  let seniaMetodo: MetodoPago | null = null;
  let seniaEsPagoTotal = false;
  const obsList: string[] = [];

  for (let idx = 0; idx < clauses.length; idx++) {
    const clause = clauses[idx];
    if (consumedIndices.has(idx)) continue;
    const cleanClause = clause.replace(/__PHONE_EXTRACTED__/g, '').trim();
    if (!cleanClause) continue;

    // A) Prenda
    const prendaParsed = parseGarmentClause(cleanClause, idx);
    if (prendaParsed) {
      prendas.push(prendaParsed);

      // ¿Además mencionó en la misma frase fecha o seña? Revisar por las dudas
      const dateInClause = parseDeliveryDateFromText(cleanClause);
      if (dateInClause.dateKey && !fechaEstimadaEntrega) {
        fechaEstimadaEntrega = dateInClause.dateKey;
        fechaEstimadaLabel = dateInClause.label;
      }
      continue;
    }

    // B) Seña / Pago / Método de pago
    if (isDepositClause(cleanClause)) {
      const { amount } = extractMonetaryAmount(cleanClause);
      const metodo = detectPaymentMethod(cleanClause);
      const esPagoTotal = /\b(pago\s+todo|abono\s+todo|pago\s+total|saldado|completo)\b/.test(
        normalizeSpanish(cleanClause)
      );
      seniaDetected = true;
      if (amount !== null) seniaMonto = amount;
      if (metodo !== null) seniaMetodo = metodo;
      if (esPagoTotal) seniaEsPagoTotal = true;
      continue;
    }

    // C) Fecha de entrega
    if (isDateClause(cleanClause)) {
      const dateInfo = parseDeliveryDateFromText(cleanClause);
      if (dateInfo.dateKey) {
        fechaEstimadaEntrega = dateInfo.dateKey;
        fechaEstimadaLabel = dateInfo.label;
        if (dateInfo.needsConfirm && dateInfo.reason) {
          pendientesConfirmacion.push(dateInfo.reason);
        }
      }
      continue;
    }

    // D) Observaciones
    if (isObservationClause(cleanClause)) {
      obsList.push(cleanClause.replace(/^(?:obs(?:ervacion(?:es)?)?|nota|aclaracion)\s*[:\-]?\s*/i, '').trim());
      continue;
    }

    // Cláusula suelta no clasificada -> guardar como observación si aporta contexto útil
    if (cleanClause.length >= 3) {
      obsList.push(cleanClause);
    }
  }

  const senia: OrderDictationDraft['senia'] = seniaDetected
    ? {
        monto: seniaMonto,
        metodo: seniaMetodo,
        esPagoTotal: seniaEsPagoTotal,
      }
    : null;

  // Paso 5: Validar faltantes y ambigüedades sin inventar datos
  if (!clienteExistente && !clienteNuevo) {
    pendientesConfirmacion.push('No se detectó cliente ni teléfono: seleccionalo o completá el alta rápida.');
  } else if (clienteNuevo) {
    if (!clienteNuevo.nombre) {
      pendientesConfirmacion.push('Falta el nombre del cliente nuevo.');
    }
    if (!clienteNuevo.telefono) {
      pendientesConfirmacion.push(
        `Cliente nuevo "${clienteNuevo.nombre} ${clienteNuevo.apellido}". Falta número de teléfono.`
      );
    }
  }

  if (prendas.length === 0) {
    pendientesConfirmacion.push('No se detectaron prendas claras en el dictado.');
  }

  for (const p of prendas) {
    if (p.ambiguedadPrecio === 'sin_precio') {
      pendientesConfirmacion.push(`Falta el precio para "${p.cantidad}x ${p.tipo}".`);
    } else if (p.ambiguedadPrecio === 'total_o_unitario') {
      pendientesConfirmacion.push(
        `Confirmar si $${p.montoOriginalDetectado?.toLocaleString('es-AR')} para "${p.cantidad}x ${p.tipo}" es precio unitario o total.`
      );
    }
  }

  if (senia && senia.monto === null && !senia.esPagoTotal) {
    pendientesConfirmacion.push('Se mencionó una seña o pago, pero falta el importe exacto.');
  }
  if (senia && !senia.metodo) {
    pendientesConfirmacion.push('Falta confirmar el medio de pago de la seña (efectivo, transferencia, etc.).');
  }

  return {
    textoOriginal,
    clienteExistente,
    clienteNuevo,
    prendas,
    fechaEstimadaEntrega,
    fechaEstimadaLabel,
    senia,
    observacionesGenerales: obsList.join('. '),
    pendientesConfirmacion,
  };
}
