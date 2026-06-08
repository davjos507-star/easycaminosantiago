// Netlify Function: test endpoint for Resend email delivery.
// Sends a simulated booking confirmation email WITHOUT touching Stripe.
// Protected by TEST_EMAIL_SECRET env var.
//
// Usage:
//   GET  /.netlify/functions/test-email?secret=<TOKEN>&to=<email>
//   POST /.netlify/functions/test-email?secret=<TOKEN>   (body: { to: "email" })

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
        'Content-Length': Buffer.byteLength(body),
      },
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

exports.handler = async function (event) {
  console.log('[test-email] invocado, method:', event.httpMethod);

  const params = event.queryStringParameters || {};
  const secret = params.secret || '';
  const expectedSecret = process.env.TEST_EMAIL_SECRET;

  if (!expectedSecret) {
    console.error('[test-email] TEST_EMAIL_SECRET no configurada');
    return json(500, { error: 'TEST_EMAIL_SECRET not configured' });
  }

  if (secret !== expectedSecret) {
    console.warn('[test-email] acceso denegado — secret incorrecto');
    return json(403, { error: 'Forbidden' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[test-email] RESEND_API_KEY no configurada');
    return json(500, { error: 'RESEND_API_KEY not configured' });
  }

  // Determine recipient — query param > POST body > fallback to admin
  let toEmail = params.to || '';
  if (!toEmail && event.httpMethod === 'POST' && event.body) {
    try {
      const parsed = JSON.parse(event.body);
      toEmail = parsed.to || '';
    } catch (_) {}
  }
  if (!toEmail || !toEmail.includes('@')) {
    toEmail = 'info@easycaminosantiago.com';
  }

  // Fake booking data
  const booking = {
    nombre: 'Peregrino Test',
    email: toEmail,
    telefono: '+34 600 000 000',
    ruta: 'Camino Francés (TEST)',
    fechaInicio: '2026-07-15',
    alojamiento: 'Privado',
    deposito: 200,
    total: 1000,
    paymentIntentId: 'pi_TEST_FAKE_000000000000',
  };

  const firstName = 'Peregrino';
  const restoPendiente = booking.total - booking.deposito;

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

    <tr>
      <td style="background:#ffffff;padding:32px 32px 24px;text-align:center;">
        <img src="https://easycaminosantiago.com/img/logo-ecs-email.png"
          alt="Easy Camino Santiago"
          width="200" height="200"
          style="display:block;margin:0 auto;width:200px;height:auto;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>

    <tr>
      <td style="background:#2D4A52;padding:20px 32px 26px;text-align:center;">
        <p style="margin:0;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:700;">Easy Camino Santiago</p>
        <p style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">Depósito recibido ✓</p>
      </td>
    </tr>

    <tr>
      <td style="padding:28px 32px 20px;">
        <p style="margin:0 0 6px;font-size:16px;color:#2D4A52;font-weight:700;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;">
          Hemos recibido tu depósito correctamente. Ya estamos revisando tu solicitud y coordinaremos todos los servicios para tu Camino. En menos de 24 horas laborables te enviaremos la confirmación definitiva con toda la documentación.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#f8fafa;border:1px solid #dde6e7;border-radius:6px;overflow:hidden;">
          <tbody>
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Ruta</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${booking.ruta}</td></tr>
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Fecha de inicio</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${booking.fechaInicio}</td></tr>
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Alojamiento</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${booking.alojamiento}</td></tr>
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;border-bottom:1px solid #eef0f1;">Depósito pagado</td><td style="padding:9px 14px;font-size:13px;color:#0e7b5c;font-weight:700;border-bottom:1px solid #eef0f1;">${booking.deposito} €</td></tr>
            <tr><td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;">Resto pendiente</td><td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;">${restoPendiente} €</td></tr>
          </tbody>
        </table>
      </td>
    </tr>

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

    <tr>
      <td style="padding:0 32px 28px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;color:#6b7c7e;">¿Tienes alguna pregunta urgente?</p>
        <a href="https://wa.me/34982907629"
          style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:24px;letter-spacing:0.3px;">
          &#128172; Escríbenos por WhatsApp
        </a>
      </td>
    </tr>

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
<p style="text-align:center;font-size:11px;color:#b0bec5;margin-top:8px;">⚠️ TEST EMAIL — datos ficticios, sin pago real</p>
</body>
</html>`;

  console.log('[test-email] enviando email de prueba a', toEmail);
  const result = await resendPost(
    {
      from: 'Easy Camino Santiago <info@easycaminosantiago.com>',
      to: [toEmail],
      subject: '[TEST] Depósito recibido — Empezamos a organizar tu Camino',
      html: clientHtml,
    },
    apiKey
  );

  console.log('[test-email] Resend respuesta:', result.status, JSON.stringify(result.body));

  return json(result.status >= 400 ? 500 : 200, {
    ok: result.status < 400,
    resendStatus: result.status,
    resendBody: result.body,
    sentTo: toEmail,
    note: 'TEST — datos ficticios, sin pago real',
  });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2),
  };
}
