// Servidor de desarrollo: sirve ./public con las mismas cabeceras que producción (_headers)
// y simula la aplicación web de Apps Script en /macros/s/DEV/exec con un libro ficticio.
// Código de conexión de desarrollo: se imprime al arrancar.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConector } from '../test/mock-gas.mjs';
import { crearLibroFicticio } from '../test/hoja-ficticia.mjs';
import { cabecerasSeguridad as cabecerasProduccion } from './construir-worker.mjs';

const RAIZ = fileURLToPath(new URL('../public/', import.meta.url));
const PUERTO = Number(process.env.PORT || 8788);
const CLAVE = 'clave-desarrollo';
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

const gas = cargarConector(crearLibroFicticio(), { CB_CLAVE: CLAVE });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/macros/s/DEV/exec') {
    if (req.method !== 'POST') { res.writeHead(200).end('conector de desarrollo'); return; }
    let cuerpo = '';
    for await (const trozo of req) cuerpo += trozo;
    let salida;
    try { salida = gas.post(JSON.parse(cuerpo)); } catch (e) { salida = { ok: false, error: 'error', mensaje: String(e.message) }; }
    await new Promise((r) => setTimeout(r, Number(process.env.RETARDO || 250)));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(salida));
    return;
  }
  let ruta = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (ruta.endsWith('/')) ruta += 'index.html';
  try {
    const cuerpo = await readFile(join(RAIZ, ruta));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream', ...cabecerasProduccion() });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(PUERTO, () => {
  const codigo = 'CB1.' + Buffer.from(JSON.stringify({ u: `http://localhost:${PUERTO}/macros/s/DEV/exec`, k: CLAVE })).toString('base64url');
  console.log(`App:    http://localhost:${PUERTO}/`);
  console.log(`Código: ${codigo}`);
});
