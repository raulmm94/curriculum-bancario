// Mes a mes: visión del año, formulario para rellenar/corregir un mes y tabla anual.
import {
  h, icono, eur, eur0, num, pct, MESES, MESES_CORTOS, parseImporte, importeEditable, hoyIso, fechaLarga,
} from '../formato.js';
import { claveCambio, valorReal, construirMensual } from '../modelo.js';
import { columnasAgrupadas, columnasDivergentes, lineaTemporal, barrasOrdenadas, leyenda } from '../graficos.js';
import { tarjeta, kpi, vacio } from '../ui.js';

const SUBVISTAS = [
  ['vision', 'Visión del año', 'grafico'],
  ['rellenar', 'Rellenar mes', 'editar'],
  ['tabla', 'Tabla anual', 'tabla'],
];
const NOMBRE_CLASE = { consumo: 'Gasto corriente', deuda: 'Deuda', inversion: 'Ahorro e inversión' };

let refs = { totales: new Map() };

export function mesValorDe(app, tabla) {
  const e = app.estado;
  return e.mesValor[tabla.id] ?? Math.min(11, e.mesCierre + 1);
}

export function vistaMensual(app) {
  const e = app.estado;
  const mm = e.mensual;
  if (!mm) return h('div.vista', vacio('Tu Google Sheet no tiene ninguna hoja «Rellenar AAAA» con las tablas mensuales.'));

  const anios = e.payload.anios || [mm.anio];
  const selectorAnio = anios.length > 1
    ? h('select.selector', { 'aria-label': 'Año', onchange: (ev) => app.cambiarAnio(Number(ev.target.value)) },
      anios.map((a) => h('option', { value: a, selected: a === mm.anio }, a)))
    : h('span.anio', mm.anio);

  const pestanas = h('div.subpestanas', { role: 'tablist' }, SUBVISTAS.map(([id, nombre, ic]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(e.sub === id), class: e.sub === id ? 'activa' : '',
      onclick: () => app.navegar('mensual', id) }, icono(ic, 16), nombre)));

  const cierre = mm.cerrados > 0
    ? `Gastos e ingresos reales hasta ${MESES[mm.cerrados - 1].toLowerCase()}`
    : 'Aún no hay meses cerrados';
  const cabecera = h('div.mensual-cabecera',
    h('div.mensual-titulo', h('h1', 'Seguimiento ', selectorAnio),
      h('p', cierre, mm.actualizado ? ` · actualizado el ${fechaLarga(mm.actualizado)}` : '')),
    pestanas);

  const cuerpo = e.sub === 'rellenar' ? subRellenar(app, mm) : e.sub === 'tabla' ? subTabla(app, mm) : subVision(app, mm);
  return h('div.vista.vista-mensual', cabecera, cuerpo);
}

/* ------------------------------------------------------------------ */
/* Visión del año                                                      */
/* ------------------------------------------------------------------ */

