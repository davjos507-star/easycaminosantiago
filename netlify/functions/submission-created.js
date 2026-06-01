// Netlify Function: auto-reply email for all form submissions that include an email field.
// Triggered automatically by Netlify for every form submission (event: submission-created).
// Requires env var: RESEND_API_KEY  (resend.com — free tier covers 3 000 emails/month)

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

  const body = JSON.parse(event.body);
  const form = body.payload;
  const data = form.data || {};
  console.log('[submission-created] formulario:', form.form_name);

  const toEmail = data.email;
  if (!toEmail) {
    console.log('[submission-created] sin campo email — omitido');
    return ok('skipped: no email field');
  }
  console.log('[submission-created] email detectado:', toEmail);

  const config = getConfig(form.form_name, data);
  if (!config) {
    console.log('[submission-created] formulario no gestionado — omitido');
    return ok('skipped: unhandled form');
  }

  const firstName = (data.nombre || '').split(' ')[0] || 'Peregrino';
  const html = buildEmail(firstName, config);

  console.log('[submission-created] llamando a Resend...');
  const result = await resendPost(
    {
      from: 'Easy Camino Santiago <info@easycaminosantiago.com>',
      to: [toEmail],
      subject: config.subject,
      html,
    },
    process.env.RESEND_API_KEY
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
  if (formName === 'solicitud-info') {
    return {
      subject: 'Hemos recibido tu solicitud — Easy Camino Santiago',
      heading: 'Hemos recibido tu solicitud',
      intro:
        'Gracias por ponerte en contacto con nosotros. Hemos recibido tu solicitud y te responderemos con una propuesta personalizada en menos de 24 horas.',
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
    };
  }

  if (formName === 'contacto') {
    return {
      subject: 'Hemos recibido tu mensaje — Easy Camino Santiago',
      heading: 'Hemos recibido tu mensaje',
      intro:
        'Gracias por escribirnos. Hemos recibido tu mensaje y te responderemos en menos de 24 horas.',
      tableRows: dataRows([
        ['Asunto', data.asunto],
        ['Mensaje', data.mensaje],
      ]),
    };
  }

  // folleto, folleto-sarria, folleto-portugues, etc.
  if (formName.startsWith('folleto')) {
    return {
      subject: 'Tu itinerario del Camino de Santiago — Easy Camino Santiago',
      heading: 'Tu itinerario está en camino',
      intro:
        'Gracias por tu interés en el Camino de Santiago. Hemos recibido tu solicitud de itinerario y te lo enviaremos en breve a este correo.',
      tableRows: dataRows([
        ['Ruta', data.ruta],
        ['Teléfono', data.telefono],
      ]),
    };
  }

  if (formName === 'reserva') {
    const pilgrimsLabel = [
      data.adultos && `${data.adultos} adulto${data.adultos !== '1' ? 's' : ''}`,
      data.ninos && data.ninos !== '0' && `${data.ninos} niño${data.ninos !== '1' ? 's' : ''}`,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      subject: 'Reserva recibida — Easy Camino Santiago',
      heading: 'Reserva recibida correctamente',
      intro:
        'Hemos recibido tu solicitud de reserva. Te confirmaremos todos los detalles y el siguiente paso de pago en menos de 24 horas.',
      tableRows: dataRows([
        ['Referencia', data.referencia],
        ['Ruta', data.ruta],
        ['Fecha de inicio', data['fecha-inicio']],
        ['Peregrinos', pilgrimsLabel],
        ['Alojamiento', data.alojamiento],
        ['Total', data.total],
        ['Extras', data.extras],
        ['Método de pago', data['metodo-pago']],
        ['Observaciones', data.observaciones],
      ]),
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
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:9px 14px;font-size:13px;color:#6b7c7e;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eef0f1;">${label}</td>
          <td style="padding:9px 14px;font-size:13px;color:#2D4A52;font-weight:600;border-bottom:1px solid #eef0f1;">${value}</td>
        </tr>`
    )
    .join('');
}

function buildEmail(firstName, { heading, intro, tableRows }) {
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

    <!-- ── Header ── -->
    <tr>
      <td style="background:#ffffff;padding:24px 32px 0;text-align:center;">
        <img src="https://easycaminosantiago.com/favicon.png"
          width="140" height="140"
          alt="Easy Camino Santiago"
          style="display:block;margin:0 auto;width:140px;height:140px;border-radius:50%;border:3px solid #e8f2f3;">
      </td>
    </tr>
    <tr>
      <td style="background:#2D4A52;padding:20px 32px 26px;text-align:center;margin-top:0;">
        <p style="margin:0;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:700;">Easy Camino Santiago</p>
        <p style="margin:6px 0 0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">${heading}</p>
      </td>
    </tr>

    <!-- ── Greeting ── -->
    <tr>
      <td style="padding:28px 32px 20px;">
        <p style="margin:0 0 6px;font-size:16px;color:#2D4A52;font-weight:700;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;">${intro}</p>
      </td>
    </tr>

    <!-- ── Data summary ── -->
    ${summaryBlock}

    <!-- ── Response promise ── -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#edf6f7;border-left:3px solid #56A1A4;border-radius:0 5px 5px 0;padding:12px 16px;">
              <p style="margin:0;font-size:14px;color:#2D4A52;line-height:1.55;">
                <strong>Te responderemos en menos de 24 horas.</strong><br>
                Si no recibes nuestra respuesta, revisa tu carpeta de <strong>spam</strong> o correo no deseado.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ── WhatsApp CTA ── -->
    <tr>
      <td style="padding:0 32px 28px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;color:#6b7c7e;">¿Tienes alguna pregunta urgente?</p>
        <a href="https://wa.me/34982907629"
          style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:24px;letter-spacing:0.3px;">
          &#128172; Escríbenos por WhatsApp
        </a>
      </td>
    </tr>

    <!-- ── Footer ── -->
    <tr>
      <td style="padding:20px 32px;background:#f8fafa;border-top:1px solid #e2e8ea;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0;font-size:13px;font-weight:700;color:#2D4A52;">Easy Camino Santiago</p>
              <p style="margin:3px 0 0;font-size:12px;color:#6b7c7e;">
                info@easycaminosantiago.com &nbsp;·&nbsp; +34 982 907 629
              </p>
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
