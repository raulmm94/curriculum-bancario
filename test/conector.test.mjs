import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarConector } from './mock-gas.mjs';
import { crearLibroFicticio } from './hoja-ficticia.mjs';

const CLAVE = 'clave-de-prueba-0123456789abcdef';
function entorno(opciones) {
  const libro = crearLibroFicticio(opciones);
  const gas = cargarConector(libro, { CB_CLAVE: CLAVE });
  return { libro, gas };
}

test('sin clave o con clave incorrecta no se devuelve ningún dato', () => {
  const { gas } = entorno();
  for (const k of [undefined, '', 'x', CLAVE.slice(0, -1) + 'X', CLAVE + 'x', 123, null]) {
    const r = gas.post({ k, accion: 'leer' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no_autorizado');
    assert.deepEqual(Object.keys(r).sort(), ['error', 'mensaje', 'ok']);
  }
  const sinClaveConfigurada = cargarConector(crearLibroFicticio(), {});
  assert.equal(sinClaveConfigurada.post({ k: '', accion: 'leer' }).ok, false);
  assert.equal(sinClaveConfigurada.post({ accion: 'leer' }).ok, false);
});

test('doGet no expone datos', () => {
  const { gas } = entorno();
  const texto = gas.contexto.doGet().getContent();
  assert.match(texto, /conector activo/);
  assert.doesNotMatch(texto, /Demo|Banco/);
});

test('leer devuelve la hoja DATOS estructurada', () => {
  const { gas } = entorno();
  const r = gas.post({ k: CLAVE, accion: 'leer' });
  assert.equal(r.ok, true);
  const d = r.datos;
  assert.equal(d.actualizado, '2026-11-02');
  assert.equal(d.inmuebles.cabeceras.length, 20);
  assert.equal(d.inmuebles.filas.length, 3);
  assert.deepEqual(d.inmuebles.filas[0][0], ['s', 'Vivienda']);
  assert.deepEqual(d.inmuebles.filas[0][5], ['e', 95000]);
  assert.equal(d.inmuebles.filas[0][7][0], 'p');
  assert.deepEqual(d.inmuebles.filas[0][9], ['f', '2022-03-15']);
  assert.equal(d.inmuebles.filas[0][15][0], 'e', 'el formato contable con "€" se detecta como euros');
  assert.equal(d.inmuebles.filas[2][4], null, 'inmueble sin hipoteca');
  assert.ok(d.inmuebles.total, 'fila de totales de inmuebles');
  assert.deepEqual(d.inmuebles.total[0], ['n', 3]);
  assert.equal(d.prestamos.filas.length, 2);
  assert.deepEqual(d.prestamos.total[0], ['s', 'TOTAL']);
  assert.equal(d.trabajo.filas.length, 9);
  assert.deepEqual(d.trabajo.filas[1], [['s', 'Empresa'], ['s', 'Ejemplo Tecnología S.L.']]);
  assert.equal(d.inversiones.filas.length, 5);
  assert.equal(d.inversiones.total[0], null);
  assert.equal(d.resumen.length, 9);
  assert.equal(d.resumen[0].etiqueta, 'Total ingresos mensuales');
  assert.equal(d.resumen[0].valor[0], 'e');
  assert.equal(d.resumen[3].extra[0], 'p');
  assert.equal(d.resumen[7].valor[0], 'p');
  assert.equal(d.resumen[7].extra, null);
  assert.equal(d.enlaces.length, 6);
  assert.equal(d.enlaces[0].url, 'https://example.com/demo/recibos-prestamos');
  assert.equal(d.enlaces[2].url, 'https://example.com/demo/renta', 'enlace insertado en la celda');
  assert.equal(d.enlaces[3].url, null);
});

test('leer devuelve las tablas de Rellenar AAAA', () => {
  const { gas } = entorno();
  const r = gas.post({ k: CLAVE, accion: 'leer' });
  assert.deepEqual(r.anios, [2026]);
  const R = r.rellenar;
  assert.equal(R.anio, 2026);
  assert.equal(R.actualizado, '2026-11-02');
  assert.deepEqual(R.tablas.map((t) => [t.id, t.tipo, t.filas.length]), [
    ['gastos', 'flujo', 14], ['ingresos', 'flujo', 3], ['bolsa', 'valor', 5], ['inmobiliario', 'valor', 3],
  ]);
  const nomina = R.tablas[1].filas[0];
  assert.equal(nomina.concepto, 'Nomina');
  assert.equal(nomina.meses.length, 12);
  assert.equal(nomina.meses[11], 1, 'marcador de mes sin rellenar');
  assert.equal(R.tablas[1].filas[1].fx[10], '=950+600+70');
  assert.equal(R.tablas[0].total.tipologia, 'Total');
  assert.equal(R.tablas[2].filas[4].meses[0], 2, 'marcador de mes sin dato');
  assert.ok(!('_colMes' in R.tablas[0]));
});

test('guardar escribe solo las celdas pedidas y actualiza la fecha', () => {
  const { gas, libro } = entorno();
  const antes = gas.post({ k: CLAVE, accion: 'leer' }).rellenar;
  const hoja = libro.getSheetByName('Rellenar 2026');
  const nomina = antes.tablas[1].filas[0];
  const btc = antes.tablas[2].filas[4];
  const r = gas.post({
    k: CLAVE, accion: 'guardar', anio: 2026, fecha: '2026-12-01', fechaRellenar: true, fechaDatos: false,
    cambios: [
      { tabla: 'ingresos', fila: nomina.fila, categoria: nomina.categoria, concepto: nomina.concepto, mes: 11, valor: 3105.456 },
      { tabla: 'bolsa', fila: btc.fila, categoria: btc.categoria, concepto: btc.concepto, mes: 12, valor: 2000 },
      { tabla: 'gastos', fila: antes.tablas[0].filas[1].fila, categoria: 'Vivir', concepto: 'Supermercado y hogar', mes: 11, valor: null },
    ],
  });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.guardados, 3);
  assert.equal(r.rellenar.tablas[1].filas[0].meses[10], 3105.46);
  assert.equal(r.rellenar.tablas[2].filas[4].meses[11], 2000);
  assert.equal(r.rellenar.tablas[0].filas[1].meses[10], null);
  assert.equal(r.rellenar.actualizado, '2026-12-01');
  assert.equal(r.datos.actualizado, '2026-11-02', 'la fecha de DATOS no se toca si no se pide');
  assert.equal(hoja.escrituras.length, 4);
  assert.equal(libro.getSheetByName('DATOS').escrituras.length, 0);
});

test('guardar localiza la fila aunque la hoja haya cambiado y valida antes de escribir', () => {
  const { gas, libro } = entorno();
  const hoja = libro.getSheetByName('Rellenar 2026');
  const base = { k: CLAVE, accion: 'guardar', anio: 2026 };
  // Número de fila desfasado: se localiza por categoría + concepto.
  let r = gas.post({ ...base, cambios: [{ tabla: 'ingresos', fila: 999, categoria: 'Ingresos', concepto: 'nomina', mes: 3, valor: 10 }] });
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.rellenar.tablas[1].filas[0].meses[2], 10);
  const n = hoja.escrituras.length;
  // Un cambio inválido impide escribir cualquiera de los demás.
  for (const malo of [
    { tabla: 'ingresos', fila: 1, categoria: 'Ingresos', concepto: 'No existe', mes: 3, valor: 1 },
    { tabla: 'nada', fila: 1, categoria: 'Ingresos', concepto: 'Nomina', mes: 3, valor: 1 },
    { tabla: 'ingresos', fila: 1, categoria: 'Ingresos', concepto: 'Nomina', mes: 13, valor: 1 },
    { tabla: 'ingresos', fila: 1, categoria: 'Ingresos', concepto: 'Nomina', mes: 3, valor: '=IMPORTRANGE("x")' },
  ]) {
    r = gas.post({ ...base, cambios: [{ tabla: 'ingresos', fila: 999, categoria: 'Ingresos', concepto: 'Nomina', mes: 4, valor: 5 }, malo] });
    assert.equal(r.ok, false);
    assert.equal(hoja.escrituras.length, n);
  }
  r = gas.post({ ...base, anio: 1999, cambios: [] });
  assert.equal(r.ok, false);
});

