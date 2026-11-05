// Anticipos de GRUPO pagados por familias (tipo_pago === 'deposito_familia').
//
// Una reserva de grupo se reparte en varias familias y cada una paga su propio
// anticipo desde su propia página, con su referencia individual. Este módulo es la
// fuente server-side de esos importes y la comprobación de "ya pagado":
//
//   - create-payment-intent.js toma de aquí el importe, el email y los metadatos
//     (lo que mande el navegador se ignora) y rechaza un segundo cobro si Stripe ya
//     tiene un PaymentIntent 'succeeded' con esa referencia individual.
//   - stripe-webhook.js calcula aquí cuántas familias del grupo han pagado, para no
//     registrar en HubSpot el anticipo del grupo como pagado hasta que lo esté entero.
//
// La comprobación de "ya pagado" consulta a Stripe directamente (Search API), no a
// Netlify Blobs: no depende del almacén ni de que el webhook haya llegado. Ningún
// otro tipo de pago (depósito, saldo, pago total) pasa por aquí.
//
// Añadir aquí cada nuevo grupo antes de publicar sus páginas de pago.
const https = require('https');

const GRUPOS = {
  'ECS-SARRIA-MB2027': {
    cliente: 'Meire Brasil',
    ruta:    'Camino Francés desde Sarria — 16 a 25/05/2027 — 9 peregrinos',
    familias: {
      'ECS-SARRIA-MB2027-LUCIANE': { familia: 'Luciane', responsable: 'Luciane Ozelame Ribas Colombo', email: 'colomboeribas@hotmail.com', peregrinos: 4, amountEUR: 666.67, totalFamiliaEUR: 3333.33, saldoEUR: 2666.66 },
      'ECS-SARRIA-MB2027-MEIRE':   { familia: 'Meire',   responsable: 'Meire Elen Colombo Kaiser',     email: 'meireck@hotmail.com',       peregrinos: 3, amountEUR: 500.00, totalFamiliaEUR: 2500.00, saldoEUR: 2000.00 },
      'ECS-SARRIA-MB2027-ELAINE':  { familia: 'Elaine',  responsable: 'Elaine Ozelame Ribas',          email: 'elaineozribas@hotmail.com', peregrinos: 2, amountEUR: 333.33, totalFamiliaEUR: 1666.67, saldoEUR: 1333.34 },
    },
  },
};

function buscarFamilia(reservaId) {
  for (const [grupoRef, grupo] of Object.entries(GRUPOS)) {
    const familia = grupo.familias[reservaId];
    if (familia) return { reservaId, grupoRef, grupo, ...familia };
  }
  return null;
}

function stripeGet(path, secretKey) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      path,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + secretKey },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Respuesta inválida de Stripe')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Anticipos de familia ya cobrados del grupo, según Stripe. Lanza si la consulta
// falla — quien llama decide (create-payment-intent falla cerrado). La Search API
// tarda unos segundos en indexar un pago recién completado; ese hueco lo cubre la
// Idempotency-Key por familia de create-payment-intent.js.
async function anticiposPagadosDelGrupo(grupoRef, secretKey) {
  const query = `metadata['referencia_general']:'${grupoRef}' AND status:'succeeded'`;
  const pagados = [];
  let page = null;
  do {
    const qs = new URLSearchParams({ query, limit: '100', ...(page && { page }) }).toString();
    const { status, body } = await stripeGet('/v1/payment_intents/search?' + qs, secretKey);
    if (status !== 200 || !body || !Array.isArray(body.data)) {
      throw new Error('búsqueda de pagos en Stripe falló — status ' + status);
    }
    for (const pi of body.data) {
      if (pi.metadata && pi.metadata.tipo_pago === 'deposito_familia') {
        pagados.push({ reservaId: pi.metadata.reserva_id, paymentIntentId: pi.id, amountEUR: pi.amount_received / 100 });
      }
    }
    page = body.has_more ? body.next_page : null;
  } while (page);
  return pagados;
}

// Progreso del anticipo del grupo. `piActual` se suma aunque la búsqueda todavía
// no lo haya indexado (el webhook llega segundos después del cobro).
async function progresoDelGrupo(grupoRef, secretKey, piActual) {
  const grupo = GRUPOS[grupoRef];
  const pagados = await anticiposPagadosDelGrupo(grupoRef, secretKey);
  if (piActual && !pagados.some(p => p.paymentIntentId === piActual.paymentIntentId)) pagados.push(piActual);

  const porFamilia = new Map();
  for (const p of pagados) if (grupo.familias[p.reservaId] && !porFamilia.has(p.reservaId)) porFamilia.set(p.reservaId, p);

  const refs = Object.keys(grupo.familias);
  const totalEUR = refs.reduce((s, r) => s + Math.round(grupo.familias[r].amountEUR * 100), 0) / 100;
  const pagadoEUR = [...porFamilia.values()].reduce((s, p) => s + Math.round(p.amountEUR * 100), 0) / 100;
  return {
    familiasPagadas: porFamilia.size,
    familiasTotal:   refs.length,
    pagadoEUR,
    totalEUR,
    pendientes:      refs.filter(r => !porFamilia.has(r)),
    completo:        porFamilia.size === refs.length,
  };
}

// Estado ACTUAL de un PaymentIntent. Hace falta porque una respuesta con
// Idempotency-Key repetida es la respuesta guardada de la primera petición (estado
// de entonces), no el estado de ahora.
async function estadoPaymentIntent(id, secretKey) {
  const { status, body } = await stripeGet('/v1/payment_intents/' + encodeURIComponent(id), secretKey);
  if (status !== 200 || !body) throw new Error('consulta de PaymentIntent falló — status ' + status);
  return body.status;
}

module.exports = { GRUPOS, buscarFamilia, anticiposPagadosDelGrupo, progresoDelGrupo, estadoPaymentIntent };
