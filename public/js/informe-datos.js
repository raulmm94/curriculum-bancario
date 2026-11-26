// Contenido del currículum bancario, independiente del formato de salida.
// Lo consumen tanto el informe en folio (PDF/impresión) como la exportación a Excel.
import { eur, pct, num, fecha, celda, valorNumerico, valorTexto, normalizar } from './formato.js';

const n = valorNumerico;
const t = valorTexto;
const iso = (c) => (c && c[0] === 'f' ? c[1] : null);

export function formatoColumna(tipo, v) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'eur') return eur(v);
  if (tipo === 'pct') return pct(v);
  if (tipo === 'fecha') return fecha(v);
  if (tipo === 'num') return num(v, 2);
  if (tipo === 'int') return num(v, 0);
  return String(v);
}

const amortizado = (x) => n(x.pctPagado) ?? (n(x.inicial) ? (n(x.inicial) - (n(x.pendiente) ?? 0)) / n(x.inicial) : null);
const tipoInteres = (x) => [t(x.tipo), x.interes ? celda(x.interes) : null].filter(Boolean).join(' · ');

export function datosInforme(m, opciones = {}) {
  const k = m.kpi;
  const d = m.derivados;
  const v = (campo) => n(k[campo] && k[campo].valor);
  const conCatastro = opciones.catastro !== false;

  const kpis = [
    { etiqueta: 'Patrimonio neto', valor: v('patrimonioNeto') ?? (d.valorInmuebles - d.deudaHipotecas + d.valorInversiones) },
    { etiqueta: 'Ingresos mensuales', valor: v('ingresos') },
    { etiqueta: 'Cuotas de deuda al mes', valor: v('deudas') },
    { etiqueta: 'Cashflow mensual', valor: v('cashflow') },
  ];

  const laboral = m.trabajo
    .filter((x) => !/^(titular|nombre)/.test(normalizar(x.concepto)))
    .map((x) => ({ etiqueta: x.concepto, celda: x.celda }));

  const resumen = m.resumen.map((r) => ({ etiqueta: r.etiqueta, valor: r.valor, extra: r.extra }));
  resumen.push({ etiqueta: 'Deuda pendiente total (hipotecas + préstamos)', valor: ['e', d.deudaTotal], extra: null });

  const solvencia = [];
  if (v('ratio') !== null) solvencia.push({ etiqueta: 'Endeudamiento', nota: k.ratio.etiqueta, valor: v('ratio'), limite: 0.35, textoLimite: 'Límite habitual 35 %' });
  if (v('ratioExtra') !== null) solvencia.push({ etiqueta: 'Endeudamiento ampliado', nota: k.ratioExtra.etiqueta, valor: v('ratioExtra'), limite: 0.35, textoLimite: 'Límite habitual 35 %' });
  if (d.ltv !== null) solvencia.push({ etiqueta: 'Deuda / valor de inmuebles (LTV)', nota: 'Hipotecas pendientes sobre valor de mercado', valor: d.ltv, limite: 0.8, maximo: 1, textoLimite: 'Máx. habitual 80 %' });

  const composicion = [
    { nombre: 'Inmobiliario neto', valor: v('patrimonioInmo') ?? Math.max(0, d.valorInmuebles - d.deudaHipotecas) },
    { nombre: 'Inversiones financieras', valor: v('inversiones') ?? d.valorInversiones },
  ].filter((p) => p.valor > 0);

  const tablas = [];
  const I = m.inmuebles;
  if (I.items.length) {
    tablas.push({
      id: 'inmuebles', titulo: 'Inmuebles', nota: I.etiquetas.valorMercado ? `Valor de mercado: ${I.etiquetas.valorMercado}` : '',
      cols: [
        { t: 'Tipo', tipo: 'txt', span: 1, w: 9 }, { t: 'Dirección', tipo: 'txt', span: 3, w: conCatastro ? 24 : 37 },
        ...(conCatastro ? [{ t: 'Ref. catastral', tipo: 'txt', span: 2, w: 21, fino: true }] : []),
        { t: 'm²', tipo: 'int', span: 1, w: 6 }, { t: 'Valor mercado', tipo: 'eur', span: conCatastro ? 2 : 3, w: conCatastro ? 14 : 18 },
        { t: 'Valor neto', tipo: 'eur', span: conCatastro ? 2 : 3, w: conCatastro ? 14 : 18 }, { t: 'Alquiler/mes', tipo: 'eur', span: 1, w: 12 },
      ],
      filas: I.items.map((x) => [t(x.tipologia), t(x.direccion), ...(conCatastro ? [t(x.refCatastral)] : []),
        n(x.metros), n(x.valorMercado), n(x.valorNeto), n(x.alquiler)]),
      pie: I.items.length > 1 ? ['Total', '', ...(conCatastro ? [''] : []), null,
        d.valorInmuebles, n(I.total && I.total.valorNeto) ?? (d.valorInmuebles - d.deudaHipotecas), d.alquileres] : null,
    });
    const hipotecas = I.items.filter((x) => n(x.pendiente) !== null || n(x.inicial) !== null);
    if (hipotecas.length) {
      tablas.push({
        id: 'hipotecas', titulo: 'Hipotecas', nota: '',
        cols: [
          { t: 'Inmueble', tipo: 'txt', span: 2, w: 22 }, { t: 'Banco', tipo: 'txt', span: 1, w: 10 },
          { t: 'Importe inicial', tipo: 'eur', span: 2, w: 12 }, { t: 'Pendiente', tipo: 'eur', span: 2, w: 12 },
          { t: 'Amortizado', tipo: 'pct', span: 1, w: 9, corto: 'Amort.' }, { t: 'Vencimiento', tipo: 'fecha', span: 1, w: 11, corto: 'Vence' },
          { t: 'Tipo · interés', tipo: 'txt', span: 2, w: 13 }, { t: 'Cuota/mes', tipo: 'eur', span: 1, w: 11 },
        ],
        filas: hipotecas.map((x) => [[t(x.tipologia), t(x.direccion)].filter(Boolean).join(' · '), t(x.banco),
          n(x.inicial), n(x.pendiente), amortizado(x), iso(x.fin), tipoInteres(x), n(x.cuota)]),
        pie: hipotecas.length > 1 ? ['Total', '', n(I.total && I.total.inicial), d.deudaHipotecas, null, null, '', d.cuotaHipotecas] : null,
      });
    }
  }
  const P = m.prestamos;
  if (P.items.length) {
    tablas.push({
      id: 'prestamos', titulo: 'Otros préstamos', nota: '',
      cols: [
        { t: 'Entidad', tipo: 'txt', span: 2, w: 13 }, { t: 'Finalidad', tipo: 'txt', span: 2, w: 22 },
        { t: 'Importe inicial', tipo: 'eur', span: 2, w: 12 }, { t: 'Pendiente', tipo: 'eur', span: 2, w: 12 },
        { t: 'Amortizado', tipo: 'pct', span: 1, w: 9, corto: 'Amort.' }, { t: 'Vencimiento', tipo: 'fecha', span: 1, w: 11, corto: 'Vence' },
        { t: 'Interés', tipo: 'txt', span: 1, w: 11 }, { t: 'Cuota/mes', tipo: 'eur', span: 1, w: 10 },
      ],
      filas: P.items.map((x) => [t(x.entidad), t(x.finalidad), n(x.inicial), n(x.pendiente), amortizado(x),
        iso(x.fin), tipoInteres(x), n(x.cuota)]),
      pie: P.items.length > 1 ? ['Total', '', n(P.total && P.total.inicial), d.deudaPrestamos, null, null, '', d.cuotaPrestamos] : null,
    });
  }
  const V = m.inversiones;
  if (V.items.length) {
    const total = d.valorInversiones || 1;
    tablas.push({
      id: 'inversiones', titulo: 'Inversiones financieras', nota: '',
      cols: [
        { t: 'Entidad', tipo: 'txt', span: 3, w: 30 }, { t: 'Activo', tipo: 'txt', span: 4, w: 34 },
        { t: 'Valor', tipo: 'eur', span: 3, w: 20 }, { t: '% cartera', tipo: 'pct', span: 2, w: 16 },
      ],
      filas: V.items.map((x) => [t(x.broker), t(x.activo), n(x.valor), n(x.pct) ?? (n(x.valor) ?? 0) / total]),
      pie: ['Total', '', d.valorInversiones, 1],
    });
  }

  return {
    titular: (opciones.titular ?? m.titular ?? '').trim(),
    actualizado: m.actualizado,
    kpis, laboral, resumen, solvencia, composicion, tablas,
    enlaces: opciones.enlaces === false ? [] : m.enlaces.filter((e) => e.url),
  };
}

export function nombreArchivo(info, extension) {
  const limpio = normalizar(info.titular).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ['Curriculum-bancario', limpio, info.actualizado].filter(Boolean).join('-') + '.' + extension;
}
