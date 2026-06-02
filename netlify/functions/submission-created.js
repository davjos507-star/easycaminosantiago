// Netlify Function: auto-reply email for all Netlify Forms submissions.
// Triggered automatically by Netlify for every form submission (event: submission-created).
// Requires env var: RESEND_API_KEY  (resend.com)
//
// Forms handled:
//   reserva           → tarjeta: skip (send-booking-email handles it after Stripe)
//                     → transferencia: "reserva recibida, pendiente de pago"
//   solicitud-info    → "solicitud recibida, propuesta en <24h"
//   solicitud-info-en → idem in English
//   folleto*          → "tu itinerario está en camino"
//   contacto          → "mensaje recibido"
//   llamada           → skip (no email field)
//   presupuesto       → skip (no email field)

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
  console.log('[submission-created] evento recibido');

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch (e) {
    console.error('[submission-created] body inválido:', e.message);
    return ok('error: invalid body');
  }

  const form = parsed.payload;
  const data = form.data || {};
  const formName = form.form_name || '';

  console.log('[submission-created] form_name:', formName);

  // Formularios sin email — log y skip
  if (formName === 'llamada' || formName === 'presupuesto') {
    console.log('[submission-created] formulario sin email — skip:', formName);
    return ok('skipped: no email form');
  }

  const toEmail = data.email;
  if (!toEmail || !toEmail.includes('@')) {
    console.log('[submission-created] campo email ausente o inválido — omitido');
    return ok('skipped: no valid email field');
  }
  console.log('[submission-created] email detectado:', toEmail);

  const config = getConfig(formName, data);
  if (!config) {
    console.log('[submission-created] formulario no gestionado — omitido:', formName);
    return ok('skipped: unhandled form');
  }

  // reserva con tarjeta: pago gestionado por send-booking-email, no enviar aquí
  if (config === 'SKIP_STRIPE') {
    console.log('[submission-created] reserva con tarjeta — gestionada por send-booking-email, skip');
    return ok('skipped: stripe payment handled by send-booking-email');
  }

  console.log('[submission-created] plantilla seleccionada:', config.templateName);

  const firstName = (data.nombre || data.name || '').split(' ')[0] || 'Peregrino';
  const html = buildEmail(firstName, config);
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('[submission-created] RESEND_API_KEY no configurada');
    return ok('error: no api key');
  }

  console.log('[submission-created] llamando a Resend...');
  const result = await resendPost(
    {
      from: 'Easy Camino Santiago <info@easycaminosantiago.com>',
      to: [toEmail],
      subject: config.subject,
      html,
    },
    apiKey
  );

  console.log('[submission-created] Resend respuesta:', result.status, JSON.stringify(result.body));

  if (result.status >= 400) {
    console.error('[submission-created] error Resend:', result.status, JSON.stringify(result.body));
    return { statusCode: 500, body: 'email send failed' };
  }

  console.log('[submission-created] email enviado OK a', toEmail);
  return ok('sent');
};

// ---------------------------------------------------------------------------
// Config per form type
// ---------------------------------------------------------------------------