function subVision(app, mm) {
  const a = mm.acum;
  const n = Math.max(1, mm.cerrados);
  const periodo = mm.cerrados > 1 ? `${MESES_CORTOS[0]}–${MESES_CORTOS[mm.cerrados - 1]}` : mm.cerrados === 1 ? MESES_CORTOS[0] : 'sin meses cerrados';
  const tenue = (i) => i >= mm.cerrados;
  const titulos = MESES.map((m, i) => `${m} ${mm.anio}${tenue(i) ? ' (sin cerrar)' : ''}`);

  const kpis = h('div.kpis',
    kpi({ etiqueta: `Ingresos · ${periodo}`, valor: eur(a.ingresos), nota: `Media ${eur0(a.ingresos / n)} al mes` }),
    kpi({ etiqueta: `Gastos · ${periodo}`, valor: eur(a.gastos), nota: `Media ${eur0(a.gastos / n)} al mes` }),
    kpi({ etiqueta: 'Sobrante', valor: eur(a.sobrante), nota: 'Ingresos menos todos los gastos' }),
    kpi({ etiqueta: 'Capacidad de ahorro', valor: eur(a.capacidadAhorro),
      nota: a.ingresos ? `${pct(a.capacidadAhorro / a.ingresos, 0)} de los ingresos, tras gasto corriente y deuda` : null }));

  const haySinCerrar = mm.cerrados < 12;
  const flujo = tarjeta({ titulo: 'Ingresos y gastos por mes',
    nota: 'Los gastos incluyen cuotas de deuda y aportaciones a inversión y ahorro' },
  leyenda([
    { nombre: 'Ingresos', color: 'var(--s1)' },
    { nombre: 'Gastos', color: 'var(--s2)' },
    ...(haySinCerrar ? [{ nombre: 'Mes sin cerrar (previsión)', color: 'var(--tinta-2)', tenue: true }] : []),
  ]),
  columnasAgrupadas({
    etiquetas: MESES_CORTOS, titulos, tenue,
    series: [
      { nombre: 'Ingresos', color: 'var(--s1)', valores: mm.mensual.map((x) => x.ingresos) },
      { nombre: 'Gastos', color: 'var(--s2)', valores: mm.mensual.map((x) => x.gastos) },
    ],
  }));

  const sobrante = tarjeta({ titulo: 'Sobrante mensual', nota: 'Ingresos menos gastos de cada mes' },
    columnasDivergentes({ etiquetas: MESES_CORTOS, titulos, tenue, nombre: 'Sobrante', valores: mm.mensual.map((x) => x.sobrante) }));

  const reparto = tarjeta({ titulo: '¿A dónde va el dinero?', nota: `Acumulado ${periodo} por categoría` },
    mm.categorias.some((c) => c.total > 0)
      ? barrasOrdenadas(mm.categorias.filter((c) => c.total > 0).map((c) => ({
        nombre: c.nombre, nota: NOMBRE_CLASE[c.clase], valor: c.total,
      })), { total: a.gastos })
      : vacio('Sin gastos registrados en los meses cerrados.'),
    h('div.reparto-clases',
      h('span', 'Gasto corriente ', h('strong', eur0(a.consumo))),
      h('span', 'Deuda ', h('strong', eur0(a.deuda))),
      h('span', 'Ahorro e inversión ', h('strong', eur0(a.inversion)))));

  const valores = mm.valores.map((t) => {
    const total = t.filas.reduce((s, f) => s + (f.ultimo ?? 0), 0);
    const conDatos = t.totalMes.filter((v) => v !== null).length;
    return tarjeta({ titulo: tituloValor(t), nota: `Valor actual ${eur(total)}` },
      conDatos > 1 ? lineaTemporal({ etiquetas: MESES_CORTOS, titulos: MESES.map((m) => `1 de ${m.toLowerCase()} de ${mm.anio}`), valores: t.totalMes, nombre: 'Valor total' }) : null,
      h('ul.posiciones', t.filas.map((f) => {
        const delta = f.ultimo !== null && f.previo ? (f.ultimo - f.previo) / f.previo : null;
        return h('li',
          h('span.posicion-nombre', nombreFila(t, f)),
          h('span.posicion-valor', eur(f.ultimo)),
          delta === null ? h('span.posicion-delta') : h('span.posicion-delta', { title: 'Variación respecto al dato anterior' },
            Math.abs(delta) < 0.0005 ? '= sin cambios' : (delta > 0 ? '▲ ' : '▼ ') + pct(Math.abs(delta), 1)));
      })));
  });

  return h('div.subvista', kpis, flujo, h('div.dos-columnas', sobrante, reparto),
    valores.length ? h('div.dos-columnas', valores) : null);
}

function tituloValor(t) {
  return t.id === 'bolsa' ? 'Inversiones financieras' : t.id === 'inmobiliario' ? 'Valor de los inmuebles' : t.titulo;
}
function tituloTabla(t) {
  return t.tipo === 'valor' ? tituloValor(t) : t.titulo;
}
function nombreFila(t, f) {
  if (t.tipo === 'valor') return [f.categoria, f.concepto].filter(Boolean).join(' · ');
  return f.concepto || f.categoria;
}

/* ------------------------------------------------------------------ */
/* Rellenar / corregir un mes                                          */
/* ------------------------------------------------------------------ */

