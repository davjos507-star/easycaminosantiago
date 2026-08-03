// Netlify Function: auto-reply email + HubSpot CRM sync for all Netlify Forms submissions.
// Triggered automatically by Netlify's "formSubmitted" platform event (Functions API v2 —
// see https://docs.netlify.com/build/functions/trigger-on-events/). Netlify's own
// FormSubmittedEvent type (@netlify/types) exposes only `{ data: Record<string,string> }`;
// there is no separate form-name field — "form-name" arrives as a regular key inside `data`.
// Env vars required: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT (email)
//                    HUBSPOT_TOKEN (HubSpot Private App Token, optional — sync skipped if absent)
//
// Forms handled:
//   reserva              → HubSpot sync siempre, independiente del email:
//                          tarjeta: estado=reserva_iniciada, email omitido (send-booking-email lo gestiona)
//                          transferencia: estado=pendiente_transferencia + email "reserva recibida"
//   solicitud-info       → email PREMIUM con resumen + CTA encuesta
//   solicitud-info-en    → idem in English
//   folleto*             → "tu itinerario está en camino"
//   contacto             → "mensaje recibido"
//   llamada              → skip (no email field)
//   presupuesto          → skip (no email field)
//   encuesta-open        → skip (tracking interno, sin respuesta)
//   encuesta-respuestas  → skip (tracking interno, sin respuesta)

import https from 'https';
import nodemailer from 'nodemailer';

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

