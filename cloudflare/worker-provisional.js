// Worker PROVISIONAL de Cloudflare.
//
// Sirve los archivos estáticos de ./public tal y como están en un commit concreto de este
// repositorio público (REF), con las mismas cabeceras de seguridad que public/_headers.
// No tiene estado, ni almacenamiento, ni ve ningún dato: la app habla directamente con el
// Apps Script del usuario desde el navegador.
//
// Existe solo para poder publicar sin credenciales de despliegue. En cuanto se conecte el
// repositorio en Cloudflare (Workers Builds) o se ejecute `npm run deploy`, el Worker pasa a
// ser el de wrangler.jsonc (assets estáticos subidos a Cloudflare) y este archivo sobra.
const REPO = 'raulmm94/curriculum-bancario';
const REF = '__REF__'; // SHA del commit publicado; se sustituye al desplegar

const TIPOS = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', json: 'application/json', txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json',
};
const SEGURIDAD = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; connect-src 'self' https://script.google.com https://script.googleusercontent.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const memoria = new Map(); // el contenido de un commit es inmutable: se puede guardar sin caducidad

function respuesta(cuerpo, estado, tipo, extra = {}) {
  return new Response(cuerpo, { status: estado, headers: { 'Content-Type': tipo, ...SEGURIDAD, ...extra } });
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respuesta('Método no permitido', 405, TIPOS.txt, { Allow: 'GET, HEAD' });
    }
    let ruta = new URL(request.url).pathname;
    if (ruta.endsWith('/')) ruta += 'index.html';
    const extension = ruta.slice(ruta.lastIndexOf('.') + 1).toLowerCase();
    if (!/^(\/[\w.-]+)+$/.test(ruta) || ruta.includes('..') || ruta.startsWith('/_') || !TIPOS[extension]) {
      return respuesta('No encontrado', 404, TIPOS.txt);
    }
    let archivo = memoria.get(ruta);
    if (!archivo) {
      const origen = await fetch(`https://raw.githubusercontent.com/${REPO}/${REF}/public${ruta}`, {
        cf: { cacheEverything: true, cacheTtl: 2592000 },
      });
      if (origen.status === 404) return respuesta('No encontrado', 404, TIPOS.txt);
      if (!origen.ok) return respuesta('No disponible temporalmente', 502, TIPOS.txt, { 'Retry-After': '30' });
      archivo = await origen.arrayBuffer();
      memoria.set(ruta, archivo);
    }
    const cache = extension === 'html' || extension === 'webmanifest' ? 'no-cache' : 'public, max-age=3600';
    return respuesta(request.method === 'HEAD' ? null : archivo, 200, TIPOS[extension], {
      'Cache-Control': cache, 'X-Version': REF.slice(0, 7),
    });
  },
};
