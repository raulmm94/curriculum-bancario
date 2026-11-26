// Informe: el currículum bancario maquetado en folios A4, listo para PDF, impresión o Excel.
import { h, icono, eur, pct, celda, fechaLarga, hoyIso, fecha } from '../formato.js';
import { barraSegmentada, partesConColor, medidor } from '../graficos.js';
import { datosInforme, formatoColumna, nombreArchivo } from '../informe-datos.js';
import { estadoRatio } from './resumen.js';
import { estado } from '../ui.js';

const NUMERICA = new Set(['eur', 'pct', 'num', 'int', 'fecha']);

function tablaInforme(tb) {
  const total = tb.cols.reduce((a, c) => a + (c.w || c.span), 0);
  const fila = (valores, etiqueta) => h('tr', valores.map((v, i) => {
    const col = tb.cols[i];
    const clases = (NUMERICA.has(col.tipo) ? '.num' : '') + (col.fino ? '.fino' : '');
    return h(etiqueta + clases, etiqueta === 'th' ? { scope: 'col', title: col.t } : null,
      etiqueta === 'th' ? v : formatoColumna(col.tipo, v));
  }));
  return h('section.inf-bloque.inf-tabla', { dataset: { divisible: '1' } },
    h('h3', tb.titulo, tb.nota ? h('small', tb.nota) : null),
    h('table',
      h('colgroup', tb.cols.map((c) => h('col', { style: { width: ((c.w || c.span) / total) * 100 + '%' } }))),
      h('thead', fila(tb.cols.map((c) => c.corto || c.t), 'th')),
      h('tbody', tb.filas.map((f) => fila(f, 'td'))),
      tb.pie ? h('tfoot', fila(tb.pie, 'td')) : null));
}