function subRellenar(app, mm) {
  const e = app.estado;
  refs = { totales: new Map() };
  const mes = e.mesCierre;

  const paso = (delta) => h('button.boton-icono', {
    type: 'button', disabled: mes + delta < 0 || mes + delta > 11,
    'aria-label': delta < 0 ? 'Mes anterior' : 'Mes siguiente',
    onclick: () => { e.mesCierre = mes + delta; e.mesValor = {}; app.render(); },
  }, icono(delta < 0 ? 'izquierda' : 'derecha'));

  const selector = h('div.selector-mes',
    paso(-1),
    h('div.selector-mes-centro',
      h('select', { 'aria-label': 'Mes que se rellena', onchange: (ev) => { e.mesCierre = Number(ev.target.value); e.mesValor = {}; app.render(); } },
        MESES.map((m, i) => h('option', { value: i, selected: i === mes }, `${m} ${mm.anio}`))),
      h('span', mes < mm.cerrados ? 'Mes ya cerrado: puedes corregirlo' : 'Mes pendiente de cerrar')),
    paso(1));

  const ayuda = h('p.ayuda-rellenar', icono('info', 16),
    h('span', `Rellena los gastos e ingresos de ${MESES[mes].toLowerCase()} y el valor de tus inversiones a día 1 del mes siguiente. ` +
      'Puedes escribir sumas (p. ej. 950+600). Nada se envía a tu hoja hasta que pulses «Guardar».'));

  // Dos columnas: ingresos y valores a la izquierda, gastos (la tabla larga) a la derecha.
  // En móvil se apilan en el orden natural: ingresos, gastos, valores.
  const flujos = mm.tablas.filter((t) => t.tipo === 'flujo');
  const pinta = (t, orden) => tarjetaEdicion(app, mm, t, t.tipo === 'flujo' ? mes : mesValorDe(app, t), orden);
  const izquierda = [...flujos.filter((t) => t.id === 'ingresos').map((t) => pinta(t, 1)), ...mm.valores.map((t) => pinta(t, 3))];
  const derecha = flujos.filter((t) => t.id !== 'ingresos').map((t) => pinta(t, 2));

  return h('div.subvista.rellenar', selector, ayuda,
    h('div.rellenar-rejilla', h('div.rellenar-columna', izquierda), h('div.rellenar-columna', derecha)));
}

function tarjetaEdicion(app, mm, tabla, mes, orden) {
  const e = app.estado;
  const total = h('strong', eur(tabla.totalMes[mes]));
  refs.totales.set(tabla.id, { nodo: total, mes });

  let subtitulo;
  if (tabla.tipo === 'flujo') {
    subtitulo = h('p.tarjeta-nota', MESES[mes], mes >= mm.cerrados ? ' · sin cerrar' : '');
  } else {
    subtitulo = h('p.tarjeta-nota', 'Valor a día 1 de ',
      h('select.selector.mini', { 'aria-label': 'Mes del valor', onchange: (ev) => { e.mesValor[tabla.id] = Number(ev.target.value); app.render(); } },
        MESES.map((m, i) => h('option', { value: i, selected: i === mes }, m.toLowerCase()))));
  }

  const filas = [];
  let categoriaPrevia = null;
  for (const fila of tabla.filas) {
    if (tabla.tipo === 'flujo' && tabla.filas.length > 6 && fila.categoria !== categoriaPrevia) {
      filas.push(h('div.edicion-categoria', fila.categoria));
      categoriaPrevia = fila.categoria;
    }
    filas.push(filaEdicion(app, tabla, fila, mes));
  }

  return h('section.tarjeta.edicion.orden-' + orden,
    h('header.tarjeta-cabecera', h('div', h('h2', tituloTabla(tabla)), subtitulo), h('div.edicion-total', h('span', 'Total'), total)),
    h('div.edicion-filas', filas));
}

