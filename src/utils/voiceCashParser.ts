/**
 * Intérprete de consultas y comandos de Caja para el Asistente eLeGe (voz o teclado).
 * Trabaja exclusivamente sobre los datos reales de storage.ts, sin inventar cifras.
 */

import { CategoriaMovimientoCaja, MetodoPago, TipoMovimientoCaja } from '../types';
import {
  CATEGORIA_CAJA_LABELS,
  METODO_PAGO_LABELS,
  formatMoneda,
  getLocalDateKey,
  getStartOfWeekDateKey,
  getStartOfMonthDateKey,
} from './formatters';
import {
  normalizeSpanish,
  extractMonetaryAmount,
  detectPaymentMethod,
} from './voiceNumbers';
import { storage } from '../services/storage';

export interface CashEntryDraft {
  tipo: TipoMovimientoCaja;
  categoria: CategoriaMovimientoCaja;
  concepto: string;
  monto: number | null;
  metodo: MetodoPago;
  fecha: string; // YYYY-MM-DD
  observaciones?: string;
  pendientes: string[];
}

export interface CashAssistantResult {
  intent: 'query' | 'draft_entry' | 'unknown';
  answerTitle: string;
  answerText: string;
  highlights?: Array<{ label: string; value: string; tone?: 'emerald' | 'rose' | 'amber' | 'neutral' }>;
  suggestedFilters?: {
    periodo: 'hoy' | 'semana' | 'mes' | 'todos';
    tipo?: 'todos' | TipoMovimientoCaja;
    categoria?: string;
    metodo?: string;
  };
  draftEntry?: CashEntryDraft;
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; categoria: CategoriaMovimientoCaja; tipo: TipoMovimientoCaja }> = [
  {
    pattern: /\b(limpieza|jabon|suavizante|lavandina|detergente|quitamanchas|perfume|desinfectante|productos?\s+de\s+limpieza)\b/,
    categoria: 'productos_limpieza',
    tipo: 'egreso',
  },
  {
    pattern: /\b(insumos?|bolsas?|perchas?|etiquetas?|rollo|papel\s+termico|hilo|agujas?)\b/,
    categoria: 'insumos',
    tipo: 'egreso',
  },
  {
    pattern: /\b(servicios?|luz|edenor|edesur|gas|agua|aysa|internet|wifi|telefono|alquiler|impuesto|abl|monotributo)\b/,
    categoria: 'servicios',
    tipo: 'egreso',
  },
  {
    pattern: /\b(sueldos?|salario|jornal|adelanto\s+de\s+sueldo|empleado|empleada|personal)\b/,
    categoria: 'sueldos',
    tipo: 'egreso',
  },
  {
    pattern: /\b(mantenimiento|reparacion|arreglo|tecnico|lavarropas|secarropas|plancha|caldera)\b/,
    categoria: 'mantenimiento',
    tipo: 'egreso',
  },
  {
    pattern: /\b(ajuste|sobrante|caja\s+inicial)\b/,
    categoria: 'ajuste_positivo',
    tipo: 'ingreso',
  },
  {
    pattern: /\b(senas?|senia)\b/,
    categoria: 'senia_pedido',
    tipo: 'ingreso',
  },
  {
    pattern: /\b(cobros?|pedidos?)\b/,
    categoria: 'cobro_pedido',
    tipo: 'ingreso',
  },
];

function detectPeriodFromText(norm: string): {
  key: 'hoy' | 'ayer' | 'semana' | 'mes' | 'todos';
  label: string;
  fechaDesde?: string;
  fechaHasta?: string;
} {
  const hoy = new Date();
  const hoyStr = getLocalDateKey(hoy);

  if (/\bayer\b/.test(norm)) {
    const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
    const ayerStr = getLocalDateKey(ayer);
    return { key: 'ayer', label: 'ayer', fechaDesde: ayerStr, fechaHasta: ayerStr };
  }
  if (/\b(semana|ultimos\s+7\s+dias|esta\s+semana)\b/.test(norm)) {
    return {
      key: 'semana',
      label: 'esta semana',
      fechaDesde: getStartOfWeekDateKey(hoy),
      fechaHasta: hoyStr,
    };
  }
  if (/\b(mes|este\s+mes|mensual)\b/.test(norm)) {
    return {
      key: 'mes',
      label: 'este mes',
      fechaDesde: getStartOfMonthDateKey(hoy),
      fechaHasta: hoyStr,
    };
  }
  if (/\b(historico|siempre|total\s+general|todos)\b/.test(norm)) {
    return { key: 'todos', label: 'todo el histórico' };
  }
  return { key: 'hoy', label: 'hoy', fechaDesde: hoyStr, fechaHasta: hoyStr };
}

