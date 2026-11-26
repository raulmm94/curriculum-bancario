// Exportación a Excel (.xlsx) con formato, generada en el navegador con ExcelJS
// (servido desde este mismo dominio; se carga solo al exportar).
import { fechaLarga, hoyIso } from './formato.js';
import { nombreArchivo } from './informe-datos.js';
import { estadoRatio } from './vistas/resumen.js';

const COLS = 12;
const ANCHO = 11; // ancho de cada columna de la rejilla, en caracteres
const AZUL = 'FF17365D';
const AZUL_CLARO = 'FFE8EEF6';
const GRIS = 'FFF3F5F8';
const LINEA = 'FFD5DBE3';
const TINTA = 'FF1B2430';
const TINTA_2 = 'FF5B6776';
const FMT = { eur: '#,##0.00 "€"', pct: '0.00%', fecha: 'dd/mm/yyyy', int: '#,##0', num: '#,##0.00' };

let cargando;
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  cargando ??= new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = '/vendor/exceljs.min.js';
    sc.onload = ok;
    sc.onerror = () => { cargando = null; ko(new Error('no se pudo cargar el generador de Excel')); };
    document.head.append(sc);
  });
  return cargando;
}

const aFecha = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
const borde = (color = LINEA) => ({ style: 'thin', color: { argb: color } });

/** Escribe un valor ocupando `span` columnas de la rejilla, con el mismo estilo en todas. */
function poner(ws, fila, col, span, valor, estilo = {}) {
  for (let c = col; c < col + span; c++) {
    const celda = ws.getCell(fila, c);
    celda.font = { name: 'Calibri', size: 10, color: { argb: TINTA }, ...(estilo.font || {}) };
    celda.alignment = { vertical: 'middle', wrapText: true, ...(estilo.alignment || {}) };
    if (estilo.fill) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estilo.fill } };
    if (estilo.border) celda.border = estilo.border;
    if (estilo.numFmt) celda.numFmt = estilo.numFmt;
  }
  ws.getCell(fila, col).value = valor ?? null;
  if (span > 1) ws.mergeCells(fila, col, fila, col + span - 1);
}

function valorCelda(c) {
  if (!c) return { v: null };
  const [tipo, v] = c;
  if (tipo === 'e') return { v, numFmt: FMT.eur };
  if (tipo === 'p') return { v, numFmt: FMT.pct };
  if (tipo === 'f') return { v: aFecha(v), numFmt: FMT.fecha };
  if (tipo === 'n') return { v, numFmt: Number.isInteger(v) ? FMT.int : FMT.num };
  return { v: String(v).startsWith('#') ? null : v };
}

function tituloSeccion(ws, fila, texto, col = 1, span = COLS) {
  poner(ws, fila, col, span, texto, {
    font: { bold: true, size: 11, color: { argb: AZUL } },
    border: { bottom: { style: 'medium', color: { argb: AZUL } } },
  });
  ws.getRow(fila).height = 20;
}

function tabla(ws, fila, tb) {
  tituloSeccion(ws, fila, tb.titulo);
  fila += 1;
  const esNum = (tipo) => tipo !== 'txt';
  let col = 1;
  let lineasCab = 1;
  for (const c of tb.cols) {
    const texto = c.corto || c.t;
    lineasCab = Math.max(lineasCab, Math.ceil(texto.length / (c.span * ANCHO - 1.5)));
    poner(ws, fila, col, c.span, texto, {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: AZUL,
      alignment: esNum(c.tipo) ? { horizontal: 'right' } : { horizontal: 'left', indent: col > 1 ? 1 : 0 },
    });
    col += c.span;
  }
  ws.getRow(fila).height = 13.5 * lineasCab + 5;
  fila += 1;
  const pintar = (valores, pie) => {
    let cc = 1;
    let lineas = 1;
    valores.forEach((v, i) => {
      const c = tb.cols[i];
      const valor = c.tipo === 'fecha' ? aFecha(v) : (v === '' ? null : v);
      if (typeof valor === 'string') lineas = Math.max(lineas, Math.ceil(valor.length / (c.span * ANCHO - 1)));
      poner(ws, fila, cc, c.span, valor, {
        numFmt: FMT[c.tipo],
        font: pie ? { bold: true } : {},
        fill: pie ? GRIS : null,
        alignment: esNum(c.tipo) ? { horizontal: 'right' } : { horizontal: 'left', indent: i ? 1 : 0 },
        border: pie ? { top: borde(TINTA_2) } : { bottom: borde() },
      });
      cc += c.span;
    });
    ws.getRow(fila).height = Math.max(16, 13.5 * lineas + 3);
    fila += 1;
  };
  tb.filas.forEach((f) => pintar(f, false));
  if (tb.pie) pintar(tb.pie, true);
  return fila + 1;
}

