// Resumen: la foto que le interesa al banco de un vistazo.
import { h, icono, eur, eur0, pct, celda, valorNumerico, normalizar } from '../formato.js';
import { barraSegmentada, partesConColor, medidor } from '../graficos.js';
import { tarjeta, kpi, fichas, estado, vacio } from '../ui.js';

export const LIMITE_ENDEUDAMIENTO = 0.35;
export const LIMITE_LTV = 0.8;

export function estadoRatio(valor, limite) {
  if (valor === null) return ['neutro', 'Sin dato'];
  if (valor <= limite * 0.86) return ['bien', 'Holgado'];
  if (valor <= limite) return ['aviso', 'Cerca del límite'];
  return ['mal', 'Por encima del límite'];
}

export function leyendaPartes(partes, total) {
  return h('ul.reparto', partes.map((p) => h('li',
    h('span.reparto-muestra', { style: { background: p.color } }),
    h('span.reparto-nombre', p.nombre),
    h('span.reparto-valor', eur(p.valor)),
    h('span.reparto-pct', pct(p.valor / (total || 1), 1)))));
}

export function listaEnlaces(enlaces) {
  if (!enlaces.length) return vacio('Añade en la hoja DATOS la tabla «Link» con tus carpetas de justificantes.');
  return h('ul.enlaces', enlaces.map((e) => h('li', e.url
    ? h('a.enlace-doc', { href: e.url, target: '_blank', rel: 'noopener noreferrer' }, icono('enlace', 18), h('span', e.etiqueta))
    : h('span.enlace-doc.pendiente', icono('enlace', 18), h('span', e.etiqueta), h('small', 'Sin enlace')))));
}

export function vistaResumen(app) {
  const m = app.estado.modelo;
  const k = m.kpi;
  const d = m.derivados;
  const v = (campo) => valorNumerico(k[campo] && k[campo].valor);

  const patrimonioNeto = v('patrimonioNeto');
  const partes = partesConColor([
    { nombre: 'Inmobiliario (neto de hipotecas)', valor: v('patrimonioInmo') ?? Math.max(0, d.valorInmuebles - d.deudaHipotecas) },
    { nombre: 'Inversiones financieras', valor: v('inversiones') ?? d.valorInversiones },
  ]);
  const totalPartes = partes.reduce((a, p) => a + p.valor, 0);

  const heroe = h('section.tarjeta.heroe',
    h('div.heroe-etiqueta', k.patrimonioNeto ? k.patrimonioNeto.etiqueta : 'Patrimonio total neto'),
    h('div.heroe-valor', eur(patrimonioNeto ?? totalPartes)),
    h('div.heroe-sub',
      v('patrimonioBruto') !== null ? h('span', 'Bruto con hipotecas ', h('strong', eur(v('patrimonioBruto')))) : null,
      h('span', 'Deuda pendiente ', h('strong', eur(d.deudaTotal)))),
    partes.length ? barraSegmentada(partes, { alta: true }) : null,
    partes.length ? leyendaPartes(partes, totalPartes) : null);

  const kpis = h('div.kpis',
    kpi({ etiqueta: 'Ingresos mensuales', valor: eur(v('ingresos')), nota: d.alquileres ? `Incluye ${eur0(d.alquileres)} de alquileres` : null }),
    kpi({ etiqueta: 'Cuotas de deuda al mes', valor: eur(v('deudas')), nota: `Hipotecas ${eur0(d.cuotaHipotecas)} · préstamos ${eur0(d.cuotaPrestamos)}` }),
    kpi({ etiqueta: 'Cashflow mensual', valor: eur(v('cashflow')), nota: 'Ingresos menos cuotas de deuda' }),
    kpi({ etiqueta: 'Deuda pendiente total', valor: eur(d.deudaTotal), nota: `Hipotecas ${eur0(d.deudaHipotecas)} · préstamos ${eur0(d.deudaPrestamos)}` }));

  const ratio = v('ratio');
  const ratioExtra = v('ratioExtra');
  const [tipoRatio, textoRatio] = estadoRatio(ratio, LIMITE_ENDEUDAMIENTO);
  const endeudamiento = tarjeta({ titulo: 'Ratio de endeudamiento', nota: 'Cuotas de deuda sobre ingresos' },
    ratio === null ? vacio('La hoja no incluye el ratio de endeudamiento.') : h('div.ratio',
      h('div.ratio-cabecera', h('span.ratio-valor', pct(ratio)), estado(tipoRatio, textoRatio)),
      h('p.ratio-nota', k.ratio.etiqueta),
      medidor({ valor: ratio, limite: LIMITE_ENDEUDAMIENTO, etiquetaLimite: 'Límite habitual 35 %' })),
    ratioExtra === null ? null : h('div.ratio.secundario',
      h('div.ratio-cabecera', h('span.ratio-valor', pct(ratioExtra)), estado(...estadoRatio(ratioExtra, LIMITE_ENDEUDAMIENTO))),
      h('p.ratio-nota', k.ratioExtra.etiqueta),
      medidor({ valor: ratioExtra, limite: LIMITE_ENDEUDAMIENTO, etiquetaLimite: '35 %' })));

  const garantia = d.ltv === null ? null : tarjeta({ titulo: 'Garantía inmobiliaria', nota: 'Deuda hipotecaria sobre valor de mercado (LTV)' },
    h('div.ratio',
      h('div.ratio-cabecera', h('span.ratio-valor', pct(d.ltv)), estado(...estadoRatio(d.ltv, LIMITE_LTV))),
      medidor({ valor: d.ltv, limite: LIMITE_LTV, maximo: 1, etiquetaLimite: 'Financiación máx. habitual 80 %' })),
    fichas([
      ['Valor de mercado de los inmuebles', eur(d.valorInmuebles)],
      ['Hipotecas pendientes', eur(d.deudaHipotecas)],
      ['Valor neto inmobiliario', eur(d.valorInmuebles - d.deudaHipotecas)],
    ], 'compacta'));

  const trabajo = tarjeta({ titulo: 'Situación laboral' },
    m.trabajo.length
      ? fichas(m.trabajo.filter((t) => !/^(titular|nombre)/.test(normalizar(t.concepto))).map((t) => [t.concepto, celda(t.celda)]))
      : vacio('Sin datos laborales en la hoja.'));

  const documentos = tarjeta({ titulo: 'Documentación justificativa', nota: 'Enlaces que acompañan al informe' }, listaEnlaces(m.enlaces));

  const otros = m.otrosResumen.length ? tarjeta({ titulo: 'Otros indicadores' },
    fichas(m.otrosResumen.map((o) => [o.etiqueta, celda(o.valor) + (o.extra ? ' · ' + celda(o.extra) : '')]))) : null;

  return h('div.vista.vista-resumen',
    heroe, kpis,
    h('div.dos-columnas', endeudamiento, garantia),
    h('div.dos-columnas', trabajo, documentos),
    otros);
}
