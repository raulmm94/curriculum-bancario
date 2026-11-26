import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImporte, eur, pct, fecha, celda, importeEditable } from '../public/js/formato.js';
import { construirModelo, construirMensual, claveCambio, esMarcador, mesesCerrados, claseGasto } from '../public/js/modelo.js';
import { datosInforme, nombreArchivo } from '../public/js/informe-datos.js';
import { cargarConector } from './mock-gas.mjs';
import { crearLibroFicticio } from './hoja-ficticia.mjs';

const payload = () => cargarConector(crearLibroFicticio(), { CB_CLAVE: 'k'.repeat(20) }).post({ k: 'k'.repeat(20), accion: 'leer' });
const nb = (s) => s.replace(/ /g, ' ');

test('parseImporte entiende formatos españoles, sumas y rechaza basura', () => {
  const casos = [
    ['1.234,56', 1234.56], ['1234,56', 1234.56], ['1234.56', 1234.56], ['1.234', 1234], ['12.5', 12.5],
    ['1.234.567', 1234567], ['1,234.56', 1234.56], ['950+600', 1550], ['2427,26+124,66', 2551.92],
    ['1 200 €', 1200], ['100-25,5', 74.5], ['-30', -30], ['0', 0], ['  ', null], ['', null],
  ];
  for (const [texto, esperado] of casos) assert.equal(parseImporte(texto), esperado, texto);
  for (const malo of ['abc', '=SUM(A1)', '1,2,3', '12..5', '5*3', '1e5', '+']) assert.ok(Number.isNaN(parseImporte(malo)), malo);
});

test('formato de importes, porcentajes, fechas y celdas', () => {
  assert.equal(nb(eur(4800)), '4.800,00 €');
  assert.equal(nb(eur(-1130.76)), '−1.130,76 €');
  assert.equal(nb(pct(0.2527)), '25,27 %');
  assert.equal(fecha('2026-11-02'), '02/11/2026');
  assert.equal(celda(['s', '#DIV/0!']), '—');
  assert.equal(celda(null), '—');
  assert.equal(nb(celda(['n', 60])), '60');
  assert.equal(importeEditable(9733.529562), '9.733,53');
  assert.equal(parseImporte(importeEditable(9733.529562)), 9733.53);
});

test('el modelo reconoce las columnas por su cabecera y calcula derivados', () => {
  const m = construirModelo(payload());
  assert.equal(m.inmuebles.items.length, 3);
  assert.deepEqual(m.inmuebles.items[0].direccion, ['s', 'Calle de la Demo 12, 3º B']);
  assert.deepEqual(m.inmuebles.items[0].cuota, ['e', 412.3]);
  assert.equal(m.inmuebles.items[0].extras.length, 0, 'todas las columnas conocidas quedan mapeadas');
  assert.equal(m.prestamos.items[0].cuotasPend[1], 34);
  assert.equal(m.titular, 'Alex Demo García');
  for (const k of ['ingresos', 'deudas', 'cashflow', 'patrimonioInmo', 'inversiones', 'patrimonioNeto', 'patrimonioBruto', 'ratio', 'ratioExtra']) {
    assert.ok(m.kpi[k], 'KPI ' + k);
  }
  assert.equal(m.otrosResumen.length, 0);
  assert.equal(m.derivados.deudaHipotecas, 117110.65);
  assert.equal(Math.round(m.derivados.deudaTotal * 100), 12858085);
  assert.ok(Math.abs(m.derivados.ltv - 117110.65 / 274000) < 1e-9);
  assert.deepEqual(m.enlaces.map((e) => Boolean(e.url)), [true, true, true, false, true, false]);
});