function filaEdicion(app, tabla, fila, mes) {
  const e = app.estado;
  const clave = claveCambio(tabla.id, fila.fila, mes + 1);
  const original = valorReal(tabla.tipo, fila.meses[mes]);
  const pendiente = e.pendientes.get(clave);
  const id = `c-${tabla.id}-${fila.fila}-${mes}`;
  const formula = fila.fx && fila.fx[mes];

  const campo = h('input', {
    id, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
    value: importeEditable(pendiente ? pendiente.valor : original),
    placeholder: original === null ? 'Sin dato' : '0,00',
    'aria-describedby': id + '-nota',
  });
  const contenedor = h('div.edicion-fila' + (pendiente ? '.cambiada' : ''));

  const evaluar = () => {
    const v = parseImporte(campo.value);
    contenedor.classList.remove('invalida');
    if (Number.isNaN(v)) {
      contenedor.classList.add('invalida');
      e.pendientes.delete(clave);
    } else {
      // Vacío en un flujo equivale a 0; en una tabla de valores significa «no tocar».
      const nuevo = v === null ? (tabla.tipo === 'flujo' && original !== null ? 0 : null) : v;
      const igual = nuevo === null || (original !== null && Math.abs(nuevo - original) < 0.005);
      if (igual) e.pendientes.delete(clave);
      else {
        e.pendientes.set(clave, {
          tabla: tabla.id, titulo: tituloTabla(tabla), fila: fila.fila, categoria: fila.categoria,
          concepto: fila.concepto, mes: mes + 1, valor: nuevo, antes: original, tipo: tabla.tipo,
        });
      }
    }
    contenedor.classList.toggle('cambiada', e.pendientes.has(clave));
    app.pendientesCambiados();
  };
  campo.addEventListener('input', evaluar);
  campo.addEventListener('blur', () => {
    if (contenedor.classList.contains('invalida')) return;
    const p = e.pendientes.get(clave);
    campo.value = importeEditable(p ? p.valor : original);
  });
  campo.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const campos = [...document.querySelectorAll('.edicion-fila input')];
    const siguiente = campos[campos.indexOf(campo) + 1];
    if (siguiente) siguiente.focus(); else campo.blur();
  });
  campo.addEventListener('focus', () => campo.select());

  const anterior = mes > 0 ? fila.valores[mes - 1] : null;
  const nota = h('div.edicion-nota', { id: id + '-nota' },
    anterior !== null ? h('button.copiar', {
      type: 'button', title: 'Copiar el valor del mes anterior',
      onclick: () => { campo.value = importeEditable(anterior); evaluar(); },
    }, `${MESES_CORTOS[mes - 1]}: ${eur(anterior)}`) : null,
    formula ? h('span.formula', { title: `La celda contiene la fórmula ${formula}. Si la cambias aquí se guardará como valor.` }, 'ƒ ' + formula) : null,
    h('span.mensaje-invalido', 'Importe no válido'));

  contenedor.append(
    h('label', { for: id }, tabla.tipo === 'valor' ? nombreFila(tabla, fila) : fila.concepto),
    h('div.edicion-campo', campo, h('span', '€')),
    nota);
  return contenedor;
}

/** Se llama tras cada tecla: refresca totales sin redibujar (para no perder el foco). */
export function refrescarTotales(app) {
  const mm = app.estado.mensual;
  if (!mm) return;
  for (const [id, ref] of refs.totales) {
    const t = mm.porId[id];
    if (t && ref.nodo.isConnected) ref.nodo.textContent = eur(t.totalMes[ref.mes]);
  }
}

/* ------------------------------------------------------------------ */
/* Tabla anual                                                         */
/* ------------------------------------------------------------------ */

function subTabla(app, mm) {
  const e = app.estado;
  const irA = (tabla, m) => {
    if (tabla.tipo === 'flujo') { e.mesCierre = m; e.mesValor = {}; } else { e.mesCierre = Math.max(0, m - 1); e.mesValor = { [tabla.id]: m }; }
    app.navegar('mensual', 'rellenar');
  };
  return h('div.subvista', mm.tablas.map((t) => {
    const flujo = t.tipo === 'flujo';
    const cuerpo = t.filas.map((f) => h('tr',
      h('th', { scope: 'row' }, nombreFila(t, f), flujo && f.categoria && f.categoria !== f.concepto ? h('small', f.categoria) : null),
      f.valores.map((v, m) => h('td' + (flujo && m >= mm.cerrados ? '.tenue' : '') + (f.editado[m] ? '.editada' : ''),
        h('button', { type: 'button', title: `${MESES[m]}: ${v === null ? 'sin dato' : eur(v)} · pulsa para editar`, onclick: () => irA(t, m) }, v === null ? '—' : num(v, 0)))),
      h('td.total', num(flujo ? f.valores.reduce((a, b) => a + (b ?? 0), 0) : f.ultimo, 0))));
    const totalAnual = flujo
      ? t.totalMes.reduce((a, b) => a + (b ?? 0), 0)
      : t.filas.reduce((a, f) => a + (f.ultimo ?? 0), 0);
    return tarjeta({ titulo: tituloTabla(t), nota: flujo ? 'Importe de cada mes (€) · pulsa una celda para editarla' : 'Valor a día 1 de cada mes (€) · pulsa una celda para editarla' },
      h('div.tabla-desplazable', { tabindex: 0, role: 'group', 'aria-label': tituloTabla(t) },
        h('table.tabla-anual',
          h('thead', h('tr', h('th', { scope: 'col' }, 'Concepto'),
            MESES_CORTOS.map((m, i) => h('th' + (flujo && i >= mm.cerrados ? '.tenue' : ''), { scope: 'col' }, m)),
            h('th', { scope: 'col' }, flujo ? 'Total año' : 'Último'))),
          h('tbody', cuerpo),
          h('tfoot', h('tr', h('th', { scope: 'row' }, 'Total'),
            t.totalMes.map((v, i) => h('td' + (flujo && i >= mm.cerrados ? '.tenue' : ''), v === null ? '—' : num(v, 0))),
            h('td.total', num(totalAnual, 0)))))));
  }), h('p.nota-pie', 'Importes en euros, redondeados; el valor exacto aparece al pasar el cursor y al editar. ' +
    'Los meses atenuados aún no están cerrados: pueden contener previsiones de la hoja.'));
}

