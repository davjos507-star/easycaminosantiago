const https = require('https');

function resendPost(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[send-booking-email] RESEND_API_KEY no configurada');
    return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  let booking;
  try {
    booking = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { nombre, email, telefono, ruta, fechaInicio, alojamiento, deposito, total, paymentIntentId } = booking;
  const fromAddress = 'Easy Camino Santiago <onboarding@resend.dev>';
  const adminEmail  = 'info@easycaminosantiago.com';

  const adminHtml = `
    <h2 style="color:#2D4A52">Nueva reserva — ${ruta || '—'}</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:600px">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee">${nombre || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${email || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Teléfono</td><td style="padding:8px;border-bottom:1px solid #eee">${telefono || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Ruta</td><td style="padding:8px;border-bottom:1px solid #eee">${ruta || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Fecha inicio</td><td style="padding:8px;border-bottom:1px solid #eee">${fechaInicio || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Alojamiento</td><td style="padding:8px;border-bottom:1px solid #eee">${alojamiento || '—'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Depósito pagado</td><td style="padding:8px;border-bottom:1px solid #eee">${deposito} €</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Total reserva</td><td style="padding:8px;border-bottom:1px solid #eee">${total} €</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Payment ID</td><td style="padding:8px">${paymentIntentId || '—'}</td></tr>
    </table>
  `;

  const clientHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#2D4A52">¡Reserva confirmada! Buen Camino 🙏</h2>
      <p style="color:#5a6b6a">Hola ${nombre ? nombre.split(' ')[0] : ''},</p>
      <p style="color:#5a6b6a">Hemos recibido tu reserva y el depósito correctamente. Nos pondremos en contacto contigo en menos de 24h para confirmar todos los detalles.</p>
      <table style="font-size:14px;border-collapse:collapse;width:100%;margin:24px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#2D4A52">Ruta</td><td style="padding:8px;border-bottom:1px solid #eee;color:#5a6b6a">${ruta || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#2D4A52">Fecha inicio</td><td style="padding:8px;border-bottom:1px solid #eee;color:#5a6b6a">${fechaInicio || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#2D4A52">Alojamiento</td><td style="padding:8px;border-bottom:1px solid #eee;color:#5a6b6a">${alojamiento || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#2D4A52">Depósito pagado</td><td style="padding:8px;border-bottom:1px solid #eee;color:#5a6b6a">${deposito} €</td></tr>
        <tr><td style="padding:8px;font-weight:bold;color:#2D4A52">Importe pendiente</td><td style="padding:8px;color:#5a6b6a">${total - deposito} €</td></tr>
      </table>
      <p style="color:#5a6b6a">¿Dudas? Escríbenos a <a href="mailto:info@easycaminosantiago.com" style="color:#56A1A4">info@easycaminosantiago.com</a> o llámanos al <strong>982 907 629</strong>.</p>
      <p style="color:#5a6b6a;margin-top:32px">¡Ultreia!<br><strong style="color:#2D4A52">Easy Camino Santiago</strong></p>
    </div>
  `;

  try {
    await resendPost({ from: fromAddress, to: [adminEmail],
      subject: `Nueva reserva — ${ruta || '—'} — ${nombre || '—'}`, html: adminHtml }, apiKey);
  } catch (e) { console.error('[send-booking-email] email admin:', e.message); }

  if (email && email.includes('@')) {
    try {
      await resendPost({ from: fromAddress, to: [email],
        subject: '¡Reserva confirmada! Tu Camino de Santiago está en marcha', html: clientHtml }, apiKey);
    } catch (e) { console.error('[send-booking-email] email cliente:', e.message); }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};
