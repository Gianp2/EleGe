import type { TipoServicio, MetodoPago } from '../types';

export type GarmentDraft = { tipo: string; precio: number | null; servicio: TipoServicio; descripcion: string };
export type DictationDraft = {
  nombre?: string;
  apellido?: string;
  telefono?: string;
  prendas: GarmentDraft[];
  senia?: number;
  metodoPago?: MetodoPago;
  fecha?: string;
  pendientes: string[];
};

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const unit: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const count = (raw: string | undefined) => raw ? (unit[fold(raw)] || Number(raw) || 1) : 1;
// Acepta importes argentinos expresados en cifras o en palabras.
const MONEY_WORDS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200,
  trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600,
  setecientos: 700, ochocientos: 800, novecientos: 900,
};
const moneyAtStart = (raw: string): number | null => {
  const str = fold(raw).replace(/^\s*\$\s*/, '').trim();
  const numeric = str.match(/^(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+)(?:\s+(mil|miles))?(?:\s+(\d{1,3}))?(?=\b|$)/);
  if (numeric) {
    const digits = numeric[1];
    const value = /^\d{1,3}(?:[.,]\d{3})+/.test(digits)
      ? Number(digits.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
      : Number(digits);
    const final = numeric[2] ? value * 1000 + Number(numeric[3] || 0) : value;
    return Number.isFinite(final) && final >= 0 ? final : null;
  }
  const words = str.split(/\s+/);
  let subtotal = 0;
  let recognized = false;
  for (let i = 0; i < Math.min(words.length, 9); i++) {
    const word = words[i];
    if (word === 'y') continue;
    if (word === 'mil' || word === 'miles') {
      subtotal = (subtotal || 1) * 1000;
      recognized = true;
      continue;
    }
    if (word === 'peso' || word === 'pesos') break;
    if (/^\d{1,3}$/.test(word) && recognized) { subtotal += Number(word); continue; }
    if (MONEY_WORDS[word] === undefined) break;
    subtotal += MONEY_WORDS[word];
    recognized = true;
  }
  return recognized && subtotal >= 0 ? subtotal : null;
};
const cash = (text: string) => moneyAtStart(text);
const asDate = (day: number, month: number, year: number): string | undefined => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : undefined;
};