export default {
  async formSubmitted(event) {
    console.log('[SC] ▶ invocado — evento formSubmitted');

    // FormSubmittedEvent (@netlify/types@2.8.0, dist/main.d.ts) expone únicamente
    // `{ data: Record<string,string> }`. No existe un campo de nombre de formulario
    // aparte: "form-name" llega como una clave más dentro de `data`, igual que
    // cualquier otro campo del formulario (el <input type="hidden" name="form-name">
    // que ya llevan todos los formularios de este sitio).
    const data = event.data || {};

    let formName = data['form-name'] || '';

    // FALLBACK: en el evento formSubmitted real, "form-name" no llega dentro de `data`
    // (confirmado por [SC] EVENT KEYS=["data"] en logs de producción — el objeto `event`
    // solo contiene `data`, y form-name no está entre sus claves). Como red de seguridad,
    // si formName llega vacío se detecta el formulario "reserva" por la presencia conjunta
    // de campos que solo aparecen en ese formulario.
    if (!formName) {
      const reservaFields = ['ruta', 'fecha-inicio', 'adultos', 'alojamiento', 'email', 'total', 'deposito'];
      const looksLikeReserva = reservaFields.every(field => field in data);
      if (looksLikeReserva) {
        formName = 'reserva';
      }
    }

    // LOG DIAGNÓSTICO — siempre visible en Netlify Function logs
    console.log('[SC] DIAGNÓSTICO formName=' + JSON.stringify(formName));
    console.log('[SC] DIAGNÓSTICO email detectado=' + JSON.stringify(data.email));
    console.log('[SC] DIAGNÓSTICO ruta detectada=' + JSON.stringify(data.ruta));
    console.log('[SC] DIAGNÓSTICO data keys=' + JSON.stringify(Object.keys(data)));
    console.log('[SC] DIAGNÓSTICO SMTP_HOST presente=' + (!!process.env.SMTP_HOST) + ' RESEND_API_KEY presente=' + (!!process.env.RESEND_API_KEY));

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

    // HubSpot sync — independiente del email: se ejecuta SIEMPRE para el formulario 'reserva'
    // independientemente del método de pago elegido por el cliente.
    let hubspotSynced = false;
    if (formName === 'reserva') {
      const metodoPago = data['metodo-pago'] || '';
      const estadoReserva = metodoPago === 'Tarjeta bancaria' ? 'reserva_iniciada' : 'pendiente_transferencia';
      console.log('[SC] reserva — sync HubSpot independiente | método:', metodoPago, '| estado:', estadoReserva);
      try { await syncToHubspot(formName, data, estadoReserva); } catch (e) { console.error('[HS] ✗ error inesperado en reserva:', e.message); }
      hubspotSynced = true;
    }

    if (config === 'SKIP_STRIPE') {
      // Solicitud de reserva con tarjeta, enviada ANTES de intentar el cobro (aún no hay
      // pago confirmado). No se envía nada al cliente aquí — eso lo hace send-booking-email
      // solo si el pago llega a completarse. Pero el equipo sí debe enterarse de que hay una
      // solicitud nueva pendiente de pago, incluso si el cliente nunca llega a pagar.
      console.log('[SC] reserva tarjeta (pago pendiente) — HubSpot sincronizado, enviando aviso interno');
      try {
        await sendInternalNotice(
          'Nueva solicitud de reserva (pago pendiente) — ' + (data.ruta || '—') + ' — ' + (data.nombre || '—'),
          buildInternalReservaHtml(data)
        );
      } catch (e) {
        console.error('[SC] ✗ error inesperado al enviar aviso interno:', e.message);
      }
      return ok('skipped: client email handled by send-booking-email, internal notice sent');
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

    // Envío: SMTP si está configurado (todos los formularios), Resend como fallback
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

    if (smtpHost && smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      console.log('[SC] → enviando via SMTP a:', toEmail, '| asunto:', config.subject, '| host:', smtpHost, 'puerto:', smtpPort, '| formulario:', formName);
      try {
        await transporter.sendMail({
          from: 'Easy Camino Santiago <info@easycaminosantiago.com>',
          to: toEmail,
          subject: config.subject,
          html,
        });
      } catch (err) {
        console.error('[SC] ✗ excepción SMTP:', err.message);
        return { statusCode: 500, body: 'smtp exception: ' + err.message };
      }

      console.log('[SC] ✓ email enviado OK via SMTP a', toEmail, '| formulario:', formName);
      if (!hubspotSynced) {
        try { await syncToHubspot(formName, data, null); } catch (e) { console.error('[HS] ✗ error inesperado:', e.message); }
      }
      return ok('sent');
    }

    // Fallback → Resend (solo si SMTP no está configurado)
    console.warn('[SC] SMTP no configurado — usando Resend como fallback para formulario:', formName);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[SC] ✗ RESEND_API_KEY no configurada — CORRÍGELO EN Site Settings > Env Vars');
      return ok('error: no smtp config and no resend api key');
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

    console.log('[SC] ✓ email enviado OK via Resend a', toEmail);
    if (!hubspotSynced) {
      try { await syncToHubspot(formName, data, null); } catch (e) { console.error('[HS] ✗ error inesperado:', e.message); }
    }
    return ok('sent');
  },
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

  // ── Descarga de folleto (EN) (folleto-en, folleto-sarria-en, folleto-portugues-en…) ─
  if (formName.startsWith('folleto') && formName.endsWith('-en')) {
    return {
      templateName: 'folleto',
      subject: 'Your Camino de Santiago itinerary — Easy Camino Santiago',
      heading: 'Your itinerary is on its way',
      intro: 'Thank you for your interest in the Camino de Santiago. We have received your itinerary request and will send it to you at this email address shortly.',
      tableRows: dataRows([
        ['Route', data.ruta],
        ['Phone', data.telefono],
      ]),
      responsePromise: 'Ready to take the next step? We can prepare a personalised, no-obligation quote for you.',
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
        <td colspan="2" style="background:#f0f8f8;padding:10px 20px;border-bottom:1px solid #d8e8e9;">
          <p style="margin:0;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#56A1A4;font-weight:700;font-family:Arial,sans-serif;">Tu solicitud</p>
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
<body style="margin:0;padding:0;background:#f2f6f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f6;padding:40px 16px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0"
    style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(45,74,82,0.09);">

    <!-- ACENTO SUPERIOR -->
    <tr>
      <td bgcolor="#56A1A4" style="background:#56A1A4;height:4px;font-size:0;line-height:0;padding:0;">&nbsp;</td>
    </tr>

    <!-- LOGO -->
    <tr>
      <td style="background:#ffffff;padding:40px 40px 32px;text-align:center;">
        <img src="https://easycaminosantiago.com/img/logo-ecs-email.png"
          alt="Easy Camino Santiago"
          width="200" height="200"
          style="display:block;margin:0 auto;width:200px;height:auto;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>

    <!-- TÍTULO -->
    <tr>
      <td style="padding:0 40px 36px;text-align:center;">
        <p style="margin:0 0 14px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#56A1A4;font-weight:700;font-family:Arial,sans-serif;">Easy Camino Santiago</p>
        <h1 style="margin:0;font-size:26px;font-weight:700;color:#2D4A52;line-height:1.35;font-family:Arial,sans-serif;">
          Hemos recibido<br>tu solicitud
        </h1>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr>
      <td style="padding:0 40px;">
        <div style="height:1px;background:#eef2f2;font-size:0;line-height:0;">&nbsp;</div>
      </td>
    </tr>

    <!-- INTRO -->
    <tr>
      <td style="padding:36px 40px 28px;">
        <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#2D4A52;font-family:Arial,sans-serif;">Hola, ${firstName}.</p>
        <p style="margin:0;font-size:15px;color:#4a5c5e;line-height:1.78;font-family:Arial,sans-serif;">
          Gracias por confiar en Easy Camino Santiago.<br>
          Ya estamos preparando tu propuesta personalizada para el Camino de Santiago.
        </p>
      </td>
    </tr>

    <!-- RESUMEN DE SOLICITUD -->
    <tr>
      <td style="padding:0 40px 32px;">
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
      <td style="padding:0 40px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-left:3px solid #56A1A4;padding:14px 20px;background:#f7fbfb;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:15px;color:#2D4A52;line-height:1.78;font-family:Arial,sans-serif;">
                Estamos revisando tu ruta, fechas y preferencias para prepararte una propuesta clara y personalizada.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA ENCUESTA -->
    <tr>
      <td style="padding:0 40px 36px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#edf7f7;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#56A1A4;font-weight:700;font-family:Arial,sans-serif;">Mientras preparamos tu propuesta</p>
              <p style="margin:0 0 22px;font-size:15px;color:#2D4A52;line-height:1.72;font-family:Arial,sans-serif;">
                Nos ayudaría mucho conocer un poco mejor tu experiencia en nuestra web. Solo son 7 preguntas rápidas.
              </p>
              <a href="${ctaUrl}"
                style="display:inline-block;background:#2D4A52;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:15px 30px;border-radius:30px;letter-spacing:0.4px;font-family:Arial,sans-serif;">
                Responder preguntas ahora
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- DIVIDER -->
    <tr>
      <td style="padding:0 40px;">
        <div style="height:1px;background:#eef2f2;font-size:0;line-height:0;">&nbsp;</div>
      </td>
    </tr>

    <!-- TRUST INDICATORS -->
    <tr>
      <td style="padding:28px 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td colspan="2" style="padding-bottom:16px;">
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
      <td style="padding:0 40px 40px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#8da4a6;line-height:1.70;font-family:Arial,sans-serif;">
          Normalmente respondemos en menos de 24 horas.<br>
          Si no recibes nuestra propuesta, revisa tu carpeta de <strong>spam</strong>.
        </p>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background:#f7fafa;border-top:1px solid #e4eced;padding:24px 40px;">
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
          Escríbenos por WhatsApp
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

// ---------------------------------------------------------------------------
// Aviso interno — nueva solicitud de reserva con tarjeta, pago aún pendiente
// (send-booking-email cubre el email al cliente cuando el pago se completa)
// ---------------------------------------------------------------------------

function buildInternalReservaHtml(data) {
  const pilgrimsLabel = [
    data.adultos && data.adultos !== '0' && data.adultos + ' adultos',
    data.ninos   && data.ninos   !== '0' && data.ninos   + ' niños',
  ].filter(Boolean).join(', ');

  const rows = [
    ['Cliente',          data.nombre],
    ['Email',            data.email],
    ['Teléfono',         data.telefono],
    ['Ruta',             data.ruta],
    ['Fecha inicio',     data['fecha-inicio']],
    ['Peregrinos',       pilgrimsLabel],
    ['Alojamiento',      data.alojamiento],
    ['Total reserva',    data.total],
    ['Depósito (20%)',   data.deposito],
    ['Referencia',       data.referencia],
  ].filter(([, v]) => v && String(v).trim());

  const rowsHtml = rows.map(([label, value]) => `
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#888;width:140px">${label}</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${value}</td></tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#2D4A52;border-bottom:2px solid #56A1A4;padding-bottom:8px">
        🕓 Nueva solicitud de reserva — pago pendiente
      </h2>
      <p style="font-size:13px;color:#888">El cliente ha confirmado sus datos y ha llegado al paso de pago con tarjeta, pero todavía no se ha cobrado nada. Si el pago se completa, recibirás otra notificación.</p>
      <table style="font-size:14px;border-collapse:collapse;width:100%">${rowsHtml}</table>
    </div>`;
}

// Envía un email interno (solo a info@easycaminosantiago.com), reutilizando el mismo
// fallback SMTP → Resend que usa el resto de esta función para los emails al cliente.
async function sendInternalNotice(subject, html) {
  const adminEmail = 'info@easycaminosantiago.com';

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

  if (smtpHost && smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    try {
      await transporter.sendMail({
        from: 'Easy Camino Santiago <info@easycaminosantiago.com>',
        to: adminEmail,
        subject,
        html,
      });
      console.log('[SC] ✓ aviso interno enviado via SMTP');
      return true;
    } catch (err) {
      console.error('[SC] ✗ excepción SMTP (aviso interno):', err.message);
      return false;
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[SC] ✗ no se pudo enviar aviso interno — sin SMTP ni RESEND_API_KEY configurados');
    return false;
  }
  try {
    const result = await resendPost(
      { from: 'Easy Camino Santiago <info@easycaminosantiago.com>', to: [adminEmail], subject, html },
      apiKey
    );
    if (result.status >= 400) {
      console.error('[SC] ✗ Resend rechazó el aviso interno — status:', result.status, JSON.stringify(result.body));
      return false;
    }
    console.log('[SC] ✓ aviso interno enviado via Resend');
    return true;
  } catch (err) {
    console.error('[SC] ✗ excepción Resend (aviso interno):', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// HubSpot CRM sync — crea o actualiza contacto + añade nota con detalles
// ---------------------------------------------------------------------------

async function syncToHubspot(formName, data, estadoReserva) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.warn('[HS] HUBSPOT_TOKEN no configurado — sync omitido');
    return;
  }

  const email = (data.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.log('[HS] email sin datos suficientes — sync omitido (formName=' + formName + ')');
    return;
  }

  // Formularios de tracking sin contacto real — omitir
  const skipForms = ['encuesta-open', 'encuesta-respuestas', 'llamada', 'presupuesto'];
  if (skipForms.includes(formName)) {
    console.log('[HS] formulario tracking — sync omitido:', formName);
    return;
  }

  // ── Construir nombre ──────────────────────────────────────────────────────
  let firstname = '';
  let lastname = '';
  if (formName === 'solicitud-info-en') {
    firstname = [data.titulo, data.nombre].filter(Boolean).join(' ').trim();
    lastname  = (data.apellido || '').trim();
  } else {
    const parts = (data.nombre || '').trim().split(/\s+/);
    firstname = parts[0] || '';
    lastname  = parts.slice(1).join(' ') || '';
  }

  // Limpia importes: elimina '€', espacios y puntos de miles (formato español "1.200 €" → 1200)
  const parseAmount = str => {
    if (!str) return undefined;
    const n = parseFloat(String(str).replace(/[€\s.]/g, '').replace(',', '.'));
    return isNaN(n) ? undefined : n;
  };
  const importeDeposito = parseAmount(data.deposito);
  const importeTotal    = parseAmount(data.total);

  // ── Propiedades del contacto ──────────────────────────────────────────────
  const properties = {
    email,
    ...(firstname              && { firstname }),
    ...(lastname               && { lastname }),
    ...(data.telefono          && { phone:              data.telefono }),
    lifecyclestage: 'lead',
    ...(estadoReserva          && { estado_reserva:      estadoReserva }),
    ...(data['metodo-pago']    && { metodo_pago_reserva: data['metodo-pago'] }),
    ...(importeDeposito !== undefined && { importe_deposito: importeDeposito }),
    ...(importeTotal    !== undefined && { importe_total:    importeTotal }),
    ...(data.ruta              && { ruta_reservada:      data.ruta }),
    ...(data.referencia        && { stripe_payment_id:   data.referencia }),
  };

  // ── Buscar contacto existente ─────────────────────────────────────────────
  let contactId;
  try {
    const search = await hubspotRequest('POST', '/crm/v3/objects/contacts/search', token, {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email'],
      limit: 1,
    });

    const existing = search.body && search.body.results && search.body.results[0];

    if (existing) {
      const upd = await hubspotRequest('PATCH', '/crm/v3/objects/contacts/' + existing.id, token, { properties });
      if (upd.status >= 400) {
        console.error('[HS] ✗ error HubSpot al actualizar — status:', upd.status, JSON.stringify(upd.body));
        return;
      }
      contactId = existing.id;
      console.log('[HS] ✓ contacto actualizado id:', contactId, '| email:', email, '| formulario:', formName);
    } else {
      const created = await hubspotRequest('POST', '/crm/v3/objects/contacts', token, { properties });
      if (created.status >= 400) {
        console.error('[HS] ✗ error HubSpot al crear — status:', created.status, JSON.stringify(created.body));
        return;
      }
      contactId = created.body.id;
      console.log('[HS] ✓ contacto creado id:', contactId, '| email:', email, '| formulario:', formName);
    }
  } catch (err) {
    console.error('[HS] ✗ error HubSpot (contacto):', err.message);
    return;
  }

  // ── Construir resumen del formulario (reutilizado en la nota y en el deal) ─
  const pilgrimsLabel = [
    data.adultos && data.adultos !== '0' && data.adultos + ' adultos',
    data.ninos   && data.ninos   !== '0' && data.ninos   + ' niños',
  ].filter(Boolean).join(', ');

  const noteLines = [
    'Formulario: ' + formName,
    'Idioma: '            + (formName.endsWith('-en') ? 'Inglés' : 'Español'),
    'Fuente: Web / Netlify Forms',
    estadoReserva        && 'Estado reserva: '    + estadoReserva,
    data['metodo-pago']  && 'Método de pago: '    + data['metodo-pago'],
    data.ruta            && 'Ruta: '              + data.ruta,
    data.alojamiento     && 'Alojamiento: '       + data.alojamiento,
    data.fecha           && 'Fecha aprox.: '      + data.fecha,
    data['fecha-inicio'] && 'Fecha inicio: '      + data['fecha-inicio'],
    data.personas        && 'Peregrinos: '        + data.personas,
    pilgrimsLabel        && 'Peregrinos: '        + pilgrimsLabel,
    data.localidad       && 'Localidad: '         + data.localidad,
    data.asunto          && 'Asunto: '            + data.asunto,
    data.mensaje         && 'Mensaje: '           + data.mensaje,
    data.observaciones   && 'Observaciones: '     + data.observaciones,
    data.total           && 'Total: '             + data.total + ' €',
    data.deposito        && 'Depósito: '          + data.deposito + ' €',
    data.referencia      && 'Referencia: '        + data.referencia,
  ].filter(Boolean).join('\n');

  // ── Crear Deal si el formulario tiene intención comercial ─────────────────
  console.log('[HS-DEAL-DEBUG] a punto de llamar a ensureDealForContact | formName:', formName, '| contactId:', contactId);
  try {
    await ensureDealForContact(token, contactId, formName, data, { firstname, lastname, importeTotal, noteLines });
  } catch (err) {
    console.error('[HS-DEAL] ✗ error inesperado:', err.message, '| stack:', err.stack);
  }

  if (!noteLines) return;

  try {
    const note = await hubspotRequest('POST', '/crm/v3/objects/notes', token, {
      properties: {
        hs_note_body: noteLines,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [{
        to:    { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
      }],
    });
    if (note.status >= 400) {
      console.error('[HS] ✗ error HubSpot (nota) — status:', note.status, JSON.stringify(note.body));
    } else {
      console.log('[HS] ✓ nota añadida al contacto', contactId);
    }
  } catch (err) {
    console.error('[HS] ✗ error HubSpot (nota):', err.message);
  }
}

// ---------------------------------------------------------------------------
// HubSpot Deals — creación automática para formularios con intención comercial
// ---------------------------------------------------------------------------

// Formularios que generan Deal. Formularios de bajo interés (folleto, contacto,
// newsletter, tracking) quedan fuera para no ensuciar el pipeline de ventas.
const DEAL_FORMS = ['solicitud-info', 'solicitud-info-en', 'reserva'];

let cachedPipelineInfo = null;
let cachedDealContactAssocTypeId = null;

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Descubre automáticamente el pipeline y la etapa "Nuevo lead" — evita hardcodear
// IDs internos de HubSpot, que son específicos de cada portal y pueden cambiar.
async function getDealPipelineStage(token) {
  if (cachedPipelineInfo) {
    console.log('[HS-DEAL-DEBUG] getDealPipelineStage — usando caché:', JSON.stringify(cachedPipelineInfo));
    return cachedPipelineInfo;
  }

  const res = await hubspotRequest('GET', '/crm/v3/pipelines/deals', token, null);
  console.log('[HS-DEAL-DEBUG] GET /crm/v3/pipelines/deals — status:', res.status, '| body:', JSON.stringify(res.body));
  if (res.status >= 400 || !res.body || !Array.isArray(res.body.results)) {
    console.error('[HS-DEAL] ✗ error al listar pipelines — status:', res.status, JSON.stringify(res.body));
    return null;
  }

  for (const pipeline of res.body.results) {
    const stage = (pipeline.stages || []).find(
      s => (s.label || '').trim().toLowerCase() === 'nuevo lead'
    );
    console.log('[HS-DEAL-DEBUG] pipeline revisado:', pipeline.id, '| stages:', JSON.stringify((pipeline.stages || []).map(s => s.label)), '| match "Nuevo lead":', !!stage);
    if (stage) {
      cachedPipelineInfo = {
        pipelineId: pipeline.id,
        stageId: stage.id,
        closedStageIds: (pipeline.stages || [])
          .filter(s => s.metadata && s.metadata.isClosed === 'true')
          .map(s => s.id),
      };
      console.log('[HS-DEAL-DEBUG] pipelineInfo resuelto:', JSON.stringify(cachedPipelineInfo));
      return cachedPipelineInfo;
    }
  }

  console.error('[HS-DEAL] ✗ ninguna etapa "Nuevo lead" encontrada en los pipelines de deals — revisa el nombre exacto en HubSpot');
  return null;
}

// Descubre el associationTypeId por defecto entre Deal y Contact (puede variar
// si el portal tiene labels personalizados). 3 = "Deal to Contact" HubSpot-defined,
// se usa solo como fallback si la API de labels no responde.
async function getDealContactAssociationTypeId(token) {
  if (cachedDealContactAssocTypeId) {
    console.log('[HS-DEAL-DEBUG] getDealContactAssociationTypeId — usando caché:', cachedDealContactAssocTypeId);
    return cachedDealContactAssocTypeId;
  }

  const res = await hubspotRequest('GET', '/crm/v4/associations/deals/contacts/labels', token, null);
  console.log('[HS-DEAL-DEBUG] GET /crm/v4/associations/deals/contacts/labels — status:', res.status, '| body:', JSON.stringify(res.body));
  const defined = res.body && Array.isArray(res.body.results)
    ? res.body.results.find(r => r.category === 'HUBSPOT_DEFINED')
    : null;

  cachedDealContactAssocTypeId = defined ? defined.typeId : 3;
  console.log('[HS-DEAL-DEBUG] assocTypeId resuelto:', cachedDealContactAssocTypeId, defined ? '(desde API)' : '(fallback hardcoded, la API no devolvió un default HUBSPOT_DEFINED)');
  return cachedDealContactAssocTypeId;
}

// Busca si el contacto ya tiene un deal abierto (etapa no cerrada). Si lo tiene,
// no se crea uno nuevo — evita duplicados cuando el mismo lead envía varios formularios.
async function findOpenDealIdForContact(token, contactId, closedStageIds) {
  const assoc = await hubspotRequest(
    'GET', '/crm/v3/objects/contacts/' + contactId + '/associations/deals', token, null
  );
  console.log('[HS-DEAL-DEBUG] GET associations/deals para contacto', contactId, '— status:', assoc.status, '| body:', JSON.stringify(assoc.body));
  const dealIds = (assoc.body && Array.isArray(assoc.body.results))
    ? assoc.body.results.map(r => r.id).filter(Boolean)
    : [];
  console.log('[HS-DEAL-DEBUG] dealIds ya asociados al contacto:', JSON.stringify(dealIds), '| closedStageIds:', JSON.stringify(closedStageIds));

  if (!dealIds.length) return null;

  for (const dealId of dealIds) {
    const deal = await hubspotRequest(
      'GET', '/crm/v3/objects/deals/' + dealId + '?properties=dealstage', token, null
    );
    const stageId = deal.body && deal.body.properties && deal.body.properties.dealstage;
    console.log('[HS-DEAL-DEBUG] deal', dealId, '— status:', deal.status, '| dealstage:', stageId, '| ¿cerrado?:', closedStageIds.includes(stageId));
    if (stageId && !closedStageIds.includes(stageId)) {
      return dealId;
    }
  }
  return null;
}

// Fecha del formulario en formato ISO (YYYY-MM-DD, tal como la entregan los
// <input type="date">) → "Month YYYY" en inglés, para el nombre del deal.
function formatMonthYear(dateStr) {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(String(dateStr || '').trim());
  if (!match) return '';
  const monthIdx = parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return '';
  return MONTH_NAMES_EN[monthIdx] + ' ' + match[1];
}

// Nombre significativo: "Nombre Apellido - Ruta - Mes Año"
// (usa el mismo firstname/lastname ya calculado para el Contacto — evita duplicar
// esa lógica — y omite los segmentos cuyo dato no vino en el formulario).
function buildDealName(formName, data, firstname, lastname) {
  const fullName = [firstname, lastname].filter(Boolean).join(' ').trim() || data.email || 'Sin nombre';
  const dateStr = formName === 'reserva' ? data['fecha-inicio'] : data.fecha;

  const parts = [fullName];
  if (data.ruta) parts.push(data.ruta);
  const monthYear = formatMonthYear(dateStr);
  if (monthYear) parts.push(monthYear);

  return parts.join(' - ');
}

async function ensureDealForContact(token, contactId, formName, data, dealContext) {
  console.log('[HS-DEAL-DEBUG] ▶ entrada ensureDealForContact | formName:', formName, '| contactId:', contactId, '| ¿en DEAL_FORMS?:', DEAL_FORMS.includes(formName));
  if (!DEAL_FORMS.includes(formName)) {
    console.log('[HS-DEAL-DEBUG] ✗ salida temprana — formulario no genera deal:', formName);
    return;
  }

  const { firstname, lastname, importeTotal, noteLines } = dealContext;

  const pipelineInfo = await getDealPipelineStage(token);
  if (!pipelineInfo) {
    console.error('[HS-DEAL] no se pudo resolver pipeline/etapa — creación de deal omitida');
    return;
  }

  const existingDealId = await findOpenDealIdForContact(token, contactId, pipelineInfo.closedStageIds);
  if (existingDealId) {
    console.log('[HS-DEAL] contacto ya tiene deal abierto — se omite creación | deal:', existingDealId, '| contacto:', contactId);
    return;
  }

  const assocTypeId = await getDealContactAssociationTypeId(token);

  // Todas propiedades nativas por defecto de Deals — ninguna se crea ni se
  // asume custom. Ruta, Fecha, Peregrinos, Alojamiento, Idioma y Fuente no
  // tienen propiedad nativa propia en Deals, así que se consolidan en
  // "description" (mismo resumen que la nota).
  const properties = {
    dealname: buildDealName(formName, data, firstname, lastname),
    pipeline: pipelineInfo.pipelineId,
    dealstage: pipelineInfo.stageId,
  };

  if (noteLines) {
    properties.description = noteLines;
  }

  if (formName === 'reserva' && importeTotal !== undefined) {
    properties.amount = importeTotal;
  }

  const dealPayload = {
    properties,
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assocTypeId }],
    }],
  };
  console.log('[HS-DEAL-DEBUG] payload a enviar a POST /crm/v3/objects/deals:', JSON.stringify(dealPayload));

  const created = await hubspotRequest('POST', '/crm/v3/objects/deals', token, dealPayload);
  console.log('[HS-DEAL-DEBUG] POST /crm/v3/objects/deals — status:', created.status, '| body completo:', JSON.stringify(created.body));

  if (created.status >= 400) {
    console.error('[HS-DEAL] ✗ error al crear deal — status:', created.status, JSON.stringify(created.body));
    return;
  }

  console.log('[HS-DEAL] ✓ deal creado id:', created.body.id, '| contacto:', contactId, '| formulario:', formName);
}
