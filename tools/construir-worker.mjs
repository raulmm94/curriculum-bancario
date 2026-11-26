// Genera dist/worker.js: un Worker de Cloudflare autocontenido que sirve los archivos de ./public
// con las cabeceras de seguridad de public/_headers. No tiene bindings, almacenamiento ni estado.
//
// Se empaquetan los archivos dentro del script (en vez de usar «static assets») para que el
// despliegue sea una única subida autenticada con un token de API normal, que funciona igual
// desde Workers Builds, desde un ordenador y desde sesiones en la nube.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../public/', import.meta.url));
const SALIDA = fileURLToPath(new URL('../dist/', import.meta.url));
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function cabecerasSeguridad() {
  const out = {};
  let activa = false;
  for (const linea of readFileSync(join(RAIZ, '_headers'), 'utf8').split('\n')) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    if (!/^\s/.test(linea)) { activa = linea.trim() === '/*'; continue; }
    if (!activa) continue;
    const i = linea.indexOf(':');
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  return out;
}

function recorrer(dir, prefijo = '') {
  const out = [];
  for (const nombre of readdirSync(dir).sort()) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...recorrer(ruta, `${prefijo}/${nombre}`));
    else if (!nombre.startsWith('_') && !nombre.startsWith('.')) out.push([`${prefijo}/${nombre}`, ruta]);
  }
  return out;
}

export function construir() {
  const archivos = {};
  let total = 0;
  for (const [url, ruta] of recorrer(RAIZ)) {
    const tipo = TIPOS[extname(ruta).toLowerCase()];
    if (!tipo) throw new Error(`Tipo de archivo sin declarar: ${url}`);
    const datos = readFileSync(ruta);
    total += datos.length;
    archivos[url] = [tipo, `"${createHash('sha256').update(datos).digest('hex').slice(0, 20)}"`, datos.toString('base64')];
  }
  const codigo = `// GENERADO por tools/construir-worker.mjs a partir de ./public — no editar.
const SEGURIDAD = ${JSON.stringify(cabecerasSeguridad(), null, 2)};
const ARCHIVOS = ${JSON.stringify(archivos)};
const decodificados = new Map();

function cuerpo(ruta) {
  let bytes = decodificados.get(ruta);
  if (!bytes) {
    bytes = Uint8Array.from(atob(ARCHIVOS[ruta][2]), (c) => c.charCodeAt(0));
    decodificados.set(ruta, bytes);
  }
  return bytes;
}

function respuesta(contenido, estado, cabeceras) {
  return new Response(contenido, { status: estado, headers: { ...SEGURIDAD, ...cabeceras } });
}

export default {
  fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respuesta('Método no permitido', 405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    }
    let ruta = new URL(request.url).pathname;
    if (ruta.endsWith('/')) ruta += 'index.html';
    if (!Object.hasOwn(ARCHIVOS, ruta)) {
      return respuesta('No encontrado', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const [tipo, etag] = ARCHIVOS[ruta];
    // «no-cache» + ETag: el navegador revalida siempre, así tras un despliegue nunca mezcla versiones.
    const cabeceras = { 'Content-Type': tipo, ETag: etag, 'Cache-Control': 'no-cache' };
    if (request.headers.get('If-None-Match') === etag) return respuesta(null, 304, cabeceras);
    return respuesta(request.method === 'HEAD' ? null : cuerpo(ruta), 200, cabeceras);
  },
};
`;
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, 'worker.js'), codigo);
  return { archivos: Object.keys(archivos).length, bytes: total, script: codigo.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = construir();
  console.log(`dist/worker.js: ${r.archivos} archivos, ${(r.bytes / 1024).toFixed(0)} KiB de contenido, ${(r.script / 1024).toFixed(0)} KiB de script`);
}
