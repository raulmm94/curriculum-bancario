// Utilidades de formato (es-ES), análisis de números y creación de DOM sin innerHTML.

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const cacheNumeros = new Map();
function formateador(dec) {
  if (!cacheNumeros.has(dec)) {
    cacheNumeros.set(dec, new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always',
    }));
  }
  return cacheNumeros.get(dec);
}

const esNumero = (x) => typeof x === 'number' && Number.isFinite(x);
const SIN_DATO = '—';

export function num(x, dec = 2) {
  if (!esNumero(x)) return SIN_DATO;
  return formateador(dec).format(x).replace('-', '−');
}
export function eur(x, dec = 2) {
  return esNumero(x) ? num(x, dec) + '\u00a0€' : SIN_DATO;
}
export function eur0(x) { return eur(x, 0); }
export function pct(x, dec = 2) {
  return esNumero(x) ? num(x * 100, dec) + '\u00a0%' : SIN_DATO;
}
/** Importe compacto para ejes: 0 · 500 · 1 k · 12,5 k */
export function eurCompacto(x) {
  if (!esNumero(x)) return SIN_DATO;
  const a = Math.abs(x);
  if (a >= 1e6) return num(x / 1e6, a % 1e6 ? 1 : 0) + ' M';
  if (a >= 1e4) return num(x / 1e3, (a / 1e3) % 1 ? 1 : 0) + ' k';
  return num(x, 0);
}
export function fecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : SIN_DATO;
}
export function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${+m[3]} de ${MESES[+m[2] - 1].toLowerCase()} de ${m[1]}` : SIN_DATO;
}
export function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Celda tipada de la API ([tipo, valor]) → texto listo para mostrar. */
export function celda(c) {
  if (!c) return SIN_DATO;
  const [tipo, v] = c;
  if (tipo === 'e') return eur(v);
  if (tipo === 'p') return pct(v);
  if (tipo === 'f') return fecha(v);
  if (tipo === 'n') return num(v, Number.isInteger(v) ? 0 : 2);
  const s = String(v);
  return s.startsWith('#') ? SIN_DATO : s; // errores de la hoja (#DIV/0!, #N/A…)
}
export function valorNumerico(c) {
  return c && (c[0] === 'n' || c[0] === 'e' || c[0] === 'p') && esNumero(c[1]) ? c[1] : null;
}
export function valorTexto(c) {
  return c ? celda(c) : '';
}

export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Interpreta un importe escrito a mano: «1.234,56», «1234.56», «950+600», «1 200 €».
 * Devuelve un número (2 decimales), null si está vacío o NaN si no se entiende.
 */
export function parseImporte(texto) {
  const limpio = String(texto ?? '').replace(/[€\s ]/g, '').replace(/−/g, '-');
  if (!limpio) return null;
  if (!/^[-+]?[\d.,]+([-+][\d.,]+)*$/.test(limpio)) return NaN;
  let total = 0;
  for (const m of limpio.matchAll(/([-+]?)([\d.,]+)/g)) {
    const n = parseTermino(m[2]);
    if (Number.isNaN(n)) return NaN;
    total += m[1] === '-' ? -n : n;
  }
  return Math.round(total * 100) / 100;
}
function parseTermino(s) {
  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;
  let normal;
  if (comas === 1 && puntos === 0) normal = s.replace(',', '.');
  else if (comas === 0 && puntos === 0) normal = s;
  else if (comas === 1 && s.lastIndexOf(',') > s.lastIndexOf('.')) normal = s.replace(/\./g, '').replace(',', '.');
  else if (comas === 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) normal = s.replace(/\./g, ''); // 1.234 → miles
  else if (comas === 0 && puntos === 1) normal = s; // 12.5 → decimal
  else if (puntos === 1 && s.lastIndexOf('.') > s.lastIndexOf(',')) normal = s.replace(/,/g, ''); // 1,234.56
  else return NaN;
  return /^\d*\.?\d+$|^\d+\.$/.test(normal) ? Number(normal) : NaN;
}
/** Número → texto editable en un campo («1234,5» → «1.234,50»). */
export function importeEditable(x) {
  return esNumero(x) ? formateador(2).format(x) : '';
}

/* ---------- DOM ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function aplicar(el, attrs, hijos) {
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    hijos.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const anadir = (x) => {
    if (x === null || x === undefined || x === false) return;
    if (Array.isArray(x)) x.forEach(anadir);
    else el.append(x instanceof Node ? x : document.createTextNode(String(x)));
  };
  hijos.forEach(anadir);
  return el;
}

/** h('div.clase.otra', {atributos}, ...hijos) — el texto siempre entra como nodo de texto. */
export function h(selector, attrs, ...hijos) {
  const [etiqueta, ...clases] = selector.split('.');
  const el = document.createElement(etiqueta || 'div');
  if (clases.length) el.className = clases.join(' ');
  return aplicar(el, attrs, hijos);
}
/** Igual que h() pero para elementos SVG. */
export function s(selector, attrs, ...hijos) {
  const [etiqueta, ...clases] = selector.split('.');
  const el = document.createElementNS(SVG_NS, etiqueta);
  if (clases.length) el.setAttribute('class', clases.join(' '));
  return aplicar(el, attrs, hijos);
}

const ICONOS = {
  resumen: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  patrimonio: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 11h.01M15 11h.01',
  mensual: 'M7 3v4M17 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 14h3M8 17h6',
  informe: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  refrescar: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  tema: 'M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A5.5 5.5 0 0 1 13.4 3.1 9 9 0 0 0 12 3z',
  enlace: 'M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  candado: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
  descargar: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  imprimir: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  izquierda: 'M15 5l-7 7 7 7',
  derecha: 'M9 5l7 7-7 7',
  ojo: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  tabla: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  grafico: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
};
export function icono(nombre, tam = 20) {
  return s('svg.icono', {
    viewBox: '0 0 24 24', width: tam, height: tam, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  }, s('path', { d: ICONOS[nombre] || '' }));
}