/** Conservative parser: unrecognized information stays in the transcript for manual review. */
export function parseDictation(text: string, today = new Date()): DictationDraft {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 2500);
  const lower = fold(clean);
  const draft: DictationDraft = { prendas: [], pendientes: [] };

  // Names are bounded by the next clearly recognized field.
  const nameMatch = clean.match(/\b(?:cliente|para|nombre(?: del cliente)?)(?:\s+(?:se llama|llamad[oa]))?\s*[:,-]?\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,3}?)(?=\s*[,.;]|\s+(?:tel[eé]fono|celular|n[uú]mero|trae|lleva|pedido|con|prendas?|un|una|dos|tres|cuatro|cinco|lavado|entrega|retira|seña|dej[oó]|$))/i);
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(/\s+/);
    draft.nombre = parts[0];
    if (parts.length > 1) draft.apellido = parts.slice(1).join(' ');
  }
  const phoneMatch = clean.match(/\b(?:tel[eé]fono|celular|n[uú]mero(?: de tel[eé]fono)?|whatsapp)\s*[:,-]?\s*(\+?\d[\d\s()-]{6,18}\d)/i);
  if (phoneMatch) draft.telefono = phoneMatch[1].replace(/[^\d+]/g, '');

  const garmentPattern = /\b(?:(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?(acolchados?|camisas?|pantal[oó]n(?:es)?|polleras?|vestidos?|camperas?|trajes?|s[aá]banas?|frazadas?|cortinas?|remeras?|buzos?|manteles?|toallas?|tapados?|alfombras?|prendas?)\b/gi;
  const found = Array.from(clean.matchAll(garmentPattern));
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const next = found[i + 1];
    const segment = clean.slice(current.index, next?.index ?? clean.length).split(/\b(?:se[nñ]a|dej[oó]|adelanto|entrega|retira|tel[eé]fono|celular)\b/i)[0];
    const qty = Math.min(count(current[1]), 25);
    const tipo = current[2].trim();
    const plazas = segment.match(/(?:de\s+)?(una|un|dos|tres|1|2|3)\s+plazas?/i);
    const detalle = plazas ? `${tipo} ${count(plazas[1])} plaza${count(plazas[1]) > 1 ? 's' : ''}` : tipo;
    // Precio acotado a la prenda actual, nunca al telefono, senia ni fecha.
    // Se acepta «a 12000», «sale doce mil», «cada uno 12 mil», «precio de $12.000».
    const pricePrefix = /(?:\b(?:a|por|precio(?:\s+de)?|cuesta(?:n)?|vale(?:n)?|sale(?:n)?|cobra(?:n)?|cada\s+un[ao]?(?:\s+a)?|unidad(?:\s+a)?|unitario(?:\s+de)?|total(?:\s+de)?)\b|\$)\s*[:=$]?\s*/gi;
    let price: number | null = null;
    let explicitTotal = false;
    for (const candidate of segment.matchAll(pricePrefix)) {
      const remainder = segment.slice((candidate.index ?? 0) + candidate[0].length);
      const amount = cash(remainder);
      if (amount !== null && amount > 0) {
        price = amount;
        explicitTotal = /\btotal\b/i.test(candidate[0]);
        break;
      }
    }
    if (explicitTotal && price !== null && qty > 1) {
      draft.pendientes.push(`Se interpretó un total de $${price} para ${qty} ${tipo}; verificá el importe por unidad.`);
      price = null; // No asignar un total como precio unitario por error.
    }
    const service: TipoServicio = /planchad[oa]/i.test(segment) && !/lavad[oa]/i.test(segment)
      ? 'solo_planchado' : /tintorer[ií]a/i.test(segment) ? 'tintoreria'
      : /solo lavado/i.test(segment) ? 'solo_lavado' : /acolchad|frazad/i.test(tipo) ? 'acolchados_frazadas'
      : 'lavado_planchado';
    for (let n = 0; n < qty; n++) draft.prendas.push({ tipo: detalle, precio: price, servicio: service, descripcion: '' });
    if (price === null) draft.pendientes.push(`Indicar precio de ${detalle}`);
  }
  const senia = clean.match(/\b(?:se[nñ]a|adelanto|dej[oó](?:\s+de\s+se[nñ]a)?|abon[oó]|pag[oó])\s*(?:de\s+|por\s+|\$\s*)?/i);
  if (senia) {
    const amount = cash(clean.slice(senia.index! + senia[0].length));
    if (amount !== null) draft.senia = amount;
  }
  if (/\btransferencia\b/i.test(lower)) draft.metodoPago = 'transferencia';
  else if (/\befectivo\b/i.test(lower)) draft.metodoPago = 'efectivo';
  else if (/\bd[eé]bito\b/i.test(lower)) draft.metodoPago = 'debito';
  else if (/\bcr[eé]dito\b/i.test(lower)) draft.metodoPago = 'credito';

  const explicitDate = lower.match(/\b(?:entrega|retira|retirar|para el)\b.{0,25}?\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (explicitDate) {
    let year = explicitDate[3] ? Number(explicitDate[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    draft.fecha = asDate(Number(explicitDate[1]), Number(explicitDate[2]), year);
  } else if (/\b(?:entrega|retira|retirar)\b.{0,25}?\b(ma[nñ]ana|pasado ma[nñ]ana)\b/.test(lower)) {
    const days = /pasado ma[nñ]ana/.test(lower) ? 2 : 1;
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    draft.fecha = asDate(d.getDate(), d.getMonth() + 1, d.getFullYear());
  } else if (/\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(lower)) {
    draft.pendientes.push('Confirmar fecha de entrega (se mencionó un día de la semana)');
  }
  if (draft.prendas.length > 25) draft.pendientes.push('Se detectaron muchas prendas: revisá cantidades y precios.');
  if (!draft.nombre && !draft.telefono) draft.pendientes.push('Identificar cliente');
  if (!draft.prendas.length) draft.pendientes.push('Indicar prendas y precios');
  return draft;
}
