// Netlify Function: Stripe webhook handler.
// Recibe eventos de Stripe, verifica la firma y actualiza HubSpot.
//
// Env vars required:
//   STRIPE_WEBHOOK_SECRET  — secreto del endpoint de webhook en Stripe Dashboard
//   HUBSPOT_TOKEN          — mismo Private App Token que el resto de funciones
//
// Eventos configurados en Stripe Dashboard:
//   payment_intent.succeeded
//   payment_intent.payment_failed

const https  = require('https');
const crypto = require('crypto');

// ── Verificación de firma Stripe ────────────────────────────────────────────
// Stripe firma el payload con HMAC-SHA256 usando el webhook secret.
// Header: stripe-signature: t=TIMESTAMP,v1=SIG[,v1=SIG2,...]
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  let timestamp = '';
  let receivedSig = '';

  for (const chunk of signatureHeader.split(',')) {
    const eqIdx = chunk.indexOf('=');
    const key   = chunk.slice(0, eqIdx);
    const val   = chunk.slice(eqIdx + 1);
    if (key === 't')  timestamp    = val;
    if (key === 'v1' && !receivedSig) receivedSig = val; // primera v1 encontrada
  }

  if (!timestamp || !receivedSig) return false;

  // Ventana antireplay: 5 minutos
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const signedPayload = timestamp + '.' + rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  try {
    const a = Buffer.from(expected,     'hex');
    const b = Buffer.from(receivedSig,  'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── HubSpot API helper ──────────────────────────────────────────────────────
function hubspotRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.hubapi.com',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };
    const req = https.request(options, res => {
      let responseData = '';
      res.on('data', chunk => { responseData += chunk; });
      res.on('end', () => {
        if (!responseData.trim()) { resolve({ status: res.statusCode, body: null }); return; }
        try { resolve({ status: res.statusCode, body: JSON.parse(responseData) }); }
        catch { resolve({ status: res.statusCode, body: responseData }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Busca el contacto por email, lo crea si no existe, y lo actualiza ───────
async function upsertContact(token, email, properties) {
  const search = await hubspotRequest('POST', '/crm/v3/objects/contacts/search', token, {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email'],
    limit: 1,
  });

  const existing = search.body && search.body.results && search.body.results[0];

  if (existing) {
    const upd = await hubspotRequest('PATCH', '/crm/v3/objects/contacts/' + existing.id, token, { properties });
    if (upd.status >= 400) {
      console.error('[STRIPE-WEBHOOK] error HubSpot al actualizar — status:', upd.status, JSON.stringify(upd.body));
      return null;
    }
    console.log('[STRIPE-WEBHOOK] HubSpot actualizado — contacto:', existing.id, '| email:', email);
    return existing.id;
  }

  // Contacto no encontrado — crearlo con email + lifecyclestage + propiedades del pago
  const created = await hubspotRequest('POST', '/crm/v3/objects/contacts', token, {
    properties: { email, lifecyclestage: 'lead', ...properties },
  });
  if (created.status >= 400) {
    console.error('[STRIPE-WEBHOOK] error HubSpot al crear — status:', created.status, JSON.stringify(created.body));
    return null;
  }
  console.log('[STRIPE-WEBHOOK] HubSpot contacto creado — id:', created.body.id, '| email:', email);
  return created.body.id;
}

// ── Añade nota al contacto ───────────────────────────────────────────────────
async function addNote(token, contactId, noteText) {
  const note = await hubspotRequest('POST', '/crm/v3/objects/notes', token, {
    properties: {
      hs_note_body:  noteText,
      hs_timestamp:  new Date().toISOString(),
    },
    associations: [{
      to:    { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    }],
  });
  if (note.status >= 400) {
    console.error('[STRIPE-WEBHOOK] error HubSpot (nota) — status:', note.status, JSON.stringify(note.body));
  } else {
    console.log('[STRIPE-WEBHOOK] nota añadida al contacto:', contactId);
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // ── Validar configuración ────────────────────────────────────────────────
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[STRIPE-WEBHOOK] STRIPE_WEBHOOK_SECRET no configurado');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  const hubspotToken = process.env.HUBSPOT_TOKEN;
  if (!hubspotToken) {
    console.error('[STRIPE-WEBHOOK] HUBSPOT_TOKEN no configurado');
    return { statusCode: 500, body: 'HubSpot token not configured' };
  }

  // ── Verificar firma ──────────────────────────────────────────────────────
  const signatureHeader = (event.headers || {})['stripe-signature'];
  if (!signatureHeader) {
    console.warn('[STRIPE-WEBHOOK] cabecera stripe-signature ausente');
    return { statusCode: 400, body: 'Missing stripe-signature header' };
  }

  // Netlify puede entregar el body en base64 cuando hay caracteres no ASCII
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : (event.body || '');

  if (!verifyStripeSignature(rawBody, signatureHeader, webhookSecret)) {
    console.warn('[STRIPE-WEBHOOK] firma inválida — solicitud rechazada');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // ── Parsear evento ───────────────────────────────────────────────────────
  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  const eventType = stripeEvent.type || '';
  console.log('[STRIPE-WEBHOOK] evento recibido:', eventType, '| id:', stripeEvent.id);

  // Solo procesar eventos de payment_intent
  if (!['payment_intent.succeeded', 'payment_intent.payment_failed'].includes(eventType)) {
    return { statusCode: 200, body: 'Event ignored: ' + eventType };
  }

  const pi = stripeEvent.data && stripeEvent.data.object;
  if (!pi || pi.object !== 'payment_intent') {
    return { statusCode: 200, body: 'Event object is not a payment_intent' };
  }

  // ── Extraer email (orden de prioridad) ───────────────────────────────────
  const email = (
    (pi.metadata  && (pi.metadata.email || pi.metadata.customer_email)) ||
    pi.receipt_email ||
    ''
  ).trim().toLowerCase();

  if (!email || !email.includes('@')) {
    console.warn('[STRIPE-WEBHOOK] sin email — no se actualiza HubSpot | paymentIntent:', pi.id);
    return { statusCode: 200, body: 'No email found — HubSpot not updated' };
  }

  // ── Construir propiedades y nota según evento ─────────────────────────────
  const fechaEvento = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  let properties = {};
  let noteLines  = [];

  if (eventType === 'payment_intent.succeeded') {
    console.log('[STRIPE-WEBHOOK] pago correcto | pi:', pi.id, '| email:', email);

    const importeRecibido = typeof pi.amount_received === 'number'
      ? pi.amount_received / 100
      : undefined;

    properties = {
      estado_reserva:       'deposito_pagado',
      stripe_payment_id:    pi.id,
      metodo_pago_reserva:  'Tarjeta bancaria',
      ...(importeRecibido !== undefined && { importe_deposito: importeRecibido }),
    };

    noteLines = [
      'Evento Stripe: payment_intent.succeeded',
      'Estado aplicado: deposito_pagado',
      'PaymentIntent ID: ' + pi.id,
      importeRecibido !== undefined ? 'Importe recibido: ' + importeRecibido + ' €' : null,
      'Email: ' + email,
      'Fecha: ' + fechaEvento,
    ];

  } else if (eventType === 'payment_intent.payment_failed') {
    console.log('[STRIPE-WEBHOOK] pago fallido | pi:', pi.id, '| email:', email);

    const importeIntentado = typeof pi.amount === 'number'
      ? pi.amount / 100
      : undefined;
    const errorMsg = pi.last_payment_error && pi.last_payment_error.message;

    properties = {
      estado_reserva:       'pendiente_pago',
      stripe_payment_id:    pi.id,
      metodo_pago_reserva:  'Tarjeta bancaria',
    };

    noteLines = [
      'Evento Stripe: payment_intent.payment_failed',
      'Estado aplicado: pendiente_pago',
      'PaymentIntent ID: ' + pi.id,
      importeIntentado !== undefined ? 'Importe intentado: ' + importeIntentado + ' €' : null,
      errorMsg ? 'Error Stripe: ' + errorMsg : null,
      'Email: ' + email,
      'Fecha: ' + fechaEvento,
    ];
  }

  // ── Actualizar HubSpot ────────────────────────────────────────────────────
  try {
    const contactId = await upsertContact(hubspotToken, email, properties);
    if (contactId) {
      const noteText = noteLines.filter(Boolean).join('\n');
      await addNote(hubspotToken, contactId, noteText);
      console.log('[STRIPE-WEBHOOK] HubSpot actualizado correctamente | contacto:', contactId, '| evento:', eventType);
    }
  } catch (err) {
    console.error('[STRIPE-WEBHOOK] error HubSpot:', err.message);
    // Devolver 200 para que Stripe no reintente — el error queda en logs
    return { statusCode: 200, body: 'HubSpot error logged: ' + err.message };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true, event: eventType }),
  };
};
