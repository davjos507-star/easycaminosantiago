// Netlify Function: añade una nota rápida a un contacto de HubSpot, buscado por email.
// No crea ni modifica contactos — solo busca uno existente y le añade una nota (engagement).
// Pensado para botones de acción rápida (presupuesto enviado, enlace de pago, seguimiento, etc.)
// desde una página interna protegida con contraseña compartida (ADMIN_NOTES_SECRET).
//
// Env vars requeridas:
//   HUBSPOT_TOKEN        — mismo HubSpot Private App Token que ya usan las demás funciones.
//   ADMIN_NOTES_SECRET    — frase secreta compartida para autorizar el uso de esta función.

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

function fechaHoraMadrid() {
  // Construido a partir de formatToParts (no .format directo) para garantizar
  // exactamente "DD/MM/AAAA HH:MM" sin coma ni depender del separador del locale.
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type).value;
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ---------------------------------------------------------------------------
// Función reutilizable: busca un contacto por email y le añade una nota.
// Pensada para que futuras acciones (nuevos botones) solo necesiten llamar a
// esta misma función con un texto de nota distinto — sin tocar el backend.
// ---------------------------------------------------------------------------
async function addNoteToContactByEmail(token, email, notaTexto) {
  const search = await hubspotRequest('POST', '/crm/v3/objects/contacts/search', token, {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email', 'firstname', 'lastname'],
    limit: 1,
  });

  const contact = search.body && search.body.results && search.body.results[0];
  if (!contact) {
    return { notFound: true };
  }

  const noteBody = notaTexto + '\n' + fechaHoraMadrid();

  const note = await hubspotRequest('POST', '/crm/v3/objects/notes', token, {
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
    associations: [{
      to: { id: contact.id },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    }],
  });

  if (note.status >= 400) {
    throw new Error('HubSpot rechazó la nota: ' + note.status + ' ' + JSON.stringify(note.body));
  }

  const nombre = [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ');
  return { notFound: false, contactId: contact.id, noteId: note.body && note.body.id, contactName: nombre || email };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Método no permitido' });
  }

  const adminSecret = process.env.ADMIN_NOTES_SECRET;
  if (!adminSecret) {
    console.error('[hubspot-note] ADMIN_NOTES_SECRET no configurado en el sitio');
    return jsonResponse(500, { error: 'Función no configurada todavía (falta ADMIN_NOTES_SECRET en Netlify)' });
  }

  const headers = event.headers || {};
  const providedSecret = headers['x-admin-secret'] || headers['X-Admin-Secret'];
  if (!providedSecret || providedSecret !== adminSecret) {
    return jsonResponse(401, { error: 'Contraseña incorrecta' });
  }

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.error('[hubspot-note] HUBSPOT_TOKEN no configurado en el sitio');
    return jsonResponse(500, { error: 'HubSpot no está configurado en este sitio' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return jsonResponse(400, { error: 'Cuerpo de la petición no válido' });
  }

  const email = (payload.email || '').trim().toLowerCase();
  const nota = (payload.nota || '').trim();
  if (!email || !email.includes('@') || !nota) {
    return jsonResponse(400, { error: 'Falta el email o el texto de la nota' });
  }

  try {
    const result = await addNoteToContactByEmail(token, email, nota);
    if (result.notFound) {
      return jsonResponse(404, { error: 'No se encontró ningún contacto en HubSpot con ese email' });
    }
    console.log('[hubspot-note] ✓ nota añadida — contacto:', result.contactId, '| nota:', nota);
    return jsonResponse(200, { ok: true, contactId: result.contactId, noteId: result.noteId, contactName: result.contactName });
  } catch (err) {
    console.error('[hubspot-note] ✗ error:', err.message);
    return jsonResponse(502, { error: 'Error al añadir la nota en HubSpot' });
  }
};
