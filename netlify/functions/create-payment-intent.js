const https = require('https');
const FINAL_PAYMENTS_REGISTRY = require('./lib/final-payments-registry');
const { obtenerSaldoFinalConfirmado } = require('./lib/final-payment-store');

// idempotencyKey (opcional): cuando se pasa, Stripe garantiza que varias
// llamadas con la MISMA clave devuelven siempre el MISMO PaymentIntent en vez
// de crear uno nuevo — es el mecanismo propio de Stripe para solicitudes
// concurrentes/duplicadas. No se usa en las llamadas existentes (depósito,
// pago total, etc.) — solo se añade para tipo_pago === 'saldo', así que su
// comportamiento no cambia para ningún otro cliente.
function stripePost(path, payload, secretKey, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(payload).toString();
    const options = {
      hostname: 'api.stripe.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Respuesta inválida de Stripe')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Método no permitido' })
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Configuración de pago no disponible' })
    };
  }

  // Guardarraíl de pruebas — SEGUNDO nivel, independiente de que el .env local
  // tenga prioridad o no: si TEST_MODE_REQUIRE_TEST_KEYS=true está activo (solo
  // en entornos de prueba, nunca en producción) y la clave resuelta NO es de
  // test, se aborta aquí mismo, antes de llamar a Stripe. No depende de ningún
  // otro mecanismo de precedencia de variables de entorno.
  if (process.env.TEST_MODE_REQUIRE_TEST_KEYS === 'true' && !secretKey.startsWith('sk_test_')) {
    console.error('[create-payment-intent] TEST_MODE_REQUIRE_TEST_KEYS=true pero STRIPE_SECRET_KEY no es sk_test_ — abortado por seguridad, no se llama a Stripe');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Modo de pruebas activo pero la clave de Stripe configurada no es de test. Abortado por seguridad — no se ha llamado a Stripe.' })
    };
  }

  let amount, description, metadata;
  try {
    ({ amount, description, metadata } = JSON.parse(event.body));
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Datos de la petición no válidos' })
    };
  }

  if (!amount || amount < 1) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Importe no válido' })
    };
  }

  // Validación defensiva: email requerido para que el webhook pueda identificar
  // al contacto en HubSpot. Si falta, se corta aquí sin crear nada en Stripe.
  const metaEmail = (metadata && typeof metadata.email === 'string') ? metadata.email.trim() : '';
  if (!metaEmail || !metaEmail.includes('@')) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Email requerido para crear PaymentIntent' })
    };
  }

  // ── Pagos de SALDO FINAL (tipo_pago === 'saldo') — validación server-side ──
  // Este bloque solo se activa para metadata.tipo_pago === 'saldo'. Ningún otro
  // flujo (depósito, pago total, etc.) lo atraviesa, así que su comportamiento
  // no cambia para ningún otro cliente.
  let idempotencyKey;
  if (metadata && metadata.tipo_pago === 'saldo') {
    const reservaId = typeof metadata.reserva_id === 'string' ? metadata.reserva_id.trim() : '';
    const reserva = reservaId && FINAL_PAYMENTS_REGISTRY[reservaId];

    // La referencia debe existir en el registro server-side — una reserva no
    // registrada no puede cobrarse como saldo final (falla cerrado). Esto
    // impide inventar/cambiar la referencia desde el navegador.
    if (!reserva) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Reserva no reconocida para pago de saldo final' })
      };
    }

    // El importe SIEMPRE sale del registro server-side, nunca del navegador —
    // si el importe recibido no coincide, se registra mismo así (puede indicar
    // una página desincronizada) pero se cobra el importe correcto igualmente.
    if (amount !== reserva.amountEUR) {
      console.warn('[create-payment-intent] importe recibido no coincide con el registrado — se usa el del registro:', { reservaId, recibido: amount, registrado: reserva.amountEUR });
    }
    amount = reserva.amountEUR;

    // Comprobación de "ya pagado" — fuente de verdad: el registro que escribe
    // stripe-webhook.js tras verificar un payment_intent.succeeded real y
    // firmado por Stripe. Si falla la consulta (p. ej. Blobs no disponible un
    // instante), no bloqueamos el primer intento legítimo de pago — el resto
    // de capas (Idempotency-Key + el propio webhook) siguen protegiendo.
    try {
      const yaConfirmado = await obtenerSaldoFinalConfirmado(reservaId);
      if (yaConfirmado) {
        return {
          statusCode: 409,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Esta reserva ya tiene el saldo final pagado.', alreadyPaid: true })
        };
      }
    } catch (err) {
      console.warn('[create-payment-intent] no se pudo comprobar el registro de saldo final confirmado, se continúa:', err.message);
    }

    // Clave de idempotencia determinista: si dos solicitudes llegan casi a la
    // vez para la misma reserva (doble clic, dos pestañas, recarga), Stripe
    // las resuelve devolviendo el MISMO PaymentIntent en vez de crear dos.
    idempotencyKey = 'saldo-final:' + reservaId;
  }

  // El frontend envía euros; Stripe requiere céntimos
  const amountCents = Math.round(amount * 100);

  const payload = {
    amount: amountCents,
    currency: 'eur',
    'payment_method_types[]': 'card',
    description: description || 'Depósito Easy Camino Santiago'
  };

  if (metadata && typeof metadata === 'object') {
    for (const [k, v] of Object.entries(metadata)) {
      payload[`metadata[${k}]`] = v ?? '';
    }
  }

  try {
    const { status, body: stripe } = await stripePost('/v1/payment_intents', payload, secretKey, idempotencyKey);

    if (status !== 200 || !stripe.client_secret) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: stripe.error?.message || 'Error al crear el pago' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret: stripe.client_secret })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Error interno del servidor' })
    };
  }
};
