/**
 * Suite de pruebas funcionales unitarias:
 * 1. Dictado de voz continuo y merge de fragmentos sin duplicación.
 * 2. Intérprete de pedidos por voz (voiceOrderParser).
 * 3. Asistente de Caja por voz / teclado (voiceCashParser).
 * 4. Persistencia, cálculos y auditoría del módulo Control de Caja (storage).
 */

import assert from 'node:assert/strict';

// Polyfill mínimo de localStorage antes de importar storage/voiceCashParser en Node/tsx
const memoryStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return memoryStore.size;
  },
  clear() {
    memoryStore.clear();
  },
  getItem(key: string) {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  },
  key(index: number) {
    return Array.from(memoryStore.keys())[index] ?? null;
  },
  removeItem(key: string) {
    memoryStore.delete(key);
  },
  setItem(key: string, value: string) {
    memoryStore.set(key, String(value));
  },
};

import { mergeTranscriptSegments } from '../src/hooks/useContinuousSpeechDictation';
import { parseOrderDictation } from '../src/utils/voiceOrderParser';
import { Cliente, Pedido } from '../src/types';

async function main() {
  const { storage } = await import('../src/services/storage');
  const { interpretCashAssistantCommand } = await import('../src/utils/voiceCashParser');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}:`, err);
    }
  }

  console.log('\n=== PRUEBAS DE DICTADO CONTINUO E INTÉRPRETES ===');

  test('mergeTranscriptSegments evita duplicar palabras solapadas al reiniciar reconocimiento', () => {
    const merged = mergeTranscriptSegments(
      'Para Laura Gómez dos acolchados de',
      'acolchados de dos plazas a quince mil'
    );
    assert.equal(merged, 'Para Laura Gómez dos acolchados de dos plazas a quince mil');
  });

  test('mergeTranscriptSegments concatena normalmente cuando no hay solapamiento', () => {
    const merged = mergeTranscriptSegments('Tres camisas', 'cinco mil pesos cada una');
    assert.equal(merged, 'Tres camisas cinco mil pesos cada una');
  });

  const clientesMock: Cliente[] = [
    {
      id: 'CLI_1',
      nombre: 'Laura',
      apellido: 'Gómez',
      telefono: '1145678901',
      fechaAlta: '2026-01-01T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_1',
    },
  ];

  test('parseOrderDictation interpreta pedido completo con "cada uno", teléfono, seña, transferencia y fecha', () => {
    const draft = parseOrderDictation(
      'Para Laura Gómez, tel 11 4567 8901, dos acolchados de dos plazas a quince mil cada uno, tres camisas cinco mil pesos cada una, dejó diez mil de seña por transferencia, entregar el viernes',
      clientesMock
    );

    assert.equal(draft.clienteExistente?.id, 'CLI_1');
    assert.equal(draft.prendas.length, 2);

    assert.equal(draft.prendas[0].cantidad, 2);
    assert.equal(draft.prendas[0].precioUnitario, 15000);
    assert.equal(draft.prendas[0].ambiguedadPrecio, undefined);

    assert.equal(draft.prendas[1].cantidad, 3);
    assert.equal(draft.prendas[1].precioUnitario, 5000);
    assert.equal(draft.prendas[1].ambiguedadPrecio, undefined);

    assert.equal(draft.senia?.monto, 10000);
    assert.equal(draft.senia?.metodo, 'transferencia');
    assert.ok(draft.fechaEstimadaEntrega, 'Debe resolver una fecha YYYY-MM-DD para el viernes');

    const [y, m, d] = draft.fechaEstimadaEntrega!.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    assert.equal(dt.getDay(), 5);
  });

  test('parseOrderDictation nunca confunde número de teléfono con precio de prenda ni de seña', () => {
    const draft = parseOrderDictation(
      'Cliente Carlos Pérez, teléfono 11 5566 7788, una campera',
      clientesMock
    );

    assert.equal(draft.clienteExistente, null);
    assert.equal(draft.clienteNuevo?.nombre, 'Carlos');
    assert.equal(draft.clienteNuevo?.apellido, 'Pérez');
    assert.equal(draft.clienteNuevo?.telefono.replace(/\D/g, ''), '1155667788');
    assert.equal(draft.prendas.length, 1);
    assert.equal(draft.prendas[0].precioUnitario, null);
    assert.equal(draft.prendas[0].ambiguedadPrecio, 'sin_precio');
    assert.ok(
      draft.pendientesConfirmacion.some((p) => p.includes('Falta el precio')),
      'Debe advertir que falta precio sin inventarlo'
    );
  });

  test('parseOrderDictation señala ambigüedad total vs unitario si no dice cada uno ni total', () => {
    const draft = parseOrderDictation('Laura Gómez, dos frazadas veinte mil pesos', clientesMock);
    assert.equal(draft.prendas.length, 1);
    assert.equal(draft.prendas[0].cantidad, 2);
    assert.equal(draft.prendas[0].ambiguedadPrecio, 'total_o_unitario');
    assert.ok(draft.pendientesConfirmacion.some((p) => p.includes('unitario o total')));
  });

  test('parseOrderDictation divide correctamente cuando dice "en total"', () => {
    const draft = parseOrderDictation(
      'Laura Gómez, dos frazadas veinte mil pesos en total',
      clientesMock
    );
    assert.equal(draft.prendas.length, 1);
    assert.equal(draft.prendas[0].cantidad, 2);
    assert.equal(draft.prendas[0].precioUnitario, 10000);
    assert.equal(draft.prendas[0].ambiguedadPrecio, undefined);
  });

  console.log('\n=== PRUEBAS DE CAJA, BALANCES, ASISTENTE Y ARQUEO ===');

  test('storage Caja: apertura, cobros reales vs saldos impagos, separación efectivo/digital y egresos', () => {
    localStorage.clear();

    storage.saveCliente(clientesMock[0]);

    // 1. Abrir caja con $20.000 de fondo inicial en efectivo
    const apRes = storage.abrirCaja(20000, 0, 'Turno mañana');
    assert.equal(apRes.ok, true);
    assert.ok(apRes.sesion);

    // 2. Guardar pedido por $25.000 con saldo pendiente $25.000 (SIN PAGAR AÚN)
    const pedido: Pedido = {
      id: 'PED-CAJA-1',
      codigoVisible: '#9001',
      clienteId: 'CLI_1',
      fechaRecepcion: new Date().toISOString(),
      fechaEstimadaEntrega: '2026-12-01',
      prendas: [
        {
          id: 'PRN-CAJA-1',
          pedidoId: 'PED-CAJA-1',
          clienteId: 'CLI_1',
          tipo: 'Acolchado',
          descripcion: '',
          servicio: 'acolchados_frazadas',
          precio: 25000,
          estado: 'recibido',
          qrPayload: 'PRN-CAJA-1',
        },
      ],
      total: 25000,
      saldoPendiente: 25000,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
      pagos: [],
      avisosWhatsApp: [],
      qrPayload: 'PED-CAJA-1',
    };
    storage.savePedido(pedido);

    // Verificar que los $25.000 impagos NO cuentan como ingresos ni dinero en caja
    const resumenSinPagos = storage.getResumenCaja();
    assert.equal(resumenSinPagos.resumen.ingresosPeriodo, 0);
    assert.equal(resumenSinPagos.resumen.saldosPorCobrarClientes, 25000);
    assert.equal(resumenSinPagos.resumen.efectivoDisponible, 20000);
    assert.equal(resumenSinPagos.resumen.saldoDigitalDisponible, 0);

    // 3. Cobrar seña $10.000 en efectivo + segundo pago $15.000 por transferencia
    const p1 = storage.registrarPago({
      pedidoId: 'PED-CAJA-1',
      monto: 10000,
      metodo: 'efectivo',
      esSenia: true,
    });
    assert.equal(p1.ok, true);
    const p2 = storage.registrarPago({
      pedidoId: 'PED-CAJA-1',
      monto: 15000,
      metodo: 'transferencia',
    });
    assert.equal(p2.ok, true);

    // 4. Registrar egreso manual de $4.500 en efectivo (productos de limpieza)
    const egRes = storage.registrarMovimientoCaja({
      tipo: 'egreso',
      categoria: 'productos_limpieza',
      concepto: 'Jabón líquido 5L',
      monto: 4500,
      metodo: 'efectivo',
    });
    assert.equal(egRes.ok, true);

    // 5. Verificar guardas de monto inválido y doble clic
    const negRes = storage.registrarMovimientoCaja({
      tipo: 'egreso',
      categoria: 'insumos',
      concepto: 'Bolsas',
      monto: 0,
      metodo: 'efectivo',
    });
    assert.equal(negRes.ok, false);

    const dupRes = storage.registrarMovimientoCaja({
      tipo: 'egreso',
      categoria: 'productos_limpieza',
      concepto: 'Jabón líquido 5L',
      monto: 4500,
      metodo: 'efectivo',
    });
    assert.equal(dupRes.ok, false);

    // 6. Verificar balances y separación estricta efectivo físico vs digital
    const { resumen, movimientosFiltrados } = storage.getResumenCaja();
    assert.equal(movimientosFiltrados.length, 3);
    assert.equal(resumen.ingresosPeriodo, 25000);
    assert.equal(resumen.egresosPeriodo, 4500);
    assert.equal(resumen.balanceNetoPeriodo, 20500);
    assert.equal(resumen.saldosPorCobrarClientes, 0);
    assert.equal(resumen.efectivoDisponible, 25500);
    assert.equal(resumen.saldoDigitalDisponible, 15000);
    assert.equal(resumen.saldoCajaTotal, 40500);

    // 7. Corrección auditada del egreso manual
    const corrRes = storage.corregirMovimientoCaja(
      egRes.movimiento!.id,
      { monto: 5000 },
      'El bidón costó $5.000 según ticket'
    );
    assert.equal(corrRes.ok, true);
    const movCorregido = storage
      .getMovimientosCajaManuales()
      .find((m) => m.id === egRes.movimiento!.id)!;
    assert.equal(movCorregido.monto, 5000);
    assert.equal(movCorregido.historialCambios?.length, 1);

    // 8. Anulación de pago desde Caja recompone saldoPendiente en el Pedido
    const movTransferencia = storage
      .getMovimientosCajaUnificados(false)
      .find((m) => m.origen === 'pedido_pago' && m.metodo === 'transferencia')!;
    const anuRes = storage.anularMovimientoCaja(
      movTransferencia.id,
      'Transferencia rebotada por el banco'
    );
    assert.equal(anuRes.ok, true);

    const pedidoRecompuesto = storage.getPedidoById('PED-CAJA-1')!;
    assert.equal(pedidoRecompuesto.saldoPendiente, 15000);
    assert.equal(pedidoRecompuesto.estadoPago, 'parcial');

    // 9. Cierre de caja con arqueo real
    // Efectivo esperado: 20000 inicial + 10000 ingreso ef - 5000 egreso ef = 25000
    const cierreRes = storage.cerrarCaja(apRes.sesion!.id, 24800, 'Faltaron $200 de vuelto');
    assert.equal(cierreRes.ok, true);
    assert.equal(cierreRes.sesion?.resumenCierre?.efectivoEsperado, 25000);
    assert.equal(cierreRes.sesion?.diferenciaArqueo, -200);
  });

  test('Asistente de Caja eLeGe responde 5 consultas naturales y arma borrador editable sin auto-guardar', () => {
    const rHoy = interpretCashAssistantCommand('¿Cuánto ingresó hoy?');
    assert.equal(rHoy.intent, 'query');
    assert.ok(rHoy.highlights && rHoy.highlights.length > 0);
    assert.equal(rHoy.suggestedFilters?.periodo, 'hoy');

    const rSemana = interpretCashAssistantCommand('¿Cuánto gastamos esta semana?');
    assert.equal(rSemana.intent, 'query');
    assert.equal(rSemana.suggestedFilters?.periodo, 'semana');
    assert.equal(rSemana.suggestedFilters?.tipo, 'egreso');

    const rMes = interpretCashAssistantCommand('¿Cuál es el balance de este mes?');
    assert.equal(rMes.intent, 'query');
    assert.equal(rMes.suggestedFilters?.periodo, 'mes');

    const rEfectivo = interpretCashAssistantCommand('¿Cuánto efectivo tenemos en caja?');
    assert.equal(rEfectivo.intent, 'query');
    assert.ok(rEfectivo.answerText.includes('Efectivo'));

    const rLimpieza = interpretCashAssistantCommand('Mostrame los gastos de productos de limpieza');
    assert.equal(rLimpieza.intent, 'query');
    assert.equal(rLimpieza.suggestedFilters?.categoria, 'productos_limpieza');
    assert.equal(rLimpieza.suggestedFilters?.tipo, 'egreso');

    const rDraft = interpretCashAssistantCommand('Gastamos 12 mil en jabón líquido en efectivo');
    assert.equal(rDraft.intent, 'draft_entry');
    assert.equal(rDraft.draftEntry?.tipo, 'egreso');
    assert.equal(rDraft.draftEntry?.categoria, 'productos_limpieza');
    assert.equal(rDraft.draftEntry?.monto, 12000);
    assert.equal(rDraft.draftEntry?.metodo, 'efectivo');
  });

  console.log(`\nResultado unitario: ${passed} pasadas, ${failed} fallidas.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
