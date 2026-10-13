/*
 * Adaptador de almacenamiento clave-valor para el panel /admin/.
 *
 * Backend REAL (producción): Netlify Blobs — incluido en Netlify, sin
 * coste ni contrato adicional, ver https://docs.netlify.com/blobs/overview/.
 * Se usa para: borradores del panel (draft-store.js) y contadores de
 * intentos de login (rate-limit.js).
 *
 * Backend LOCAL (desarrollo/pruebas de la Fase 2, en esta sesión): un
 * directorio en disco, bajo netlify/functions/.local-admin-data/ (fuera
 * del control de versiones, ver .gitignore). Se activa automáticamente
 * cuando @netlify/blobs no puede resolver un store real (fuera de
 * `netlify dev`/producción) — así todo el código de más arriba
 * (draft-store, rate-limit) es exactamente el mismo en local y en
 * producción; solo cambia dónde se guardan los bytes.
 */
const fs = require('fs');
const path = require('path');

const LOCAL_ROOT = path.join(__dirname, '.local-admin-data');

function localKeyToPath(namespace, key) {
  const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(LOCAL_ROOT, namespace, `${safeKey}.json`);
}

function localStore(namespace) {
  return {
    async get(key) {
      try {
        const raw = fs.readFileSync(localKeyToPath(namespace, key), 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    },
    // opts.onlyIfNew: escritura atómica "solo si no existe ya" — usada por
    // final-payment-store.js / el deduplicado de emails de saldo final.
    // AVISO: en el backend local (disco) esto es best-effort, no un mutex real
    // entre procesos — válido para desarrollo/pruebas, no para producción
    // (en producción se usa Netlify Blobs, que sí soporta onlyIfNew de forma
    // atómica en el propio servicio de almacenamiento — ver tryLoadBlobs más abajo).
    async set(key, value, opts) {
      const filePath = localKeyToPath(namespace, key);
      if (opts && opts.onlyIfNew && fs.existsSync(filePath)) {
        return { modified: false };
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
      return { modified: true };
    },
    async delete(key) {
      try {
        fs.unlinkSync(localKeyToPath(namespace, key));
      } catch (err) {
        /* noop */
      }
    },
    async list() {
      const dir = path.join(LOCAL_ROOT, namespace);
      try {
        return fs.readdirSync(dir).map((f) => f.replace(/\.json$/, ''));
      } catch (err) {
        return [];
      }
    },
  };
}

let blobsModule = null;
function tryLoadBlobs() {
  if (blobsModule !== null) return blobsModule;
  try {
    // require perezoso: si @netlify/blobs no está instalado o no hay
    // contexto de sitio Netlify real, caemos al store local sin más.
    blobsModule = require('@netlify/blobs');
  } catch (err) {
    blobsModule = false;
  }
  return blobsModule;
}

/**
 * ADMIN_FORCE_LOCAL_STORE=true fuerza el backend local aunque
 * @netlify/blobs esté instalado — es lo que usan las pruebas de esta
 * sesión, para no escribir nunca en el Blobs real del sitio en
 * producción mientras probamos en local.
 */
function getStore(namespace) {
  const forceLocal = process.env.ADMIN_FORCE_LOCAL_STORE === 'true';
  const blobs = !forceLocal && tryLoadBlobs();
  if (blobs) {
    try {
      const store = blobs.getStore(namespace);
      return {
        async get(key) {
          const raw = await store.get(key, { type: 'json' });
          return raw ?? null;
        },
        async set(key, value, opts) {
          // onlyIfNew: true → Netlify Blobs hace la comprobación-y-escritura de
          // forma atómica en el propio servicio (mutex real entre invocaciones
          // concurrentes, no solo dentro de un proceso).
          const result = await store.setJSON(key, value, opts && opts.onlyIfNew ? { onlyIfNew: true } : undefined);
          return result || { modified: true };
        },
        async delete(key) {
          await store.delete(key);
        },
        async list() {
          const { blobs: items } = await store.list();
          return items.map((b) => b.key);
        },
      };
    } catch (err) {
      console.warn('[kv-store] Netlify Blobs no disponible, usando almacenamiento local:', err.message);
      return localStore(namespace);
    }
  }
  return localStore(namespace);
}

module.exports = { getStore };
