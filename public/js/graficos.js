// Gráficos propios en SVG/HTML (sin librerías ni peticiones externas).
// Reglas: marcas finas, rejilla discreta, un solo eje, leyenda con ≥ 2 series,
// texto siempre en tinta de texto y tooltip en cada marca.
import { h, s, eur, eurCompacto, pct } from './formato.js';

/* ---------- Tooltip compartido ---------- */

let tip;
function capaTip() {
  if (!tip) {
    tip = h('div.tip', { role: 'tooltip' });
    tip.hidden = true;
    document.body.append(tip);
    window.addEventListener('scroll', ocultarTip, { passive: true, capture: true });
  }
  return tip;
}
/** filas: [{ nombre, valor, color? }] — el valor manda, el nombre acompaña. */
export function mostrarTip(evento, titulo, filas) {
  const t = capaTip();
  t.replaceChildren(
    titulo ? h('div.tip-titulo', titulo) : null,
    ...filas.map((f) => h('div.tip-fila',
      f.color ? h('span.tip-clave', { style: { background: f.color } }) : null,
      h('strong', f.valor), h('span', f.nombre))));
  t.hidden = false;
  const margen = 12;
  const r = t.getBoundingClientRect();
  let x = evento.clientX + margen;
  let y = evento.clientY + margen;
  if (x + r.width > innerWidth - 8) x = evento.clientX - r.width - margen;
  if (y + r.height > innerHeight - 8) y = evento.clientY - r.height - margen;
  t.style.left = Math.max(8, x) + 'px';
  t.style.top = Math.max(8, y) + 'px';
}
export function ocultarTip() {
  if (tip) tip.hidden = true;
}
function conTip(el, titulo, filas) {
  const ver = (e) => mostrarTip(e, typeof titulo === 'function' ? titulo() : titulo, typeof filas === 'function' ? filas() : filas);
  el.addEventListener('pointermove', ver);
  el.addEventListener('pointerdown', ver);
  el.addEventListener('pointerleave', ocultarTip);
  return el;
}

/* ---------- Utilidades ---------- */

/** Redibuja el gráfico cuando cambia el ancho disponible. */
export function responsivo(dibujar, clase = '') {
  const caja = h('div.grafico' + (clase ? '.' + clase : ''));
  let ancho = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.floor(caja.clientWidth);
    if (w && w !== ancho) { ancho = w; ocultarTip(); caja.replaceChildren(dibujar(w)); }
  });
  ro.observe(caja);
  return caja;
}

/** Escala «redonda»: máximo y paso para unas 4 marcas. */
function escala(min, max, marcas = 4) {
  if (max <= min) max = min + 1;
  const bruto = (max - min) / marcas;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= bruto);
  const lo = Math.floor(min / paso) * paso;
  const hi = Math.ceil(max / paso) * paso;
  const ticks = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

/** Rectángulo con el extremo de datos redondeado (4 px) y la base recta. */
function columna(x, y0, y1, ancho, attrs) {
  const arriba = y1 < y0;
  const alto = Math.abs(y1 - y0);
  const r = Math.min(4, ancho / 2, alto);
  const d = arriba
    ? `M${x},${y0}V${y1 + r}q0,${-r} ${r},${-r}h${ancho - 2 * r}q${r},0 ${r},${r}V${y0}z`
    : `M${x},${y0}V${y1 - r}q0,${r} ${r},${r}h${ancho - 2 * r}q${r},0 ${r},${-r}V${y0}z`;
  return s('path', { d, ...attrs });
}

function ejes(svg, { ancho, m, alto, esc, y, etiquetasX, xCentro }) {
  for (const t of esc.ticks) {
    const yy = y(t);
    svg.append(s('line.rejilla' + (t === 0 ? '.base' : ''), { x1: m.izq, x2: ancho - m.der, y1: yy, y2: yy }));
    svg.append(s('text.eje', { x: m.izq - 8, y: yy + 4, 'text-anchor': 'end' }, eurCompacto(t)));
  }
  const saltar = xCentro(1) - xCentro(0) < 30 ? 2 : 1;
  etiquetasX.forEach((e, i) => {
    if (i % saltar) return;
    svg.append(s('text.eje', { x: xCentro(i), y: alto - 6, 'text-anchor': 'middle' }, e));
  });
}

export function leyenda(items) {
  return h('div.leyenda', items.map((it) => h('span.leyenda-item',
    h('span.leyenda-muestra' + (it.linea ? '.linea' : '') + (it.tenue ? '.tenue' : ''), { style: { background: it.color } }),
    it.nombre)));
}

/* ---------- Columnas agrupadas (ingresos frente a gastos por mes) ---------- */

