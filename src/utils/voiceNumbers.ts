/**
 * Utilidades compartidas de normalización y parseo en español rioplatense
 * para números en palabras/cifras, fechas relativas y medios de pago.
 */

import { MetodoPago } from '../types';
import { getLocalDateKey } from './formatters';

export function normalizeSpanish(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const UNIDADES: Record<string, number> = {
  cero: 0,
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
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const DECENAS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

/**
 * Convierte expresiones numéricas en español (cifras, palabras o mixtas) a número.
 * Ejemplos:
 * - "quince mil" -> 15000
 * - "cinco mil quinientos" -> 5500
 * - "15 mil" -> 15000
 * - "$15.000" -> 15000
 * - "15 lucas" -> 15000
 * - "medio millon" -> 500000
 */
export function parseSpanishNumber(rawInput: string): number | null {
  const clean = normalizeSpanish(rawInput)
    .replace(/\$/g, ' ')
    .replace(/\bpesos?\b/g, ' ')
    .replace(/\bcon\s+\d+\s*(centavos?)?\b/g, ' ')
    .trim();

  if (!clean) return null;

  if (/\bmedio\s+millon\b/.test(clean)) return 500000;

  // Caso directo numérico con posible separador de miles (ej: "15.000", "15,000", "15000", "15k")
  const directK = clean.match(/^(\d+(?:[.,]\d+)?)\s*k$/);
  if (directK) {
    const n = parseFloat(directK[1].replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }

  const directDigits = clean.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)$/);
  if (directDigits) {
    const digitsOnly = directDigits[1].replace(/[.,]/g, '');
    const n = parseInt(digitsOnly, 10);
    return Number.isFinite(n) ? n : null;
  }

  // Mixto o palabras: tokenizar
  const tokens = clean
    .replace(/\by\b/g, ' ')
    .replace(/[.,;]/g, (m) => (m === '.' ? '' : ' '))
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let hasNumericToken = false;

  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      current += parseInt(tok, 10);
      hasNumericToken = true;
    } else if (/^\d+k$/.test(tok)) {
      current += parseInt(tok.slice(0, -1), 10) * 1000;
      hasNumericToken = true;
    } else if (UNIDADES[tok] !== undefined) {
      current += UNIDADES[tok];
      hasNumericToken = true;
    } else if (DECENAS[tok] !== undefined) {
      current += DECENAS[tok];
      hasNumericToken = true;
    } else if (CENTENAS[tok] !== undefined) {
      current += CENTENAS[tok];
      hasNumericToken = true;
    } else if (tok === 'mil' || tok === 'lucas' || tok === 'luca') {
      hasNumericToken = true;
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
    } else if (tok === 'millon' || tok === 'millones') {
      hasNumericToken = true;
      total += (current === 0 ? 1 : current) * 1000000;
      current = 0;
    } else {
      // Token no numérico corta la secuencia si ya habíamos acumulado algo? No necesariamente si limpiamos antes,
      // pero si la cadena entera no tenía palabras numéricas, devolver null.
    }
  }

  if (!hasNumericToken) return null;
  const result = total + current;
  return Number.isFinite(result) ? result : null;
}

/**
 * Extrae el primer importe monetario encontrado dentro de un fragmento de texto.
 */
