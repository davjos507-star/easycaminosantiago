// Registro de pagos de SALDO FINAL ya confirmados — usado para impedir cobros
// duplicados del saldo de una misma reserva.
//
// Se apoya en Netlify Blobs (vía kv-store.js), el mismo backend que ya usan
// draft-store.js / rate-limit.js, con fallback a disco local fuera de producción.
//
// Fuente de verdad de "esta reserva ya tiene el saldo pagado": SOLO la escribe
// marcarSaldoFinalConfirmado, y solo se llama desde stripe-webhook.js, tras
// verificar la firma de Stripe y procesar un evento payment_intent.succeeded
// real — nunca desde el navegador ni desde create-payment-intent.js.
const { getStore } = require('./kv-store');

// BLOBS_NAMESPACE_SUFFIX: vacío en producción (comportamiento sin cambios).
// Para pruebas locales con Netlify Blobs real (netlify dev + .env local) se
// fija a algo como '-test', de forma que las pruebas usen un store de Blobs
// completamente distinto al de clientes reales — nunca el mismo namespace.
const SUFFIX = process.env.BLOBS_NAMESPACE_SUFFIX || '';
const NAMESPACE = 'saldo-final-pagos' + SUFFIX;

async function marcarSaldoFinalConfirmado(reservaId, paymentIntentId) {
  const store = getStore(NAMESPACE);
  await store.set(reservaId, {
    reservaId,
    paymentIntentId,
    confirmedAt: new Date().toISOString(),
  });
}

async function obtenerSaldoFinalConfirmado(reservaId) {
  const store = getStore(NAMESPACE);
  return store.get(reservaId);
}

module.exports = { marcarSaldoFinalConfirmado, obtenerSaldoFinalConfirmado };
