// Netlify Function: busca contactos de HubSpot por nombre/apellido (texto libre, tipo "autocomplete").
// Solo lectura — no crea, modifica ni borra nada. Pensada para alimentar un buscador
// de contactos en una página interna protegida con contraseña (ADMIN_NOTES_SECRET).
//
// Env vars requeridas:
//   HUBSPOT_TOKEN        — mismo HubSpot Private App Token que ya usan las demás funciones.
//   ADMIN_NOTES_SECRET    — misma frase secreta que usa hubspot-note.js.

const https = require('https');

function hubspotRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.hubapi.com',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };
    const req = https.request(options, res => {
      let responseData = '';
      res.on('data', chunk => { responseData += chunk; });
      res.on('end', () => {
        if (!responseData.trim()) {
          resolve({ status: res.statusCode, body: null });
          return;
        }
        try { resolve({ status: res.statusCode, body: JSON.parse(responseData) }); }
        catch (e) { resolve({ status: res.statusCode, body: responseData }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Método no permitido' });
  }

  const adminSecret = process.env.ADMIN_NOTES_SECRET;
  if (!adminSecret) {
    console.error('[hubspot-search] ADMIN_NOTES_SECRET no configurado en el sitio');
    return jsonResponse(500, { error: 'Función no configurada todavía (falta ADMIN_NOTES_SECRET en Netlify)' });
  }

  const headers = event.headers || {};
  const providedSecret = headers['x-admin-secret'] || headers['X-Admin-Secret'];
  if (!providedSecret || providedSecret !== adminSecret) {
    return jsonResponse(401, { error: 'Contraseña incorrecta' });
  }

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.error('[hubspot-search] HUBSPOT_TOKEN no configurado en el sitio');
    return jsonResponse(500, { error: 'HubSpot no está configurado en este sitio' });
  }

  const q = ((event.queryStringParameters || {}).q || '').trim();
  if (q.length < 2) {
    return jsonResponse(200, { results: [] });
  }

  try {
    const search = await hubspotRequest('POST', '/crm/v3/objects/contacts/search', token, {
      query: q,
      properties: ['email', 'firstname', 'lastname'],
      limit: 8,
    });

    if (search.status >= 400) {
      console.error('[hubspot-search] error HubSpot:', search.status, JSON.stringify(search.body));
      return jsonResponse(502, { error: 'Error al buscar contactos en HubSpot' });
    }

    const results = ((search.body && search.body.results) || [])
      .filter(c => c.properties && c.properties.email)
      .map(c => ({
        id: c.id,
        email: c.properties.email,
        nombre: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || c.properties.email,
      }));

    return jsonResponse(200, { results });
  } catch (err) {
    console.error('[hubspot-search] excepción:', err.message);
    return jsonResponse(502, { error: 'Error al buscar contactos en HubSpot' });
  }
};