function getConfig(formName, data) {

  // ── Solicitud de información / presupuesto (ES) ──────────────────────────
  if (formName === 'solicitud-info') {
    return {
      templateName: 'solicitud-info',
      subject: 'Hemos recibido tu solicitud — Easy Camino Santiago',
      heading: 'Hemos recibido tu solicitud',
      intro: 'Gracias por ponerte en contacto con nosotros. Hemos recibido tu solicitud y prepararemos una propuesta personalizada para tu Camino en menos de 24 horas laborables.',
      tableRows: dataRows([
        ['Ruta', data.ruta],
        ['Nombre', [data.titulo, data.nombre, data.apellido].filter(Boolean).join(' ')],
        ['Teléfono', data.telefono],
        ['Localidad', data.localidad],
        ['Fecha aproximada', data.fecha],
        ['Peregrinos', data.personas],
        ['Alojamiento', data.alojamiento],
        ['Mensaje', data.mensaje],
      ]),
      responsePromise: 'Te enviaremos una propuesta detallada en menos de 24 horas laborables.',
    };
  }

  // ── Solicitud de información / presupuesto (EN) ──────────────────────────
  if (formName === 'solicitud-info-en') {
    return {
      templateName: 'solicitud-info-en',
      subject: 'We have received your enquiry — Easy Camino Santiago',
      heading: 'Enquiry received',
      intro: 'Thank you for getting in touch. We have received your enquiry and will prepare a personalised proposal for your Camino within 24 working hours.',
      tableRows: dataRows([
        ['Route', data.ruta],
        ['Name', [data.titulo, data.nombre, data.apellido].filter(Boolean).join(' ')],
        ['Phone', data.telefono],
        ['Location', data.localidad],
        ['Approximate date', data.fecha],
        ['Pilgrims', data.personas],
        ['Accommodation', data.alojamiento],
        ['Message', data.mensaje],
      ]),
      responsePromise: 'We will send you a detailed proposal within 24 working hours.',
    };
  }

  // ── Formulario de contacto ───────────────────────────────────────────────
  if (formName === 'contacto') {
    return {
      templateName: 'contacto',
      subject: 'Hemos recibido tu mensaje — Easy Camino Santiago',
      heading: 'Hemos recibido tu mensaje',
      intro: 'Gracias por escribirnos. Hemos recibido tu mensaje y te responderemos en menos de 24 horas laborables.',
      tableRows: dataRows([
        ['Asunto', data.asunto],
        ['Mensaje', data.mensaje],
      ]),
      responsePromise: 'Te responderemos en menos de 24 horas laborables.',
    };
  }

  // ── Descarga de folleto (folleto, folleto-sarria, folleto-portugues…) ─────
  if (formName.startsWith('folleto')) {
    return {
      templateName: 'folleto',
      subject: 'Tu itinerario del Camino de Santiago — Easy Camino Santiago',
      heading: 'Tu itinerario está en camino',
      intro: 'Gracias por tu interés en el Camino de Santiago. Hemos recibido tu solicitud de itinerario y te lo enviaremos en breve a este correo.',
      tableRows: dataRows([
        ['Ruta', data.ruta],
        ['Teléfono', data.telefono],
      ]),
      responsePromise: '¿Listo para dar el siguiente paso? Podemos prepararte un presupuesto personalizado sin compromiso.',
    };
  }

  // ── Reserva ──────────────────────────────────────────────────────────────
  if (formName === 'reserva') {
    const metodoPago = data['metodo-pago'] || '';

    // Tarjeta bancaria: el pago está confirmado por Stripe.
    // send-booking-email.js ya envía el correo al cliente. Skip aquí.
    if (metodoPago === 'Tarjeta bancaria') {
      return 'SKIP_STRIPE';
    }

    // Transferencia bancaria: reserva recibida, pendiente de pago
    const pilgrimsLabel = [
      data.adultos && `${data.adultos} adulto${data.adultos !== '1' ? 's' : ''}`,
      data.ninos && data.ninos !== '0' && `${data.ninos} niño${data.ninos !== '1' ? 's' : ''}`,
    ].filter(Boolean).join(', ');

    return {
      templateName: 'reserva-transferencia',
      subject: 'Solicitud de reserva recibida — Easy Camino Santiago',
      heading: 'Solicitud de reserva recibida',
      intro: 'Hemos recibido tu solicitud de reserva con pago por transferencia bancaria. En cuanto confirmemos la recepción del depósito, te enviaremos la confirmación definitiva con toda la documentación.',
      tableRows: dataRows([
        ['Referencia', data.referencia],
        ['Ruta', data.ruta],
        ['Fecha de inicio', data['fecha-inicio']],
        ['Peregrinos', pilgrimsLabel],
        ['Alojamiento', data.alojamiento],
        ['Total reserva', data.total],
        ['Depósito (20%)', data.deposito],
        ['Extras', data.extras],
        ['Observaciones', data.observaciones],
      ]),
      responsePromise: 'Confirmaremos la reserva en cuanto recibamos la transferencia. Si tienes dudas, escríbenos por WhatsApp.',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function dataRows(pairs) {
  const filtered = pairs.filter(([, v]) => v && String(v).trim());
  if (!filtered.length) return '';
  return filtered
    .map(([label, value]) => `
        <tr>
          <td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eef0f1;">${label}</td>
          <td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${value}</td>
        </tr>`)
    .join('');
}

function buildEmail(firstName, { heading, intro, tableRows, responsePromise }) {
  const summaryBlock = tableRows
    ? `<tr><td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#f8fafa;border:1px solid #dde6e7;border-radius:6px;overflow:hidden;">
          <tbody>${tableRows}</tbody>
        </table>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f4;padding:32px 16px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0"
    style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(45,74,82,0.10);">

    <!-- Header logo -->
    <tr>
      <td style="background:#ffffff;padding:24px 32px 0;text-align:center;">
        <img src="https://easycaminosantiago.com/favicon.png"
          width="80" height="80"
          alt="Easy Camino Santiago"
          style="display:block;margin:0 auto;width:80px;height:80px;border-radius:50%;border:3px solid #e8f2f3;">
      </td>
    </tr>
    <tr>
      <td style="background:#2D4A52;padding:20px 32px 26px;text-align:center;">
        <p style="margin:0;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:700;">Easy Camino Santiago</p>
        <p style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">${heading}</p>
      </td>
    </tr>

    <!-- Greeting -->
    <tr>
      <td style="padding:28px 32px 20px;">
        <p style="margin:0 0 6px;font-size:16px;color:#2D4A52;font-weight:700;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;">${intro}</p>
      </td>
    </tr>

    <!-- Data summary -->
    ${summaryBlock}

    <!-- Response promise -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#edf6f7;border-left:3px solid #56A1A4;border-radius:0 5px 5px 0;padding:12px 16px;">
              <p style="margin:0;font-size:14px;color:#2D4A52;line-height:1.55;">
                ${responsePromise}<br><br>
                Si no recibes nuestra respuesta, revisa tu carpeta de <strong>spam</strong> o correo no deseado.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- WhatsApp CTA -->
    <tr>
      <td style="padding:0 32px 28px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;color:#6b7c7e;">¿Tienes alguna pregunta?</p>
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
}

function ok(body) {
  return { statusCode: 200, body };
}