function bloquesInforme(info) {
  const bloques = [];
  bloques.push(h('header.inf-cabecera',
    h('div',
      h('p.inf-sobretitulo', 'Currículum bancario'),
      h('h1', 'Informe de situación financiera'),
      info.titular ? h('p.inf-titular', info.titular) : null),
    h('div.inf-fecha',
      h('span', 'Datos actualizados a'),
      h('strong', info.actualizado ? fechaLarga(info.actualizado) : fechaLarga(hoyIso())))));

  bloques.push(h('section.inf-bloque.inf-kpis', info.kpis.map((k) =>
    h('div', h('span', k.etiqueta), h('strong', eur(k.valor))))));

  bloques.push(h('section.inf-bloque.inf-columnas',
    h('div',
      h('h3', 'Situación laboral'),
      h('dl.inf-fichas', info.laboral.map((x) => h('div', h('dt', x.etiqueta), h('dd', celda(x.celda)))))),
    h('div',
      h('h3', 'Resumen financiero'),
      h('dl.inf-fichas', info.resumen.map((x) => h('div', h('dt', x.etiqueta),
        h('dd', celda(x.valor), x.extra ? h('small', celda(x.extra)) : null)))))));

  if (info.solvencia.length || info.composicion.length) {
    const partes = partesConColor(info.composicion);
    const total = partes.reduce((a, p) => a + p.valor, 0) || 1;
    bloques.push(h('section.inf-bloque',
      h('h3', 'Indicadores de solvencia'),
      h('div.inf-solvencia', info.solvencia.map((x) => h('div.inf-indicador',
        h('div.inf-indicador-cabecera', h('strong', pct(x.valor)), estado(...estadoRatio(x.valor, x.limite))),
        h('p', x.etiqueta, h('small', x.nota)),
        medidor({ valor: x.valor, limite: x.limite, maximo: x.maximo ?? null, etiquetaLimite: x.textoLimite })))),
      partes.length > 1 ? h('div.inf-composicion',
        h('p', 'Composición del patrimonio neto'),
        barraSegmentada(partes, { alta: true }),
        h('ul', partes.map((p) => h('li', h('span.reparto-muestra', { style: { background: p.color } }),
          `${p.nombre}: ${eur(p.valor)} (${pct(p.valor / total, 1)})`)))) : null));
  }

  info.tablas.forEach((tb) => bloques.push(tablaInforme(tb)));

  if (info.enlaces.length) {
    bloques.push(h('section.inf-bloque',
      h('h3', 'Documentación justificativa'),
      h('ul.inf-enlaces', info.enlaces.map((e) => h('li',
        h('span', e.etiqueta), h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' }, e.url))))));
  }

  bloques.push(h('p.inf-nota', 'Documento informativo elaborado por el titular con sus propios datos. ' +
    'Importes en euros. Los valores de mercado son estimaciones y los justificantes están a disposición de la entidad.'));
  return bloques;
}

/* ---------- Paginación en folios A4 ---------- */

function nuevaHoja(info) {
  const cuerpo = h('div.hoja-cuerpo');
  const numero = h('span');
  const marco = h('div.hoja-marco', h('article.hoja', cuerpo,
    h('footer.hoja-pie', h('span', ['Currículum bancario', info.titular].filter(Boolean).join(' · ')),
      h('span', `Generado el ${fecha(hoyIso())}`), numero)));
  return { marco, cuerpo, numero };
}
const desborda = (el) => el.scrollHeight > el.clientHeight + 1;

/**
 * Parte una tabla que no cabe en la hoja: deja las filas que entran y devuelve el resto
 * como bloque nuevo. Devuelve 'no-cabe' si ni siquiera entra una fila.
 */
function partirTabla(bloque, cuerpo) {
  const tbody = bloque.querySelector('tbody');
  const pie = bloque.querySelector('tfoot');
  const movidas = [];
  // Las tablas cortas no se parten: quedan mejor enteras en la hoja siguiente.
  if (tbody.rows.length < 8) return 'no-cabe';
  if (pie) pie.remove();
  while (desborda(cuerpo) && tbody.rows.length > 1) movidas.unshift(tbody.removeChild(tbody.lastElementChild));
  if (desborda(cuerpo) || tbody.rows.length < 3) return 'no-cabe';
  if (!movidas.length && !pie) return null;
  // El total nunca viaja solo: se lleva consigo la última fila.
  if (!movidas.length && tbody.rows.length > 1) movidas.unshift(tbody.removeChild(tbody.lastElementChild));
  const titulo = bloque.querySelector('h3').firstChild.textContent.replace(/ \(continuación\)$/, '');
  return h('section.inf-bloque.inf-tabla', { dataset: { divisible: '1' } },
    h('h3', titulo + ' (continuación)'),
    h('table', bloque.querySelector('colgroup').cloneNode(true), bloque.querySelector('thead').cloneNode(true),
      h('tbody', movidas), pie || null));
}

function paginar(papel, bloques, info) {
  papel.replaceChildren();
  const hojas = [];
  const abrir = () => { const hoja = nuevaHoja(info); hojas.push(hoja); papel.append(hoja.marco); return hoja; };
  let hoja = abrir();
  const cola = [...bloques];
  let seguro = 0;
  while (cola.length && seguro++ < 500) {
    const b = cola.shift();
    hoja.cuerpo.append(b);
    if (!desborda(hoja.cuerpo)) continue;
    const esPrimero = hoja.cuerpo.children.length === 1;
    if (b.dataset.divisible) {
      const entera = b.cloneNode(true);
      const resto = partirTabla(b, hoja.cuerpo);
      if (resto === 'no-cabe') {
        if (esPrimero) { b.replaceWith(entera); continue; } // caso extremo: se deja tal cual
        b.remove(); cola.unshift(entera); hoja = abrir();
      } else if (resto) {
        cola.unshift(resto); hoja = abrir();
      }
      continue;
    }
    if (esPrimero) continue;
    b.remove(); cola.unshift(b); hoja = abrir();
  }
  hojas.forEach((x, i) => { x.numero.textContent = `Página ${i + 1} de ${hojas.length}`; });
  return hojas.length;
}

/* ---------- Vista ---------- */

export function vistaInforme(app) {
  const e = app.estado;
  const m = e.modelo;
  if (!e.informe) e.informe = { titular: m.titular || '', catastro: true, enlaces: true };
  const op = e.informe;

  const papel = h('div.papel');
  const paginas = h('span.informe-paginas');
  let info = datosInforme(m, op);

  const ajustarEscala = () => {
    const hoja = papel.querySelector('.hoja');
    if (!hoja) return;
    const disponible = papel.clientWidth;
    papel.style.setProperty('--k', String(Math.min(1, disponible / hoja.offsetWidth)));
  };
  const componer = () => {
    info = datosInforme(m, op);
    const total = paginar(papel, bloquesInforme(info), info);
    paginas.textContent = `${total} ${total === 1 ? 'página' : 'páginas'} · A4 vertical`;
    ajustarEscala();
  };

  const titular = h('input', { id: 'inf-titular', type: 'text', value: op.titular, placeholder: 'Nombre y apellidos (opcional)', autocomplete: 'off' });
  let espera;
  titular.addEventListener('input', () => { op.titular = titular.value; clearTimeout(espera); espera = setTimeout(componer, 250); });
  const casilla = (clave, texto) => {
    const c = h('input', { type: 'checkbox', checked: op[clave] });
    c.addEventListener('change', () => { op[clave] = c.checked; componer(); });
    return h('label.casilla', c, h('span', texto));
  };

  const imprimir = () => {
    const anterior = document.title;
    document.title = nombreArchivo(info, 'pdf').replace(/\.pdf$/, '');
    const restaurar = () => { document.title = anterior; window.removeEventListener('afterprint', restaurar); };
    window.addEventListener('afterprint', restaurar);
    window.print();
  };
  const botonExcel = h('button.boton', { type: 'button' }, icono('descargar', 18), 'Descargar Excel');
  botonExcel.addEventListener('click', async () => {
    botonExcel.disabled = true;
    try {
      const { exportarExcel } = await import('../excel.js');
      await exportarExcel(info, m);
      app.aviso('Excel descargado.');
    } catch (err) {
      app.aviso('No se pudo generar el Excel: ' + err.message, 'error');
    } finally {
      botonExcel.disabled = false;
    }
  });

  const herramientas = h('section.tarjeta.informe-herramientas',
    h('div.informe-opciones',
      h('label.campo', { for: 'inf-titular' }, h('span', 'Titular'), titular),
      casilla('catastro', 'Incluir referencia catastral'),
      casilla('enlaces', 'Incluir enlaces a documentación')),
    h('div.informe-acciones',
      h('button.boton.primario', { type: 'button', onclick: imprimir }, icono('imprimir', 18), 'Guardar PDF / Imprimir'),
      botonExcel,
      paginas),
    h('p.tarjeta-nota', 'En el diálogo de impresión elige «Guardar como PDF». El informe ya está ajustado a tamaño folio (A4) y no se envía a ningún servidor.'));

  const raiz = h('div.vista.vista-informe', herramientas, papel);
  const ro = new ResizeObserver(ajustarEscala);
  ro.observe(papel);
  raiz._montado = componer;
  return raiz;
}
