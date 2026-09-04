// Netlify Function: calcula una ruta PEATONAL real entre dos puntos usando
// OpenRouteService (perfil foot-walking), para "Llévame al alojamiento" en
// Easy Camino Companion (/companion/). MapLibre no calcula rutas por sí
// mismo: esta función es el único intermediario, y existe solo para que la
// API key de OpenRouteService no viaje nunca al navegador del peregrino
// (una key pública sería copiable y su cuota gratuita, agotable por
// cualquiera). No modifica ni depende de ninguna otra función del sitio.
//
// Por qué OpenRouteService: perfil peatonal real sobre datos OSM (sigue
// caminos y sendas, no solo carreteras — importante en el Camino), cuota
// gratuita de uso razonable para el volumen actual (2000 peticiones/día,
// 40/min), sin necesidad de tarjeta de crédito, uso comercial permitido en
// el nivel gratuito, y respuesta GeoJSON lista para pintar en MapLibre.
//
// Env var requerida:
//   ORS_API_KEY — clave gratuita de https://openrouteservice.org/dev/#/signup
//
// Si la variable no está configurada, la función responde 503 de forma
// controlada; el frontend (companion/js/accommodation/accommodation-nav.js)
// ya sabe mostrar "no se ha podido calcular la ruta a pie" sin romper nada.
//
// Endpoint: api.heigit.org (no api.openrouteservice.org).
// HeiGIT anunció la migración de "api.openrouteservice.org" a
// "api.heigit.org/openrouteservice" (mismo servicio, misma API key, solo
// cambia la URL): cuota del host antiguo reducida al 10% desde el
// 27/08/2026 y apagado total previsto el 28/09/2026. Ver
// https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912
// Confirmado en producción: con el host antiguo, la función devolvía 502
// (ORS rechazaba la petición por la cuota reducida) pese a tener una
// ORS_API_KEY válida configurada.

const https = require('https');

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function requestOpenRouteService(apiKey, coordinates) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ coordinates });
    const options = {
      hostname: 'api.heigit.org',
      path: '/openrouteservice/v2/directions/foot-walking/geojson',
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: null });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Método no permitido' });
  }

  // .trim(): variables de entorno pegadas desde el panel de Netlify a veces
  // arrastran un salto de línea o espacio final invisible, que convierte una
  // key por lo demás válida en una cadena distinta que el gateway rechaza.
  const rawApiKey = process.env.ORS_API_KEY;
  const apiKey = rawApiKey ? rawApiKey.trim() : rawApiKey;
  if (!apiKey) {
    console.error('[walking-route] ORS_API_KEY no configurada en el sitio');
    return jsonResponse(503, { error: 'Routing no configurado todavía' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return jsonResponse(400, { error: 'Cuerpo de la petición no válido' });
  }

  const fromLat = Number(payload && payload.fromLat);
  const fromLng = Number(payload && payload.fromLng);
  const toLat = Number(payload && payload.toLat);
  const toLng = Number(payload && payload.toLng);

  if (!isValidCoord(fromLat, fromLng) || !isValidCoord(toLat, toLng)) {
    return jsonResponse(400, { error: 'Coordenadas no válidas' });
  }

  try {
    const result = await requestOpenRouteService(apiKey, [[fromLng, fromLat], [toLng, toLat]]);

    if (result.status >= 400 || !result.body) {
      console.error('[walking-route] OpenRouteService rechazó la petición:', result.status, JSON.stringify(result.body));
      // upstreamStatus/upstreamError son diagnóstico seguro (nunca la key):
      // el estado y el mensaje de error que devuelve el proveedor de routing.
      return jsonResponse(502, {
        error: 'No se ha podido calcular la ruta a pie',
        upstreamStatus: result.status || null,
        upstreamError: result.body ? JSON.stringify(result.body).slice(0, 300) : null,
        // Diagnóstico seguro de la key (nunca su valor): solo para localizar
        // un espacio/salto de línea accidental en la variable de entorno.
        apiKeyLength: apiKey.length,
        apiKeyHadWhitespace: rawApiKey !== apiKey,
      });
    }

    const feature = result.body.features && result.body.features[0];
    const coordinates = feature && feature.geometry && feature.geometry.coordinates;
    const summary = feature && feature.properties && feature.properties.summary;

    if (!coordinates || coordinates.length < 2) {
      return jsonResponse(502, { error: 'Ruta a pie sin geometría' });
    }

    return jsonResponse(200, {
      coordinates,
      distanceMeters: summary ? summary.distance : null,
      durationSeconds: summary ? summary.duration : null,
    });
  } catch (err) {
    console.error('[walking-route] error:', err.message);
    return jsonResponse(502, { error: 'Error al calcular la ruta a pie', upstreamError: err.message });
  }
};