export function extractMonetaryAmount(fragment: string): {
  amount: number | null;
  matchedText: string;
} {
  const norm = normalizeSpanish(fragment);

  // 1) Patrón explícito con $, k, mil/lucas o dígitos de 3+ cifras
  const regexList: RegExp[] = [
    /\$\s*(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(mil|lucas?|k)?/i,
    /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(mil|lucas?|k)(?:\s+(\d{1,3}|[a-z]+))?(?:\s+pesos?)?/i,
    /\b((?:(?:un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veinti[a-z]+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscient[oa]s|trescient[oa]s|cuatrocient[oa]s|quinient[oa]s|seiscient[oa]s|setecient[oa]s|ochocient[oa]s|novecient[oa]s|medio)\s+(?:y\s+)?)+)(?:mil|lucas?|millon(?:es)?)(?:\s+(?:[a-z]+(?:\s+y\s+[a-z]+)?|\d{1,3}))?(?:\s+pesos?)?/i,
    /\b(\d{3,7})\s*(?:pesos?)?\b/i,
  ];

  for (const rx of regexList) {
    const match = norm.match(rx);
    if (match) {
      const parsed = parseSpanishNumber(match[0]);
      if (parsed !== null && parsed > 0) {
        return { amount: parsed, matchedText: match[0] };
      }
    }
  }

  return { amount: null, matchedText: '' };
}

/**
 * Detecta un método de pago en texto en español.
 */
export function detectPaymentMethod(text: string): MetodoPago | null {
  const norm = normalizeSpanish(text);
  if (/\b(transferencia|transferir|transf|alias|cbu|cvu|mercado\s*pago|mp|billetera|qr)\b/.test(norm)) {
    return 'transferencia';
  }
  if (/\b(debito|tarjeta\s+de\s+debito)\b/.test(norm)) {
    return 'debito';
  }
  if (/\b(credito|tarjeta\s+de\s+credito|cuotas?)\b/.test(norm)) {
    return 'credito';
  }
  if (/\b(efectivo|cash|contado|en\s+mano|billete)\b/.test(norm)) {
    return 'efectivo';
  }
  if (/\b(tarjeta)\b/.test(norm)) {
    return 'debito';
  }
  return null;
}

const WEEKDAYS_ES: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS_ES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/**
 * Interpreta fechas relativas o días de semana en español.
 * Ej: "entregar el viernes", "para mañana", "en 48 hs", "para el 25/11".
 */
export function parseDeliveryDateFromText(
  text: string,
  baseDate: Date = new Date()
): { dateKey: string | null; label: string | null; needsConfirm: boolean; reason?: string } {
  const norm = normalizeSpanish(text);
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());

  const formatLabel = (d: Date) =>
    new Intl.DateTimeFormat('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(d);

  // 1) "pasado mañana"
  if (/\bpasado\s+manana\b/.test(norm)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 2);
    return { dateKey: getLocalDateKey(d), label: formatLabel(d), needsConfirm: false };
  }

  // 2) "mañana"
  if (/\b(para|entregar|retira[r]?|listo)?\s*(el\s+dia\s+de\s+)?manana\b/.test(norm)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return { dateKey: getLocalDateKey(d), label: formatLabel(d), needsConfirm: false };
  }

  // 3) "hoy"
  if (/\b(para|entregar|retira[r]?|listo)\s+hoy\b/.test(norm)) {
    return { dateKey: getLocalDateKey(base), label: formatLabel(base), needsConfirm: false };
  }

  // 4) "en X horas" / "en X días"
  const horasMatch = norm.match(/\ben\s+(\d+)\s*(hs|horas?)\b/);
  if (horasMatch) {
    const dias = Math.max(1, Math.round(parseInt(horasMatch[1], 10) / 24));
    const d = new Date(base);
    d.setDate(d.getDate() + dias);
    return { dateKey: getLocalDateKey(d), label: formatLabel(d), needsConfirm: false };
  }

  const diasMatch = norm.match(/\ben\s+(\d+|un|uno|dos|tres|cuatro|cinco|seis|siete)\s+dias?\b/);
  if (diasMatch) {
    const cant = parseSpanishNumber(diasMatch[1]) || 1;
    const d = new Date(base);
    d.setDate(d.getDate() + cant);
    return { dateKey: getLocalDateKey(d), label: formatLabel(d), needsConfirm: false };
  }

  // 5) Día de la semana ("entregar el viernes", "para el lunes", "este sabado", "proximo martes")
  const weekdayMatch = norm.match(
    /\b(?:entregar|entrega|retira[r]?|para|listo)?\s*(?:el\s+|este\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/
  );
  if (weekdayMatch) {
    const targetDay = WEEKDAYS_ES[weekdayMatch[1]];
    const currentDay = base.getDay();
    let diff = (targetDay - currentDay + 7) % 7;
    let needsConfirm = false;
    let reason: string | undefined;

    if (diff === 0) {
      // Mismo día de la semana que hoy: asumir la semana próxima o pedir confirmación
      diff = 7;
      needsConfirm = true;
      reason = `Mencionaste "${weekdayMatch[1]}" y hoy es ${weekdayMatch[1]}. Se propuso el próximo ${weekdayMatch[1]}; confirmá si es hoy o la semana próxima.`;
    }
    if (/\bproxim[oa]\b/.test(weekdayMatch[0]) && diff < 7 && diff > 0) {
      // Si ya es un día futuro esta semana pero dice "próximo", podría ser esta o la otra
    }

    const d = new Date(base);
    d.setDate(d.getDate() + diff);
    return {
      dateKey: getLocalDateKey(d),
      label: formatLabel(d),
      needsConfirm,
      reason,
    };
  }

  // 6) Fecha numérica DD/MM o DD/MM/YYYY
  const dateSlashMatch = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dateSlashMatch) {
    const day = parseInt(dateSlashMatch[1], 10);
    const month = parseInt(dateSlashMatch[2], 10) - 1;
    const yearRaw = dateSlashMatch[3];
    const year = yearRaw
      ? yearRaw.length === 2
        ? 2000 + parseInt(yearRaw, 10)
        : parseInt(yearRaw, 10)
      : base.getFullYear();

    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const d = new Date(year, month, day);
      if (!yearRaw && d < base) {
        d.setFullYear(d.getFullYear() + 1);
      }
      return { dateKey: getLocalDateKey(d), label: formatLabel(d), needsConfirm: false };
    }
  }

  // 7) "el 25 de noviembre" o "para el 25"
  const dayOfMonthMatch = norm.match(
    /\b(?:para\s+el|entregar\s+el|el\s+dia|el)\s+(\d{1,2})(?:\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))?\b/
  );
  if (dayOfMonthMatch) {
    const day = parseInt(dayOfMonthMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const month = dayOfMonthMatch[2] ? MONTHS_ES[dayOfMonthMatch[2]] : base.getMonth();
      const d = new Date(base.getFullYear(), month, day);
      if (d < base) {
        if (dayOfMonthMatch[2]) d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
      }
      return { dateKey: getLocalDateKey(d), label: formatLabel(d), needsConfirm: !dayOfMonthMatch[2] };
    }
  }

  return { dateKey: null, label: null, needsConfirm: false };
}
