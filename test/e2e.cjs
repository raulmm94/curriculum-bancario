// Prueba de extremo a extremo en un navegador real contra el servidor de desarrollo
// (`npm run dev`). Necesita Playwright instalado en el entorno:  node test/e2e.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8788';
const CODIGO = 'CB1.' + Buffer.from(JSON.stringify({ u: `${BASE}/macros/s/DEV/exec`, k: 'clave-desarrollo' })).toString('base64url');
const MALO = 'CB1.' + Buffer.from(JSON.stringify({ u: `${BASE}/macros/s/DEV/exec`, k: 'clave-incorrecta-0000' })).toString('base64url');
const salida = process.env.SALIDA || fs.mkdtempSync(path.join(os.tmpdir(), 'cb-e2e-'));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  const peticiones = new Set();
  page.on('request', (r) => peticiones.add(new URL(r.url()).origin));
  const paso = (t) => console.log('·', t);

  await page.goto(BASE);
  paso('sin código no se muestra ningún dato');
  assert.equal(await page.locator('.vista').count(), 0);
  assert.ok(!(await page.content()).includes('Demo García'));

  paso('código mal formado y clave incorrecta dan error claro');
  await page.fill('#codigo', 'hola');
  await page.click('button[type=submit]');
  await page.waitForSelector('.error');
  assert.match(await page.textContent('.error'), /formato esperado/);
  await page.fill('#codigo', MALO);
  await page.click('button[type=submit]');
  await page.waitForSelector('.error');
  assert.match(await page.textContent('.error'), /ya no es válido/);
  assert.equal(await page.locator('.vista').count(), 0);

  paso('conexión correcta sin «recordar»: nada en el almacenamiento del navegador');
  await page.fill('#codigo', CODIGO);
  await page.click('button[type=submit]');
  await page.waitForSelector('.vista-resumen');
  assert.match(await page.textContent('.heroe-valor'), /184\.856,39/);
  const almacen = await page.evaluate(() => ({ local: { ...localStorage }, sesion: { ...sessionStorage }, cookies: document.cookie }));
  assert.deepEqual(almacen, { local: {}, sesion: {}, cookies: '' });

  paso('navegación por las secciones');
  await page.click('.lateral a[href="#/patrimonio"]');
  await page.waitForSelector('.vista-patrimonio');
  assert.equal(await page.locator('.inmueble').count(), 3);
  assert.equal(await page.locator('.prestamo').count(), 2);
  await page.click('.lateral a[href="#/mensual"]');
  await page.waitForSelector('.vista-mensual svg');
  assert.ok(await page.locator('.grafico svg').count() >= 4);

  paso('rellenar un mes: edición, total en vivo, validación y guardado');
  await page.click('.subpestanas button:has-text("Rellenar mes")');
  await page.waitForSelector('.selector-mes select');
  await page.selectOption('.selector-mes select', '10'); // noviembre
  const nomina = page.locator('.edicion-fila:has(label:text-is("Nomina")) input');
  assert.equal(await nomina.inputValue(), '', 'el marcador 1 de la hoja se muestra como «sin dato»');
  await nomina.fill('3.000+105,50');
  assert.match(await page.textContent('.edicion.orden-1 .edicion-total strong'), /4\.725,50/);
  assert.match(await page.textContent('.barra-guardar'), /1 cambio sin guardar/);
  const super_ = page.locator('.edicion-fila:has(label:text-is("Supermercado y hogar")) input');
  await super_.fill('abc');
  assert.equal(await page.locator('.edicion-fila.invalida').count(), 1);
  await super_.fill('321,09');
  assert.match(await page.textContent('.barra-guardar'), /2 cambios sin guardar/);
  await page.locator('.edicion-fila:has(label:text-is("Cripto · BTC")) input').fill('2100');
  await page.click('.barra-guardar .primario');
  await page.waitForSelector('dialog[open]');
  assert.equal(await page.locator('.cambios li').count(), 3);
  assert.match(await page.textContent('.cambios'), /sin dato\s*→\s*3\.105,50/);
  await page.screenshot({ path: path.join(salida, 'dialogo-guardar.png') });
  await page.fill('#fecha-act', '2026-12-01');
  await page.click('dialog .primario');
  await page.waitForSelector('.toast');
  assert.match(await page.textContent('.toast'), /3 celdas guardadas/);
  assert.equal(await page.locator('.barra-guardar:visible').count(), 0);
  assert.equal(await nomina.inputValue(), '3.105,50');
  assert.match(await page.textContent('.mensual-titulo p'), /hasta noviembre.*1 de diciembre de 2026/);

  paso('tabla anual');
  await page.click('.subpestanas button:has-text("Tabla anual")');
  await page.waitForSelector('.tabla-anual');
  assert.equal(await page.locator('.tabla-anual').count(), 4);

  paso('informe A4: paginado, opciones y Excel');
  await page.click('.lateral a[href="#/informe"]');
  await page.waitForSelector('.hoja');
  const hojas = await page.locator('.hoja').count();
  assert.ok(hojas >= 1 && hojas <= 3, 'páginas: ' + hojas);
  const desbordes = await page.evaluate(() => [...document.querySelectorAll('.hoja-cuerpo')].map((c) => c.scrollHeight - c.clientHeight));
  assert.ok(desbordes.every((d) => d <= 1), 'ninguna hoja desborda: ' + desbordes);
  const cortes = await page.evaluate(() => [...document.querySelectorAll('.inf-tabla th, .inf-tabla td.num')].filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent));
  assert.deepEqual(cortes, [], 'ninguna celda del informe se corta');
  await page.fill('#inf-titular', 'Titular de Prueba');
  await page.waitForFunction(() => document.querySelector('.inf-titular')?.textContent === 'Titular de Prueba');
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Descargar Excel")')]);
  assert.match(descarga.suggestedFilename(), /^Curriculum-bancario-titular-de-prueba-2026-11-02\.xlsx$/);
  const rutaExcel = path.join(salida, descarga.suggestedFilename());
  await descarga.saveAs(rutaExcel);
  assert.ok(fs.statSync(rutaExcel).size > 5000);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(salida, 'informe.pdf'), pdf);
  const paginasPdf = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(paginasPdf, hojas, 'el PDF tiene exactamente las hojas del informe');
  await page.emulateMedia({ media: 'screen' });

  paso('desconectar borra el estado; «recordar» guarda solo el código');
  page.once('dialog', (d) => d.accept());
  await page.click('.lateral button[title="Desconectar"]');
  await page.waitForSelector('#codigo');
  assert.ok(!(await page.content()).includes('Demo García'));
  await page.fill('#codigo', CODIGO);
  await page.check('#recordar');
  await page.click('button[type=submit]');
  await page.waitForSelector('.vista-resumen');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ['cb.conexion']);
  await page.reload();
  await page.waitForSelector('.vista-resumen');
  await page.click('.lateral button[title="Desconectar"]');
  await page.waitForSelector('#codigo');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);

  paso('modo demo');
  await page.click('button:has-text("Ver una demo")');
  await page.waitForSelector('.banda-demo:visible');

  assert.deepEqual([...peticiones], [BASE], 'ninguna petición a terceros');
  assert.deepEqual(errores.filter((e) => !/401|Failed to load resource/.test(e)), [], 'sin errores de consola ni de CSP');
  await browser.close();
  console.log('OK · archivos en', salida);
})().catch((e) => { console.error(e); process.exit(1); });
