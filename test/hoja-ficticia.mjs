// Libro de cálculo FICTICIO con la misma disposición que el «Cuadro financiero» real
// (hojas DATOS y Rellenar AAAA). Todos los nombres, direcciones e importes son inventados.
// Sirve para los tests, el servidor de desarrollo y el modo demo de la app.
import { Libro, fechaHoja } from './mock-gas.mjs';

const EUR = '#,##0.00\\ [$€-1]';
const EUR_CONTABLE = '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@';
const PCT = '0.00%';
const FECHA = 'dd/mm/yyyy';
const NUM = '0.00';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function col(n) { // 1 → A
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const r2 = (x) => Math.round(x * 100) / 100;

function azar(semilla) { // generador determinista
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearLibroFicticio({ anio = 2026, mesActualizado = 11, tz = 'Europe/Madrid' } = {}) {
  const libro = new Libro('Cuadro financiero (demo)', tz);
  const rnd = azar(20260101);
  const f = (iso) => fechaHoja(iso, tz);
  const actualizado = `${anio}-${String(mesActualizado).padStart(2, '0')}-02`;
  const cerrados = mesActualizado - 1; // meses de gastos/ingresos ya rellenados

  /* ---------------- Rellenar AAAA ---------------- */
  const R = libro.nueva(`Rellenar ${anio}`);
  R.pon('R2', 'Datos actualizados').pon('S2', f(actualizado), { nf: FECHA });

  function cabecera(fila, resumen, sufijo) {
    const nombres = ['Tipologia', 'Categoria', 'Concepto', resumen];
    MESES.forEach((m) => { nombres.push(m); nombres.push(sufijo(m)); });
    nombres.push('Total Año2');
    nombres.forEach((n, i) => R.pon(col(2 + i) + fila, n));
  }
  const colMes = (m) => col(6 + 2 * m); // m: 0..11 → F, H, J…

  function tablaFlujo(filaCab, tipologia, filas) {
    cabecera(filaCab, 'Total Año', (m) => '% ' + m);
    const totales = new Array(12).fill(0);
    filas.forEach((def, i) => {
      const fila = filaCab + 1 + i;
      R.pon('B' + fila, tipologia).pon('C' + fila, def.categoria).pon('D' + fila, def.concepto);
      let suma = 0;
      for (let m = 0; m < 12; m++) {
        let v;
        let extra = { nf: EUR_CONTABLE };
        if (m < cerrados) v = def.valor(m);
        else if (def.prevision !== undefined) v = def.prevision;
        else v = 0;
        if (def.formula && def.formula[m]) { v = def.formula[m].v; extra = { ...extra, f: def.formula[m].f }; }
        v = r2(v);
        R.pon(colMes(m) + fila, v, extra);
        R.pon(col(7 + 2 * m) + fila, 0, { nf: '0%', f: '=X/X$1' });
        suma += v; totales[m] += v;
      }
      R.pon('E' + fila, r2(suma), { nf: EUR_CONTABLE, f: '=AD' + fila });
      R.pon('AD' + fila, r2(suma), { nf: EUR_CONTABLE, f: `=SUM(F${fila}:AB${fila})` });
    });
    const filaTotal = filaCab + 1 + filas.length;
    R.pon('B' + filaTotal, 'Total');
    totales.forEach((t, m) => R.pon(colMes(m) + filaTotal, r2(t), { nf: EUR_CONTABLE, f: '=SUM(…)' }));
    const anual = r2(totales.reduce((a, b) => a + b, 0));
    R.pon('E' + filaTotal, anual, { nf: EUR_CONTABLE, f: '=AD' + filaTotal });
    R.pon('AD' + filaTotal, anual, { nf: EUR_CONTABLE, f: '=SUM(…)' });
    return { filaTotal, totales };
  }

  const vario = (base, amplitud) => () => Math.max(0, base + (rnd() - 0.5) * 2 * amplitud);
  const aVeces = (prob, base, amplitud) => () => (rnd() < prob ? base + (rnd() - 0.5) * 2 * amplitud : 0);
  const fijo = (x) => () => x;

  const gastos = tablaFlujo(4, 'Gastos', [
    { categoria: 'Ahorro', concepto: 'Ahorro/Liquidez', valor: aVeces(0.6, 150, 40) },
    { categoria: 'Vivir', concepto: 'Supermercado y hogar', valor: vario(340, 90) },
    { categoria: 'Facturas y servicios', concepto: 'Alquiler y suministros', valor: vario(720, 25), prevision: 700 },
    { categoria: 'Gasto', concepto: 'Imprevistos y suscripciones', valor: vario(70, 60) },
    { categoria: 'Ocio', concepto: 'Ocio y viajes', valor: vario(230, 200) },
    { categoria: 'Compras', concepto: 'Ropa, hogar y regalos', valor: aVeces(0.7, 140, 110) },
    { categoria: 'Salud', concepto: 'Salud y deporte', valor: vario(95, 45) },
    { categoria: 'Transporte', concepto: 'Transporte y vehículo', valor: vario(110, 70) },
    { categoria: 'Prestamos', concepto: 'Personales', valor: fijo(338.45), prevision: 338.45 },
    { categoria: 'Prestamos', concepto: 'Hipotecas', valor: fijo(648.75), prevision: 648.75 },
    { categoria: 'Inversion', concepto: 'Plan de pensiones', valor: aVeces(0.8, 125, 0) },
    { categoria: 'Inversion', concepto: 'Fondos indexados', valor: aVeces(0.7, 300, 100) },
    { categoria: 'Inversion', concepto: 'Acciones y ETF', valor: aVeces(0.4, 400, 250) },
    { categoria: 'Inversion', concepto: 'Cripto', valor: aVeces(0.3, 100, 60) },
  ]);

  const filaIngresos = gastos.filaTotal + 3;
  const formulaAlquiler = {};
  formulaAlquiler[cerrados] = { v: 1620, f: '=950+600+70' }; // previsión escrita como fórmula
  const ingresos = tablaFlujo(filaIngresos, 'Ingresos', [
    {
      categoria: 'Ingresos', concepto: 'Nomina', prevision: 1,
      valor: (m) => (m === 5 ? 4650 : 3100) + (rnd() - 0.5) * 60,
    },
    { categoria: 'Ingresos', concepto: 'Alquileres', valor: (m) => (m < 2 ? 1550 : 1620), formula: formulaAlquiler },
    { categoria: 'Ingresos', concepto: 'Otros', valor: aVeces(0.5, 60, 50) },
  ]);

  const filaSobrante = ingresos.filaTotal + 2;
  R.pon('B' + filaSobrante, 'Sobrante');
  for (let m = 0; m < 12; m++) {
    R.pon(colMes(m) + filaSobrante, r2(ingresos.totales[m] - gastos.totales[m]), { nf: EUR_CONTABLE, f: '=F1-F2' });
  }

  // Tablas de valores: el mes siguiente al último rellenado lleva un 1 (marcador de la hoja),
  // y los meses sin dato anteriores a la primera aportación llevan un 2.
  function tablaValor(filaCab, tipologia, filas) {
    cabecera(filaCab, 'Ultimo Valor', (m) => 'Variacion ' + m.slice(0, 3));
    const totales = new Array(12).fill(0);
    const ultimos = [];
    filas.forEach((def, i) => {
      const fila = filaCab + 1 + i;
      R.pon('B' + fila, tipologia).pon('C' + fila, def.categoria).pon('D' + fila, def.concepto);
      let valor = def.inicial;
      let ultimo = null;
      for (let m = 0; m < 12; m++) {
        let v;
        if (m >= mesActualizado) v = 1;
        else if (m < (def.desde || 0)) v = 2;
        else {
          valor = Math.max(0, valor * (1 + (rnd() - 0.45) * def.volatilidad) + (def.aporte || 0));
          v = r2(valor);
          ultimo = v;
        }
        R.pon(colMes(m) + fila, v, { nf: EUR_CONTABLE });
        R.pon(col(7 + 2 * m) + fila, 0, { nf: '0%', f: '=(H1-F1)/H1' });
        totales[m] += v;
      }
      ultimos.push(ultimo);
      R.pon('E' + fila, ultimo, { nf: EUR_CONTABLE, f: '=INDEX(…)' });
      R.pon('AD' + fila, ultimo, { nf: EUR_CONTABLE, f: '=E' + fila });
    });
    const filaTotal = filaCab + 1 + filas.length;
    R.pon('B' + filaTotal, 'Total');
    totales.forEach((t, m) => R.pon(colMes(m) + filaTotal, r2(t), { nf: EUR_CONTABLE, f: '=SUM(…)' }));
    R.pon('E' + filaTotal, r2(ultimos.reduce((a, b) => a + (b || 0), 0)), { nf: EUR_CONTABLE, f: '=SUM(…)' });
    return { filaTotal, ultimos };
  }

  const bolsaDef = [
    { categoria: 'Bróker Alfa', concepto: 'Acciones', inicial: 4800, volatilidad: 0.12, aporte: 120 },
    { categoria: 'Bróker Beta', concepto: 'ETF', inicial: 2600, volatilidad: 0.07, aporte: 50 },
    { categoria: 'Gestora Demo', concepto: 'Fondos indexados', inicial: 8200, volatilidad: 0.05, aporte: 300 },
    { categoria: 'Gestora Demo', concepto: 'Plan de pensiones', inicial: 3000, volatilidad: 0.03, aporte: 125 },
    { categoria: 'Cripto', concepto: 'BTC', inicial: 1500, volatilidad: 0.25, desde: 6 },
  ];
  const bolsa = tablaValor(filaSobrante + 4, 'Financieras', bolsaDef);

  const inmoDef = [
    { categoria: 'Pisos', concepto: 'Calle de la Demo 12, 3º B', inicial: 168000, volatilidad: 0 },
    { categoria: 'Local', concepto: 'Avenida Ejemplo 45, bajo', inicial: 92000, volatilidad: 0, desde: 4 },
    { categoria: 'Garaje', concepto: 'Calle de la Demo 12, plaza 7', inicial: 14000, volatilidad: 0, desde: 4 },
  ];
  const inmo = tablaValor(bolsa.filaTotal + 4, 'Inmobiliario', inmoDef);

  /* ---------------- DATOS ---------------- */
  const D = libro.nueva('DATOS');
  // Para que el orden de pestañas sea como en el libro real (DATOS primero).
  libro.hojas.reverse();

  D.pon('B2', 'DATOS ACTUALIZADOS').pon('D2', f(actualizado), { nf: FECHA });
  D.pon('B4', 'Inmuebles').pon('F4', 'Hipoteca').pon('Q4', 'Valores');
  ['Tipología', 'Dirección', 'Metros', 'Ref. Catastral', 'Banco', 'Imp. inicial', 'Imp. pendiente',
    '% Pagado', '% Pendiente', 'Fecha inicio', 'Fecha fin ', 'Años pend.', 'Tipo', 'Interés',
    'Cuota mensual', 'Valor mercado (tasación online)', 'Valor neto (sin hipoteca)',
    'Ingreso alquiler mensual', 'Cashflow mensual (sin hipoteca)', 'Ratio cobertura de deuda',
  ].forEach((n, i) => D.pon(col(2 + i) + 5, n));

  const hoy = f(actualizado).getTime();
  const anios = (iso) => r2((f(iso).getTime() - hoy) / 86400000 / 365);
  const inmuebles = [
    { tip: 'Vivienda', dir: inmoDef[0].concepto, m2: 78, ref: '0000001AA0000A0001AA', banco: 'Banco Norte',
      ini: 95000, pend: 81240.55, inicio: '2022-03-15', fin: '2047-03-15', tipo: 'Mixta', interes: 0.0245,
      cuota: 412.3, valor: inmo.ultimos[0], alquiler: 950 },
    { tip: 'Local', dir: 'Avenida Ejemplo 45, bajo 2', m2: 54, ref: '0000002BB0000B0002BB', banco: 'Banco Norte',
      ini: 42000, pend: 35870.1, inicio: '2023-06-01', fin: '2043-06-01', tipo: 'Fijo', interes: 0.031,
      cuota: 236.45, valor: inmo.ultimos[1], alquiler: 600 },
    { tip: 'Garaje', dir: inmoDef[2].concepto, m2: 12, ref: '0000003CC0000C0003CC', banco: null,
      valor: inmo.ultimos[2], alquiler: 70 },
  ];
  inmuebles.forEach((x, i) => {
    const n = 6 + i;
    D.pon('B' + n, x.tip).pon('C' + n, x.dir).pon('D' + n, x.m2).pon('E' + n, x.ref);
    if (x.banco) {
      D.pon('F' + n, x.banco).pon('G' + n, x.ini, { nf: EUR }).pon('H' + n, x.pend, { nf: EUR })
        .pon('I' + n, (x.ini - x.pend) / x.ini, { nf: PCT, f: '=(G-H)/G' })
        .pon('J' + n, x.pend / x.ini, { nf: PCT, f: '=1-I' })
        .pon('K' + n, f(x.inicio), { nf: FECHA }).pon('L' + n, f(x.fin), { nf: FECHA })
        .pon('M' + n, anios(x.fin), { nf: NUM, f: '=(L-TODAY())/365' })
        .pon('N' + n, x.tipo).pon('O' + n, x.interes, { nf: PCT }).pon('P' + n, x.cuota, { nf: EUR });
    }
    D.pon('Q' + n, x.valor, { nf: EUR_CONTABLE, f: "='Rellenar'!E1" })
      .pon('R' + n, r2(x.valor - (x.pend || 0)), { nf: EUR_CONTABLE, f: '=Q-H' })
      .pon('S' + n, x.alquiler, { nf: EUR })
      .pon('T' + n, r2(x.alquiler - (x.cuota || 0)), { nf: EUR, f: '=S-P' })
      .pon('U' + n, x.cuota ? x.alquiler / x.cuota : '#DIV/0!', { nf: '#,##0.00', f: '=S/P' });
  });
  const hip = inmuebles.filter((x) => x.banco);
  const sum = (lista, k) => r2(lista.reduce((a, x) => a + (x[k] || 0), 0));
  const nTot = 6 + inmuebles.length;
  const totInm = {
    ini: sum(hip, 'ini'), pend: sum(hip, 'pend'), cuota: sum(hip, 'cuota'),
    valor: sum(inmuebles, 'valor'), alquiler: sum(inmuebles, 'alquiler'),
  };
  D.pon('B' + nTot, inmuebles.length, { f: '=COUNTA(…)' })
    .pon('G' + nTot, totInm.ini, { nf: EUR }).pon('H' + nTot, totInm.pend, { nf: EUR })
    .pon('I' + nTot, (totInm.ini - totInm.pend) / totInm.ini, { nf: PCT })
    .pon('J' + nTot, totInm.pend / totInm.ini, { nf: PCT })
    .pon('P' + nTot, totInm.cuota, { nf: EUR })
    .pon('Q' + nTot, totInm.valor, { nf: EUR_CONTABLE })
    .pon('R' + nTot, r2(totInm.valor - totInm.pend), { nf: EUR_CONTABLE })
    .pon('S' + nTot, totInm.alquiler, { nf: EUR })
    .pon('T' + nTot, r2(totInm.alquiler - totInm.cuota), { nf: EUR })
    .pon('U' + nTot, totInm.alquiler / totInm.cuota, { nf: '#,##0.00' });

  const filaPrest = nTot + 3;
  ['Entidad', 'Imp. inicial', 'Imp. pendiente', '% Pagado', '% Pendiente', 'Fecha inicio', 'Fecha fin ',
    'Años pend.', 'Tipo', 'Interés', 'Cuota mensual', 'Cuotas pendientes', 'Finalidad',
  ].forEach((n, i) => D.pon(col(2 + i) + filaPrest, n));
  const prestamos = [
    { ent: 'Banco Sur', ini: 12000, pend: 7350.2, inicio: '2024-09-10', fin: '2029-09-10', tipo: 'Fijo',
      interes: 0.0525, cuota: 227.9, cuotas: 34, fin_: 'Reforma de vivienda en alquiler' },
    { ent: 'Financiera Demo', ini: 6000, pend: 4120, inicio: '2025-05-05', fin: '2030-05-05', tipo: 'Fijo',
      interes: 0.0495, cuota: 110.55, cuotas: 42, fin_: 'Compra de vehículo' },
  ];
  prestamos.forEach((x, i) => {
    const n = filaPrest + 1 + i;
    D.pon('B' + n, x.ent).pon('C' + n, x.ini, { nf: EUR }).pon('D' + n, x.pend, { nf: EUR })
      .pon('E' + n, (x.ini - x.pend) / x.ini, { nf: PCT }).pon('F' + n, x.pend / x.ini, { nf: PCT })
      .pon('G' + n, f(x.inicio), { nf: FECHA }).pon('H' + n, f(x.fin), { nf: FECHA })
      .pon('I' + n, anios(x.fin), { nf: NUM }).pon('J' + n, x.tipo).pon('K' + n, x.interes, { nf: PCT })
      .pon('L' + n, x.cuota, { nf: EUR }).pon('M' + n, x.cuotas).pon('N' + n, x.fin_);
  });
  const nTotP = filaPrest + 1 + prestamos.length;
  const totP = { ini: sum(prestamos, 'ini'), pend: sum(prestamos, 'pend'), cuota: sum(prestamos, 'cuota') };
  D.pon('B' + nTotP, 'TOTAL').pon('C' + nTotP, totP.ini, { nf: EUR }).pon('D' + nTotP, totP.pend, { nf: EUR })
    .pon('E' + nTotP, (totP.ini - totP.pend) / totP.ini, { nf: PCT })
    .pon('F' + nTotP, totP.pend / totP.ini, { nf: PCT }).pon('L' + nTotP, totP.cuota, { nf: EUR });

  const fila0 = nTotP + 3;
  const neto = 3100;
  D.pon('B' + fila0, 'Concepto').pon('C' + fila0, 'Valor');
  [
    ['Titular', 'Alex Demo García'],
    ['Empresa', 'Ejemplo Tecnología S.L.'],
    ['Antiguedad', f('2019-09-02'), { nf: FECHA }],
    ['Años empresa', r2((hoy - f('2019-09-02').getTime()) / 86400000 / 365), { nf: NUM }],
    ['Tipo Contrato', 'Indefinido, tiempo completo'],
    ['Salario anual bruto', 52000, { nf: EUR }],
    ['Salario mensual bruto', r2(52000 / 12), { nf: EUR }],
    ['Salario mensual neto', neto, { nf: EUR }],
    ['Puesto', 'Analista de sistemas'],
  ].forEach(([k, v, o], i) => D.pon('B' + (fila0 + 1 + i), k).pon('C' + (fila0 + 1 + i), v, o || {}));

  ['Broker', 'Activo', 'Valor', '% inversión'].forEach((n, i) => D.pon(col(5 + i) + fila0, n));
  const totalInv = r2(bolsa.ultimos.reduce((a, b) => a + b, 0));
  bolsaDef.forEach((x, i) => {
    const n = fila0 + 1 + i;
    D.pon('E' + n, x.categoria).pon('F' + n, x.concepto)
      .pon('G' + n, bolsa.ultimos[i], { nf: EUR_CONTABLE }).pon('H' + n, bolsa.ultimos[i] / totalInv, { nf: PCT });
  });
  const nTotI = fila0 + 1 + bolsaDef.length;
  D.pon('G' + nTotI, totalInv, { nf: EUR_CONTABLE }).pon('H' + nTotI, 1, { nf: PCT });

  const ingresosMes = neto + totInm.alquiler;
  const deudasMes = r2(totInm.cuota + totP.cuota);
  const netoInmo = r2(totInm.valor - totInm.pend);
  D.pon('J' + fila0, 'RESUMEN').pon('R' + fila0, 'Link');
  [
    ['Total ingresos mensuales', ingresosMes, EUR],
    ['Total deudas mensuales', deudasMes, EUR],
    ['Total cashflow mensual', r2(ingresosMes - deudasMes), EUR],
    ['Total patrimonio neto (Inmobiliario)', netoInmo, EUR_CONTABLE, netoInmo / (netoInmo + totalInv)],
    ['Total inversión fondos', totalInv, EUR_CONTABLE, totalInv / (netoInmo + totalInv)],
    ['Patrimonio total neto', r2(netoInmo + totalInv), EUR_CONTABLE, 1],
    ['Total Patrimonio bruto con hipotecas', r2(totInm.valor + totalInv), EUR_CONTABLE],
    ['Ratio endeudamiento (solo nomina)', deudasMes / neto, PCT],
    ['R.E con 50% ingresos extra', deudasMes / (neto + totInm.alquiler / 2), PCT],
  ].forEach(([k, v, nf, extra], i) => {
    const n = fila0 + 1 + i;
    D.pon('J' + n, k).pon('M' + n, v, { nf, f: '=…' });
    if (extra !== undefined) D.pon('N' + n, extra, { nf: PCT, f: '=…' });
  });
  [
    ['Recibos de prestamos', 'https://example.com/demo/recibos-prestamos'],
    ['Justificante ingreso alquiler', 'https://example.com/demo/alquileres'],
    ['Última renta', 'Ver documento', { enlace: 'https://example.com/demo/renta' }],
    ['CIRBE', ''],
    ['Últimas Nominas', 'https://example.com/demo/nominas'],
    ['Justificantes inversion en fondos', ''],
  ].forEach(([k, v, o], i) => {
    const n = fila0 + 1 + i;
    D.pon('P' + n, k);
    if (v) D.pon('R' + n, v, o || {});
  });

  return libro;
}
