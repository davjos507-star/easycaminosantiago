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
  console.log('[send-booking-email] invocado, method:', event.httpMethod);

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
    console.error('[send-booking-email] body inválido');
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { nombre, email, telefono, ruta, fechaInicio, alojamiento, deposito, total, paymentIntentId } = booking;
  console.log('[send-booking-email] reserva:', { ruta, email: email ? '***' : 'VACÍO', paymentIntentId });

  const fromAddress = 'Easy Camino Santiago <info@easycaminosantiago.com>';
  const adminEmail  = 'info@easycaminosantiago.com';
  const firstName   = nombre ? nombre.split(' ')[0] : 'Peregrino';
  const restoPendiente = (Number(total) - Number(deposito)) || 0;

  // ── Email interno ──────────────────────────────────────────────────────────
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#2D4A52;border-bottom:2px solid #56A1A4;padding-bottom:8px">
        ✅ Nueva reserva pagada con tarjeta — ${ruta || '—'}
      </h2>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;width:140px">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${nombre || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${email || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Teléfono</td><td style="padding:8px;border-bottom:1px solid #eee">${telefono || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Ruta</td><td style="padding:8px;border-bottom:1px solid #eee">${ruta || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Fecha inicio</td><td style="padding:8px;border-bottom:1px solid #eee">${fechaInicio || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Alojamiento</td><td style="padding:8px;border-bottom:1px solid #eee">${alojamiento || '—'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Depósito cobrado</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#0e7b5c">${deposito} €</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888">Total reserva</td><td style="padding:8px;border-bottom:1px solid #eee">${total} €</td></tr>
        <tr><td style="padding:8px;color:#888">Stripe Payment ID</td><td style="padding:8px;font-family:monospace;font-size:12px">${paymentIntentId || '—'}</td></tr>
      </table>
    </div>
  `;

  // ── Email cliente ──────────────────────────────────────────────────────────
  const clientHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Depósito recibido — Easy Camino Santiago</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f4;padding:32px 16px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0"
    style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(45,74,82,0.10);">

    <!-- Header logo -->
    <tr>
      <td style="background:#ffffff;padding:32px 32px 24px;text-align:center;">
        <img src="https://easycaminosantiago.com/logo/favicon-easy.png"
          alt="Easy Camino Santiago"
          style="display:block;margin:0 auto;max-width:160px;width:160px;height:auto;">
      </td>
    </tr>

    <!-- Header band -->
    <tr>
      <td style="background:#2D4A52;padding:20px 32px 26px;text-align:center;">
        <p style="margin:0;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:700;">Easy Camino Santiago</p>
        <p style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">Depósito recibido ✓</p>
      </td>
    </tr>

    <!-- Greeting -->
    <tr>
      <td style="padding:28px 32px 20px;">
        <p style="margin:0 0 6px;font-size:16px;color:#2D4A52;font-weight:700;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;">
          Hemos recibido tu depósito correctamente. Ya estamos revisando tu solicitud y coordinaremos todos los servicios para tu Camino. En menos de 24 horas laborables te enviaremos la confirmación definitiva con toda la documentación.
        </p>
      </td>
    </tr>

    <!-- Summary table -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#f8fafa;border:1px solid #dde6e7;border-radius:6px;overflow:hidden;">
          <tbody>
            ${ruta ? `<tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Ruta</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${ruta}</td></tr>` : ''}
            ${fechaInicio ? `<tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Fecha de inicio</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${fechaInicio}</td></tr>` : ''}
            ${alojamiento ? `<tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Alojamiento</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${alojamiento}</td></tr>` : ''}
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Depósito pagado</td><td style="padding:9px 14px;font-size:13px;color:#0e7b5c;font-weight:700;border-bottom:1px solid #eef0f1;">${deposito} €</td></tr>
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;">Resto pendiente</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;">${restoPendiente} €</td></tr>
          </tbody>
        </table>
      </td>
    </tr>

    <!-- Info box -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#edf6f7;border-left:3px solid #56A1A4;border-radius:0 5px 5px 0;padding:12px 16px;">
              <p style="margin:0;font-size:14px;color:#2D4A52;line-height:1.55;">
                <strong>¿Qué pasa ahora?</strong><br>
                Nuestro equipo revisará tu solicitud y coordinará los alojamientos y servicios. Recibirás la confirmación definitiva con el itinerario y la documentación en menos de 24 horas laborables.<br><br>
                El resto del importe se abonará una vez confirmemos todos los detalles contigo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- WhatsApp CTA -->
    <tr>
      <td style="padding:0 32px 28px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;color:#6b7c7e;">¿Tienes alguna pregunta urgente?</p>
        <a href="https://wa.me/34982907629"
          style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:24px;letter-spacing:0.3px;">
          &#128172; Escríbenos por WhatsApp
        </a>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:20px 32px;background:#f8fafa;border-top:1px solid #e2e8ea;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0;font-size:13px;font-weight:700;color:#2D4A52;">Easy Camino Santiago</p>
              <p style="margin:3px 0 0;font-size:12px;color:#6b7c7e;">info@easycaminosantiago.com &nbsp;·&nbsp; +34 982 907 629</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7c7e;">www.easycaminosantiago.com</p>
            </td>
            <td align="right" style="vertical-align:top;">
              <p style="margin:0;font-size:11px;color:#b0bec5;line-height:1.5;">Mensaje automático de confirmación.<br>Por favor no respondas a este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

  // ── Enviar email interno ───────────────────────────────────────────────────
  console.log('[send-booking-email] enviando email interno a', adminEmail);
  try {
    const adminResult = await resendPost({
      from: fromAddress,
      to: [adminEmail],
      subject: `Nueva reserva (tarjeta) — ${ruta || '—'} — ${nombre || '—'}`,
      html: adminHtml
    }, apiKey);
    console.log('[send-booking-email] email interno:', adminResult.status, JSON.stringify(adminResult.body));
  } catch (e) {
    console.error('[send-booking-email] error email interno:', e.message);
  }

  // ── Enviar email cliente ───────────────────────────────────────────────────
  if (!email || !email.includes('@')) {
    console.log('[send-booking-email] sin email cliente válido — omitido');
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, note: 'no client email' }) };
  }

  console.log('[send-booking-email] enviando email cliente a', email);
  try {
    const clientResult = await resendPost({
      from: fromAddress,
      to: [email],
      subject: 'Depósito recibido — Empezamos a organizar tu Camino',
      html: clientHtml
    }, apiKey);
    console.log('[send-booking-email] email cliente:', clientResult.status, JSON.stringify(clientResult.body));
    if (clientResult.status >= 400) {
      console.error('[send-booking-email] Resend rechazó el email cliente:', JSON.stringify(clientResult.body));
    }
  } catch (e) {
    console.error('[send-booking-email] error email cliente:', e.message);
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};
