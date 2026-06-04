// Netlify Function: auto-reply email for all Netlify Forms submissions.
// Triggered automatically by Netlify for every form submission (event: submission-created).
// Requires env var: RESEND_API_KEY  (resend.com)
//
// Forms handled:
//   reserva              → tarjeta: skip (send-booking-email handles it after Stripe)
//                        → transferencia: "reserva recibida, pendiente de pago"
//   solicitud-info       → email PREMIUM con resumen + CTA encuesta
//   solicitud-info-en    → idem in English
//   folleto*             → "tu itinerario está en camino"
//   contacto             → "mensaje recibido"
//   llamada              → skip (no email field)
//   presupuesto          → skip (no email field)
//   encuesta-open        → skip (tracking interno, sin respuesta)
//   encuesta-respuestas  → skip (tracking interno, sin respuesta)

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
  console.log('[SC] ▶ invocado — método:', event.httpMethod);

  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch (e) {
    console.error('[SC] ✗ body inválido:', e.message, '| raw:', String(event.body).slice(0, 200));
    return ok('error: invalid body');
  }

  const form = parsed.payload || {};
  const data = form.data || {};
  const formName = form.form_name || '';

  // LOG DIAGNÓSTICO — siempre visible en Netlify Function logs
  console.log('[SC] DIAGNÓSTICO formName=' + JSON.stringify(formName));
  console.log('[SC] DIAGNÓSTICO email detectado=' + JSON.stringify(data.email));
  console.log('[SC] DIAGNÓSTICO ruta detectada=' + JSON.stringify(data.ruta));
  console.log('[SC] DIAGNÓSTICO data keys=' + JSON.stringify(Object.keys(data)));
  console.log('[SC] DIAGNÓSTICO RESEND_API_KEY presente=' + (!!process.env.RESEND_API_KEY));

  // Formularios sin email o de tracking interno — skip
  const skipForms = ['llamada', 'presupuesto', 'encuesta-open', 'encuesta-respuestas'];
  if (skipForms.includes(formName)) {
    console.log('[SC] skip (tracking/sin email):', formName);
    return ok('skipped: no email form');
  }

  const toEmail = data.email;
  if (!toEmail || !toEmail.includes('@')) {
    console.log('[SC] ✗ email ausente o inválido en data — keys disponibles:', JSON.stringify(Object.keys(data)));
    return ok('skipped: no valid email field');
  }

  const config = getConfig(formName, data);
  console.log('[SC] DIAGNÓSTICO premium=' + (config && config !== 'SKIP_STRIPE' ? JSON.stringify(!!config.premium) : 'N/A') + ' config=' + (config ? (config === 'SKIP_STRIPE' ? 'SKIP_STRIPE' : config.templateName) : 'null'));

  if (!config) {
    console.log('[SC] formulario no gestionado — omitido:', formName);
    return ok('skipped: unhandled form');
  }

  if (config === 'SKIP_STRIPE') {
    console.log('[SC] reserva tarjeta — skip (send-booking-email lo gestiona)');
    return ok('skipped: stripe payment handled by send-booking-email');
  }

  const firstName = (data.nombre || data.name || '').split(' ')[0] || 'Peregrino';

  if (config.premium) {
    const eB64 = encodeURIComponent(Buffer.from(toEmail).toString('base64'));
    const rB64 = data.ruta ? encodeURIComponent(Buffer.from(data.ruta).toString('base64')) : '';
    config.ctaUrl = 'https://easycaminosantiago.com/encuesta/?e=' + eB64 + (rB64 ? '&r=' + rB64 : '');
    console.log('[SC] DIAGNÓSTICO ctaUrl generada=' + config.ctaUrl);
  }

  const html = config.premium
    ? buildPremiumEmail(firstName, config)
    : buildEmail(firstName, config);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[SC] ✗ RESEND_API_KEY no configurada en Netlify — CORRÍGELO EN Site Settings > Env Vars');
    return ok('error: no api key');
  }

  console.log('[SC] → llamando Resend para enviar a:', toEmail, '| asunto:', config.subject);
  let result;
  try {
    result = await resendPost(
      {
        from: 'Easy Camino Santiago <info@easycaminosantiago.com>',
        to: [toEmail],
        subject: config.subject,
        html,
      },
      apiKey
    );
  } catch (err) {
    console.error('[SC] ✗ excepción al llamar Resend:', err.message);
    return { statusCode: 500, body: 'resend exception: ' + err.message };
  }

  console.log('[SC] DIAGNÓSTICO Resend status=' + result.status + ' body=' + JSON.stringify(result.body));

  if (result.status >= 400) {
    console.error('[SC] ✗ Resend rechazó el email — status:', result.status, 'body:', JSON.stringify(result.body));
    return { statusCode: 500, body: 'email send failed' };
  }

  console.log('[SC] ✓ email enviado OK a', toEmail);
  return ok('sent');
};

// ---------------------------------------------------------------------------
// Config per form type
// ---------------------------------------------------------------------------

