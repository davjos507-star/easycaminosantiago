// Reservas con página de pago de SALDO FINAL activa.
//
// El importe aquí definido es SIEMPRE el que se cobra cuando create-payment-intent.js
// recibe metadata.tipo_pago === 'saldo' — el importe que mande el navegador se ignora
// por completo para ese tipo de pago. Una reserva no listada aquí no puede cobrarse
// como saldo final (falla cerrado: 400 "Reserva no reconocida").
//
// Añadir aquí cada nueva reserva de saldo final antes de publicar su página de pago.
const registry = {
  'ECS-NORTE-873922': {
    amountEUR: 1356,
    cliente:   'Pilar Rodríguez Gámez',
    ruta:      'Camino del Norte — Irún a Bilbao',
  },
  'ECS-SARRIA-GM2026': {
    amountEUR: 488,
    cliente:   'Gerardo Martínez Trejo',
    ruta:      'Camino Francés desde Sarria',
    // Saldo final cobrado y confirmado por Stripe (evento payment_intent.succeeded
    // con firma verificada, recibido por stripe-webhook el 24/10/2026 10:48:30 UTC).
    // El webhook no pudo guardarlo en el almacén (Netlify Blobs no disponible en
    // producción), así que la confirmación queda fijada aquí: bloquea en el
    // servidor cualquier nuevo cobro de saldo para esta reserva.
    saldoConfirmado: {
      reservaId:       'ECS-SARRIA-GM2026',
      paymentIntentId: 'pi_3UU2UwLdy1SiD5iF1CqW9Kbq',
      stripeEventId:   'evt_3UU2UwLdy1SiD5iF1ONwPDTF',
      amountEUR:       488,
      confirmedAt:     '2026-10-24T10:48:30.404Z',
    },
  },
};

// Reserva FICTICIA solo para pruebas locales (netlify dev / Stripe test mode) —
// nunca se escribe en este archivo ni se despliega. Se activa únicamente si
// TEST_FINAL_PAYMENT_RESERVA_ID está definida en el entorno (p. ej. en un .env
// local, nunca en la configuración real del sitio en Netlify). En producción
// esta variable no existe, así que el registro real de arriba queda intacto.
if (process.env.TEST_FINAL_PAYMENT_RESERVA_ID) {
  registry[process.env.TEST_FINAL_PAYMENT_RESERVA_ID] = {
    amountEUR: Number(process.env.TEST_FINAL_PAYMENT_AMOUNT_EUR) || 1,
    cliente:   'RESERVA DE PRUEBA — no es un cliente real',
    ruta:      'Prueba local',
  };
}

module.exports = registry;
