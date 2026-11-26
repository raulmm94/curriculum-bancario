// Patrimonio: inmuebles con su hipoteca, otros préstamos e inversiones.
import { h, eur, pct, celda, num, valorNumerico, valorTexto } from '../formato.js';
import { barraSegmentada, partesConColor, medidor } from '../graficos.js';
import { tarjeta, fichas, vacio, tituloSeccion } from '../ui.js';
import { leyendaPartes } from './resumen.js';

const n = valorNumerico;
const t = valorTexto;

function amortizacion(item) {
  const pagado = n(item.pctPagado) ?? (n(item.inicial) ? (n(item.inicial) - (n(item.pendiente) ?? 0)) / n(item.inicial) : null);
  if (pagado === null) return null;
  return h('div.amortizacion',
    h('div.amortizacion-cabecera',
      h('span', 'Amortizado ', h('strong', pct(pagado))),
      h('span', eur(n(item.pendiente)), ' pendientes de ', eur(n(item.inicial)))),
    medidor({ valor: Math.max(0, Math.min(1, pagado)), maximo: 1 }),
    h('div.amortizacion-fechas',
      h('span', item.inicio ? 'Inicio ' + celda(item.inicio) : ''),
      h('span', item.fin ? 'Vence ' + celda(item.fin) + (n(item.aniosPend) !== null ? ` · ${num(n(item.aniosPend), 1)} años` : '') : '')));
}

function extras(item) {
  return item.extras.map((e) => [e.etiqueta, celda(e.celda)]);
}

function tarjetaInmueble(x, etiquetas) {
  const tieneHipoteca = n(x.pendiente) !== null || n(x.inicial) !== null;
  return h('article.tarjeta.inmueble',
    h('header.inmueble-cabecera',
      h('span.etiqueta', t(x.tipologia) || 'Inmueble'),
      h('h3', t(x.direccion) || '—'),
      h('p', [n(x.metros) !== null ? num(n(x.metros), 0) + ' m²' : null,
        x.refCatastral ? 'Ref. catastral ' + t(x.refCatastral) : null].filter(Boolean).join(' · '))),
    h('div.trio',
      h('div', h('span', etiquetas.valorMercado || 'Valor de mercado'), h('strong', eur(n(x.valorMercado)))),
      h('div', h('span', 'Hipoteca pendiente'), h('strong', tieneHipoteca ? eur(n(x.pendiente)) : 'Sin hipoteca')),
      h('div', h('span', 'Valor neto'), h('strong', eur(n(x.valorNeto))))),
    tieneHipoteca ? h('div.bloque',
      h('h4', 'Hipoteca', x.banco ? ' · ' + t(x.banco) : ''),
      amortizacion(x),
      fichas([
        ['Tipo', [t(x.tipo), x.interes ? celda(x.interes) : null].filter(Boolean).join(' · ') || '—'],
        ['Cuota mensual', eur(n(x.cuota))],
      ], 'en-linea')) : null,
    h('div.bloque',
      h('h4', 'Rentabilidad del alquiler'),
      fichas([
        ['Ingreso mensual', eur(n(x.alquiler))],
        ['Cashflow tras hipoteca', eur(n(x.cashflow))],
        tieneHipoteca ? ['Cobertura de la cuota', n(x.ratio) !== null ? num(n(x.ratio), 2) + ' ×' : '—'] : null,
        ...extras(x),
      ], 'en-linea')));
}

function totalesInmuebles(m) {
  const tot = m.inmuebles.total;
  if (!tot || m.inmuebles.items.length < 2) return null;
  return h('div.tarjeta.totales',
    h('h3', `Total de ${m.inmuebles.items.length} inmuebles`),
    fichas([
      ['Valor de mercado', eur(n(tot.valorMercado))],
      ['Hipotecas pendientes', eur(n(tot.pendiente))],
      ['Valor neto', eur(n(tot.valorNeto))],
      ['Cuotas hipotecarias', eur(n(tot.cuota))],
      ['Alquileres', eur(n(tot.alquiler))],
      ['Cashflow', eur(n(tot.cashflow))],
    ], 'en-linea'));
}

function tarjetaPrestamo(x) {
  return h('article.tarjeta.prestamo',
    h('header.prestamo-cabecera',
      h('div', h('h3', t(x.entidad) || 'Préstamo'), x.finalidad ? h('p', t(x.finalidad)) : null),
      h('div.prestamo-cuota', h('strong', eur(n(x.cuota))), h('span', 'al mes'))),
    amortizacion(x),
    fichas([
      ['Tipo', [t(x.tipo), x.interes ? celda(x.interes) : null].filter(Boolean).join(' · ') || '—'],
      n(x.cuotasPend) !== null ? ['Cuotas pendientes', num(n(x.cuotasPend), 0)] : null,
      ...extras(x),
    ], 'en-linea'));
}

export function vistaPatrimonio(app) {
  const m = app.estado.modelo;

  const inmuebles = h('section.seccion',
    tituloSeccion('Inmuebles', `${m.inmuebles.items.length} · valor de mercado ${eur(m.derivados.valorInmuebles)}`),
    m.inmuebles.items.length
      ? h('div.rejilla-tarjetas', m.inmuebles.items.map((x) => tarjetaInmueble(x, m.inmuebles.etiquetas)))
      : vacio('No hay inmuebles en la hoja.'),
    totalesInmuebles(m));

  const totP = m.prestamos.total;
  const prestamos = h('section.seccion',
    tituloSeccion('Otros préstamos', m.prestamos.items.length
      ? `${eur(m.derivados.deudaPrestamos)} pendientes · ${eur(m.derivados.cuotaPrestamos)} al mes` : null),
    m.prestamos.items.length
      ? h('div.rejilla-tarjetas', m.prestamos.items.map(tarjetaPrestamo))
      : vacio('No hay préstamos personales en la hoja.'),
    totP && m.prestamos.items.length > 1 ? h('div.tarjeta.totales',
      h('h3', `Total de ${m.prestamos.items.length} préstamos`),
      fichas([
        ['Importe inicial', eur(n(totP.inicial))],
        ['Pendiente', eur(n(totP.pendiente))],
        ['Amortizado', n(totP.inicial) ? pct((n(totP.inicial) - (n(totP.pendiente) ?? 0)) / n(totP.inicial)) : '—'],
        ['Cuotas mensuales', eur(n(totP.cuota))],
      ], 'en-linea')) : null);

  const partes = partesConColor(m.inversiones.items.map((x) => ({
    nombre: [t(x.broker), t(x.activo)].filter(Boolean).join(' · '),
    valor: n(x.valor) ?? 0,
  })));
  const totalInv = partes.reduce((a, p) => a + p.valor, 0);
  const inversiones = h('section.seccion',
    tituloSeccion('Inversiones financieras', totalInv ? eur(totalInv) : null),
    partes.length
      ? tarjeta({}, barraSegmentada(partes), leyendaPartes(partes, totalInv))
      : vacio('No hay inversiones en la hoja.'));

  return h('div.vista.vista-patrimonio', inmuebles, prestamos, inversiones);
}
