// Piezas de interfaz reutilizadas por las vistas.
import { h, icono, celda } from './formato.js';

export function tarjeta({ titulo, nota, accion, clase = '' }, ...contenido) {
  return h('section.tarjeta' + (clase ? '.' + clase.split(' ').join('.') : ''),
    titulo ? h('header.tarjeta-cabecera',
      h('div', h('h2', titulo), nota ? h('p.tarjeta-nota', nota) : null),
      accion || null) : null,
    ...contenido);
}

export function kpi({ etiqueta, valor, nota, clase = '' }) {
  return h('div.kpi' + (clase ? '.' + clase : ''),
    h('div.kpi-etiqueta', etiqueta),
    h('div.kpi-valor', valor),
    nota ? h('div.kpi-nota', nota) : null);
}

/** Lista de pares etiqueta → valor. */
export function fichas(pares, clase = '') {
  return h('dl.fichas' + (clase ? '.' + clase : ''), pares.filter(Boolean).map(([k, v]) =>
    h('div.ficha', h('dt', k), h('dd', v instanceof Node || typeof v === 'string' ? v : celda(v)))));
}

const ESTADOS = {
  bien: { icono: 'ok', clase: 'bien' },
  aviso: { icono: 'info', clase: 'aviso' },
  mal: { icono: 'alerta', clase: 'mal' },
  neutro: { icono: 'info', clase: 'neutro' },
};
/** Estado con icono + texto (nunca solo color). */
export function estado(tipo, texto) {
  const e = ESTADOS[tipo] || ESTADOS.neutro;
  return h('span.estado.' + e.clase, icono(e.icono, 14), texto);
}

export function botonIcono(nombre, etiqueta, onclick, clase = '') {
  return h('button.boton-icono' + (clase ? '.' + clase : ''), { type: 'button', title: etiqueta, 'aria-label': etiqueta, onclick }, icono(nombre));
}

export function vacio(texto) {
  return h('p.vacio', texto);
}

export function tituloSeccion(texto, nota) {
  return h('div.titulo-seccion', h('h2', texto), nota ? h('span', nota) : null);
}