export function columnasAgrupadas({ etiquetas, titulos, series, tenue = () => false, alto = 240 }) {
  return responsivo((ancho) => {
    const m = { izq: 46, der: 6, sup: 10, inf: 26 };
    const svg = s('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Columnas por mes: ' + series.map((x) => x.nombre).join(' y ') });
    const maximo = Math.max(1, ...series.flatMap((x) => x.valores.map((v) => v || 0)));
    const esc = escala(0, maximo);
    const y = (v) => m.sup + (alto - m.sup - m.inf) * (1 - (v - esc.lo) / (esc.hi - esc.lo));
    const banda = (ancho - m.izq - m.der) / etiquetas.length;
    const hueco = 2;
    const grosor = Math.max(3, Math.min(24, (banda * 0.72 - hueco * (series.length - 1)) / series.length));
    const grupo = grosor * series.length + hueco * (series.length - 1);
    const xCentro = (i) => m.izq + banda * (i + 0.5);
    ejes(svg, { ancho, m, alto, esc, y, etiquetasX: etiquetas, xCentro });
    etiquetas.forEach((_, i) => {
      const g = s('g.banda' + (tenue(i) ? '.tenue' : ''));
      g.append(s('rect.banda-fondo', { x: m.izq + banda * i, y: m.sup, width: banda, height: alto - m.sup - m.inf }));
      series.forEach((serie, k) => {
        const v = serie.valores[i] || 0;
        if (v <= 0) return;
        g.append(columna(xCentro(i) - grupo / 2 + k * (grosor + hueco), y(0), y(v), grosor, { style: { fill: serie.color } }));
      });
      conTip(g, titulos ? titulos[i] : etiquetas[i],
        series.map((serie) => ({ nombre: serie.nombre, valor: eur(serie.valores[i] || 0), color: serie.color })));
      svg.append(g);
    });
    return svg;
  });
}

/* ---------- Columnas divergentes (sobrante mensual: positivo / negativo) ---------- */

export function columnasDivergentes({ etiquetas, titulos, valores, nombre, tenue = () => false, alto = 200 }) {
  return responsivo((ancho) => {
    const m = { izq: 46, der: 6, sup: 10, inf: 26 };
    const svg = s('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': nombre + ' por mes' });
    const reales = valores.map((v) => v || 0);
    const esc = escala(Math.min(0, ...reales), Math.max(0, ...reales));
    const y = (v) => m.sup + (alto - m.sup - m.inf) * (1 - (v - esc.lo) / (esc.hi - esc.lo));
    const banda = (ancho - m.izq - m.der) / etiquetas.length;
    const grosor = Math.max(4, Math.min(24, banda * 0.5));
    const xCentro = (i) => m.izq + banda * (i + 0.5);
    ejes(svg, { ancho, m, alto, esc, y, etiquetasX: etiquetas, xCentro });
    etiquetas.forEach((_, i) => {
      const v = reales[i];
      const g = s('g.banda' + (tenue(i) ? '.tenue' : ''));
      g.append(s('rect.banda-fondo', { x: m.izq + banda * i, y: m.sup, width: banda, height: alto - m.sup - m.inf }));
      if (v !== 0) {
        g.append(columna(xCentro(i) - grosor / 2, y(0), y(v), grosor, { class: v >= 0 ? 'relleno-positivo' : 'relleno-negativo' }));
      }
      conTip(g, titulos ? titulos[i] : etiquetas[i], [{ nombre, valor: eur(v) }]);
      svg.append(g);
    });
    return svg;
  });
}

/* ---------- Línea temporal (evolución de un valor) ---------- */

export function lineaTemporal({ etiquetas, titulos, valores, nombre, alto = 220 }) {
  return responsivo((ancho) => {
    const m = { izq: 46, der: 14, sup: 14, inf: 26 };
    const svg = s('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Evolución de ' + nombre });
    const puntos = valores.map((v, i) => ({ i, v })).filter((p) => p.v !== null && p.v !== undefined);
    if (!puntos.length) return h('p.vacio', 'Todavía no hay datos para este gráfico.');
    const vs = puntos.map((p) => p.v);
    const margen = (Math.max(...vs) - Math.min(...vs)) * 0.15 || Math.max(...vs) * 0.1 || 1;
    const esc = escala(Math.max(0, Math.min(...vs) - margen), Math.max(...vs) + margen);
    const y = (v) => m.sup + (alto - m.sup - m.inf) * (1 - (v - esc.lo) / (esc.hi - esc.lo));
    const paso = (ancho - m.izq - m.der) / Math.max(1, etiquetas.length - 1);
    const x = (i) => m.izq + paso * i;
    ejes(svg, { ancho, m, alto, esc, y, etiquetasX: etiquetas, xCentro: x });
    const trazo = puntos.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join('');
    if (puntos.length > 1) {
      const base = alto - m.inf;
      svg.append(s('path.area', { d: `${trazo}L${x(puntos.at(-1).i)},${base}L${x(puntos[0].i)},${base}z` }));
      svg.append(s('path.linea', { d: trazo }));
    }
    const fin = puntos.at(-1);
    svg.append(s('circle.punto', { cx: x(fin.i), cy: y(fin.v), r: 4.5 }));
    const cursor = s('g.cursor', { visibility: 'hidden' },
      s('line.cursor-linea', { y1: m.sup, y2: alto - m.inf }), s('circle.punto', { r: 4.5 }));
    svg.append(cursor);
    const zona = s('rect.zona', { x: m.izq - paso / 2, y: 0, width: ancho - m.izq - m.der + paso, height: alto });
    const mover = (e) => {
      const caja = svg.getBoundingClientRect();
      const px = e.clientX - caja.left;
      const cerca = puntos.reduce((a, b) => (Math.abs(x(b.i) - px) < Math.abs(x(a.i) - px) ? b : a));
      cursor.setAttribute('visibility', 'visible');
      cursor.firstChild.setAttribute('x1', x(cerca.i));
      cursor.firstChild.setAttribute('x2', x(cerca.i));
      cursor.lastChild.setAttribute('cx', x(cerca.i));
      cursor.lastChild.setAttribute('cy', y(cerca.v));
      mostrarTip(e, titulos ? titulos[cerca.i] : etiquetas[cerca.i], [{ nombre, valor: eur(cerca.v) }]);
    };
    zona.addEventListener('pointermove', mover);
    zona.addEventListener('pointerdown', mover);
    zona.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); ocultarTip(); });
    svg.append(zona);
    return svg;
  });
}

