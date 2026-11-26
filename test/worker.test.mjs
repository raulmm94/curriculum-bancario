import test from 'node:test';
import assert from 'node:assert/strict';
import { construir, cabecerasSeguridad } from '../tools/construir-worker.mjs';

construir();
const { default: worker } = await import('../dist/worker.js?' + Date.now());
const pedir = (ruta, init) => worker.fetch(new Request('https://app.example' + ruta, init));

test('sirve la app con sus tipos y las cabeceras de seguridad en todas las respuestas', async () => {
  const seguridad = cabecerasSeguridad();
  assert.match(seguridad['Content-Security-Policy'], /default-src 'none'/);
  for (const [ruta, tipo] of [['/', 'text/html'], ['/index.html', 'text/html'], ['/js/main.js', 'text/javascript'],
    ['/css/app.css', 'text/css'], ['/vendor/exceljs.min.js', 'text/javascript'], ['/iconos/icono-192.png', 'image/png'],
    ['/manifest.webmanifest', 'application/manifest+json']]) {
    const r = await pedir(ruta);
    assert.equal(r.status, 200, ruta);
    assert.ok(r.headers.get('content-type').startsWith(tipo), ruta);
    for (const [k, v] of Object.entries(seguridad)) assert.equal(r.headers.get(k), v, `${ruta} ${k}`);
    assert.ok((await r.arrayBuffer()).byteLength > 0);
  }
  const html = await (await pedir('/')).text();
  assert.match(html, /<title>Currículum bancario<\/title>/);
});

test('no expone nada fuera de public ni acepta escrituras', async () => {
  for (const ruta of ['/_headers', '/../apps-script/Code.gs', '/Code.gs', '/js/%2e%2e/%2e%2e/package.json', '/nada', '/js/', '/.gitignore', '/constructor', '/__proto__']) {
    const r = await pedir(ruta);
    assert.equal(r.status, 404, ruta);
    assert.ok(r.headers.get('content-security-policy'));
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await pedir('/', { method })).status, 405);
});

test('revalidación con ETag y peticiones HEAD', async () => {
  const r = await pedir('/js/main.js');
  const etag = r.headers.get('etag');
  assert.match(etag, /^"[0-9a-f]{20}"$/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const r304 = await pedir('/js/main.js', { headers: { 'If-None-Match': etag } });
  assert.equal(r304.status, 304);
  assert.equal(await r304.text(), '');
  const cabeza = await pedir('/js/main.js', { method: 'HEAD' });
  assert.equal(cabeza.status, 200);
  assert.equal(await cabeza.text(), '');
});

test('el script desplegado no contiene datos personales del libro real', async () => {
  const { readFileSync } = await import('node:fs');
  const codigo = readFileSync(new URL('../dist/worker.js', import.meta.url), 'utf8');
  const demo = Buffer.from(JSON.parse(codigo.match(/const ARCHIVOS = (\{.*\});/)[1])['/js/demo-datos.js'][2], 'base64').toString();
  assert.match(demo, /Alex Demo García/);
  assert.match(demo, /example\.com/);
});
