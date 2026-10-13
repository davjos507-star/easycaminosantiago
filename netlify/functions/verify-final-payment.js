// Función de solo lectura: comprueba si el SALDO FINAL de una reserva ya está
// confirmado, para que gracias-pili-final.html (y futuras páginas de saldo
// final) solo muestren "pago confirmado" cuando el servidor lo ha verificado
// de verdad — nunca por el simple hecho de haber abierto la URL.
//
// No expone ninguna clave privada ni llama directamente a Stripe: solo lee el
// registro que stripe-webhook.js ya escribió al procesar (con firma
// verificada) un evento payment_intent.succeeded real.
const { obtenerSaldoFinalConfirmado } = require('./lib/final-payment-store');
const FINAL_PAYMENTS_REGISTRY = require('./lib/final-payments-registry');

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const reservaId = ((event.queryStringParameters && event.queryStringParameters.reserva_id) || '').trim();

  if (!reservaId || !FINAL_PAYMENTS_REGISTRY[reservaId]) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Reserva no reconocida' }),
    };
  }

  try {
    const confirmado = await obtenerSaldoFinalConfirmado(reservaId);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paid: !!confirmado,
        confirmedAt: confirmado ? confirmado.confirmedAt : null,
      }),
    };
  } catch (err) {
    console.error('[verify-final-payment] error al consultar el registro:', err.message);
    // Si no se puede verificar, se responde paid:false (nunca true) — la
    // página de gracias debe mostrar el mensaje neutro, no una confirmación.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: false, error: 'No se pudo verificar en este momento' }),
    };
  }
};
