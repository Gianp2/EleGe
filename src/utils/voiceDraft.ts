import type { TipoServicio } from '../types';
import { SERVICIOS_INFO } from './formatters';

export interface ClientDraft { nombre: string; apellido: string; telefono: string }
export interface GarmentDraft { tipo: string; servicio: TipoServicio; precio: number }
export interface OrderDraft { clienteBusqueda: string; prendas: GarmentDraft[]; senia?: number; observaciones?: string }

export const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function isNewClientIntent(text: string) {
  return /(?:agreg|cre|registr|alta|nuev).{0,28}client/i.test(normalizar(text));
}
export function isNewOrderIntent(text: string) {
  return /(?:agreg|cre|registr|carg|nuev).{0,28}pedid/i.test(normalizar(text));
}

export function parseClient(text: string): ClientDraft {
  const match = text.match(/(?:se llama|nombre(?:\s+es)?|client[ae]?\s+(?:que\s+se\s+llama\s+)?)([\s\S]*?)(?=\s*[,;.]?\s*(?:tel[eé]fono|celular|whatsapp|n[uú]mero|$))/i);
  const nombreCompleto = (match?.[1] || '').replace(/^[\s,:-]+|[\s,:.-]+$/g, '').trim();
  const partes = nombreCompleto.split(/\s+/).filter(Boolean);
  const phoneMatch = text.match(/(?:tel[eé]fono|celular|whatsapp|n[uú]mero)\s*(?:es|:)?\s*([+\d][\d\s()\-]{6,22})/i);
  return { nombre: partes[0] || '', apellido: partes.slice(1).join(' '), telefono: phoneMatch?.[1]?.trim() || '' };
}

const kinds: {re: RegExp; label: string}[] = [
  { re: /acolchad[oa]s?(?:\s+de\s+(?:una?|dos|tres|\d+)\s+plazas?)?/i, label: 'Acolchado' },
  { re: /camisas?/i, label: 'Camisa' },
  { re: /pantalones?|pantal[oó]ns?/i, label: 'Pantalón' },
  { re: /camperas?/i, label: 'Campera' },
  { re: /s[aá]banas?/i, label: 'Sábana' },
  { re: /frazadas?/i, label: 'Frazada' },
  { re: /vestidos?/i, label: 'Vestido' },
  { re: /cortinas?/i, label: 'Cortina' },
  { re: /trajes?/i, label: 'Traje' },
  { re: /remeras?/i, label: 'Remera' },
  { re: /toallas?/i, label: 'Toalla' },
  { re: /buzos?/i, label: 'Buzo' },
 ];
const countMap: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

export function parseOrder(text: string): OrderDraft {
  const clientMatch = text.match(/(?:para|cliente|clienta)\s+([\p{L}]+(?:\s+[\p{L}]+){0,3}?)(?=\s*[,;.]|\s+(?:con|que|un|una|dos|tres|cuatro|cinco|lavado|planchado|dejo|dej[oó]|seña)|$)/iu);
  const clienteBusqueda = clientMatch?.[1]?.trim() || '';
  const norm = normalizar(text);
  const servicio: TipoServicio = /solo\s+planchado|para\s+planchar/.test(norm) ? 'solo_planchado'
    : /solo\s+lavado|solo\s+lavar/.test(norm) ? 'solo_lavado'
    : /tintoreria/.test(norm) ? 'tintoreria'
    : /lavado\s+y\s+planchado/.test(norm) ? 'lavado_planchado'
    : 'lavado_planchado';
  const priceMatch = text.match(/(?:por|precio(?:\s+de)?|a)\s*\$?\s*(\d[\d.,]*)\s*(?:pesos)?/i);
  const explicitPrice = priceMatch ? Number(priceMatch[1].replace(/[.,]/g, '')) : null;
  const garments: {start:number; tipo:string; count:number}[] = [];
  for (const kind of kinds) {
    const re = new RegExp('(?:\\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|[1-9])\\s+)?('+kind.re.source+')', 'giu');
    for (const match of text.matchAll(re)) {
      const before = text.slice(Math.max(0, (match.index || 0) - 12), match.index);
      const nearby = before.match(/(?:^|\s)(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|[1-9])\s*$/i);
      const qtyToken = normalizar(match[1] || nearby?.[1] || 'un');
      const count = Math.min(10, countMap[qtyToken] || Number(qtyToken) || 1);
      const extra = /acolchado/i.test(kind.label) ? text.slice((match.index || 0), (match.index || 0)+45).match(/(?:de\s+)?(una?|dos|tres|\d+)\s+plazas?/i)?.[0] : undefined;
      garments.push({start: match.index || 0, tipo: extra ? `${kind.label} ${extra}` : kind.label, count});
    }
  }
  garments.sort((a,b)=>a.start-b.start);
  const prendas = garments.flatMap(g => Array.from({length:g.count}, () => ({
    tipo: g.tipo,
    servicio,
    // El precio sugerido se usa solamente cuando no se dictó uno explícito.
    precio: explicitPrice !== null && garments.length === 1 ? explicitPrice : SERVICIOS_INFO[servicio].precioSugerido,
  })));
  const seniaMatch = text.match(/(?:se[ñn]a|dej[oó]|anticipo)\s*(?:de|por)?\s*\$?\s*(\d[\d.,]*)/i);
  const senia = seniaMatch ? Number(seniaMatch[1].replace(/[.,]/g, '')) : undefined;
  return { clienteBusqueda, prendas: prendas.slice(0, 30), senia };
}