/* ---------- Barras ordenadas (un solo tono) ---------- */

export function barrasOrdenadas(items, { formato = eur, total = null } = {}) {
  const maximo = Math.max(1, ...items.map((x) => x.valor));
  return h('div.barras', { role: 'list' }, items.map((it) => {
    const fila = h('div.barras-fila', { role: 'listitem' },
      h('span.barras-nombre', it.nombre, it.nota ? h('small', it.nota) : null),
      h('span.barras-pista', h('span.barras-relleno' + (it.clase ? '.' + it.clase : ''), { style: { width: (it.valor / maximo) * 100 + '%' } })),
      h('span.barras-valor', formato(it.valor)));
    return conTip(fila, it.nombre, [
      { nombre: 'Importe', valor: formato(it.valor) },
      ...(total ? [{ nombre: 'del total', valor: pct(it.valor / total, 1) }] : []),
    ]);
  }));
}

/* ---------- Barra segmentada (un todo repartido en partes) ---------- */

export const COLORES_SERIE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const TINTA_SOBRE = ['#fff', '#fff', '#fff', '#0b0b0b', '#fff', '#fff', '#fff', '#fff'];

/** Agrupa la cola en «Otros» si hay más partes que colores disponibles. */
export function partesConColor(partes, maximo = 7) {
  const validas = partes.filter((p) => p.valor > 0);
  let lista = validas;
  if (validas.length > maximo) {
    const orden = [...validas].sort((a, b) => b.valor - a.valor);
    const cabeza = new Set(orden.slice(0, maximo - 1));
    lista = validas.filter((p) => cabeza.has(p));
    lista.push({ nombre: 'Otros', valor: validas.filter((p) => !cabeza.has(p)).reduce((a, p) => a + p.valor, 0) });
  }
  return lista.map((p, i) => ({ ...p, color: COLORES_SERIE[i], tinta: TINTA_SOBRE[i] }));
}

export function barraSegmentada(partes, { alta = false, formato = eur } = {}) {
  const total = partes.reduce((a, p) => a + p.valor, 0) || 1;
  const nombre = partes.map((p) => `${p.nombre}: ${formato(p.valor)} (${pct(p.valor / total, 1)})`).join('; ');
  return h('div.segmentada' + (alta ? '.alta' : ''), { role: 'img', 'aria-label': nombre }, partes.map((p) => {
    const cuota = p.valor / total;
    const seg = h('span.segmento', { style: { 'flex-grow': String(p.valor), background: p.color, color: p.tinta || '#fff' } },
      alta && cuota >= 0.12 ? pct(cuota, 0) : null);
    return conTip(seg, p.nombre, [{ nombre: 'Importe', valor: formato(p.valor) }, { nombre: 'del total', valor: pct(cuota, 1) }]);
  }));
}

/* ---------- Medidor (un ratio frente a un límite) ---------- */

/**
 * valor y limite en tanto por uno. El relleno cambia de estado al superar el límite
 * y el estado se indica siempre con icono + texto, nunca solo con color.
 */
export function medidor({ valor, limite = null, maximo = null, etiquetaLimite = '' }) {
  const tope = maximo ?? Math.max((limite || 0) * 1.45, (valor || 0) * 1.15, 0.01);
  const estado = limite === null ? 'neutro' : valor <= limite * 0.86 ? 'bien' : valor <= limite ? 'aviso' : 'mal';
  const pista = h('div.medidor-pista.' + estado,
    h('div.medidor-relleno', { style: { width: Math.min(100, (valor / tope) * 100) + '%' } }));
  if (limite !== null) {
    pista.append(h('div.medidor-limite', { style: { left: (limite / tope) * 100 + '%' } }));
  }
  const pos = limite === null ? 0 : (limite / tope) * 100;
  return h('div.medidor', { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': Math.round(tope * 100), 'aria-valuenow': Math.round((valor || 0) * 100) },
    pista,
    limite !== null ? h('div.medidor-escala', h('span', '0 %'),
      h('span.medidor-marca', { style: pos > 55 ? { right: 100 - pos + '%' } : { left: pos + '%' } }, etiquetaLimite || pct(limite, 0))) : null);
}