/* ------------------------------------------------------------------ */
/* Diálogo de guardado                                                 */
/* ------------------------------------------------------------------ */

export function dialogoGuardar(app) {
  const e = app.estado;
  const cambios = [...e.pendientes.values()].sort((a, b) => a.mes - b.mes || a.titulo.localeCompare(b.titulo));
  const mm = e.mensual;
  const fecha = h('input', { type: 'date', id: 'fecha-act', value: hoyIso() });
  const chkRellenar = h('input', { type: 'checkbox', checked: true });
  const chkDatos = h('input', { type: 'checkbox' });
  const tocaDiciembre = cambios.some((c) => c.tipo === 'valor' && c.mes === 12);
  const error = h('p.error', { role: 'alert', hidden: true });
  const guardar = h('button.boton.primario', { type: 'button' }, app.estado.fuente.tipo === 'demo' ? 'Guardar (demo)' : 'Guardar en Google Sheets');
  const cancelar = h('button.boton', { type: 'button', onclick: () => dialogo.close() }, 'Cancelar');

  const dialogo = h('dialog.dialogo', { 'aria-labelledby': 'dlg-titulo' },
    h('h2', { id: 'dlg-titulo' }, 'Revisar y guardar'),
    h('p', `Se escribirán ${cambios.length} ${cambios.length === 1 ? 'celda' : 'celdas'} en la hoja «${mm.hoja}».`),
    h('ul.cambios', cambios.map((c) => h('li',
      h('span.cambio-donde', h('strong', c.concepto), h('small', `${c.titulo} · ${MESES[c.mes - 1]}`)),
      h('span.cambio-valores', h('s', c.antes === null ? 'sin dato' : eur(c.antes)), ' → ', h('strong', eur(c.valor)))))),
    tocaDiciembre ? h('p.aviso-dialogo', icono('info', 16),
      h('span', 'Vas a rellenar diciembre en una tabla de valores. La fórmula «Último valor» de tu hoja busca un 1 como marcador del mes siguiente; ' +
        'sin él puede mostrar #N/A hasta que la ajustes o continúes en la hoja del año siguiente.')) : null,
    h('fieldset.fecha-actualizacion',
      h('legend', 'Fecha «Datos actualizados»'),
      h('label.casilla', chkRellenar, h('span', `Actualizar en «${mm.hoja}»`)),
      h('label.casilla', chkDatos, h('span', 'Actualizar también en la hoja DATOS (currículum)')),
      h('label.fecha', { for: 'fecha-act' }, 'Fecha', fecha)),
    error,
    h('div.dialogo-acciones', cancelar, guardar));

  guardar.addEventListener('click', async () => {
    guardar.disabled = true; cancelar.disabled = true;
    guardar.textContent = 'Guardando…';
    error.hidden = true;
    try {
      await app.guardar({ fecha: fecha.value || hoyIso(), fechaRellenar: chkRellenar.checked, fechaDatos: chkDatos.checked });
      dialogo.close();
    } catch (err) {
      error.replaceChildren(icono('alerta', 16), err.message);
      error.hidden = false;
      guardar.disabled = false; cancelar.disabled = false;
      guardar.textContent = 'Reintentar';
    }
  });
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
}

/** Recalcula el modelo mensual con los cambios pendientes. */
export function recalcular(app) {
  const e = app.estado;
  e.mensual = construirMensual(e.payload.rellenar, e.pendientes);
}