function getConfig(formName, data) {

  // ── Solicitud de información / presupuesto (ES) — email PREMIUM ───────────
  if (formName === 'solicitud-info') {
    return {
      premium: true,
      templateName: 'solicitud-info-premium',
      subject: 'Hemos recibido correctamente tu solicitud — Easy Camino Santiago',
      summaryRows: premiumDataRows([
        ['Ruta',             data.ruta],
        ['Fecha aproximada', data.fecha],
        ['Peregrinos',       data.personas],
        ['Alojamiento',      data.alojamiento],
        ['Comentarios',      data.mensaje],
      ]),
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
        ['Route',            data.ruta],
        ['Name',             [data.titulo, data.nombre, data.apellido].filter(Boolean).join(' ')],
        ['Phone',            data.telefono],
        ['Location',         data.localidad],
        ['Approximate date', data.fecha],
        ['Pilgrims',         data.personas],
        ['Accommodation',    data.alojamiento],
        ['Message',          data.mensaje],
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
        ['Asunto',  data.asunto],
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
        ['Ruta',     data.ruta],
        ['Teléfono', data.telefono],
      ]),
      responsePromise: '¿Listo para dar el siguiente paso? Podemos prepararte un presupuesto personalizado sin compromiso.',
    };
  }

  // ── Reserva ──────────────────────────────────────────────────────────────
  if (formName === 'reserva') {
    const metodoPago = data['metodo-pago'] || '';

    if (metodoPago === 'Tarjeta bancaria') {
      return 'SKIP_STRIPE';
    }

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
        ['Referencia',      data.referencia],
        ['Ruta',            data.ruta],
        ['Fecha de inicio', data['fecha-inicio']],
        ['Peregrinos',      pilgrimsLabel],
        ['Alojamiento',     data.alojamiento],
        ['Total reserva',   data.total],
        ['Depósito (20%)',  data.deposito],
        ['Extras',          data.extras],
        ['Observaciones',   data.observaciones],
      ]),
      responsePromise: 'Confirmaremos la reserva en cuanto recibamos la transferencia. Si tienes dudas, escríbenos por WhatsApp.',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers de filas
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