test('el modelo tolera columnas nuevas, desordenadas y enlaces peligrosos', () => {
  const p = payload();
  const t = p.datos.inmuebles;
  t.cabeceras.push('Año construcción');
  t.filas.forEach((f) => f.push(['n', 1998]));
  [t.cabeceras[0], t.cabeceras[1]] = [t.cabeceras[1], t.cabeceras[0]];
  t.filas.forEach((f) => { [f[0], f[1]] = [f[1], f[0]]; });
  p.datos.enlaces[0].url = 'javascript:alert(1)';
  const m = construirModelo(p);
  assert.deepEqual(m.inmuebles.items[0].tipologia, ['s', 'Vivienda']);
  assert.deepEqual(m.inmuebles.items[0].extras, [{ etiqueta: 'Año construcción', celda: ['n', 1998] }]);
  assert.equal(m.enlaces[0].url, null);
});

test('seguimiento mensual: marcadores, meses cerrados, acumulados y cambios pendientes', () => {
  assert.equal(esMarcador('valor', 1), true);
  assert.equal(esMarcador('valor', 2), true);
  assert.equal(esMarcador('valor', 0), false);
  assert.equal(esMarcador('flujo', 1), true);
  assert.equal(esMarcador('flujo', 2), false);
  assert.equal(mesesCerrados(2026, '2026-11-02'), 10);
  assert.equal(mesesCerrados(2026, '2027-01-03'), 12);
  assert.equal(mesesCerrados(2027, '2026-12-15'), 0);
  assert.equal(claseGasto('Inversion'), 'inversion');
  assert.equal(claseGasto('Prestamos'), 'deuda');
  assert.equal(claseGasto('Ocio'), 'consumo');

  const p = payload();
  const mm = construirMensual(p.rellenar);
  assert.equal(mm.cerrados, 10);
  assert.equal(mm.ingresos.filas[0].valores[10], null, 'marcador 1 en nómina de noviembre');
  assert.equal(mm.porId.bolsa.filas[4].valores[0], null, 'marcador 2 antes de tener el activo');
  assert.equal(mm.porId.bolsa.filas[0].mesUltimo, 10);
  const sumaCerrada = mm.mensual.slice(0, 10).reduce((a, x) => a + x.ingresos, 0);
  assert.ok(Math.abs(mm.acum.ingresos - sumaCerrada) < 0.01);
  assert.ok(Math.abs(mm.acum.consumo + mm.acum.deuda + mm.acum.inversion - mm.acum.gastos) < 0.01);

  const nomina = p.rellenar.tablas[1].filas[0];
  const pendientes = new Map([[claveCambio('ingresos', nomina.fila, 11), { valor: 3000 }]]);
  const con = construirMensual(p.rellenar, pendientes);
  assert.equal(con.ingresos.filas[0].valores[10], 3000);
  assert.equal(con.ingresos.filas[0].editado[10], true);
  assert.equal(con.mensual[10].ingresos - mm.mensual[10].ingresos, 3000);
});

test('contenido del informe y nombre de archivo', () => {
  const m = construirModelo(payload());
  const info = datosInforme(m, { titular: 'María José Ñandú', catastro: false });
  assert.deepEqual(info.tablas.map((t) => t.id), ['inmuebles', 'hipotecas', 'prestamos', 'inversiones']);
  for (const t of info.tablas) {
    assert.equal(t.cols.reduce((a, c) => a + c.span, 0), 12, 'rejilla de 12 columnas en ' + t.id);
    for (const f of [...t.filas, ...(t.pie ? [t.pie] : [])]) assert.equal(f.length, t.cols.length, t.id);
  }
  assert.equal(info.tablas[1].filas.length, 2, 'el garaje sin hipoteca no aparece en hipotecas');
  assert.ok(!info.tablas[0].cols.some((c) => /catastral/i.test(c.t)));
  assert.equal(info.enlaces.length, 4);
  assert.equal(nombreArchivo(info, 'xlsx'), 'Curriculum-bancario-maria-jose-nandu-2026-11-02.xlsx');
  assert.equal(datosInforme(m, {}).tablas[0].cols.reduce((a, c) => a + c.span, 0), 12);
});
