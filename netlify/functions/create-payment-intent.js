const https = require('https');
const FINAL_PAYMENTS_REGISTRY = require('./lib/final-payments-registry');
const { obtenerSaldoFinalConfirmado } = require('./lib/final-payment-store');
const { buscarFamilia, anticiposPagadosDelGrupo, estadoPaymentIntent } = require('./lib/group-deposits');

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

  // ── Anticipos de GRUPO por familia (tipo_pago === 'deposito_familia') ──
  // Solo lo usan las páginas de anticipo por familia (lib/group-deposits.js).
  // Ningún otro flujo lo atraviesa. Importe, email, descripción y metadatos salen
  // del registro server-side — así la petición es siempre idéntica para la misma
  // familia y la Idempotency-Key es válida en los reintentos.
  if (metadata && metadata.tipo_pago === 'deposito_familia') {
    const reservaId = typeof metadata.reserva_id === 'string' ? metadata.reserva_id.trim() : '';
    const familia = reservaId && buscarFamilia(reservaId);
    if (!familia) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Reserva no reconocida para anticipo de familia' })
      };
    }

    // "Ya pagado" según Stripe: solo cuentan PaymentIntents 'succeeded', así que
    // un intento fallido o abandonado no bloquea el siguiente. Si la consulta falla
    // se corta sin cobrar (falla cerrado): mejor un reintento que un cobro doble.
    let pagados;
    try {
      pagados = await anticiposPagadosDelGrupo(familia.grupoRef, secretKey);
    } catch (err) {
      console.error('[create-payment-intent] no se pudo comprobar si el anticipo de familia ya está pagado:', err.message);
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No se ha podido comprobar el estado del pago. Inténtalo de nuevo en unos minutos.' })
      };
    }
    if (pagados.some(p => p.reservaId === reservaId)) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Este anticipo ya está pagado.', alreadyPaid: true })
      };
    }

    amount = familia.amountEUR;
    description = `Entrada de 20% — Caminho de Santiago — Família ${familia.familia} — ${familia.peregrinos} peregrinos · ${reservaId} — Easy Camino Santiago`;
    metadata = {
      tipo:               'entrada-reserva-familia',
      tipo_pago:          'deposito_familia',
      reserva_id:         reservaId,
      referencia_general: familia.grupoRef,
      familia:            familia.familia,
      cliente:            familia.responsable,
      nombre:             familia.responsable,
      email:              familia.email,
      peregrinos:         familia.peregrinos,
      total_familia:      familia.totalFamiliaEUR,
      saldo_pendiente:    familia.saldoEUR,
      ruta:               familia.grupo.ruta,
    };

    // Misma clave para todos los intentos de la familia: Stripe devuelve el mismo
    // PaymentIntent (reintentable con otra tarjeta si el primero falló) y cubre los
    // segundos en que un pago recién completado aún no aparece en la búsqueda.
    idempotencyKey = 'deposito-familia:' + reservaId;
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

    // Con la Idempotency-Key repetida Stripe devuelve la respuesta GUARDADA del primer
    // intento, así que se consulta el estado actual: si ese PaymentIntent ya se cobró
    // (hace segundos, aún sin indexar en la búsqueda) se responde "ya pagado". Aunque
    // esta consulta fallase no habría cobro doble: es el mismo PaymentIntent y Stripe
    // no permite confirmar otra vez uno ya cobrado.
    if (metadata && metadata.tipo_pago === 'deposito_familia') {
      let estadoActual = null;
      try {
        estadoActual = await estadoPaymentIntent(stripe.id, secretKey);
      } catch (err) {
        console.warn('[create-payment-intent] no se pudo consultar el estado actual del PaymentIntent:', err.message);
      }
      if (estadoActual === 'succeeded' || estadoActual === 'processing') {
        return {
          statusCode: 409,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Este anticipo ya está pagado.', alreadyPaid: true })
        };
      }
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
