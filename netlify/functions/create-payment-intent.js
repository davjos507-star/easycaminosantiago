const https = require('https');

function stripePost(path, payload, secretKey) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(payload).toString();
    const options = {
      hostname: 'api.stripe.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
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
    const { status, body: stripe } = await stripePost('/v1/payment_intents', payload, secretKey);

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