function premiumDataRows(pairs) {
  const filtered = pairs.filter(([, v]) => v && String(v).trim());
  if (!filtered.length) return '';
  return filtered.map(([label, value], i, arr) => {
    const border = i < arr.length - 1 ? 'border-bottom:1px solid #eef2f2;' : '';
    return `
      <tr>
        <td style="padding:12px 20px;font-size:11px;color:#8a9ea0;white-space:nowrap;vertical-align:top;${border}font-family:Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">${label}</td>
        <td style="padding:12px 20px;font-size:14px;color:#2D4A52;font-weight:600;vertical-align:top;${border}font-family:Arial,sans-serif;">${value}</td>
      </tr>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Email PREMIUM — solicitud-info
// ---------------------------------------------------------------------------

function buildPremiumEmail(firstName, { summaryRows, ctaUrl }) {
  const summaryBlock = summaryRows
    ? `<tr>
        <td colspan="2" style="background:#2D4A52;padding:12px 20px;">
          <p style="margin:0;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.50);font-weight:700;font-family:Arial,sans-serif;">Tu solicitud</p>
        </td>
      </tr>
      ${summaryRows}`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Hemos recibido correctamente tu solicitud</title>
</head>
<body style="margin:0;padding:0;background:#eff5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eff5f5;padding:32px 16px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0"
    style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(45,74,82,0.12);">

    <!-- LOGO -->
    <tr>
      <td style="background:#ffffff;padding:36px 40px 30px;text-align:center;border-bottom:1px solid #eef2f2;">
        <img src="https://easycaminosantiago.com/easy-camino-santiago-logo.png"
          alt="Easy Camino Santiago"
          height="60"
          style="height:60px;width:auto;display:block;margin:0 auto;">
      </td>
    </tr>

    <!-- HEADER con gradiente sutil -->
    <tr>
      <td bgcolor="#2D4A52" style="background-color:#2D4A52;background-image:linear-gradient(180deg,#233c44 0%,#2D4A52 100%);padding:34px 40px 36px;text-align:center;">
        <p style="margin:0 0 10px;font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.38);text-transform:uppercase;font-weight:700;font-family:Arial,sans-serif;">Easy Camino Santiago</p>
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.35;font-family:Arial,sans-serif;">
          Hemos recibido correctamente<br>tu solicitud
        </h1>
      </td>
    </tr>
    <!-- Línea de acento turquesa -->
    <tr>
      <td bgcolor="#56A1A4" style="background:#56A1A4;height:3px;font-size:0;line-height:0;padding:0;">&nbsp;</td>
    </tr>

    <!-- INTRO -->
    <tr>
      <td style="padding:32px 40px 26px;">
        <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#2D4A52;font-family:Arial,sans-serif;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5c5e;line-height:1.72;font-family:Arial,sans-serif;">
          Gracias por confiar en Easy Camino Santiago.<br>
          Ya estamos preparando tu propuesta personalizada para el Camino de Santiago.
        </p>
      </td>
    </tr>

    <!-- RESUMEN DE SOLICITUD -->
    <tr>
      <td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border:1px solid #d8e8e9;border-radius:8px;overflow:hidden;">
          <tbody>
            ${summaryBlock}
          </tbody>
        </table>
      </td>
    </tr>

    <!-- TEXTO HUMANO -->
    <tr>
      <td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-left:3px solid #56A1A4;padding:12px 18px;background:#f7fbfb;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:15px;color:#2D4A52;line-height:1.72;font-family:Arial,sans-serif;">
                Estamos revisando tu ruta, fechas y preferencias para prepararte una propuesta clara y personalizada.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA ENCUESTA -->
    <tr>
      <td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#edf7f7;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:26px 28px;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#56A1A4;font-weight:700;font-family:Arial,sans-serif;">Mientras preparamos tu propuesta</p>
              <p style="margin:0 0 20px;font-size:15px;color:#2D4A52;line-height:1.68;font-family:Arial,sans-serif;">
                Nos ayudaría mucho conocer un poco mejor tu experiencia en nuestra web. Solo son 7 preguntas rápidas.
              </p>
              <a href="${ctaUrl}"
                style="display:inline-block;background:#2D4A52;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 28px;border-radius:30px;letter-spacing:0.4px;font-family:Arial,sans-serif;">
                Responder preguntas ahora
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- TRUST INDICATORS -->
    <tr>
      <td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td colspan="2" style="padding-bottom:14px;border-top:1px solid #eef2f2;padding-top:22px;">
              <p style="margin:0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8da4a6;font-weight:700;font-family:Arial,sans-serif;">Por qué confiar en nosotros</p>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding:0 14px 10px 0;vertical-align:top;">
              <p style="margin:0;font-size:13px;color:#2D4A52;font-family:Arial,sans-serif;line-height:1.5;">
                <span style="color:#56A1A4;font-weight:700;">&#10003;&nbsp;</span>Empresa local en Galicia
              </p>
            </td>
            <td width="50%" style="padding:0 0 10px;vertical-align:top;">
              <p style="margin:0;font-size:13px;color:#2D4A52;font-family:Arial,sans-serif;line-height:1.5;">
                <span style="color:#56A1A4;font-weight:700;">&#10003;&nbsp;</span>Atención personalizada
              </p>
            </td>
          </tr>
          <tr>
            <td width="50%" style="padding:0 14px 0 0;vertical-align:top;">
              <p style="margin:0;font-size:13px;color:#2D4A52;font-family:Arial,sans-serif;line-height:1.5;">
                <span style="color:#56A1A4;font-weight:700;">&#10003;&nbsp;</span>Alojamientos seleccionados
              </p>
            </td>
            <td width="50%" style="padding:0;vertical-align:top;">
              <p style="margin:0;font-size:13px;color:#2D4A52;font-family:Arial,sans-serif;line-height:1.5;">
                <span style="color:#56A1A4;font-weight:700;">&#10003;&nbsp;</span>Respuesta en menos de 24h
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- NOTA DE TIEMPO -->
    <tr>
      <td style="padding:0 40px 32px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#8da4a6;line-height:1.65;font-family:Arial,sans-serif;">
          Normalmente respondemos en menos de 24 horas.<br>
          Si no recibes nuestra propuesta, revisa tu carpeta de <strong>spam</strong>.
        </p>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background:#f4f9f9;border-top:1px solid #dde8e9;padding:22px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#2D4A52;font-family:Arial,sans-serif;">Easy Camino Santiago</p>
              <p style="margin:0 0 4px;font-size:12px;font-family:Arial,sans-serif;">
                <a href="https://wa.me/34982907629" style="color:#56A1A4;text-decoration:none;">WhatsApp</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:info@easycaminosantiago.com" style="color:#56A1A4;text-decoration:none;">info@easycaminosantiago.com</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.instagram.com/easycaminosantiago/" style="color:#56A1A4;text-decoration:none;">Instagram</a>
                &nbsp;&middot;&nbsp;
                <a href="https://easycaminosantiago.com" style="color:#56A1A4;text-decoration:none;">Web</a>
              </p>
              <p style="margin:5px 0 0;font-size:11px;color:#a8b8ba;font-family:Arial,sans-serif;">Empresa local en Galicia</p>
            </td>
            <td align="right" style="vertical-align:top;">
              <p style="margin:0;font-size:11px;color:#bac8ca;line-height:1.6;font-family:Arial,sans-serif;text-align:right;">
                Mensaje automático.<br>No respondas a este correo.
              </p>
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

// ---------------------------------------------------------------------------
// Email ESTÁNDAR — resto de formularios
// ---------------------------------------------------------------------------

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

    <tr>
      <td style="padding:28px 32px 20px;">
        <p style="margin:0 0 6px;font-size:16px;color:#2D4A52;font-weight:700;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5568;line-height:1.65;">${intro}</p>
      </td>
    </tr>

    ${summaryBlock}

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

    <tr>
      <td style="padding:0 32px 28px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;color:#6b7c7e;">¿Tienes alguna pregunta?</p>
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
</body>
</html>`;
}

function ok(body) {
  return { statusCode: 200, body };
}