function isQueryIntent(norm: string): boolean {
  return (
    /[¿?]/.test(norm) ||
    /\b(cuanto|cual|como|mostra(?:me)?|ver|decime|dime|consultar|resumen|balance|tenemos|hay\s+en\s+caja|ingreso\s+hoy|gastamos|gastos?\s+de|pendiente|deben)\b/.test(
      norm
    )
  );
}

function isDraftEntryIntent(norm: string): boolean {
  const { amount } = extractMonetaryAmount(norm);
  const hasEntryVerb = /\b(registra(?:r)?|carga(?:r)?|anota(?:r)?|agrega(?:r)?|gaste|gastamos|pague|pagamos|compre|compramos|entro|ingresar|ingreso\s+manual|egreso|gasto\s+de)\b/.test(
    norm
  );
  return hasEntryVerb || (amount !== null && !isQueryIntent(norm));
}

export function interpretCashAssistantCommand(rawText: string): CashAssistantResult {
  const text = rawText.trim();
  const norm = normalizeSpanish(text);

  if (!text) {
    return {
      intent: 'unknown',
      answerTitle: 'Escribí o dictá una consulta o movimiento',
      answerText:
        'Podés preguntar "¿Cuánto ingresó hoy?", "¿Cuánto efectivo tenemos en caja?" o dictar un movimiento como "Gastamos 12 mil en jabón líquido en efectivo".',
    };
  }

  // 1. Evaluar si es borrador de ingreso/egreso (si tiene verbo explícito de carga o monto sin pregunta)
  if (isDraftEntryIntent(norm) && !/\b(cuanto|cual|mostrame|mostra|ver)\b/.test(norm)) {
    const { amount, matchedText } = extractMonetaryAmount(text);
    const metodo = detectPaymentMethod(text) || 'efectivo';

    const esIngreso =
      /\b(ingreso|ingresar|entro|cobre|cobramos|venta|ajuste\s+positivo|ingreso\s+manual)\b/.test(
        norm
      ) && !/\b(gasto|gaste|gastamos|egreso|pague|pagamos|compre|compramos)\b/.test(norm);

    const tipo: TipoMovimientoCaja = esIngreso ? 'ingreso' : 'egreso';

    let categoria: CategoriaMovimientoCaja = esIngreso ? 'ingreso_manual' : 'otros_gastos';
    for (const cp of CATEGORY_PATTERNS) {
      if (cp.pattern.test(norm) && cp.tipo === tipo) {
        categoria = cp.categoria;
        break;
      }
    }

    // Limpiar concepto extrayendo verbos introductorios, monto y método
    let concepto = text;
    if (matchedText) {
      const esc = matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      concepto = concepto.replace(new RegExp(esc, 'i'), '');
    }
    concepto = concepto
      .replace(
        /\b(registra(?:r)?|carga(?:r)?|anota(?:r)?|agrega(?:r)?|un\s+gasto\s+de|un\s+egreso\s+de|un\s+ingreso\s+de|gaste|gastamos|pague|pagamos|compre|compramos|ingreso\s+manual|egreso|gasto|de|por|en|con)\b/gi,
        ' '
      )
      .replace(/\b(efectivo|transferencia|debito|credito|tarjeta|mercado\s+pago)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (concepto.length < 2) {
      concepto = CATEGORIA_CAJA_LABELS[categoria];
    } else {
      concepto = concepto.charAt(0).toUpperCase() + concepto.slice(1);
    }

    const pendientes: string[] = [];
    if (amount === null || amount <= 0) {
      pendientes.push('Falta indicar el importe exacto del movimiento.');
    }

    const hoyStr = getLocalDateKey();

    return {
      intent: 'draft_entry',
      answerTitle: `Borrador de ${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} listo para confirmar`,
      answerText:
        'Revisá los datos detectados antes de guardar. Podés corregir el concepto, categoría, importe o medio de pago.',
      draftEntry: {
        tipo,
        categoria,
        concepto,
        monto: amount,
        metodo,
        fecha: hoyStr,
        pendientes,
      },
    };
  }

  // 2. Consultas sobre Caja real
  const period = detectPeriodFromText(norm);

  // 2A. Consulta de efectivo físico disponible en caja
  if (/\b(efectivo|plata\s+en\s+caja|cuanto\s+tenemos\s+en\s+caja|saldo\s+de\s+caja|caja\s+disponible)\b/.test(norm)) {
    const { resumen } = storage.getResumenCaja({
      fechaDesde: period.fechaDesde,
      fechaHasta: period.fechaHasta,
    });
    return {
      intent: 'query',
      answerTitle: 'Saldo disponible en Caja',
      answerText: `Efectivo físico disponible: ${formatMoneda(resumen.efectivoDisponible)} (separado de medios digitales/transferencias: ${formatMoneda(resumen.saldoDigitalDisponible)}).`,
      highlights: [
        { label: 'Efectivo físico en caja', value: formatMoneda(resumen.efectivoDisponible), tone: 'emerald' },
        { label: 'Transferencias / Tarjetas', value: formatMoneda(resumen.saldoDigitalDisponible), tone: 'neutral' },
        { label: 'Saldo inicial efectivo', value: formatMoneda(resumen.saldoInicialEfectivo), tone: 'neutral' },
        { label: 'Saldo total real', value: formatMoneda(resumen.saldoCajaTotal), tone: 'emerald' },
      ],
    };
  }

  // 2B. Saldos pendientes de clientes (informados aparte)
  if (/\b(deben|saldo(?:s)?\s+pendiente|por\s+cobrar|fiado)\b/.test(norm)) {
    const { resumen } = storage.getResumenCaja();
    return {
      intent: 'query',
      answerTitle: 'Saldos pendientes de clientes',
      answerText: `Los clientes tienen ${formatMoneda(resumen.saldosPorCobrarClientes)} pendientes de cobro en pedidos activos. Este monto NO se suma como ingreso de caja hasta cobrarlo.`,
      highlights: [
        { label: 'Por cobrar al entregar', value: formatMoneda(resumen.saldosPorCobrarClientes), tone: 'amber' },
      ],
    };
  }

  // 2C. Filtro por categoría específica ("Mostrame los gastos de productos de limpieza")
  let matchedCat: CategoriaMovimientoCaja | undefined;
  for (const cp of CATEGORY_PATTERNS) {
    if (cp.pattern.test(norm)) {
      matchedCat = cp.categoria;
      break;
    }
  }

  const asksForExpenses = /\b(gast(?:o|os|amos)|egresos?|salidas?|pagamos)\b/.test(norm);
  const asksForIncome = /\b(ingres(?:o|os|o)|recaud(?:o|amos|acion)|cobramos|entro)\b/.test(norm);
  const asksForBalance = /\b(balance|neto|ganancia|resultado)\b/.test(norm);
  const explicitMethod = detectPaymentMethod(norm);

  // Si pregunta por categoría sin periodo explícito (ej: "Mostrame los gastos de productos de limpieza"),
  // usar el mes actual por defecto si no dijo "hoy/semana" para no mostrar 0 si se cargó ayer.
  const hasExplicitPeriodWord = /\b(hoy|ayer|semana|mes|historico|siempre|todos)\b/.test(norm);
  const effectivePeriod =
    matchedCat && !hasExplicitPeriodWord
      ? {
          key: 'mes' as const,
          label: 'este mes',
          fechaDesde: getStartOfMonthDateKey(new Date()),
          fechaHasta: getLocalDateKey(new Date()),
        }
      : period;

  const { movimientosFiltrados, resumen } = storage.getResumenCaja({
    fechaDesde: effectivePeriod.fechaDesde,
    fechaHasta: effectivePeriod.fechaHasta,
    tipo: asksForExpenses ? 'egreso' : asksForIncome ? 'ingreso' : 'todos',
    categoria: matchedCat || 'todas',
    metodo: explicitMethod || 'todos',
  });

  const activos = movimientosFiltrados.filter((m) => !m.anulado);

  if (matchedCat) {
    const totalCat = activos.reduce((acc, m) => acc + m.monto, 0);
    const catLabel = CATEGORIA_CAJA_LABELS[matchedCat];
    return {
      intent: 'query',
      answerTitle: `${catLabel} (${effectivePeriod.label})`,
      answerText: `Se registraron ${activos.length} movimiento(s) en "${catLabel}" durante ${effectivePeriod.label} por un total de ${formatMoneda(totalCat)}. Se aplicó el filtro en la tabla.`,
      highlights: [
        { label: catLabel, value: formatMoneda(totalCat), tone: asksForIncome ? 'emerald' : 'rose' },
        { label: 'Movimientos', value: String(activos.length), tone: 'neutral' },
      ],
      suggestedFilters: {
        periodo: effectivePeriod.key === 'ayer' ? 'todos' : effectivePeriod.key,
        tipo: asksForExpenses ? 'egreso' : asksForIncome ? 'ingreso' : 'todos',
        categoria: matchedCat,
        metodo: explicitMethod || 'todos',
      },
    };
  }

  if (asksForBalance) {
    return {
      intent: 'query',
      answerTitle: `Balance neto de ${effectivePeriod.label}`,
      answerText: `Durante ${effectivePeriod.label}: Ingresos ${formatMoneda(resumen.ingresosPeriodo)}, Egresos ${formatMoneda(resumen.egresosPeriodo)}. Balance neto: ${formatMoneda(resumen.balanceNetoPeriodo)}.`,
      highlights: [
        { label: 'Ingresos', value: formatMoneda(resumen.ingresosPeriodo), tone: 'emerald' },
        { label: 'Egresos', value: formatMoneda(resumen.egresosPeriodo), tone: 'rose' },
        {
          label: 'Balance neto',
          value: formatMoneda(resumen.balanceNetoPeriodo),
          tone: resumen.balanceNetoPeriodo >= 0 ? 'emerald' : 'rose',
        },
        { label: 'Efectivo en caja', value: formatMoneda(resumen.efectivoDisponible), tone: 'neutral' },
      ],
      suggestedFilters: {
        periodo: effectivePeriod.key === 'ayer' ? 'todos' : effectivePeriod.key,
        tipo: 'todos',
        categoria: 'todas',
        metodo: explicitMethod || 'todos',
      },
    };
  }

  if (asksForExpenses) {
    return {
      intent: 'query',
      answerTitle: `Egresos de ${effectivePeriod.label}`,
      answerText: `Los gastos registrados en ${effectivePeriod.label} suman ${formatMoneda(resumen.egresosPeriodo)} en ${resumen.cantidadEgresos} movimiento(s).`,
      highlights: [
        { label: `Gastos (${effectivePeriod.label})`, value: formatMoneda(resumen.egresosPeriodo), tone: 'rose' },
        { label: 'Cantidad', value: `${resumen.cantidadEgresos} egreso(s)`, tone: 'neutral' },
      ],
      suggestedFilters: {
        periodo: effectivePeriod.key === 'ayer' ? 'todos' : effectivePeriod.key,
        tipo: 'egreso',
        categoria: 'todas',
        metodo: explicitMethod || 'todos',
      },
    };
  }

  if (asksForIncome || explicitMethod) {
    const metodoLabel = explicitMethod ? ` por ${METODO_PAGO_LABELS[explicitMethod]}` : '';
    return {
      intent: 'query',
      answerTitle: `Ingresos de ${effectivePeriod.label}${metodoLabel}`,
      answerText: `Los ingresos reales cobrados en ${effectivePeriod.label}${metodoLabel} suman ${formatMoneda(resumen.ingresosPeriodo)} en ${resumen.cantidadIngresos} operación(es).`,
      highlights: [
        { label: `Ingresos (${effectivePeriod.label})`, value: formatMoneda(resumen.ingresosPeriodo), tone: 'emerald' },
        { label: 'Efectivo', value: formatMoneda(resumen.desgloseMetodos.efectivo.ingresos), tone: 'neutral' },
        { label: 'Transferencia', value: formatMoneda(resumen.desgloseMetodos.transferencia.ingresos), tone: 'neutral' },
      ],
      suggestedFilters: {
        periodo: effectivePeriod.key === 'ayer' ? 'todos' : effectivePeriod.key,
        tipo: 'ingreso',
        categoria: 'todas',
        metodo: explicitMethod || 'todos',
      },
    };
  }

  return {
    intent: 'unknown',
    answerTitle: 'No pude interpretar esa instrucción',
    answerText:
      'Probá preguntar "¿Cuánto ingresó hoy?", "¿Cuánto gastamos esta semana?", "¿Cuánto efectivo tenemos en caja?", o dictar un movimiento como "Gastamos 8 mil en bolsas en efectivo".',
  };
}
