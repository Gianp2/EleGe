import fs from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

async function testRules() {
  console.log('--- CARGANDO REGLAS EN EL EMULADOR DE FIRESTORE ---');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  try {
    const testEnv = await initializeTestEnvironment({
      projectId: 'elege-99d0c',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: rules,
      },
    });

    console.log('✔ COMPILACIÓN EXITOSA EN EMULADOR: firestore.rules compiló correctamente en el emulador oficial.');

    // Probar contexto autenticado con el UID autorizado
    const adminCtx = testEnv.authenticatedContext('eBvTLPVNQIefDTc52fmcmK0ID0K3', {
      firebase: { sign_in_provider: 'password' },
    });
    const unauthCtx = testEnv.unauthenticatedContext();
    const otherUserCtx = testEnv.authenticatedContext('otro_uid_no_autorizado', {
      firebase: { sign_in_provider: 'password' },
    });

    const adminDb = adminCtx.firestore();
    const unauthDb = unauthCtx.firestore();
    const otherDb = otherUserCtx.firestore();

    console.log('\n--- PRUEBAS REALES EN TIEMPO DE EJECUCIÓN DEL EMULADOR ---');

    // 1. Unauth intenta leer -> Debe fallar
    await assertFails(unauthDb.collection('clientes').doc('CLI_1').get());
    console.log('✔ [1] Usuario no autenticado denegado');

    // 2. Otro UID intenta escribir -> Debe fallar
    await assertFails(otherDb.collection('clientes').doc('CLI_1').set({ id: 'CLI_1' }));
    console.log('✔ [2] Usuario ajeno no autorizado denegado');

    // 3. Admin crea cliente válido
    await assertSucceeds(
      adminDb.collection('clientes').doc('CLI_1').set({
        id: 'CLI_1',
        nombre: 'María',
        telefono: '1122334455',
        fechaAlta: '2026-10-29T10:00:00.000Z',
        qrPayload: 'ELEGE:CLI:CLI_1',
      })
    );
    console.log('✔ [3] Admin autorizada crea cliente válido');

    // 4. Admin intenta borrado físico de cliente -> Debe fallar (allow delete: if false)
    await assertFails(adminDb.collection('clientes').doc('CLI_1').delete());
    console.log('✔ [4] Borrado físico de cliente bloqueado (allow delete: if false)');

    // 5. Admin crea pedido válido para cliente existente
    await assertSucceeds(
      adminDb.collection('pedidos').doc('PED_1').set({
        id: 'PED_1',
        codigoVisible: '#1001',
        clienteId: 'CLI_1',
        fechaRecepcion: '2026-10-29T10:00:00.000Z',
        total: 5000,
        saldoPendiente: 5000,
        estadoPago: 'pendiente',
        estadoGeneral: 'recibido',
      })
    );
    console.log('✔ [5] Admin crea pedido válido asociado a cliente');

    // 6. Admin intenta borrado físico de pedido -> Debe fallar
    await assertFails(adminDb.collection('pedidos').doc('PED_1').delete());
    console.log('✔ [6] Borrado físico de pedido bloqueado (allow delete: if false)');

    // 7. Admin intenta crear prenda con clienteId disonante (distinto al del pedido) -> Debe fallar
    await assertFails(
      adminDb.collection('prendas').doc('PRN_1').set({
        id: 'PRN_1',
        pedidoId: 'PED_1',
        clienteId: 'CLI_DISTINTO_INCORRECTO',
        tipo: 'Campera',
        servicio: 'lavado_planchado',
        precio: 2500,
        estado: 'recibido',
      })
    );
    console.log('✔ [7] Prenda con clienteId disonante rechazada por getPedidoData()');

    // 8. Admin crea prenda con clienteId correcto coincidente
    await assertSucceeds(
      adminDb.collection('prendas').doc('PRN_1').set({
        id: 'PRN_1',
        pedidoId: 'PED_1',
        clienteId: 'CLI_1',
        tipo: 'Campera',
        servicio: 'lavado_planchado',
        precio: 2500,
        estado: 'recibido',
      })
    );
    console.log('✔ [8] Prenda con clienteId coincidente permitida');

    // 9. Admin intenta registrar pago con clienteId disonante -> Debe fallar
    await assertFails(
      adminDb.collection('pagos').doc('PAG_1').set({
        id: 'PAG_1',
        pedidoId: 'PED_1',
        clienteId: 'CLI_OTRO',
        monto: 2500,
        metodo: 'efectivo',
        fecha: '2026-10-29T10:05:00.000Z',
      })
    );
    console.log('✔ [9] Pago con clienteId disonante rechazado por getPedidoData()');

    // 10. Admin registra pago con clienteId correcto
    await assertSucceeds(
      adminDb.collection('pagos').doc('PAG_1').set({
        id: 'PAG_1',
        pedidoId: 'PED_1',
        clienteId: 'CLI_1',
        monto: 2500,
        metodo: 'efectivo',
        fecha: '2026-10-29T10:05:00.000Z',
      })
    );
    console.log('✔ [10] Pago con clienteId coincidente permitido');

    // 11. Admin intenta borrar físicamente el pago -> Debe fallar
    await assertFails(adminDb.collection('pagos').doc('PAG_1').delete());
    console.log('✔ [11] Borrado físico de pago bloqueado (allow delete: if false)');

    // 12. Admin anula pago con motivo legítimo
    await assertSucceeds(
      adminDb.collection('pagos').doc('PAG_1').update({
        anulado: true,
        motivoAnulacion: 'Error de tipeo en importe',
        anuladoPor: 'eBvTLPVNQIefDTc52fmcmK0ID0K3',
        anuladoAt: '2026-10-29T10:10:00.000Z',
      })
    );
    console.log('✔ [12] Anulación legítima de pago con motivo y UID autorizado permitida');

    // 13. Intento de anulación con motivo con puros espacios o menor a 3 caracteres -> Debe fallar
    await assertFails(
      adminDb.collection('pagos').doc('PAG_1').update({
        anulado: true,
        motivoAnulacion: '   ',
        anuladoPor: 'eBvTLPVNQIefDTc52fmcmK0ID0K3',
        anuladoAt: '2026-10-29T10:10:00.000Z',
      })
    );
    console.log('✔ [13] Anulación con motivo inválido o solo espacios rechazada por matches()');

    // 14. Transacción atómica simultánea (Batch): Crear Pedido y Prendas juntos (evaluando getAfter())
    const batch = adminDb.batch();
    const pedidoRef = adminDb.collection('pedidos').doc('PED_batch_1');
    batch.set(pedidoRef, {
      id: 'PED_batch_1',
      codigoVisible: '#2001',
      clienteId: 'CLI_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 8000,
      saldoPendiente: 8000,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
    });
    const prendaRef1 = adminDb.collection('prendas').doc('PRN_batch_1');
    batch.set(prendaRef1, {
      id: 'PRN_batch_1',
      pedidoId: 'PED_batch_1',
      clienteId: 'CLI_1',
      tipo: 'Saco',
      servicio: 'tintoreria',
      precio: 4000,
      estado: 'recibido',
    });
    const prendaRef2 = adminDb.collection('prendas').doc('PRN_batch_2');
    batch.set(prendaRef2, {
      id: 'PRN_batch_2',
      pedidoId: 'PED_batch_1',
      clienteId: 'CLI_1',
      tipo: 'Pantalón',
      servicio: 'tintoreria',
      precio: 4000,
      estado: 'recibido',
    });
    await assertSucceeds(batch.commit());
    console.log('✔ [14] Batch atómico savePedido: Pedido + Prendas simultáneas con getAfter() verificado');

    // 15. Transacción atómica registrarPago (simulando FirestoreService.registrarPago)
    await assertSucceeds(
      adminDb.runTransaction(async (tx) => {
        const pedDoc = await tx.get(pedidoRef);
        const pedData = pedDoc.data()!;
        const nuevoSaldo = pedData.saldoPendiente - 3000;
        
        tx.update(pedidoRef, {
          saldoPendiente: nuevoSaldo,
          estadoPago: 'parcial',
        });
        
        const pagoRef = adminDb.collection('pagos').doc('PAG_tx_1');
        tx.set(pagoRef, {
          id: 'PAG_tx_1',
          pedidoId: 'PED_batch_1',
          clienteId: 'CLI_1',
          monto: 3000,
          metodo: 'transferencia',
          fecha: '2026-10-29T10:15:00.000Z',
          anulado: false,
        });

        const auditRef = adminDb.collection('auditoria').doc('AUD_tx_1');
        tx.set(auditRef, {
          id: 'AUD_tx_1',
          accion: 'PAYMENT',
          fase: 'CONFIRMADA',
          entidad: 'pago',
          entidadId: 'PAG_tx_1',
          detalles: 'Cobro de $3000 registrado atómicamente',
          usuarioUid: 'eBvTLPVNQIefDTc52fmcmK0ID0K3',
        });
      })
    );
    console.log('✔ [15] Transacción atómica registrarPago completada con consistencia multimodelo');

    // 16. Transacción atómica anularPago (simulando FirestoreService.anularPago)
    await assertSucceeds(
      adminDb.runTransaction(async (tx) => {
        const pagoRef = adminDb.collection('pagos').doc('PAG_tx_1');
        tx.update(pagoRef, {
          anulado: true,
          motivoAnulacion: 'Transferencia no impactada en cuenta',
          anuladoPor: 'eBvTLPVNQIefDTc52fmcmK0ID0K3',
          anuladoAt: '2026-10-29T10:20:00.000Z',
        });

        tx.update(pedidoRef, {
          saldoPendiente: 8000,
          estadoPago: 'pendiente',
        });

        const auditRef = adminDb.collection('auditoria').doc('AUD_tx_2');
        tx.set(auditRef, {
          id: 'AUD_tx_2',
          accion: 'PAYMENT_CANCEL',
          fase: 'CONFIRMADA',
          entidad: 'pago',
          entidadId: 'PAG_tx_1',
          detalles: 'Anulación de pago de $3000 registrada atómicamente',
          usuarioUid: 'eBvTLPVNQIefDTc52fmcmK0ID0K3',
        });
      })
    );
    console.log('✔ [16] Transacción atómica anularPago completada con restitución de saldo');

    // 17. Transacción atómica updateEstadoPrenda
    await assertSucceeds(
      adminDb.runTransaction(async (tx) => {
        tx.update(prendaRef1, {
          estado: 'listo',
        });
        tx.update(pedidoRef, {
          estadoGeneral: 'en_proceso',
        });
      })
    );
    console.log('✔ [17] Transacción atómica updateEstadoPrenda completada');

    // 18. Bloqueo contable: Intento malicioso de alterar saldoPendiente a un valor mayor al total -> Debe fallar
    await assertFails(
      adminDb.collection('pedidos').doc('PED_batch_1').update({
        saldoPendiente: 99999, // ILEGAL: saldoPendiente > total
      })
    );
    console.log('✔ [18] Intento de manipular saldoPendiente por encima del total bloqueado por reglas');

    await testEnv.cleanup();
    console.log('\n--- TODAS LAS 18 PRUEBAS REALES EN EL EMULADOR PASARON CON 100% ÉXITO ---');
  } catch (err) {
    console.error('ERROR EN EMULADOR:', err);
    process.exit(1);
  }
}

testRules();