test('las fechas respetan la zona horaria de la hoja', () => {
  const { gas } = entorno({ tz: 'America/Los_Angeles' });
  let r = gas.post({ k: CLAVE, accion: 'leer' });
  assert.equal(r.datos.actualizado, '2026-11-02');
  assert.deepEqual(r.datos.prestamos.filas[0][5], ['f', '2024-09-10']);
  r = gas.post({ k: CLAVE, accion: 'guardar', anio: 2026, cambios: [], fecha: '2026-12-01', fechaRellenar: true, fechaDatos: true });
  assert.equal(r.rellenar.actualizado, '2026-12-01');
  assert.equal(r.datos.actualizado, '2026-12-01');
});

test('el menú genera una clave larga, la conserva y permite regenerarla', () => {
  const libro = crearLibroFicticio();
  const gas = cargarConector(libro, {});
  gas.contexto.onOpen();
  gas.contexto.cbMostrarCodigo();
  const clave = gas.props.CB_CLAVE;
  assert.match(clave, /^[0-9a-f]{64}$/);
  assert.ok(gas.ui.dialogos[0].html.includes(clave));
  assert.equal(gas.post({ k: clave, accion: 'ping' }).ok, true);
  gas.contexto.cbMostrarCodigo();
  assert.equal(gas.props.CB_CLAVE, clave, 'mostrar el código no cambia la clave');
  gas.contexto.cbRegenerarClave();
  assert.notEqual(gas.props.CB_CLAVE, clave);
  assert.equal(gas.post({ k: clave, accion: 'ping' }).ok, false, 'la clave anterior queda revocada');
  assert.throws(() => gas.contexto.cbGuardarUrl('https://evil.example/macros/s/x/exec'));
  assert.equal(gas.contexto.cbGuardarUrl(' https://script.google.com/macros/s/AKfy-cb_123/exec '), 'https://script.google.com/macros/s/AKfy-cb_123/exec');
});