function hojaPrincipal(wb, info) {
  const ws = wb.addWorksheet('Currículum bancario', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.45, right: 0.45, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L&8Currículum bancario${info.titular ? ' · ' + info.titular : ''}&R&8Página &P de &N`,
    },
  });
  ws.columns = Array.from({ length: COLS }, () => ({ width: ANCHO }));

  let f = 1;
  poner(ws, f, 1, 7, 'CURRÍCULUM BANCARIO', { font: { bold: true, size: 9, color: { argb: TINTA_2 } } });
  poner(ws, f, 8, 5, 'Datos actualizados a', { font: { size: 9, color: { argb: TINTA_2 } }, alignment: { horizontal: 'right' } });
  f += 1;
  poner(ws, f, 1, 7, 'Informe de situación financiera', { font: { bold: true, size: 18, color: { argb: AZUL } } });
  poner(ws, f, 8, 5, fechaLarga(info.actualizado || hoyIso()), { font: { bold: true, size: 11 }, alignment: { horizontal: 'right' } });
  ws.getRow(f).height = 28;
  f += 1;
  if (info.titular) { poner(ws, f, 1, COLS, info.titular, { font: { size: 12, bold: true } }); ws.getRow(f).height = 20; f += 1; }
  f += 1;

  info.kpis.forEach((k, i) => {
    const col = 1 + i * 3;
    poner(ws, f, col, 3, k.etiqueta, { font: { size: 9, color: { argb: TINTA_2 } }, fill: AZUL_CLARO, alignment: { horizontal: 'left', indent: 1 } });
    poner(ws, f + 1, col, 3, k.valor, { font: { bold: true, size: 14, color: { argb: AZUL } }, fill: AZUL_CLARO, numFmt: FMT.eur, alignment: { horizontal: 'left', indent: 1 } });
  });
  ws.getRow(f).height = 16;
  ws.getRow(f + 1).height = 24;
  f += 3;

  tituloSeccion(ws, f, 'Situación laboral', 1, 5);
  tituloSeccion(ws, f, 'Resumen financiero', 7, 6);
  f += 1;
  const n = Math.max(info.laboral.length, info.resumen.length);
  for (let i = 0; i < n; i++) {
    const a = info.laboral[i];
    const b = info.resumen[i];
    let lineas = 1;
    if (a) {
      const v = valorCelda(a.celda);
      if (typeof v.v === 'string') lineas = Math.max(lineas, Math.ceil(v.v.length / (3 * ANCHO - 1)));
      lineas = Math.max(lineas, Math.ceil(a.etiqueta.length / (2 * ANCHO - 1)));
      poner(ws, f, 1, 2, a.etiqueta, { font: { color: { argb: TINTA_2 } }, border: { bottom: borde() } });
      poner(ws, f, 3, 3, v.v, { numFmt: v.numFmt, font: { bold: true }, alignment: { horizontal: 'right' }, border: { bottom: borde() } });
    }
    if (b) {
      const v = valorCelda(b.valor);
      const x = valorCelda(b.extra);
      lineas = Math.max(lineas, Math.ceil(b.etiqueta.length / (3 * ANCHO + 2)));
      poner(ws, f, 7, 3, b.etiqueta, { font: { color: { argb: TINTA_2 } }, border: { bottom: borde() } });
      poner(ws, f, 10, 2, v.v, { numFmt: v.numFmt, font: { bold: true }, alignment: { horizontal: 'right' }, border: { bottom: borde() } });
      poner(ws, f, 12, 1, x.v, { numFmt: x.numFmt, font: { color: { argb: TINTA_2 } }, alignment: { horizontal: 'right' }, border: { bottom: borde() } });
    }
    ws.getRow(f).height = 13.5 * lineas + 3;
    f += 1;
  }
  f += 1;

  if (info.solvencia.length) {
    f = tabla(ws, f, {
      titulo: 'Indicadores de solvencia',
      cols: [
        { t: 'Indicador', tipo: 'txt', span: 4 }, { t: 'Valor', tipo: 'pct', span: 2 },
        { t: 'Referencia', tipo: 'txt', span: 3 }, { t: 'Situación', tipo: 'txt', span: 3 },
      ],
      filas: info.solvencia.map((x) => [`${x.etiqueta} — ${x.nota}`, x.valor, x.textoLimite, estadoRatio(x.valor, x.limite)[1]]),
    });
  }
  if (info.composicion.length > 1) {
    const total = info.composicion.reduce((a, p) => a + p.valor, 0);
    f = tabla(ws, f, {
      titulo: 'Composición del patrimonio neto',
      cols: [{ t: 'Concepto', tipo: 'txt', span: 6 }, { t: 'Importe', tipo: 'eur', span: 3 }, { t: '% del total', tipo: 'pct', span: 3 }],
      filas: info.composicion.map((p) => [p.nombre, p.valor, p.valor / total]),
      pie: ['Total', total, 1],
    });
  }
  for (const tb of info.tablas) f = tabla(ws, f, tb);

  if (info.enlaces.length) {
    tituloSeccion(ws, f, 'Documentación justificativa');
    f += 1;
    for (const e of info.enlaces) {
      poner(ws, f, 1, 4, e.etiqueta, { border: { bottom: borde() } });
      poner(ws, f, 5, 8, { text: e.url, hyperlink: e.url }, { font: { color: { argb: 'FF1B64BE' }, underline: true }, border: { bottom: borde() } });
      f += 1;
    }
    f += 1;
  }
  poner(ws, f, 1, COLS, 'Documento informativo elaborado por el titular con sus propios datos. Importes en euros. ' +
    'Los valores de mercado son estimaciones y los justificantes están a disposición de la entidad.',
  { font: { size: 8, italic: true, color: { argb: TINTA_2 } } });
  ws.getRow(f).height = 24;
  ws.pageSetup.printArea = `A1:L${f}`;
}

/** Hoja de detalle: la tabla tal cual está en el Google Sheet, con todas sus columnas. */
function hojaDetalle(wb, nombre, tb) {
  if (!tb.filas.length) return;
  const ws = wb.addWorksheet(nombre, {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  const anchos = tb.cabeceras.map((c) => Math.min(34, Math.max(11, c.length * 0.62 + 2)));
  tb.cabeceras.forEach((c, i) => {
    poner(ws, 1, i + 1, 1, c, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: AZUL, alignment: { horizontal: 'center' } });
  });
  ws.getRow(1).height = 32;
  const pintar = (fila, r, pie) => fila.forEach((c, i) => {
    const v = valorCelda(c);
    if (typeof v.v === 'string') anchos[i] = Math.min(42, Math.max(anchos[i], v.v.length * 0.95 + 2));
    if (typeof v.v === 'number' && v.numFmt === FMT.eur) anchos[i] = Math.max(anchos[i], 14);
    poner(ws, r, i + 1, 1, v.v, {
      numFmt: v.numFmt, font: pie ? { bold: true } : {}, fill: pie ? GRIS : null,
      alignment: { horizontal: typeof v.v === 'string' ? 'left' : 'right' },
      border: pie ? { top: borde(TINTA_2) } : { bottom: borde() },
    });
  });
  tb.filas.forEach((fila, r) => pintar(fila, r + 2, false));
  if (tb.filaTotal) pintar(tb.filaTotal, tb.filas.length + 2, true);
  ws.columns = anchos.map((width) => ({ width }));
}

export async function exportarExcel(info, modelo) {
  await cargarExcelJS();
  const wb = new window.ExcelJS.Workbook();
  wb.creator = info.titular || 'Currículum bancario';
  wb.created = new Date();
  hojaPrincipal(wb, info);
  hojaDetalle(wb, 'Inmuebles (detalle)', modelo.inmuebles);
  hojaDetalle(wb, 'Préstamos (detalle)', modelo.prestamos);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo(info, 'xlsx');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
